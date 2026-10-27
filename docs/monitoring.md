# Monitoring

Uptime checks run on **UptimeRobot** (Free plan: 5-minute checks). Alerts go
to the owner's email and a private Discord channel.

| Monitor | Type | URL | Down when |
| --- | --- | --- | --- |
| GameMaster · Website | HTTP(s) | `https://hoi4gamemaster.online/` | No 2xx answer (Render or Cloudflare down) |
| GameMaster · Database | HTTP(s) | `https://hoi4gamemaster.online/api/health` | 503: the website can't reach MySQL (Aiven) |
| GameMaster · Discord bot | Keyword | `https://hoi4gamemaster.online/api/status` | `"state":"online"` missing: no bot heartbeat for 3+ minutes |

Reading an alert:

- **Only the bot is down** → the bot (Apollo): check its console, restart.
- **Database and bot down** → Aiven: check the Aiven console.
- **Everything down** → Render or Cloudflare: check the Render dashboard.

The bot counts as offline 3 minutes after its last heartbeat, so a normal
restart doesn't alert. The Free plan has no maintenance windows: pause the
monitors (Monitor → Pause) before planned downtime such as the switch-over,
and resume after.

`/api/health` and `/api/status` are public and contain nothing private.
