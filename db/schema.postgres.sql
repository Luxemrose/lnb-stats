-- LNB Stats — esquema para Supabase / PostgreSQL (generado a partir de pipeline/lnbstats/schema.sql).
-- Verificado aplicándolo en PostgreSQL 16 local (29/10/2026). NO probado en un proyecto Supabase real.
-- Para usarlo: SQL Editor del proyecto Supabase -> pegar y ejecutar.
-- Activar Row Level Security y dar sólo lectura pública si se expone a la web.
-- Regla: NULL = dato no disponible; 0 = el valor fue cero.


CREATE TABLE IF NOT EXISTS seasons (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,          -- "2026-27"
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,                 -- nombre tal como lo publica la fuente
  slug          TEXT NOT NULL UNIQUE,
  source_id     TEXT UNIQUE,                   -- id oficial si existe (p. ej. /laliga/equipo/80/...)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name     TEXT NOT NULL,
  name_key      TEXT NOT NULL,                 -- nombre normalizado (comparación)
  source_id     TEXT UNIQUE,                   -- id oficial si existe
  identity      TEXT NOT NULL CHECK (identity IN ('source_id', 'name')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_players_name_key ON players(name_key);

-- Alias: distintas grafías de un mismo equipo/jugador apuntan a la misma fila.
CREATE TABLE IF NOT EXISTS entity_aliases (
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('team', 'player')),
  alias_key     TEXT NOT NULL,
  entity_id     INTEGER NOT NULL,
  PRIMARY KEY (entity_type, alias_key)
);

CREATE TABLE IF NOT EXISTS team_rosters (
  season_id     BIGINT NOT NULL REFERENCES seasons(id),
  team_id       BIGINT NOT NULL REFERENCES teams(id),
  player_id     BIGINT NOT NULL REFERENCES players(id),
  jersey        TEXT,
  position      TEXT,
  source        TEXT NOT NULL,                 -- 'box_score' | 'roster_page' | 'csv' | 'demo'
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  PRIMARY KEY (season_id, team_id, player_id)
);

CREATE TABLE IF NOT EXISTS games (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id       BIGINT NOT NULL REFERENCES seasons(id),
  natural_key     TEXT NOT NULL UNIQUE,        -- temporada|fecha|local|visitante
  source          TEXT NOT NULL,
  source_ref      TEXT,                        -- token de la URL oficial (puede cambiar de formato)
  source_url      TEXT,
  date            TEXT NOT NULL,
  time            TEXT,
  phase           TEXT,
  round           TEXT,
  venue           TEXT,
  home_team_id    BIGINT NOT NULL REFERENCES teams(id),
  away_team_id    BIGINT NOT NULL REFERENCES teams(id),
  home_score      INTEGER,
  away_score      INTEGER,
  status          TEXT NOT NULL,
  detail_level    TEXT NOT NULL CHECK (detail_level IN ('box_score', 'result_only', 'scheduled')),
  content_hash    TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1,
  first_imported_at TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  last_checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_source_ref ON games(source_ref);
CREATE INDEX IF NOT EXISTS idx_games_season_date ON games(season_id, date);

-- Historial: cada versión distinta de un partido queda guardada completa.
CREATE TABLE IF NOT EXISTS game_revisions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id       BIGINT NOT NULL REFERENCES games(id),
  revision      INTEGER NOT NULL,
  content_hash  TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  change_summary TEXT,
  captured_at   TEXT NOT NULL,
  sync_log_id   BIGINT,
  UNIQUE (game_id, revision)
);

CREATE TABLE IF NOT EXISTS player_game_stats (
  game_id       BIGINT NOT NULL REFERENCES games(id),
  player_id     BIGINT NOT NULL REFERENCES players(id),
  team_id       BIGINT NOT NULL REFERENCES teams(id),
  starter       INTEGER,                       -- 1/0/NULL
  did_not_play  INTEGER NOT NULL DEFAULT 0,
  minutes_sec INTEGER, pts INTEGER,
  fg2m INTEGER, fg2a INTEGER, fg3m INTEGER, fg3a INTEGER, ftm INTEGER, fta INTEGER,
  oreb INTEGER, dreb INTEGER, reb INTEGER, ast INTEGER, stl INTEGER, tov INTEGER,
  blk INTEGER, blka INTEGER, pf INTEGER, pfd INTEGER, plus_minus INTEGER, eff INTEGER,
  PRIMARY KEY (game_id, player_id)
);

-- Totales de equipo publicados por la fuente (no calculados por la app).
CREATE TABLE IF NOT EXISTS team_game_stats (
  game_id       BIGINT NOT NULL REFERENCES games(id),
  team_id       BIGINT NOT NULL REFERENCES teams(id),
  is_home       INTEGER NOT NULL,
  minutes_sec INTEGER, pts INTEGER,
  fg2m INTEGER, fg2a INTEGER, fg3m INTEGER, fg3a INTEGER, ftm INTEGER, fta INTEGER,
  oreb INTEGER, dreb INTEGER, reb INTEGER, ast INTEGER, stl INTEGER, tov INTEGER,
  blk INTEGER, blka INTEGER, pf INTEGER, pfd INTEGER, plus_minus INTEGER, eff INTEGER,
  PRIMARY KEY (game_id, team_id)
);

CREATE TABLE IF NOT EXISTS data_sync_logs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source          TEXT NOT NULL,
  scope           TEXT,
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  status          TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  games_new       INTEGER NOT NULL DEFAULT 0,
  games_updated   INTEGER NOT NULL DEFAULT 0,
  games_unchanged INTEGER NOT NULL DEFAULT 0,
  games_rejected  INTEGER NOT NULL DEFAULT 0,
  message         TEXT
);

CREATE TABLE IF NOT EXISTS sync_errors (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_log_id   BIGINT NOT NULL REFERENCES data_sync_logs(id),
  stage         TEXT NOT NULL,                 -- 'fetch' | 'parse' | 'validate' | 'store'
  ref           TEXT,                          -- URL o clave del registro
  message       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  resolved_at   TEXT
);
