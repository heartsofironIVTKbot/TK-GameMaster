"""Apollo starts this file. The bot itself is in ``GameMaster Bot/bot.py.py``.

On each start, if this folder is a git checkout, pull the latest ``main``
and start that version. Secrets stay in the Apollo Variables tab.
"""

import os
import runpy
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BOT_DIR = os.path.join(ROOT, "GameMaster Bot")
BOT_FILE = os.path.join(BOT_DIR, "bot.py.py")


def _git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=120)


def _keep_only_bot_folder() -> None:
    """The panel clones the whole repository. Keep only the top-level files
    and GameMaster Bot/ on disk; the website and docs are not used here."""
    try:
        current = _git("sparse-checkout", "list")
        if current.returncode == 0 and current.stdout.strip() == "GameMaster Bot":
            return
        _git("sparse-checkout", "init", "--cone")
        result = _git("sparse-checkout", "set", "GameMaster Bot")
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"⚠️ Could not trim the checkout: {exc}")
        return
    if result.returncode == 0:
        print("✅ Checkout trimmed to GameMaster Bot/")
    else:
        print(f"⚠️ Could not trim the checkout: {(result.stderr or result.stdout).strip()[:300]}")


def _pull_latest() -> None:
    if os.getenv("GM_GIT_PULLED") == "1":
        return
    if not os.path.isdir(os.path.join(ROOT, ".git")):
        return
    os.environ["GM_GIT_PULLED"] = "1"
    _keep_only_bot_folder()
    try:
        result = _git("pull", "--ff-only")
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"⚠️ Git pull skipped: {exc}")
        return
    text = ((result.stdout or "") + (result.stderr or "")).strip()
    if result.returncode != 0:
        print(f"⚠️ Git pull failed: {text[:300]}")
        return
    print(f"✅ Git pull: {text[:200] or 'already up to date'}")
    os.execv(sys.executable, [sys.executable, os.path.abspath(__file__), *sys.argv[1:]])


if __name__ == "__main__":
    _pull_latest()
    if not os.path.isfile(BOT_FILE):
        raise SystemExit(f"Bot file not found: {BOT_FILE}")
    os.chdir(BOT_DIR)
    sys.path.insert(0, BOT_DIR)
    runpy.run_path(BOT_FILE, run_name="__main__")
