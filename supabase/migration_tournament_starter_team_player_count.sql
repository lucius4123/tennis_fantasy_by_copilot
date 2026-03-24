-- Add configurable starter team player count per tournament.
ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS starter_team_player_count INT DEFAULT 8;

UPDATE tournaments
SET starter_team_player_count = COALESCE(starter_team_player_count, 8)
WHERE starter_team_player_count IS NULL;

ALTER TABLE tournaments
DROP CONSTRAINT IF EXISTS tournaments_starter_team_player_count_check;

ALTER TABLE tournaments
ADD CONSTRAINT tournaments_starter_team_player_count_check
CHECK (starter_team_player_count > 0);
