-- Extend seeding status options with Top-Seed.

ALTER TABLE tournament_players
DROP CONSTRAINT IF EXISTS tournament_players_seeding_status_check;

ALTER TABLE tournament_players
ADD CONSTRAINT tournament_players_seeding_status_check
CHECK (seeding_status IN ('Top-Seed', 'Main-Draw', 'Gesetzt', 'Qualifikation - R1', 'Qualifikation - R2'));
