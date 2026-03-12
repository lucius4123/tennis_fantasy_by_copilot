ALTER TABLE player_matches
ADD COLUMN IF NOT EXISTS round TEXT;

ALTER TABLE player_matches
DROP CONSTRAINT IF EXISTS player_matches_round_check;

ALTER TABLE player_matches
ADD CONSTRAINT player_matches_round_check
CHECK (round IN ('R1', 'R2', 'R3', 'QF', 'SF', 'F'));
