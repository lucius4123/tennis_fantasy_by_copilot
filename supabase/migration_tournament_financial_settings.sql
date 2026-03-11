-- Add per-tournament financial settings for manager starting budget and starter team target value.
ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS start_budget INT DEFAULT 1000000;

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS starter_team_target_value INT DEFAULT 0;

UPDATE tournaments
SET
  start_budget = COALESCE(start_budget, 1000000),
  starter_team_target_value = COALESCE(starter_team_target_value, 0);
