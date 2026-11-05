# Game archive, the live game post and ratings

Status: built 2026-11-05 (website `/archive`, bot `LivePostEngine` and rating by DM), not yet tried on
the test bot with a real game. Mock-up: `docs/design/archive.html`. Tests:
`GameMaster Bot/tests/live_post.py`.

Two parts replace today's Public Attendance Log:

1. **The archive** on the website (`/archive`): every finished game on every
   server, public, searchable, never frozen. It shows everything the old
   Discord log showed: who played which nation, who came, and every commend,
   Merit, warning, Dishonored and game ban.
2. **The live game post** in Discord: one small message per game, posted the
   moment a host starts the game and kept up to date until its rating
   closes. It shows only the mode, the time, the host, the status, how many
   players came and, once the game ends, its rating.
3. **Rating by DM.** The 5-star feedback moves out of the announcement
   channel and into the end-of-game DM each player already gets. The result
   shows on the post and on the website.

The archive reads the database. It never calls Discord. The live post is the
only part that does, and it is built so that Discord's limits can't be hit
however busy a game is.

## Why the old log has to go

- **Too many API calls.** Every refresh fetches each message before editing
  it (`fetch_message` + `edit`, two calls), for every chunk of the game.
- **It splits.** A big game is several messages, and a re-render can create
  or delete chunks.
- **It freezes.** To stop runaway edits only the 7 newest games may change
  (`PUBLIC_ARCHIVE_EDIT_WINDOW`), so a reward given on an older game never
  shows.
- **No overall budget.** Each game schedules its own refresh. Ten busy games
  at once means ten independent editors, all with their own timers.
- **Rewards are written into Discord forever.** Changing one means editing
  an old message.

## The live game post

### What it shows

