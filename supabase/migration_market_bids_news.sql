-- Migration: private bids + league news + auction resolution support
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS market_bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_id UUID NOT NULL REFERENCES market_auctions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
  bid_amount INT NOT NULL CHECK (bid_amount > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (auction_id, team_id)
);

CREATE TABLE IF NOT EXISTS league_news (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_read BOOLEAN DEFAULT false
);

ALTER TABLE market_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bids" ON market_bids;
DROP POLICY IF EXISTS "Users can manage own bids" ON market_bids;
DROP POLICY IF EXISTS "Service role can manage market_bids" ON market_bids;

CREATE POLICY "Users can view own bids" ON market_bids FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM fantasy_teams ft
    WHERE ft.id = market_bids.team_id
      AND ft.user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage own bids" ON market_bids FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM fantasy_teams ft
    WHERE ft.id = market_bids.team_id
      AND ft.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage market_bids" ON market_bids FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view league news" ON league_news;
DROP POLICY IF EXISTS "Service role can manage league_news" ON league_news;

CREATE POLICY "Users can view league news" ON league_news FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM user_leagues ul
    WHERE ul.league_id = league_news.league_id
      AND ul.user_id = auth.uid()
  )
  AND (
    league_news.team_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM fantasy_teams ft
      WHERE ft.id = league_news.team_id
        AND ft.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Service role can manage league_news" ON league_news FOR ALL USING (auth.role() = 'service_role');
