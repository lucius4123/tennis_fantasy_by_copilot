-- Migration: Support for player sales from teams to the market
-- Adds columns to market_auctions to distinguish between normal auctions and player sales

-- Add seller_team_id column to track if this is a player sale from a team
ALTER TABLE market_auctions ADD COLUMN seller_team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE;

-- Add can_sell_to_market column for direct PC/market sales at market value
ALTER TABLE market_auctions ADD COLUMN can_sell_to_market BOOLEAN DEFAULT false;

-- Create an index to help with queries for player sales
CREATE INDEX idx_market_auctions_seller_team ON market_auctions(seller_team_id);

-- Add timestamps for better tracking
ALTER TABLE market_auctions ADD COLUMN seller_offered_at TIMESTAMP WITH TIME ZONE;

-- Create a table to track player sales history
CREATE TABLE player_sales_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_id UUID REFERENCES market_auctions(id) ON DELETE SET NULL,
    seller_team_id UUID REFERENCES fantasy_teams(id) ON DELETE SET NULL,
    buyer_team_id UUID REFERENCES fantasy_teams(id) ON DELETE SET NULL,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    sale_price INT NOT NULL,
    sale_type TEXT NOT NULL CHECK (sale_type IN ('market_sale', 'auction_win')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for player_sales_history
ALTER TABLE player_sales_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view sales in their leagues" ON player_sales_history FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_leagues WHERE user_leagues.league_id = player_sales_history.league_id AND user_leagues.user_id = auth.uid())
);
CREATE POLICY "Service role can manage player_sales_history" ON player_sales_history FOR ALL USING (auth.role() = 'service_role');

-- Create an index for player_sales_history
CREATE INDEX idx_player_sales_history_league ON player_sales_history(league_id);
CREATE INDEX idx_player_sales_history_seller ON player_sales_history(seller_team_id);
CREATE INDEX idx_player_sales_history_buyer ON player_sales_history(buyer_team_id);
