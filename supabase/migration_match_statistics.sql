-- Migration: Add detailed match statistics and scoring rules
-- Run this in your Supabase SQL Editor

-- Add new columns to player_matches table
ALTER TABLE player_matches
ADD COLUMN IF NOT EXISTS aces INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS double_faults INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_serve_percentage DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS break_points_won INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS break_points_faced INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_points_won INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS breaks_conceded INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_points_won INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS winners INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS unforced_errors INT DEFAULT 0;

-- Create scoring_rules table
CREATE TABLE IF NOT EXISTS scoring_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stat_name TEXT UNIQUE NOT NULL,
    points_per_unit DECIMAL(10,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert default scoring rules (only if not exists)
INSERT INTO scoring_rules (stat_name, points_per_unit, description) VALUES
    ('win', 50, 'Punkte für einen Match-Sieg'),
    ('loss', 0, 'Punkte für eine Match-Niederlage'),
    ('ace', 10, 'Punkte pro Ass'),
    ('double_fault', -5, 'Punkte pro Doppelfehler'),
    ('break_point_won', 15, 'Punkte pro gewonnenem Break Point'),
    ('net_points_won', 8, 'Punkte pro gewonnenem Netzpunkt'),
    ('breaks_conceded', -8, 'Punkte pro kassiertem Break'),
    ('winner', 5, 'Punkte pro Winner'),
    ('unforced_error', -3, 'Punkte pro unforced Error')
ON CONFLICT (stat_name) DO NOTHING;

-- Enable RLS for scoring_rules
ALTER TABLE scoring_rules ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Everyone can view scoring rules" ON scoring_rules;
DROP POLICY IF EXISTS "Service role can manage scoring rules" ON scoring_rules;

-- Create RLS policies
CREATE POLICY "Everyone can view scoring rules" ON scoring_rules FOR SELECT USING (true);
CREATE POLICY "Service role can manage scoring rules" ON scoring_rules FOR ALL USING (auth.role() = 'service_role');

-- Create or replace function to calculate fantasy points
CREATE OR REPLACE FUNCTION calculate_match_fantasy_points()
RETURNS TRIGGER AS $$
DECLARE
    total_points DECIMAL(10,2) := 0;
    win_points DECIMAL(10,2);
    loss_points DECIMAL(10,2);
    ace_points DECIMAL(10,2);
    df_points DECIMAL(10,2);
    bp_points DECIMAL(10,2);
    npw_points DECIMAL(10,2);
    breaks_conceded_points DECIMAL(10,2);
    winner_points DECIMAL(10,2);
    ue_points DECIMAL(10,2);
BEGIN
    -- Get scoring rules
    SELECT COALESCE(points_per_unit, 0) INTO win_points FROM scoring_rules WHERE stat_name = 'win';
    SELECT COALESCE(points_per_unit, 0) INTO loss_points FROM scoring_rules WHERE stat_name = 'loss';
    SELECT COALESCE(points_per_unit, 0) INTO ace_points FROM scoring_rules WHERE stat_name = 'ace';
    SELECT COALESCE(points_per_unit, 0) INTO df_points FROM scoring_rules WHERE stat_name = 'double_fault';
    SELECT COALESCE(points_per_unit, 0) INTO bp_points FROM scoring_rules WHERE stat_name = 'break_point_won';
    SELECT COALESCE(points_per_unit, 0) INTO npw_points FROM scoring_rules WHERE stat_name = 'net_points_won';
    SELECT COALESCE(points_per_unit, 0) INTO breaks_conceded_points FROM scoring_rules WHERE stat_name = 'breaks_conceded';
    SELECT COALESCE(points_per_unit, 0) INTO winner_points FROM scoring_rules WHERE stat_name = 'winner';
    SELECT COALESCE(points_per_unit, 0) INTO ue_points FROM scoring_rules WHERE stat_name = 'unforced_error';
    
    -- Calculate base points from win/loss
    IF NEW.match_result ILIKE '%won%' OR NEW.match_result ILIKE '%sieg%' THEN
        total_points := win_points;
    ELSE
        total_points := loss_points;
    END IF;
    
    -- Add points from statistics
    total_points := total_points + 
        (COALESCE(NEW.aces, 0) * ace_points) +
        (COALESCE(NEW.double_faults, 0) * df_points) +
        (COALESCE(NEW.break_points_won, 0) * bp_points) +
        (COALESCE(NEW.net_points_won, 0) * npw_points) +
        (COALESCE(NEW.breaks_conceded, 0) * breaks_conceded_points) +
        (COALESCE(NEW.winners, 0) * winner_points) +
        (COALESCE(NEW.unforced_errors, 0) * ue_points);
    
    NEW.fantasy_points := ROUND(total_points);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS calculate_fantasy_points_before_insert ON player_matches;
DROP TRIGGER IF EXISTS calculate_fantasy_points_before_update ON player_matches;

-- Create triggers
CREATE TRIGGER calculate_fantasy_points_before_insert
    BEFORE INSERT ON player_matches
    FOR EACH ROW EXECUTE FUNCTION calculate_match_fantasy_points();

CREATE TRIGGER calculate_fantasy_points_before_update
    BEFORE UPDATE ON player_matches
    FOR EACH ROW EXECUTE FUNCTION calculate_match_fantasy_points();

-- Update existing player_matches to recalculate fantasy points
-- (This will trigger the UPDATE trigger for all existing records)
-- Using fantasy_points = fantasy_points to trigger recalculation
UPDATE player_matches SET fantasy_points = fantasy_points WHERE id IS NOT NULL;
