-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: players
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    atp_id INT UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    ranking INT,
    points INT DEFAULT 0,
    country TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: leagues
CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: user_leagues
CREATE TABLE user_leagues (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, league_id)
);

-- Table: fantasy_teams
CREATE TABLE fantasy_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, league_id)
);

-- Table: team_players
CREATE TABLE team_players (
    team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (team_id, player_id)
);

-- Row Level Security (RLS)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;

-- Policies for players
-- Everyone can read players
CREATE POLICY "Players are viewable by everyone" ON players FOR SELECT USING (true);
-- Only service role can insert/update players (handled via API)

-- Policies for leagues
CREATE POLICY "Leagues are viewable by everyone" ON leagues FOR SELECT USING (true);
CREATE POLICY "Users can create leagues" ON leagues FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Policies for user_leagues
CREATE POLICY "Users can see their own leagues" ON user_leagues FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can join leagues" ON user_leagues FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for fantasy_teams
CREATE POLICY "Users can view teams in their leagues" ON fantasy_teams FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_leagues WHERE user_leagues.league_id = fantasy_teams.league_id AND user_leagues.user_id = auth.uid())
);
CREATE POLICY "Users can create their own teams" ON fantasy_teams FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own teams" ON fantasy_teams FOR UPDATE USING (auth.uid() = user_id);

-- Policies for team_players
CREATE POLICY "Users can view players in their leagues teams" ON team_players FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM fantasy_teams 
        JOIN user_leagues ON fantasy_teams.league_id = user_leagues.league_id 
        WHERE fantasy_teams.id = team_players.team_id AND user_leagues.user_id = auth.uid()
    )
);
CREATE POLICY "Users can manage their own team players" ON team_players FOR ALL USING (
    EXISTS (SELECT 1 FROM fantasy_teams WHERE fantasy_teams.id = team_players.team_id AND fantasy_teams.user_id = auth.uid())
);

-- Add columns to fantasy_teams
ALTER TABLE fantasy_teams ADD COLUMN total_points_scored INT DEFAULT 0;
ALTER TABLE fantasy_teams ADD COLUMN budget INT DEFAULT 1000000;

-- Table: market_auctions
CREATE TABLE market_auctions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    highest_bidder_id UUID REFERENCES fantasy_teams(id) ON DELETE SET NULL,
    highest_bid INT DEFAULT 0,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for market_auctions
ALTER TABLE market_auctions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view auctions in their leagues" ON market_auctions FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_leagues WHERE user_leagues.league_id = market_auctions.league_id AND user_leagues.user_id = auth.uid())
);
CREATE POLICY "Users can update auctions in their leagues" ON market_auctions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_leagues WHERE user_leagues.league_id = market_auctions.league_id AND user_leagues.user_id = auth.uid())
);

-- Table: tournaments
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for tournaments
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tournaments in their leagues" ON tournaments FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_leagues WHERE user_leagues.league_id = tournaments.league_id AND user_leagues.user_id = auth.uid())
);

-- Table: tournament_lineups
CREATE TABLE tournament_lineups (
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (tournament_id, team_id, player_id)
);

-- RLS for tournament_lineups
ALTER TABLE tournament_lineups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view lineups in their leagues" ON tournament_lineups FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM fantasy_teams ft
        JOIN user_leagues ul ON ft.league_id = ul.league_id
        WHERE ft.id = tournament_lineups.team_id AND ul.user_id = auth.uid()
    )
);
CREATE POLICY "Users can manage their own lineups" ON tournament_lineups FOR ALL USING (
    EXISTS (SELECT 1 FROM fantasy_teams WHERE fantasy_teams.id = tournament_lineups.team_id AND fantasy_teams.user_id = auth.uid())
);
