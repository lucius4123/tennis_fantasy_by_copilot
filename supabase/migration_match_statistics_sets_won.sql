-- Migration: Add sets_won match statistic
-- Run this in your Supabase SQL Editor

-- Add new column to player_matches table
ALTER TABLE player_matches
ADD COLUMN IF NOT EXISTS sets_won INT DEFAULT 0;

-- Add scoring rule for set_won
INSERT INTO scoring_rules (stat_name, points_per_unit, description) VALUES
  ('set_won', 20, 'Punkte pro gewonnenem Satz')
ON CONFLICT (stat_name) DO NOTHING;

-- Update the trigger function to include sets_won
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
    set_won_points DECIMAL(10,2);
BEGIN
    SELECT COALESCE(points_per_unit, 0) INTO win_points FROM scoring_rules WHERE stat_name = 'win';
    SELECT COALESCE(points_per_unit, 0) INTO loss_points FROM scoring_rules WHERE stat_name = 'loss';
    SELECT COALESCE(points_per_unit, 0) INTO ace_points FROM scoring_rules WHERE stat_name = 'ace';
    SELECT COALESCE(points_per_unit, 0) INTO df_points FROM scoring_rules WHERE stat_name = 'double_fault';
    SELECT COALESCE(points_per_unit, 0) INTO bp_points FROM scoring_rules WHERE stat_name = 'break_point_won';
    SELECT COALESCE(points_per_unit, 0) INTO npw_points FROM scoring_rules WHERE stat_name = 'net_points_won';
    SELECT COALESCE(points_per_unit, 0) INTO breaks_conceded_points FROM scoring_rules WHERE stat_name = 'breaks_conceded';
    SELECT COALESCE(points_per_unit, 0) INTO winner_points FROM scoring_rules WHERE stat_name = 'winner';
    SELECT COALESCE(points_per_unit, 0) INTO ue_points FROM scoring_rules WHERE stat_name = 'unforced_error';
    SELECT COALESCE(points_per_unit, 0) INTO set_won_points FROM scoring_rules WHERE stat_name = 'set_won';

    IF NEW.match_result ILIKE '%won%' OR NEW.match_result ILIKE '%sieg%' THEN
        total_points := win_points;
    ELSE
        total_points := loss_points;
    END IF;

    total_points := total_points +
        (COALESCE(NEW.aces, 0) * ace_points) +
        (COALESCE(NEW.double_faults, 0) * df_points) +
        (COALESCE(NEW.break_points_won, 0) * bp_points) +
        (COALESCE(NEW.net_points_won, 0) * npw_points) +
        (COALESCE(NEW.breaks_conceded, 0) * breaks_conceded_points) +
        (COALESCE(NEW.winners, 0) * winner_points) +
        (COALESCE(NEW.unforced_errors, 0) * ue_points) +
        (COALESCE(NEW.sets_won, 0) * set_won_points);

    NEW.fantasy_points := ROUND(total_points);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recalculate fantasy points for all existing matches
UPDATE player_matches SET fantasy_points = fantasy_points WHERE id IS NOT NULL;
