-- Add fixed lineup slots including two reserve slots.
-- Reserve slots are stored as slot_index 5 and 6 and only allow players ranked worse than 75.

ALTER TABLE tournament_lineups
ADD COLUMN IF NOT EXISTS slot_index SMALLINT;

WITH numbered_lineups AS (
  SELECT
    tournament_id,
    team_id,
    player_id,
    ROW_NUMBER() OVER (
      PARTITION BY tournament_id, team_id
      ORDER BY player_id
    ) - 1 AS generated_slot_index
  FROM tournament_lineups
)
UPDATE tournament_lineups AS lineup
SET slot_index = LEAST(numbered_lineups.generated_slot_index, 6)
FROM numbered_lineups
WHERE lineup.tournament_id = numbered_lineups.tournament_id
  AND lineup.team_id = numbered_lineups.team_id
  AND lineup.player_id = numbered_lineups.player_id
  AND lineup.slot_index IS NULL;

ALTER TABLE tournament_lineups
ALTER COLUMN slot_index SET NOT NULL;

ALTER TABLE tournament_lineups
DROP CONSTRAINT IF EXISTS tournament_lineups_slot_index_check;

ALTER TABLE tournament_lineups
ADD CONSTRAINT tournament_lineups_slot_index_check
CHECK (slot_index BETWEEN 0 AND 6);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_lineups_team_slot_unique
ON tournament_lineups (tournament_id, team_id, slot_index);

CREATE OR REPLACE FUNCTION validate_tournament_lineup_slot()
RETURNS TRIGGER AS $$
DECLARE
  player_ranking INT;
BEGIN
  IF NEW.slot_index >= 5 THEN
    SELECT ranking INTO player_ranking
    FROM players
    WHERE id = NEW.player_id;

    IF player_ranking IS NULL OR player_ranking <= 75 THEN
      RAISE EXCEPTION 'Reserve slots allow only players with ranking worse than 75';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_tournament_lineup_slot_before_write ON tournament_lineups;

CREATE TRIGGER validate_tournament_lineup_slot_before_write
BEFORE INSERT OR UPDATE ON tournament_lineups
FOR EACH ROW EXECUTE FUNCTION validate_tournament_lineup_slot();