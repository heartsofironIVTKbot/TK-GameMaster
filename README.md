# GameMaster

GameMaster is a Discord bot and a website for Hearts of Iron IV communities.
A server owner adds the bot, walks through setup on the website, and then
hosts, reserves nations on the map, takes attendance, and keeps player records
from the site. One bot process can serve many servers. Each server's commends,
warnings, and bans stay on that server.

The bot is `GameMaster Bot/bot.py.py` (Python, discord.py). The website is
`web/` (Next.js). They share one MySQL database. How a server is set up is
written in [docs/server-setup.md](docs/server-setup.md). The path from "works
on my computer" to a hosted service is
[docs/infrastructure-plan.md](docs/infrastructure-plan.md).

## What you need

- A [Discord application](https://discord.com/developers/applications) (its own bot, not someone else's token)
- MySQL 8 (or MariaDB 10.5+)
- Python 3.11 or 3.12
- Node.js 20 or newer

In the Discord Developer Portal, on the bot page, turn **on** these privileged intents:

- Server Members Intent
- Presence Intent

Leave Message Content Intent **off** unless you also set `MESSAGE_CONTENT_INTENT=1` in the bot's `.env`. Turning the switch on in code without turning it on in the portal stops the bot from logging in.

Under OAuth2, add this redirect:

`http://localhost:3000/api/auth/callback`

(Use your real site address instead of localhost once the site is public.)

## Run it on your computer

1. Create an empty database named `hoi4_dashboard`.
2. Copy `GameMaster Bot/.env.example` to `GameMaster Bot/.env` and fill in the bot token and database password.
3. Copy `web/.env.example` to `web/.env.local`. Use the **same** database settings. Fill in `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, and a long random `SESSION_SECRET`.
4. Start the bot:

```bash
cd "GameMaster Bot"
pip install -r requirements.txt
python bot.py.py
```

The bot creates its tables on startup, including the home server's `users` table. You do not have to import `schema.sql` first. `schema.sql` is there if you want to create the tables yourself.

5. Start the website:

```bash
cd web
npm install
npm run dev
```

6. Open [http://localhost:3000/invite](http://localhost:3000/invite), add the bot to a server you own, then finish setup on **Your servers**.

`HOME_GUILD_ID` in the bot's `.env` is required: the server this process treats as home (Casino add-ons and AI log tools). The website's `DISCORD_GUILD_ID` must be the same id. No roles or channels are written in the code. Every server, home included, starts blank and is set up on the website. A second bot used for testing must have its **own** token and its **own** `HOME_GUILD_ID`. Do not point a test bot at the live database.

IronLegion's Steam lock on reservations is off unless a server turns it on and the bot has IronLegion's read-only database login (`IRONLEGION_DB_*`, see `GameMaster Bot/.env.example`). It then checks players hold the authenticated role IronLegion gives on that server.

AI chat-log grading needs `GENAI_API_KEY`. Without that key the rest of GameMaster still runs.

Tests: from `web/`, `node --test` (ticket access, Require IronLegion). The IronLegion lock in the bot: `python "GameMaster Bot/tests/ironlegion_lock.py"` from the repo root with the bot's packages installed (no database needed).

## What is not in this repository

- `.env` files and bot tokens
- The old JSON player files in `GameMaster Bot/data/` (live records are in MySQL)
- Hearts of Iron IV's own game files, used only while building the maps
- The Casino site, IronLegion, and the old TicketMaster bot (separate projects)

Map files the website serves are in `web/public/`.

## Updating the new Apollo server

The new Apollo server runs the bot only. Every push to `main` that changes `GameMaster Bot/bot.py.py` or its `requirements.txt` copies those two files to the `apollo-bot` branch. Apollo installs that branch, so its Files hold only `bot.py.py` and `requirements.txt` (plus the packages Apollo installs and the bot's `data` folder).

One-time setup on the Apollo **Startup** tab: **Git repo address** `https://github.com/heartsofironIVTKbot/TK-GameMaster.git`, **Git install branch** `apollo-bot`, **Startup file** `bot.py.py`, username and token empty. Then delete everything in **Files** and use **Settings → Reinstall server**.

After that, a change goes live with **Restart**: the startup command runs `git pull` before starting the bot.

Secrets go on the Apollo **Variables** tab (yellow **Create Variables**), not in a file. A reinstall or pull cannot overwrite them, and they are not part of GitHub. Create one variable per line below. Leave the optional ones unset.

| Name | Staging value |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Token from the staging Discord application |
| `HOME_GUILD_ID` | The test Discord server's id |
| `MYSQL_HOST` | Host shown on the database page |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | Staging database user |
| `MYSQL_PASSWORD` | Staging database password |
| `MYSQL_DATABASE` | Staging database name |
| `BASE_URL` | The website's public address, e.g. `https://hoi4gamemaster.online` |

`GENAI_API_KEY`, `HOST_LOG_WEBHOOK_URL`, and `MESSAGE_CONTENT_INTENT` stay empty. Do this on the new server, not on the live TommyKay one.

## Where the live service stands

The website was built and tried with sample data. It has not yet been signed off against the real Discord API and the real database. That check is Phase 1 in [docs/infrastructure-plan.md](docs/infrastructure-plan.md). Until that checklist passes on a test server, do not send players to a new address.

Casino and Fortunes of War stay switched off. They are TommyKay-only and wait on Phase 6 of that same plan.
