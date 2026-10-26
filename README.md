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

`HOME_GUILD_ID` in the bot's `.env` is the server this process treats as home. Leave it unset to keep the original TommyKay server. A second bot used for testing must have its **own** token and its **own** `HOME_GUILD_ID`. Do not point a test bot at the live database.

AI chat-log grading needs `GENAI_API_KEY`. Without that key the rest of GameMaster still runs.

## What is not in this repository

- `.env` files and bot tokens
- The old JSON player files in `GameMaster Bot/data/` (live records are in MySQL)
- Hearts of Iron IV's own game files, used only while building the maps
- The Casino site, IronLegion, and the old TicketMaster bot (separate projects)

Map files the website serves are in `web/public/`.

## Updating the new Apollo server

The new Apollo server runs the bot only. Changes take this path:

1. Edit the code on this PC.
2. Push `main` to GitHub.
3. Download the fresh zip from the [Apollo upload release](https://github.com/heartsofironIVTKbot/TK-GameMaster/releases/tag/apollo).
4. On the **new** Apollo server, open **Files**, upload `gamemaster-apollo.zip`, then right-click it and choose **Unarchive**.
5. Restart that server.

After unarchive, `bot.py.py`, `start.sh`, `requirements.txt`, `schema.sql`, and `assets` sit at the top of Files. The startup command is `bash start.sh`.

Secrets go on the Apollo **Variables** tab (yellow **Create Variables**), not in a file. A zip upload cannot overwrite them, and they are not part of GitHub. Create one variable per line below. Leave the optional ones unset.

| Name | Staging value |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Token from the staging Discord application |
| `HOME_GUILD_ID` | The test Discord server's id |
| `MYSQL_HOST` | Host shown on the database page |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | Staging database user |
| `MYSQL_PASSWORD` | Staging database password |
| `MYSQL_DATABASE` | Staging database name |
| `BASE_URL` | `http://localhost:3000` until the website has a public address |

`GENAI_API_KEY`, `HOST_LOG_WEBHOOK_URL`, and `MESSAGE_CONTENT_INTENT` stay empty. Do this on the new server, not on the live TommyKay one.

## Where the live service stands

The website was built and tried with sample data. It has not yet been signed off against the real Discord API and the real database. That check is Phase 1 in [docs/infrastructure-plan.md](docs/infrastructure-plan.md). Until that checklist passes on a test server, do not send players to a new address.

Casino and Fortunes of War stay switched off. They are TommyKay-only and wait on Phase 6 of that same plan.
