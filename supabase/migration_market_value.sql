-- Add market_value column to tournament_players table
ALTER TABLE tournament_players
ADD COLUMN IF NOT EXISTS market_value DECIMAL(10,2) DEFAULT 0;

-- Add status column to tournaments table for tournament lifecycle
ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'upcoming';

-- Add constraint for valid status values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_status_check'
  ) THEN
    ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_status_check CHECK (status IN ('upcoming', 'on-going', 'completed'));
  END IF;
END $$;

-- Add tournament_id foreign key to player_matches table
ALTER TABLE player_matches
ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL;
