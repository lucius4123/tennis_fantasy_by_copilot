-- Migration: Tournament-scoped player ownership
-- A player can be owned by different teams in different tournaments,
-- and can appear on the transfer market simultaneously for different tournament contexts.

-- ── 1. team_players: add tournament_id, update PK ────────────────────────────

ALTER TABLE team_players
    ADD COLUMN tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

-- Backfill existing rows with the currently active tournament (if any)
UPDATE team_players
SET tournament_id = (
    SELECT id FROM tournaments WHERE is_active = true LIMIT 1
)
WHERE tournament_id IS NULL;

-- Change primary key to include tournament_id
ALTER TABLE team_players
    DROP CONSTRAINT team_players_pkey;

ALTER TABLE team_players
    ADD CONSTRAINT team_players_pkey PRIMARY KEY (team_id, player_id, tournament_id);

-- ── 2. market_auctions: add tournament_id ────────────────────────────────────

ALTER TABLE market_auctions
    ADD COLUMN tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

-- Backfill existing auction rows
UPDATE market_auctions
SET tournament_id = (
    SELECT id FROM tournaments WHERE is_active = true LIMIT 1
)
WHERE tournament_id IS NULL;

-- ── 3. market_player_rotation: add tournament_id, update PK ─────────────────

ALTER TABLE market_player_rotation
    ADD COLUMN tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

-- Backfill existing rotation rows
UPDATE market_player_rotation
SET tournament_id = (
    SELECT id FROM tournaments WHERE is_active = true LIMIT 1
)
WHERE tournament_id IS NULL;

-- Change primary key to include tournament_id
ALTER TABLE market_player_rotation
    DROP CONSTRAINT market_player_rotation_pkey;

ALTER TABLE market_player_rotation
    ADD CONSTRAINT market_player_rotation_pkey PRIMARY KEY (league_id, player_id, tournament_id);

-- Update index to include tournament_id
DROP INDEX IF EXISTS idx_market_player_rotation_league_seen;

CREATE INDEX idx_market_player_rotation_league_tournament_seen
    ON market_player_rotation (league_id, tournament_id, seen_in_cycle);

-- ── 4. Update check_player_assignment trigger to be tournament-scoped ─────────
-- A player can now be in team_players and market_auctions simultaneously,
-- as long as the tournament_id differs. The constraint only fires when the
-- same (player, tournament) combination is double-assigned within a league.

CREATE OR REPLACE FUNCTION check_player_assignment()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'team_players' THEN
        IF EXISTS (
            SELECT 1
            FROM market_auctions ma
            JOIN fantasy_teams ft ON ft.league_id = ma.league_id
            WHERE ft.id = NEW.team_id
              AND ma.player_id = NEW.player_id
              AND ma.tournament_id IS NOT DISTINCT FROM NEW.tournament_id
        ) THEN
            RAISE EXCEPTION 'Player is already listed in an auction for this tournament in this league';
        END IF;

    ELSIF TG_TABLE_NAME = 'market_auctions' THEN
        IF EXISTS (
            SELECT 1
            FROM team_players tp
            JOIN fantasy_teams ft ON tp.team_id = ft.id
            WHERE ft.league_id = NEW.league_id
              AND tp.player_id = NEW.player_id
              AND tp.tournament_id IS NOT DISTINCT FROM NEW.tournament_id
        ) THEN
            RAISE EXCEPTION 'Player is already owned by a team for this tournament in this league';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
