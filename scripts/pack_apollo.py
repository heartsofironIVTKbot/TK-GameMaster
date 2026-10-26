"""Build dist/gamemaster-apollo.zip for the Apollo Panel file manager.

The zip's contents sit at the top of the archive, which is the layout
Apollo runs: bot.py.py and start.sh next to each other, not inside an
extra folder. .env and the old player JSON are never included.
"""

from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOT = ROOT / "GameMaster Bot"
OUT = ROOT / "dist" / "gamemaster-apollo.zip"

FILES = ("bot.py.py", "requirements.txt", "start.sh", "schema.sql", ".env.example")


def main() -> None:
    missing = [name for name in FILES if not (BOT / name).is_file()]
    assets = BOT / "assets"
    if not assets.is_dir():
        missing.append("assets/")
    if missing:
        raise SystemExit(f"Missing bot files: {', '.join(missing)}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            archive.write(BOT / name, name)
        for path in sorted(assets.rglob("*")):
            if path.is_file() and path.name != ".DS_Store":
                archive.write(path, path.relative_to(BOT).as_posix())

    names = zipfile.ZipFile(OUT).namelist()
    if any(name.startswith(".env") and name != ".env.example" for name in names):
        raise SystemExit("Refusing to pack a real .env file.")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes, {len(names)} files)")


if __name__ == "__main__":
    main()
