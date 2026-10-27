"""Copy GameMaster's tables from one MySQL database to another, then compare
row counts (docs/infrastructure-plan.md, Phase 2 step 2).

Connection details come from a local file (never committed — scripts/_* is
gitignored), by default scripts/_copy.env:

    SOURCE_HOST=...   SOURCE_PORT=3306   SOURCE_USER=...   SOURCE_PASSWORD=...   SOURCE_DATABASE=...
    TARGET_HOST=...   TARGET_PORT=...    TARGET_USER=...   TARGET_PASSWORD=...   TARGET_DATABASE=...
    TARGET_SSL_CA=scripts/_ca-certificate.crt     (optional: check the target's certificate)

Usage:
    py -3 scripts/copy_database.py --list                 # tables and row counts on both sides
    py -3 scripts/copy_database.py --copy                 # copy every table missing on the target
    py -3 scripts/copy_database.py --copy --replace       # drop and re-copy tables that exist
    py -3 scripts/copy_database.py --copy --exclude a,b   # skip more tables
    py -3 scripts/copy_database.py --backup               # save the TARGET database to backups/
    py -3 scripts/copy_database.py --restore FILE         # put a backup back into TARGET (replaces its tables)

IronLegion's tables are always skipped. --backup and --restore only need the
TARGET_* values.
"""

import argparse
import base64
import datetime
import decimal
import gzip
import json
import pathlib
import sys

import mysql.connector

ALWAYS_EXCLUDED = {
    "guild_config", "ironlegion_state", "verified_users", "steam_alias_history",
    "ironlegion_guild_settings", "old_guild_settings_history", "blacklist", "suspicious_users",
    "verification_logs", "verification_tickets", "guild_authenticated_role",
}
BATCH = 1000


