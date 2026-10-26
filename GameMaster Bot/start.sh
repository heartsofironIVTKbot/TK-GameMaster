#!/bin/bash
# Apollo Panel startup script — avoids blocking on PyPI when deps are already installed.

cd /home/container 2>/dev/null || cd "$(dirname "$0")"

export PYTHONUSERBASE="${PYTHONUSERBASE:-/home/container/.local}"
export PATH="${PYTHONUSERBASE}/bin:${PATH}"

echo "=================================================="
echo " HOI4 Manager Bot — startup"
echo " Working directory: $(pwd)"
echo " Python: $(command -v python3 || command -v python)"
echo "=================================================="

# If discord.py imports cleanly, skip pip entirely (prevents PyPI timeout stalls).
if python3 -c "import discord, aiohttp, mysql.connector; from google import genai" 2>/dev/null; then
    echo "✅ All dependencies already installed — skipping pip."
else
    echo "📦 Missing packages detected — installing from requirements.txt..."
    pip install --user --timeout 120 --retries 5 --no-cache-dir -r requirements.txt
    INSTALL_EXIT=$?
    if [ "$INSTALL_EXIT" -ne 0 ]; then
        echo "⚠️  pip install exited with code ${INSTALL_EXIT}."
        echo "    If packages exist in .local, the bot will still try to start."
    else
        echo "✅ pip install finished."
    fi
fi

echo ""
echo "📋 Installed package versions:"
python3 - <<'PY' 2>/dev/null || true
import importlib.metadata as m
for pkg in ("discord.py", "aiohttp", "google-genai", "mysql-connector-python"):
    try:
        print(f"  - {pkg}: {m.version(pkg)}")
    except m.PackageNotFoundError:
        print(f"  - {pkg}: NOT INSTALLED")
PY

echo ""
echo "🚀 Launching bot.py.py ..."
exec python3 bot.py.py
