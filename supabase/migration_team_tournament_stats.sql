-- Migration: Per-tournament budget and points for fantasy teams
-- Each fantasy team now has its own budget and points per tournament.
-- The total_points_scored on fantasy_teams is kept as the global sum.

CREATE TABLE IF NOT EXISTS fantasy_team_tournament_stats (
    team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    budget INT NOT NULL DEFAULT 0,
    points_scored INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (team_id, tournament_id)
);

-- RLS for fantasy_team_tournament_stats
ALTER TABLE fantasy_team_tournament_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tournament stats in their leagues" ON fantasy_team_tournament_stats FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM fantasy_teams ft
        JOIN user_leagues ul ON ft.league_id = ul.league_id
        WHERE ft.id = fantasy_team_tournament_stats.team_id AND ul.user_id = auth.uid()
    )
);

CREATE POLICY "Service role can manage fantasy_team_tournament_stats" ON fantasy_team_tournament_stats FOR ALL USING (auth.role() = 'service_role');

-- Grant table-level permissions so the service role and authenticated users can access the table
GRANT ALL ON fantasy_team_tournament_stats TO service_role;
GRANT SELECT ON fantasy_team_tournament_stats TO authenticated;
GRANT SELECT ON fantasy_team_tournament_stats TO anon;