def load_env(path: pathlib.Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing {path}. Create it with the SOURCE_* and TARGET_* values (see the top of this script).")
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def connect(env: dict, side: str):
    get = lambda key, default=None: env.get(f"{side}_{key}", default)  # noqa: E731
    missing = [key for key in ("HOST", "USER", "PASSWORD", "DATABASE") if not get(key)]
    if missing:
        sys.exit(f"Missing {', '.join(f'{side}_{key}' for key in missing)}.")
    options = dict(
        host=get("HOST"), port=int(get("PORT", "3306")), user=get("USER"), password=get("PASSWORD"),
        database=get("DATABASE"), use_pure=True, connection_timeout=20, charset="utf8mb4",
    )
    if get("SSL_CA"):
        options.update(ssl_ca=get("SSL_CA"), ssl_verify_cert=True)
    return mysql.connector.connect(**options)


def tables(conn) -> dict:
    cur = conn.cursor()
    cur.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
    names = [row[0] for row in cur.fetchall()]
    counts = {}
    for name in names:
        cur.execute(f"SELECT COUNT(*) FROM `{name}`")
        counts[name] = cur.fetchone()[0]
    cur.close()
    return counts


def has_primary_key(conn, table: str) -> bool:
    cur = conn.cursor()
    cur.execute(f"SHOW KEYS FROM `{table}` WHERE Key_name = 'PRIMARY'")
    found = bool(cur.fetchall())
    cur.close()
    return found


def copy_table(src, dst, table: str, replace: bool) -> int:
    scur, dcur = src.cursor(), dst.cursor()
    scur.execute(f"SHOW CREATE TABLE `{table}`")
    create_sql = scur.fetchone()[1]
    if replace:
        dcur.execute(f"DROP TABLE IF EXISTS `{table}`")
    dcur.execute(create_sql)
    scur.execute(f"SELECT * FROM `{table}`")
    columns = ", ".join(f"`{col[0]}`" for col in scur.description)
    marks = ", ".join(["%s"] * len(scur.description))
    insert = f"INSERT INTO `{table}` ({columns}) VALUES ({marks})"
    copied = 0
    while True:
        rows = scur.fetchmany(BATCH)
        if not rows:
            break
        dcur.executemany(insert, rows)
        dst.commit()
        copied += len(rows)
    scur.close()
    dcur.close()
    return copied


def encode(value):
    """JSON-safe form of a MySQL value; decode() turns it back."""
    if isinstance(value, datetime.datetime):
        return {"$dt": value.isoformat()}
    if isinstance(value, datetime.date):
        return {"$d": value.isoformat()}
    if isinstance(value, datetime.timedelta):
        return {"$td": value.total_seconds()}
    if isinstance(value, decimal.Decimal):
        return {"$dec": str(value)}
    if isinstance(value, (bytes, bytearray)):
        return {"$b": base64.b64encode(bytes(value)).decode()}
    if isinstance(value, set):
        return ",".join(sorted(value))
    return value


def decode(value):
    if not isinstance(value, dict):
        return value
    if "$dt" in value:
        return datetime.datetime.fromisoformat(value["$dt"])
    if "$d" in value:
        return datetime.date.fromisoformat(value["$d"])
    if "$td" in value:
        return datetime.timedelta(seconds=value["$td"])
    if "$dec" in value:
        return decimal.Decimal(value["$dec"])
    return base64.b64decode(value["$b"])


def backup(conn, excluded: set) -> None:
    folder = pathlib.Path("backups")
    folder.mkdir(exist_ok=True)
    path = folder / f"gamemaster-{datetime.datetime.now():%Y-%m-%d-%H%M}.json.gz"
    cur = conn.cursor()
    data = {}
    for table in sorted(tables(conn)):
        if table in excluded:
            continue
        cur.execute(f"SHOW CREATE TABLE `{table}`")
        create_sql = cur.fetchone()[1]
        cur.execute(f"SELECT * FROM `{table}`")
        columns = [col[0] for col in cur.description]
        rows = [[encode(value) for value in row] for row in cur.fetchall()]
        data[table] = {"create": create_sql, "columns": columns, "rows": rows}
        print(f"saved  {table} ({len(rows)} rows)")
    cur.close()
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(data, handle)
    print(f"\nBackup written to {path} ({path.stat().st_size // 1024} KB).")


def restore(conn, path: pathlib.Path) -> None:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        data = json.load(handle)
    answer = input(f"Replace {len(data)} tables on the TARGET database with {path.name}? Type yes: ")
    if answer.strip().lower() != "yes":
        sys.exit("Cancelled.")
    cur = conn.cursor()
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    for table, entry in data.items():
        cur.execute(f"DROP TABLE IF EXISTS `{table}`")
        cur.execute(entry["create"])
        columns = ", ".join(f"`{col}`" for col in entry["columns"])
        marks = ", ".join(["%s"] * len(entry["columns"]))
        rows = [[decode(value) for value in row] for row in entry["rows"]]
        for start in range(0, len(rows), BATCH):
            cur.executemany(f"INSERT INTO `{table}` ({columns}) VALUES ({marks})", rows[start:start + BATCH])
        conn.commit()
        print(f"restored {table} ({len(rows)} rows)")
    cur.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", default="scripts/_copy.env")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--copy", action="store_true")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--exclude", default="")
    parser.add_argument("--backup", action="store_true")
    parser.add_argument("--restore", metavar="FILE")
    args = parser.parse_args()
    if not (args.list or args.copy or args.backup or args.restore):
        parser.error("pick --list, --copy, --backup or --restore")

    env = load_env(pathlib.Path(args.env))
    excluded = ALWAYS_EXCLUDED | {name.strip() for name in args.exclude.split(",") if name.strip()}
    if args.backup:
        backup(connect(env, "TARGET"), excluded)
        return
    if args.restore:
        restore(connect(env, "TARGET"), pathlib.Path(args.restore))
        return

    src, dst = connect(env, "SOURCE"), connect(env, "TARGET")
    source, target = tables(src), tables(dst)

    if args.copy:
        dcur = dst.cursor()
        dcur.execute("SET FOREIGN_KEY_CHECKS = 0")
        dcur.close()
        for table in sorted(source):
            if table in excluded:
                print(f"skip   {table} (excluded)")
                continue
            if table in target and not args.replace:
                print(f"skip   {table} (already on the target; --replace re-copies it)")
                continue
            if not has_primary_key(src, table):
                print(f"⚠️ skip {table}: no primary key (the target refuses tables without one)")
                continue
            print(f"copy   {table} ({source[table]} rows)…", flush=True)
            copy_table(src, dst, table, args.replace)
        target = tables(dst)

    print(f"\n{'table':40} {'source':>10} {'target':>10}")
    problems = 0
    for table in sorted(set(source) | set(target)):
        left, right = source.get(table, "—"), target.get(table, "—")
        mark = ""
        if table not in excluded and left != right:
            mark = "  ⚠️ differs"
            problems += 1
        print(f"{table:40} {left!s:>10} {right!s:>10}{mark}")
    print("\nAll copied tables match." if args.copy and problems == 0 else f"\n{problems} table(s) differ." if problems else "")


if __name__ == "__main__":
    main()
