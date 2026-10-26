# Tickets

*Late October 2026.* The separate TicketMaster bot is merged into GameMaster.
Only the Hearts of Iron IV tickets came over: the moderation tickets (report
a user / moderator, server suggestion) and Stellaris are gone. TicketMaster's
own database code — including the MySQL health checks it kept writing to its
log file every 30 seconds, and its JSON ticket counter — was not brought
over; GameMaster uses its own database connection.

## Who handles what

| Ticket | Who sees it and can close it | Resolving it gives |
| --- | --- | --- |
| ✅ RP Verification | Ticket Support, Host Management | RP Verified (saved to the player's record) |
| ✅ Historical Verification | Ticket Support, Host Management | Hist Verified |
| 🎤 Host application (RP or HIST) | Host Management only | The lowest host rank that branch uses (Assistant, or Full if the server switched Assistant off) |
| ⚠️ Report a host | Host Management only — the reported host is always kept out, even if they're management | — |
| ⚖️ Appeal a ban or warning | Every host, Host Management | — |
| 😠 Report a player | Every host, Host Management | — |
| ⭐ Request a commend | Every host, Host Management | — |
| ❓ General question | Every host, Host Management | — |
| 🐞 Bug report / suggestion | Developers, Host Management | — |

Server admins can see and close everything. Nobody can close their own
ticket. Closing as **Unresolved** never gives a role.

**Verification proof:** a speed test (20 Mb/s+ down and up), hardware specs
(Task Manager → Performance) and proof of all HOI4 DLCs. **Historical
Verified** also needs a screenshot of at least **500 hours** in HOI4 — staff
check it by eye.

## Game tickets ping the game's host

Appeals, player reports, commend requests and questions ask "Roleplay game /
Historical game / no game", then list that branch's games from the last 30
days. The host of the picked game is pinged in the new ticket (and can always
see it). Host reports never ping or show the reported host.

## Inactive tickets (24 h / 48 h)

Server settings → **Tickets** → *Remind and close inactive tickets* (on by
default):

1. **24 hours** with no messages from people → GameMaster pings the game's
   host to resolve or close it. Tickets without a game ping their staff
   roles instead (Ticket Support / Developers / Host Management — never every
   host).
2. **24 more hours** with still no messages → the ticket closes as
   **Unresolved**, with the transcript saved as usual.

A message from anyone (player or staff) resets the clock. GameMaster's own
messages don't count. It checks every 30 minutes.

## Commands

- **/spawn** (Host Management or admins) — post the ticket panel in the
  current channel.
- **/close** — close a ticket if its buttons ever fail (same people as the
  buttons).

## Setup (website → server settings)

- **Staff & access → Host Management** (was "Senior Staff"): the rank above
  Senior hosts. It can be a moderation role, a team lead role or a dedicated
  Host Management role.
- **Tickets** (new step):
  - **Ticket Support roles** — verification tickets only.
  - **Developer roles** — bug reports and suggestions.
  - **Ticket panel channel**, **Ticket category** (keep it hidden from
    @everyone), **Ticket transcripts**, **Private ticket transcripts** (host
    applications and host reports).
  - The inactivity switch.

On TommyKay's server the bot fills the old ticket bot's category, transcript
channels and Helper role in once at startup (a history entry says so).

## Readable transcripts: turn on Message Content

Transcripts are HTML files posted to the transcript channel and DMed to the
player. To include **what people wrote**, Discord's Message Content intent
must be on (the old ticket bot didn't have it either, so its transcripts had
no text):

1. Discord Developer Portal → GameMaster → **Bot** → Privileged Gateway
   Intents → turn on **Message Content Intent**.
2. Set `MESSAGE_CONTENT_INTENT=1` in the bot's environment and restart it.

Do step 1 first — with only step 2, Discord refuses the bot's login. Without
it, transcripts still list who wrote when, plus attachments.

## Switching over from TicketMaster

1. Restart GameMaster (new commands, settings and buttons).
2. Check the **Tickets** step on the website.
3. Stop the TicketMaster bot. The panel it posted and its open tickets keep
   working: GameMaster answers their Game Support, Verification, General
   Question and Close buttons (same button ids). Old moderation and Stellaris
   tickets can be closed with /close by Host Management or admins.
4. Run **/spawn** once to post the new panel (it adds the Bug / Suggestion
   button), then delete the old panel.
