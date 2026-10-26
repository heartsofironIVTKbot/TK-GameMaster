"""Parse Hearts of Iron IV state files into a JSON owner mapping.

Scans all ``.txt`` state files in the vanilla states directory, extracts each
state's numeric ID and its owning country tag, and writes a mapping of the form
``"state_<id>": "<TAG>"`` to ``scripts/vanilla_mapping.json``. The input and
output paths can be overridden:

    py scripts/parse_hoi4_states.py --input-dir scripts/hoi4_files/vanilla \
        --output scripts/vanilla_mapping.json

Note: this resolves the base ``owner`` only. For mods whose states carry
start-date ownership transfers (Road to 56's ``NXM = { transfer_state = PREV
}`` blocks), use ``scripts/build_state_map_svg.py`` instead — it applies the
full 1936.1.1 start rules and writes the mapping alongside the SVG.
"""

import argparse
import json
import re
from pathlib import Path

# Resolve paths relative to this script so it works from any working directory.
SCRIPT_DIR = Path(__file__).resolve().parent

# The vanilla state files live directly under the "vanilla" folder (this
# project does not have a "history/states" subdirectory).
INPUT_DIR = SCRIPT_DIR / "hoi4_files" / "vanilla"
OUTPUT_FILE = SCRIPT_DIR / "vanilla_mapping.json"

# State IDs are declared as ``id = <number>`` (spacing around "=" varies).
ID_PATTERN = re.compile(r"(?m)^\s*id\s*=\s*(\d+)")

# Owners are declared as ``owner = TAG`` or ``owner = "TAG"``.
OWNER_PATTERN = re.compile(r'(?m)^\s*owner\s*=\s*"?([A-Za-z0-9_]+)"?')


def parse_state_file(file_path: Path):
    """Return a ``(key, tag)`` tuple for a state file, or ``None`` if invalid."""
    text = file_path.read_text(encoding="utf-8", errors="ignore")

    id_match = ID_PATTERN.search(text)
    owner_match = OWNER_PATTERN.search(text)

    if not id_match or not owner_match:
        print(f"  [SKIP] {file_path.name}: missing id or owner")
        return None

    return f"state_{id_match.group(1)}", owner_match.group(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=INPUT_DIR,
        help=f"Directory of state .txt files (default: {INPUT_DIR}).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_FILE,
        help=f"Output mapping JSON (default: {OUTPUT_FILE}).",
    )
    args = parser.parse_args()

    input_dir: Path = args.input_dir
    output_file: Path = args.output
    txt_files = sorted(input_dir.glob("*.txt"))
    print(f"Scanning {len(txt_files)} .txt files in {input_dir}")

    mapping = {}
    processed = 0

    for index, file_path in enumerate(txt_files, start=1):
        result = parse_state_file(file_path)
        if result is None:
            continue

        key, tag = result
        mapping[key] = tag
        processed += 1

        if processed % 100 == 0:
            print(f"  Processed {processed} states...")

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with output_file.open("w", encoding="utf-8") as handle:
        json.dump(mapping, handle, indent=4, ensure_ascii=False)

    print(f"Wrote {processed} states to {output_file}")
    print(f"Total states successfully processed: {processed}")


if __name__ == "__main__":
    main()
