-- Add wildcard support for tournament players.
-- Wildcards must always be marked as 'Garantiert' appearance probability.

ALTER TABLE tournament_players
ADD COLUMN IF NOT EXISTS is_wildcard BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tournament_players
DROP CONSTRAINT IF EXISTS tournament_players_wildcard_guaranteed_check;

ALTER TABLE tournament_players
ADD CONSTRAINT tournament_players_wildcard_guaranteed_check
CHECK (NOT is_wildcard OR appearance_probability = 'Garantiert');
