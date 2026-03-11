-- Track market player appearances per league to ensure a fair rotation cycle.
CREATE TABLE IF NOT EXISTS market_player_rotation (
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seen_in_cycle BOOLEAN NOT NULL DEFAULT false,
  last_shown_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (league_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_market_player_rotation_league_seen
  ON market_player_rotation (league_id, seen_in_cycle);
