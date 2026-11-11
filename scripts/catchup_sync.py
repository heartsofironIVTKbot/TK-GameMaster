"""Catch the new database up with the old live GameMaster's data (2026-11-11).

While the new system was built on a copy taken on 2026-10-25, TommyKay's
live (old) GameMaster kept running games. This merges what it recorded since
into the new database, without touching what only the new system has.

The old data comes from a phpMyAdmin export loaded into a LOCAL scratch
database (OLD_* below); the new database is TARGET_* from scripts/_copy.env.
Connection details stay in local files (scripts/_* is gitignored) and are
never printed.

    scripts/_catchup.env:
        OLD_HOST=127.0.0.1  OLD_PORT=3306  OLD_USER=...  OLD_PASSWORD=...  OLD_DATABASE=gm_old_live

Usage:
    py -3 scripts/copy_database.py --backup        # FIRST: a backup of the new database
    py -3 scripts/catchup_sync.py                  # dry run: what would change, table by table
    py -3 scripts/catchup_sync.py --apply          # write it
    py -3 scripts/catchup_sync.py --apply --only users,games

Rules:
  * users: the old live bot is TommyKay's record keeper, so its values win
    (test activity while the Testing Server was "home" wrote into these rows);
    a value only the new side has (an in-game nickname set on the website, the
    new columns) is kept.
  * games: the old bot rewrites every game on each save, so updated_at /
    reservations_rev always differ; a game counts as changed only when a field
    of its data, a column, or its reservations really differ. Its data is
    merged: the old values win for every field the old bot has, fields only
    the new system added (archive snapshots, guild_id …) stay.
  * game_reservations follow their game: a changed game gets exactly the old
    reservations; a game only the new system has (test games) is untouched.
  * host_stats: the new table is per server; old rows are TommyKay's.
  * everything else: rows only the old database has are added; rows both
    have take the old values when they differ (bookkeeping columns ignored).
  * rows only the new database has are never touched.
After --apply, restart the bot: it rebuilds player_summary (the portfolios)
from the games on startup.
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import copy_database as cd  # noqa: E402

HOME_GUILD = "341585283881631744"  # TommyKay: the old bot's only server

GENERIC_TABLES = [
    "schedule_slots",
    "host_settings",
    "host_override_requests",
    "host_access_tokens",
    "host_history",
    "player_history",
    "audit_logs",
]
# Columns that change on every save of the old bot without meaning anything.
BOOKKEEPING = {"updated_at", "created_at", "reservations_rev"}


def load_old_env(path: pathlib.Path) -> dict:
    env = cd.load_env(path)
    return {key.replace("OLD_", "SOURCE_", 1): value for key, value in env.items()}


def columns(conn, table: str) -> list[str]:
    cur = conn.cursor()
    cur.execute(f"SHOW COLUMNS FROM `{table}`")
    names = [row[0] for row in cur.fetchall()]
    cur.close()
    return names


def primary_key(conn, table: str) -> list[str]:
    cur = conn.cursor()
    cur.execute(f"SHOW KEYS FROM `{table}` WHERE Key_name = 'PRIMARY'")
    keys = [row[4] for row in sorted(cur.fetchall(), key=lambda r: r[3])]
    cur.close()
    return keys


def table_exists(conn, table: str) -> bool:
    cur = conn.cursor()
    cur.execute("SHOW TABLES LIKE %s", (table,))
    found = cur.fetchone() is not None
    cur.close()
    return found


def rows_by_key(conn, table: str, cols: list[str], key: list[str], where: str = "", params: tuple = ()) -> dict:
    cur = conn.cursor()
    cur.execute(f"SELECT {', '.join(f'`{c}`' for c in cols)} FROM `{table}` {where}", params)
    index = [cols.index(k) for k in key]
    out = {tuple(str(row[i]) for i in index): list(row) for row in cur.fetchall()}
    cur.close()
    return out


def same(a, b) -> bool:
    if a is None or b is None:
        return a is b
    return str(a) == str(b)


def upsert(conn, table: str, cols: list[str], key: list[str], rows: list) -> int:
    if not rows:
        return 0
    cur = conn.cursor()
    names = ", ".join(f"`{c}`" for c in cols)
    marks = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"`{c}` = VALUES(`{c}`)" for c in cols if c not in key) or f"`{key[0]}` = `{key[0]}`"
    sql = f"INSERT INTO `{table}` ({names}) VALUES ({marks}) ON DUPLICATE KEY UPDATE {updates}"
    for start in range(0, len(rows), cd.BATCH):
        cur.executemany(sql, [tuple(r) for r in rows[start:start + cd.BATCH]])
    conn.commit()
    cur.close()
    return len(rows)


# ————— generic tables —————

def plan_generic(old, new, table: str) -> dict:
    old_cols, new_cols = columns(old, table), columns(new, table)
    cols = [c for c in old_cols if c in new_cols]
    key = primary_key(new, table) or primary_key(old, table)
    if not key or any(k not in cols for k in key):
        return {"error": f"no shared primary key ({key})"}
    o, n = rows_by_key(old, table, cols, key), rows_by_key(new, table, cols, key)
    # JSON documents (slot_data …): changed only when a field the old bot has
    # differs; merged so fields only the new system added stay.
    docs = [i for i, c in enumerate(cols) if c.endswith("_data")]
    plain = [i for i, c in enumerate(cols) if c not in BOOKKEEPING and i not in docs]
    added = [row for k, row in o.items() if k not in n]
    updated = []
    for k, row in o.items():
        current = n.get(k)
        if current is None:
            continue
        doc_changed = False
        merged = list(row)
        for i in docs:
            old_doc, new_doc = _json(row[i]), _json(current[i])
            if any(field not in new_doc or new_doc[field] != value for field, value in old_doc.items()):
                doc_changed = True
            merged[i] = json.dumps({**new_doc, **old_doc}, ensure_ascii=False)
        if doc_changed or any(not same(row[i], current[i]) for i in plain):
            updated.append(merged)
    return {"cols": cols, "key": key, "added": added, "updated": updated, "kept_new": sum(1 for k in n if k not in o)}


# ————— users —————

def plan_users(old, new) -> dict:
    old_cols, new_cols = columns(old, "users"), columns(new, "users")
    cols = [c for c in old_cols if c in new_cols]
    key = ["discord_id"]
    o, n = rows_by_key(old, "users", cols, key), rows_by_key(new, "users", cols, key)
    nick = cols.index("ingame_nickname") if "ingame_nickname" in cols else None
    added, updated = [], []
    for k, row in o.items():
        current = n.get(k)
        if current is None:
            added.append(row)
            continue
        merged = list(row)
        # A nickname set on the new website, where the old bot has none, stays.
        if nick is not None and merged[nick] in (None, "") and current[nick] not in (None, ""):
            merged[nick] = current[nick]
        if any(not same(a, b) for a, b in zip(merged, current)):
            updated.append(merged)
    return {"cols": cols, "key": key, "added": added, "updated": updated, "kept_new": sum(1 for k in n if k not in o)}


# ————— games + game_reservations —————

def _json(text):
    try:
        value = json.loads(text) if text else {}
        return value if isinstance(value, dict) else {}
    except (TypeError, ValueError):
        return {}


def plan_games(old, new) -> dict:
    old_cols, new_cols = columns(old, "games"), columns(new, "games")
    cols = [c for c in old_cols if c in new_cols]
    key = ["thread_id"]
    o, n = rows_by_key(old, "games", cols, key), rows_by_key(new, "games", cols, key)
    gd = cols.index("game_data")
    rev = cols.index("reservations_rev") if "reservations_rev" in cols else None
    plain = [i for i, c in enumerate(cols) if c not in BOOKKEEPING and c != "game_data"]

    res_cols = [c for c in columns(old, "game_reservations") if c in columns(new, "game_reservations")]
    res_key = primary_key(new, "game_reservations") or ["thread_id", "slot_key"]

    def reservations(conn):
        out = {}
        for row in rows_by_key(conn, "game_reservations", res_cols, res_key).values():
            tid = str(row[res_cols.index("thread_id")])
            out.setdefault(tid, []).append(row)
        return out

    old_res, new_res = reservations(old), reservations(new)

    def res_set(rows):
        s_i, u_i = res_cols.index("slot_key"), res_cols.index("user_id")
        return {(str(r[s_i]), str(r[u_i])) for r in rows}

    added, updated, changed = [], [], set()
    for k, row in o.items():
        tid = k[0]
        current = n.get(k)
        if current is None:
            added.append(row)
            changed.add(tid)
            continue
        old_data, new_data = _json(row[gd]), _json(current[gd])
        data_changed = any(key_ not in new_data or new_data[key_] != value for key_, value in old_data.items())
        cols_changed = any(not same(row[i], current[i]) for i in plain)
        res_changed = res_set(old_res.get(tid, [])) != res_set(new_res.get(tid, []))
        if not (data_changed or cols_changed or res_changed):
            continue
        merged = list(row)
        merged[gd] = json.dumps({**new_data, **old_data}, ensure_ascii=False)
        if rev is not None:
            # Past both: neither side's stale copy can overwrite the merge.
            merged[rev] = max(int(row[rev] or 0), int(current[rev] or 0)) + 1
        updated.append(merged)
        changed.add(tid)
    reservations_out = [r for tid in changed for r in old_res.get(tid, [])]
    return {
        "cols": cols, "key": key, "added": added, "updated": updated,
        "kept_new": sum(1 for k in n if k not in o),
        "changed": changed, "res_cols": res_cols, "res_key": res_key, "reservations": reservations_out,
    }


def apply_games(new, plan: dict) -> str:
    written = upsert(new, "games", plan["cols"], plan["key"], plan["added"] + plan["updated"])
    cur = new.cursor()
    changed = sorted(plan["changed"])
    for start in range(0, len(changed), cd.BATCH):
        part = changed[start:start + cd.BATCH]
        cur.execute(f"DELETE FROM game_reservations WHERE thread_id IN ({', '.join(['%s'] * len(part))})", tuple(part))
    new.commit()
    cur.close()
    res = upsert(new, "game_reservations", plan["res_cols"], plan["res_key"], plan["reservations"])
    return f"{written} games, {res} reservations"


# ————— host_stats (per server in the new system) —————

def plan_host_stats(old, new) -> dict:
    old_cols, new_cols = columns(old, "host_stats"), columns(new, "host_stats")
    cols = [c for c in old_cols if c in new_cols]
    o = rows_by_key(old, "host_stats", cols, ["host_id"])
    n = rows_by_key(new, "host_stats", cols, ["host_id"], "WHERE guild_id = %s", (HOME_GUILD,))
    added = [row for k, row in o.items() if k not in n]
    updated = [row for k, row in o.items() if k in n and any(not same(a, b) for a, b in zip(row, n[k]))]
    out_cols = cols + ["guild_id"]
    return {
        "cols": out_cols, "key": ["guild_id", "host_id"],
        "added": [r + [HOME_GUILD] for r in added], "updated": [r + [HOME_GUILD] for r in updated],
        "kept_new": sum(1 for k in n if k not in o),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--old-env", default="scripts/_catchup.env")
    parser.add_argument("--env", default="scripts/_copy.env")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--only", default="")
    args = parser.parse_args()

    old = cd.connect(load_old_env(pathlib.Path(args.old_env)), "SOURCE")
    new = cd.connect(cd.load_env(pathlib.Path(args.env)), "TARGET")
    only = {t.strip() for t in args.only.split(",") if t.strip()}
    wanted = lambda table: not only or table in only  # noqa: E731

    plans = {}
    if wanted("users"):
        plans["users"] = plan_users(old, new)
    if wanted("games"):
        plans["games"] = plan_games(old, new)
    if wanted("host_stats") and table_exists(old, "host_stats") and table_exists(new, "host_stats"):
        plans["host_stats"] = plan_host_stats(old, new)
    for table in GENERIC_TABLES:
        if wanted(table) and table_exists(old, table) and table_exists(new, table):
            plans[table] = plan_generic(old, new, table)

    print(f"{'table':26} {'add':>7} {'update':>7} {'new-only kept':>14}")
    for table, plan in plans.items():
        if "error" in plan:
            print(f"{table:26} skipped: {plan['error']}")
            continue
        print(f"{table:26} {len(plan['added']):>7} {len(plan['updated']):>7} {plan['kept_new']:>14}")
    if "games" in plans:
        g = plans["games"]
        print(f"{'  game_reservations':26} {len(g['reservations']):>7} rows for {len(g['changed'])} changed game(s) (replaced as a whole)")

    if not args.apply:
        print("\nDry run: nothing was written. Back up first (copy_database.py --backup), then add --apply.")
        return
    for table, plan in plans.items():
        if "error" in plan:
            continue
        if table == "games":
            print(f"{table:26} wrote {apply_games(new, plan)}")
        else:
            print(f"{table:26} wrote {upsert(new, table, plan['cols'], plan['key'], plan['added'] + plan['updated'])}")
    print("\nDone. Restart the bot so it rebuilds the portfolios (player_summary).")


if __name__ == "__main__":
    main()
