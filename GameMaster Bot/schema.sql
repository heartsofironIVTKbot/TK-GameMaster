-- Games storage schema (replaces data/games.json)
-- Create an empty database, then run this file once against it.
-- The bot also creates and updates these tables on startup.

CREATE TABLE IF NOT EXISTS games (
    thread_id               VARCHAR(32)  NOT NULL,
    mode                    VARCHAR(128) NOT NULL DEFAULT 'Unknown',
    host_id                 BIGINT       NOT NULL DEFAULT 0,
    status                  VARCHAR(32)  NULL,
    thread_name             VARCHAR(255) NULL,
    game_started            TINYINT(1)   NOT NULL DEFAULT 0,
    start_timestamp         BIGINT       NULL,
    announcement_message_id BIGINT       NULL,
    announcement_channel_id BIGINT       NULL,
    -- Bumped on every reservation mutation. Stale in-memory maps with an older
    -- rev will update game metadata but will NOT overwrite game_reservations.
    reservations_rev        INT          NOT NULL DEFAULT 0,
    -- Full game document minus reservations (JSON object).
    -- Keeps evolving bot fields without constant ALTER TABLE churn.
    game_data               JSON         NOT NULL,
    created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (thread_id),
    KEY idx_games_status (status),
    KEY idx_games_host (host_id),
    KEY idx_games_mode (mode),
    KEY idx_games_started (game_started)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per reservation slot (nation / Nation_coop / _FILL_...).
-- UNIQUE(thread_id, slot_key) is the capacity lock for concurrent reserves.
-- (thread_id, user_id) is indexed but NOT unique: legacy JSON has 12 games
-- where one user held two slots; new writes still enforce one-slot-per-user in app code.
CREATE TABLE IF NOT EXISTS game_reservations (
    thread_id               VARCHAR(32)  NOT NULL,
    slot_key                VARCHAR(128) NOT NULL,
    user_id                 BIGINT       NOT NULL,
    created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (thread_id, slot_key),
    KEY idx_res_user (thread_id, user_id),
    KEY idx_res_user_global (user_id),
    CONSTRAINT fk_res_game
        FOREIGN KEY (thread_id) REFERENCES games (thread_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- HOI4 HOST-TIER TRACKING
-- --------------------------------------------------------------------------
-- Home-server player records. Other servers use guild_users (created by the
-- bot). Fresh databases need this CREATE; an existing `users` table is left
-- as-is and the ALTERs below add anything missing.
-- ==========================================================================
CREATE TABLE IF NOT EXISTS users (
    discord_id          BIGINT       NOT NULL,
    total_games         INT          NOT NULL DEFAULT 0,
    hoi4_verified       TINYINT(1)   NOT NULL DEFAULT 0,
    stellaris_verified  TINYINT(1)   NOT NULL DEFAULT 0,
    rp_commends         INT          NOT NULL DEFAULT 0,
    rp_warns            INT          NOT NULL DEFAULT 0,
    blacklisted         TINYINT(1)   NOT NULL DEFAULT 0,
    banned              TINYINT(1)   NOT NULL DEFAULT 0,
    hist_banned         TINYINT(1)   NOT NULL DEFAULT 0,
    hist_commends       INT          NOT NULL DEFAULT 0,
    hist_warns          INT          NOT NULL DEFAULT 0,
    stel_commends       INT          NOT NULL DEFAULT 0,
    stel_warns          INT          NOT NULL DEFAULT 0,
    stel_blacklisted    TINYINT(1)   NOT NULL DEFAULT 0,
    stel_banned         TINYINT(1)   NOT NULL DEFAULT 0,
    hosted_games        INT          NOT NULL DEFAULT 0,
    host_acclamations   INT          NOT NULL DEFAULT 0,
    host_violations     INT          NOT NULL DEFAULT 0,
    minor_streaks       TEXT         NULL,
    hoi4_host_tier      VARCHAR(20)  NOT NULL DEFAULT 'None',
    merit_points        INT          NOT NULL DEFAULT 0,
    dishonored          TINYINT(1)   NOT NULL DEFAULT 0,
    dishonored_data     JSON         NULL,
    valor_trusted       VARCHAR(16)  NULL,
    vip                 TINYINT(1)   NOT NULL DEFAULT 0,
    hist_verified       TINYINT(1)   NOT NULL DEFAULT 0,
    hist_host_tier      VARCHAR(20)  NOT NULL DEFAULT 'None',
    ingame_nickname     VARCHAR(64)  NULL,
    PRIMARY KEY (discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Host tier tracking used by /make_host and the 12-hour role/verification
-- audit loop. Safe to re-run: existing columns are left alone.
-- The old Stellaris / blacklist columns (stellaris_verified, stel_*,
-- blacklisted, stellaris_host_tier) are retired: the bot no longer reads or
-- updates them. They are kept only so existing data isn't destroyed.
--
-- Requires MySQL 8.0.29+ / MariaDB 10.5+ for "ADD COLUMN IF NOT EXISTS".
-- On older servers, drop "IF NOT EXISTS" and run once manually instead.
-- ==========================================================================
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS hoi4_host_tier      VARCHAR(20) NOT NULL DEFAULT 'None',
    ADD COLUMN IF NOT EXISTS ingame_nickname     VARCHAR(64) NULL;

-- ==========================================================================
-- MERIT POINTS & DISHONORED TITLE (universal systems)
-- --------------------------------------------------------------------------
-- merit_points     : cumulative "Valor" points (never expire on their own).
-- dishonored       : 1 while the user holds an active Dishonored title.
-- dishonored_data  : JSON keyed by base category (Roleplay/Historical),
--                    e.g. {"Roleplay": {"all_majors": true, "majors": [],
--                    "minors": ["Poland"], "description": "...", "issued_by": 123,
--                    "ts": 1700000000}}.
-- Requires MySQL 8.0.29+ / MariaDB 10.5+ for "ADD COLUMN IF NOT EXISTS".
-- On older MySQL (or if you never run this file), the bot also auto-adds these
-- columns at startup via _ensure_users_schema_mysql() — that is the preferred
-- fix when /award or /sentence fails with "Unknown column 'merit_points'".
-- ==========================================================================
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS merit_points    INT        NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dishonored      TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dishonored_data JSON       NULL;

-- ==========================================================================
-- SCHEDULING SYSTEM (replaces data/schedule.json and data/locked_days.json)
-- --------------------------------------------------------------------------
-- Run once against your GameMaster database (or let the bot create the
-- tables on startup).
-- Both tables store the full slot/lock as JSON (like `drafts`), keyed by a
-- synthetic id, since the legacy JSON files were unkeyed flat lists.
-- ==========================================================================
CREATE TABLE IF NOT EXISTS schedule_slots (
    slot_id             VARCHAR(64)  NOT NULL,
    week                DATE         NOT NULL,
    day                 VARCHAR(16)  NOT NULL,
    host_id             BIGINT       NOT NULL DEFAULT 0,
    mode                VARCHAR(128) NOT NULL DEFAULT 'Unknown',
    category            VARCHAR(32)  NULL,
    game_timestamp      BIGINT       NULL,
    announce_timestamp  BIGINT       NULL,
    announced           TINYINT(1)   NOT NULL DEFAULT 0,
    -- Full slot document (mode, host_id, day, week, game_timestamp,
    -- logging_mode, add_on, category, major_lock_level, minor_lock_level,
    -- announce_timestamp, announced, slot_id).
    slot_data           JSON         NOT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (slot_id),
    KEY idx_schedule_week_day (week, day),
    KEY idx_schedule_host (host_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS locked_days (
    lock_id     VARCHAR(64) NOT NULL,
    week        DATE        NOT NULL,
    day         VARCHAR(16) NOT NULL,
    -- Full lock document (week, day, reason, locked_by, ts, lock_id).
    lock_data   JSON        NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lock_id),
    UNIQUE KEY uniq_locked_week_day (week, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Simple key/value store (replaces data/bot_config.json — schedule_message_id etc).
CREATE TABLE IF NOT EXISTS bot_config (
    config_key   VARCHAR(64) NOT NULL,
    config_value JSON        NULL,
    PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- WEB SCHEDULING CALENDAR (web /schedule page → Discord schedule board)
-- --------------------------------------------------------------------------
-- The bot also creates both tables at startup. The web queues requests;
-- web_schedule_request_loop validates + applies them and writes the outcome.
-- web_host_roster is refreshed by the bot every 5 minutes (is_host() rules).
-- ==========================================================================
CREATE TABLE IF NOT EXISTS web_schedule_requests (
    request_id    VARCHAR(64) NOT NULL,
    action        VARCHAR(16) NOT NULL,            -- create | update | cancel | lock_day | unlock_day | roster_assign | roster_remove
    slot_id       VARCHAR(64) NULL,
    host_id       BIGINT      NOT NULL,
    payload       JSON        NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | done | error | confirm (host must accept warnings)
    result        JSON        NULL,
    error         TEXT        NULL,
    created_at    BIGINT      NOT NULL,
    processed_at  BIGINT      NULL,
    PRIMARY KEY (request_id),
    KEY idx_web_schedule_requests_status (status, created_at),
    KEY idx_web_schedule_requests_host (host_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS web_host_roster (
    user_id       BIGINT      NOT NULL,
    username      VARCHAR(64) NULL,
    display_name  VARCHAR(64) NULL,
    is_senior     TINYINT(1)  NOT NULL DEFAULT 0,  -- staff: admins + Senior Management
    updated_at    BIGINT      NOT NULL,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server members for the live map's player search (host tools) and profile
-- cards, refreshed by the bot every 10 minutes. verified = Steam/IronLegion
-- role rules; role_ids = JSON array, highest role first. banner_hash and
-- accent_color are written by the web at Discord login (the bot can't read
-- other users' banners) and are left alone by the bot's refresh.
CREATE TABLE IF NOT EXISTS web_member_directory (
    user_id       BIGINT       NOT NULL,
    username      VARCHAR(64)  NULL,
    display_name  VARCHAR(64)  NULL,
    avatar_url    VARCHAR(255) NULL,
    verified      TINYINT(1)   NOT NULL DEFAULT 0,
    is_vip        TINYINT(1)   NOT NULL DEFAULT 0,
    role_ids      TEXT         NULL,
    banner_hash   VARCHAR(64)  NULL,
    accent_color  INT          NULL,
    updated_at    BIGINT       NOT NULL,
    PRIMARY KEY (user_id),
    KEY idx_web_member_directory_username (username),
    KEY idx_web_member_directory_display (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Web portfolios (docs/realtime-and-scale-plan.md, Phase 1). Both are created
-- and kept current by the bot; /backfill_portfolios fills them for old data.
-- player_summary: one precomputed row per player (history-derived numbers +
-- latest 20 games, newest first) so a portfolio is a single primary-key read.
CREATE TABLE IF NOT EXISTS player_summary (
    user_id             BIGINT  NOT NULL,
    total_games         INT     NOT NULL DEFAULT 0,
    attended            INT     NOT NULL DEFAULT 0,
    attendance_tracked  INT     NOT NULL DEFAULT 0,
    recent_games        JSON    NULL,
    ban_games           JSON    NULL,
    version             INT     NOT NULL DEFAULT 1,
    updated_at          BIGINT  NOT NULL,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- moderation_events: every moderation action with its reason, issuer, game
-- and host-log link. source_message_id (the host-log message) keeps the log
-- backfill from importing an action twice.
CREATE TABLE IF NOT EXISTS moderation_events (
    id                 BIGINT       NOT NULL AUTO_INCREMENT,
    user_id            BIGINT       NOT NULL,
    action             VARCHAR(32)  NOT NULL,
    mode               VARCHAR(32)  NULL,
    amount             INT          NULL,
    reason             TEXT         NULL,
    actor_id           BIGINT       NULL,
    thread_id          VARCHAR(64)  NULL,
    automatic          TINYINT(1)   NOT NULL DEFAULT 0,
    details            JSON         NULL,
    log_url            VARCHAR(255) NULL,
    source             VARCHAR(16)  NOT NULL DEFAULT 'live',
    source_message_id  BIGINT       NULL,
    created_at         BIGINT       NOT NULL,
    PRIMARY KEY (id),
    KEY idx_moderation_events_user (user_id, created_at),
    UNIQUE KEY uq_moderation_events_message (source_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- attendance_events: the Attendance page's audit log — game start, every
-- voice sample, participation replies, late joins, voice checks, host
-- overrides (with reason), no-show warnings given / reverted, finalize and
-- chat-log hints. game_id = the game's lobby thread id (stable across
-- /game_end). The bot creates this table itself on startup.
CREATE TABLE IF NOT EXISTS attendance_events (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    game_id     VARCHAR(64)  NOT NULL,
    kind        VARCHAR(32)  NOT NULL,
    user_id     BIGINT       NULL,
    actor_id    BIGINT       NULL,
    details     JSON         NULL,
    created_at  BIGINT       NOT NULL,
    PRIMARY KEY (id),
    KEY idx_attendance_events_game (game_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- game_presets: the website's game mode presets (Presets page) — saved nation
-- groups, nation locks, lock levels, rules and mods for one mode. Written by
-- the web (which also creates the table if needed) and created by the bot at
-- startup. guild_id keeps every server's presets separate; shared = 1 puts a
-- preset in the public library other servers can copy from (a copy is a new
-- row in the copying server, copied_from = the original). data = JSON
-- {layout, nation_locks, major_lock_level, minor_lock_level, rules, mods}.
CREATE TABLE IF NOT EXISTS game_presets (
    preset_id        VARCHAR(32)  NOT NULL,
    guild_id         VARCHAR(32)  NOT NULL,
    guild_name       VARCHAR(100) NULL,
    mode             VARCHAR(64)  NOT NULL,
    name             VARCHAR(60)  NOT NULL,
    description      VARCHAR(300) NULL,
    created_by       BIGINT       NOT NULL,
    created_by_name  VARCHAR(64)  NULL,
    shared           TINYINT(1)   NOT NULL DEFAULT 0,
    copied_from      VARCHAR(32)  NULL,
    uses             INT          NOT NULL DEFAULT 0,
    data             JSON         NOT NULL,
    created_at       BIGINT       NOT NULL,
    updated_at       BIGINT       NOT NULL,
    PRIMARY KEY (preset_id),
    KEY idx_game_presets_guild (guild_id, mode),
    KEY idx_game_presets_shared (shared, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The server's roles for the web profile card (mirrored with the directory).
-- icon = role icon URL or unicode emoji.
CREATE TABLE IF NOT EXISTS web_guild_roles (
    role_id     BIGINT       NOT NULL,
    name        VARCHAR(100) NOT NULL,
    color       INT          NOT NULL DEFAULT 0,
    position    INT          NOT NULL DEFAULT 0,
    icon        VARCHAR(255) NULL,
    updated_at  BIGINT       NOT NULL,
    PRIMARY KEY (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-host hosting record (replaces data/host_stats.json).
CREATE TABLE IF NOT EXISTS host_stats (
    host_id       BIGINT NOT NULL,
    hosted_games  INT    NOT NULL DEFAULT 0,
    acclamations  INT    NOT NULL DEFAULT 0,
    violations    INT    NOT NULL DEFAULT 0,
    history       JSON   NULL,
    PRIMARY KEY (host_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
