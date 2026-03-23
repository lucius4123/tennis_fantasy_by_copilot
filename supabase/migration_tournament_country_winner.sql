ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS previous_winner_player_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tournaments_previous_winner_player_id_fkey'
      AND table_name = 'tournaments'
  ) THEN
    ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_previous_winner_player_id_fkey
    FOREIGN KEY (previous_winner_player_id)
    REFERENCES players(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournaments_previous_winner_player_id
  ON tournaments(previous_winner_player_id);
