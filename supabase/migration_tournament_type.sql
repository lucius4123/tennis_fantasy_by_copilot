ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS tournament_category TEXT,
ADD COLUMN IF NOT EXISTS singles_player_count INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tournaments_tournament_category_check'
      AND table_name = 'tournaments'
  ) THEN
    ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_tournament_category_check
    CHECK (tournament_category IN ('grand_slam', 'masters_1000', 'atp_500', 'atp_250'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tournaments_singles_player_count_check'
      AND table_name = 'tournaments'
  ) THEN
    ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_singles_player_count_check
    CHECK (singles_player_count IN (128, 96, 56, 48, 32, 28));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tournaments_category_player_count_check'
      AND table_name = 'tournaments'
  ) THEN
    ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_category_player_count_check
    CHECK (
      (tournament_category IS NULL AND singles_player_count IS NULL)
      OR (tournament_category = 'grand_slam' AND singles_player_count = 128)
      OR (tournament_category = 'masters_1000' AND singles_player_count IN (96, 56))
      OR (tournament_category = 'atp_500' AND singles_player_count IN (48, 32))
      OR (tournament_category = 'atp_250' AND singles_player_count IN (32, 28))
    );
  END IF;
END $$;
