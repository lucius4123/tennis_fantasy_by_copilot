-- Add tournament seeding status and separate seed positions for main draw and qualification.

ALTER TABLE tournament_players
ADD COLUMN IF NOT EXISTS seeding_status TEXT NOT NULL DEFAULT 'Main-Draw';

ALTER TABLE tournament_players
ADD COLUMN IF NOT EXISTS tournament_seed_position INT;

ALTER TABLE tournament_players
ADD COLUMN IF NOT EXISTS qualification_seed_position INT;

ALTER TABLE tournament_players
DROP CONSTRAINT IF EXISTS tournament_players_seeding_status_check;

ALTER TABLE tournament_players
ADD CONSTRAINT tournament_players_seeding_status_check
CHECK (seeding_status IN ('Top-Seed', 'Main-Draw', 'Gesetzt', 'Qualifikation - R1', 'Qualifikation - R2'));

ALTER TABLE tournament_players
DROP CONSTRAINT IF EXISTS tournament_players_seed_positions_positive_check;

ALTER TABLE tournament_players
ADD CONSTRAINT tournament_players_seed_positions_positive_check
CHECK (
  (tournament_seed_position IS NULL OR tournament_seed_position > 0)
  AND (qualification_seed_position IS NULL OR qualification_seed_position > 0)
);

CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_seeding
  ON tournament_players (tournament_id, seeding_status);
