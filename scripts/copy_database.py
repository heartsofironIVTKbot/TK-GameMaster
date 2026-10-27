"""Copy GameMaster's tables from one MySQL database to another, then compare
row counts (docs/infrastructure-plan.md, Phase 2 step 2).

Connection details come from a local file (never committed — scripts/_* is
gitignored), by default scripts/_copy.env:

    SOURCE_HOST=...   SOURCE_PORT=3306   SOURCE_USER=...   SOURCE_PASSWORD=...   SOURCE_DATABASE=...
    TARGET_HOST=...   TARGET_PORT=25060  TARGET_USER=...   TARGET_PASSWORD=...   TARGET_DATABASE=...
    TARGET_SSL_CA=scripts/_ca-certificate.crt     (optional: check the target's certificate)

Usage:
    py -3 scripts/copy_database.py --list                 # tables and row counts on both sides
    py -3 scripts/copy_database.py --copy                 # copy every table missing on the target
    py -3 scripts/copy_database.py --copy --replace       # drop and re-copy tables that exist
    py -3 scripts/copy_database.py --copy --exclude a,b   # skip more tables

IronLegion's tables are always skipped.
"""

import argparse
import pathlib
import sys

import mysql.connector

ALWAYS_EXCLUDED = {
    "guild_config", "ironlegion_state", "verified_users", "steam_alias_history",
    "ironlegion_guild_settings", "old_guild_settings_history",
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", default="scripts/_copy.env")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--copy", action="store_true")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--exclude", default="")
    args = parser.parse_args()
    if not (args.list or args.copy):
        parser.error("pick --list or --copy")

    env = load_env(pathlib.Path(args.env))
    src, dst = connect(env, "SOURCE"), connect(env, "TARGET")
    excluded = ALWAYS_EXCLUDED | {name.strip() for name in args.exclude.split(",") if name.strip()}
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