| Part | Content |
|---|---|
| Colour bar | The status colour (the calendar's: yellow starting, blue on-going, grey ended, red cancelled) |
| Author line | The mode, e.g. "Roleplay, Road to 56" |
| Title | The game's name, linking to its page in the archive |
| Time | A Discord timestamp, `<t:…:F>` and `<t:…:R>` (each reader sees their own time zone) |
| Host | `@host` (a mention in an embed doesn't ping) |
| Status | Starting, On-going, Ended or Cancelled |
| Players | How many came, e.g. "24 of 32 in game", then "28 of 32 played" |
| Rating | Once the game ends: the stars, the average and how many rated, e.g. "★★★★☆ 4.3 from 21 players", and when rating closes |

No player list, no rewards, warnings or bans. Those are on the archive page,
where they can change without touching Discord.

### When it changes

| Moment | Status | Trigger |
|---|---|---|
| Host presses Start game (`game_start_started_at` is set) | Starting | posted right away |
| The start finishes (`game_started`) | On-going | edit |
| During the game | On-going | presence: attendance samples, hot-joins, drops, roster moves |
| The host ends the game | Ended | edit; the Rating line appears |
| Players rate it | Ended | rating edits, at most one a minute |
| Rating closes, 24 hours after the end | Ended | last edit, then the post never changes again |
| The game is cancelled after starting | Cancelled | last edit, then never again |

After the last edit the game costs zero Discord calls forever. There is no
"newest 7" window any more: old games stay correct because the archive page,
not the post, is where they are read.

### Always one message

The render is a pure function, `render_live_post(game) -> LivePost`, with no
Discord calls, so it can be tested on its own. With no player list the post
is a few hundred characters, far under Discord's limits (4,096 for the
description, 6,000 for the whole embed), so it can never split. The only
long text is the game's name, cut to the 256-character title limit.

### The engine

One background worker, `LivePostEngine`, owns every live post on every
server. Nothing else edits them.

```
event (reserve, sample, hot-join, start, end, …)
   │  mark_dirty(game_id, priority)        ← cheap, no Discord call, no I/O
   ▼
dirty set {game_id: highest priority since last edit}
   │  worker loop picks the game whose turn is due
   ▼
render(game)  →  hash  ──same as last sent?──►  done (no call)
   │ different
   ▼
per-channel bucket  +  global bucket  →  one PATCH (partial message, no fetch)
   │
   ▼
save {message_id, hash, sent_at} in game_data
```

**Marking, not sending.** The 13 places that call `schedule_log_update` today
call `mark_live_post_dirty(game_id, reason)` instead. Marking only flips an
entry in a dict, so a burst of 200 events is 200 dict writes and still one
edit.

**Coalescing.** A game edits at most once every 10 seconds while it runs,
and at most once a minute while its rating is open. A status change
(Starting, On-going, Ended, Cancelled) jumps the queue, with a 2-second
floor, so the colour and status are never late. Everything that
happens between two edits goes out in the next one, rendered from the
latest state.

**Skipping no-ops.** The engine keeps a hash of the last render it sent (in
memory, and saved on the game whenever the message, the channel or the
final state changes). If
a new render has the same hash (a sample that changed nothing, a reward,
which isn't in the post, a player changing their rating back) there is no
call at all.

**One call per edit.** It edits through `channel.get_partial_message(id)`,
which needs no fetch. Today's path costs two calls.

**Budgets.** Every edit takes a token from two buckets before it goes out:

| Bucket | Limit | Why |
|---|---|---|
| Per channel | 1 edit per 1.5 s (bursts of 3) | Discord's channel limit is about 5 per 5 s; this leaves room for everything else the bot posts there |
| Global, all servers | 10 edits per second | Discord's bot-wide limit is 50 requests per second; this leaves 80% for the rest of the bot |

A game waiting on a bucket keeps its dirty flag and goes out when a token
frees up. Nothing is dropped and nothing piles up: a game that waits 30
seconds still sends one edit, with the newest state.

**Fair order.** The worker serves the game that has waited longest, so one
huge game can't starve the others.

### When Discord says no

| Answer | What the engine does |
|---|---|
| 429 rate limited | Waits the `retry_after` Discord gives, for that channel only (globally if the 429 says global), then retries |
| 404 message deleted | Posts it again once. At most one re-post per game per 10 minutes, so a deleting moderator can't cause a loop |
| 403 no permission | Stops for that game for 30 minutes, then tries again, and tells the host log (at most once an hour) which channel refuses it |
| 5xx / network | Retries with backoff: 2 s, 4 s, 8 s … up to 2 minutes, with jitter |

### No duplicate posts

The first post is the only risky moment: if the bot stops after Discord
creates the message but before its ID is saved, a restart could post a
second one.

1. Before sending, the engine saves `live_post.posting_at` on the game.
2. It sends with a nonce made from the game ID, and saves the message ID the
   moment Discord answers.
3. On restart, a game with `posting_at` but no message ID reads the last 50
   messages in its channel once, looking for its own post (the title links
   to the game's archive page, which carries the game ID), and adopts it
   instead of posting again.

Only one worker exists, so two posts for the same game can't race inside the
bot.

### After a restart

On boot the engine marks every running game, and every ended game whose
rating is still open, at low priority, one every 2 seconds. A restart with
10 such games costs at most 10 edits, spread over 20 seconds. Games the old
Public Attendance Log already posted keep their old messages and get no
live post.

The same start-up pass saves the archive layout on every older game that
doesn't have one (database writes only, 5 a second), so the website groups
them like the reservation board too.

### Where it posts

The same channel as today's log: each mode's public log channel (server
setup, Channels step). Posts already in those channels from the old system
stay as they are; the engine never touches them.

### Rough load

A 40-player game produces a few hundred events an hour (samples, voice,
hot-joins). Only the player count is shown, so most of them change nothing
and are skipped by the hash: in practice a few dozen edits per game. Its
rating then costs at most 60 edits an hour for a day, usually a handful.
Ten busy games on different servers: well under one edit a second in
total, a tenth of the global budget or less.

## Rating the game

### The DM

When the host ends the game, every player marked present already gets a DM.
That DM becomes the rating:

- An embed: "*Roleplay #87, Road to 56* has ended. Thanks for playing.
  Hosts review the game for commends and warnings." and "How was it?"
- Five buttons, 1 to 5 stars, and a link button to the game in the archive.
- Clicking a star **edits that DM in place**: the chosen button turns green,
  and the text says "You gave it 4 stars. +1 Merit. You can change it until
  Monday 18:40." No extra messages.
- Edits made in answer to a click go through the interaction, which doesn't
  count against the bot's rate limits.

The rules stay the same as the old poll:

- Only players marked present can rate (they are the only ones DMed).
- One rating each; it can be changed until rating closes.
- 1 Merit for the first rating only.
- Rating closes **24 hours after the game ends**, the moment the hosting is
  judged (3.0 or more is Successful Hosting). Today people could still vote
  for another day after the judgement; now the number shown is the number
  judged. A click after that answers "Rating has closed".

### What goes away

- The public poll in the announcement channel.
- The 48-hour step that deleted it and copied it to the host chat logs.
  The rating is on the post, the archive page and the host's Games page.
- `FEEDBACK_ARCHIVE_AFTER_SEC` and `_archive_session_feedback`.

### If a DM can't be delivered

Some players have DMs closed. The archive page shows a **Rate this game**
box to a logged-in player who was marked present, while rating is open. It
sends the rating to the bot as a player request (like crash reports), so the
bot stays the only writer and gives the Merit the same way.

### Privacy

Who gave which rating is never shown anywhere: not on the post, not on the
website, not to hosts. Only the average, the count and how many gave each
number of stars.

## The archive (website)

- **`/archive`**, public, no login. Tabs: **All games**, **Roleplay**,
  **Historical**. The roleplay archive (`/roleplay`) moves inside it: a
  graded game shows a "Roleplay graded" mark and links to its story;
  `/roleplay` redirects to the Roleplay tab.
- **The list**: each game with its mode, server, date, host, its rating,
  and presence counts as icons (played, no-show, told the host, joined
  late), plus its commends, Merit, warnings, Dishonored and bans. Search by
  player, nation or game; filter by mode and server.
- **A game** (`/archive/<game>`): the rating (stars, average, count and how
  many gave each number of stars), count boxes like the map's reservation
  board (played, no-show, told the host, joined late, commend, Merit,
  warning, Dishonored, game ban), then one table grouped the same way as the
  board (Majors, Europe, Asia …): presence, flag, nation, player, and every
  mark they got.
- **Data**: the `games` table and its `game_data` (reservations,
  `present_ids`, `dropped_out`, `late_join_nations`, `game_action_counts`,
  `feedback_ratings`),
  plus the nation layout the map uses. No Discord calls. A running game's
  page refreshes every 15 seconds.
- **Privacy**: names and avatars, never Discord IDs, the same as the
  roleplay archive. Niko chose to show warnings, Dishonored and bans
  publicly, as the Discord log did.

## Build order (all done)

1. The archive pages and API (website only, safe to ship first).
2. `render_live_post` and its tests.
3. `LivePostEngine`: dirty set, buckets, worker, failure handling, restart
   recovery. Tests run the scheduler on a fake clock with a fake Discord that
   counts calls and returns 429s, 404s and 403s.
4. Switch the 13 call sites, delete the old log code
   (`update_public_log`, the chunk packer, `PUBLIC_ARCHIVE_EDIT_WINDOW`).
5. Rating by DM: the DM embed and buttons, rating closes with the hosting
   judgement, the website's Rate this game box, and remove the public poll.
6. Test on the test bot with a real game before the live switch.
