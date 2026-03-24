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
    image_url TEXT,
    fantasy_avg DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: player_matches
CREATE TABLE player_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    tournament_name TEXT NOT NULL,
    round TEXT CHECK (round IN ('R1', 'R2', 'R3', 'QF', 'SF', 'F')),
    opponent_name TEXT NOT NULL,
    match_result TEXT NOT NULL,
    fantasy_points INT DEFAULT 0,
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Detailed match statistics
    aces INT DEFAULT 0,
    double_faults INT DEFAULT 0,
    first_serve_percentage DECIMAL(5,2) DEFAULT 0,
    break_points_won INT DEFAULT 0,
    break_points_faced INT DEFAULT 0,
    net_points_won INT DEFAULT 0,
    breaks_conceded INT DEFAULT 0,
    total_points_won INT DEFAULT 0,
    winners INT DEFAULT 0,
    unforced_errors INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: scoring_rules
CREATE TABLE scoring_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stat_name TEXT UNIQUE NOT NULL,
    points_per_unit DECIMAL(10,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert default scoring rules
INSERT INTO scoring_rules (stat_name, points_per_unit, description) VALUES
    ('win', 50, 'Punkte für einen Match-Sieg'),
    ('loss', 0, 'Punkte für eine Match-Niederlage'),
    ('ace', 10, 'Punkte pro Ass'),
    ('double_fault', -5, 'Punkte pro Doppelfehler'),
    ('break_point_won', 15, 'Punkte pro gewonnenem Break Point'),
    ('net_points_won', 8, 'Punkte pro gewonnenem Netzpunkt'),
    ('breaks_conceded', -8, 'Punkte pro kassiertem Break'),
    ('winner', 5, 'Punkte pro Winner'),
    ('unforced_error', -3, 'Punkte pro unforced Error');

-- RLS for scoring_rules
ALTER TABLE scoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view scoring rules" ON scoring_rules FOR SELECT USING (true);
CREATE POLICY "Service role can manage scoring rules" ON scoring_rules FOR ALL USING (auth.role() = 'service_role');

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
ALTER TABLE player_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;

-- Policies for players
-- Everyone can read players
CREATE POLICY "Players are viewable by everyone" ON players FOR SELECT USING (true);
-- Only service role can insert/update players (handled via API)

-- Policies for player_matches
CREATE POLICY "Player matches are viewable by everyone" ON player_matches FOR SELECT USING (true);
CREATE POLICY "Service role can manage player matches" ON player_matches FOR ALL USING (auth.role() = 'service_role');

-- Policies for leagues
CREATE POLICY "Leagues are viewable by everyone" ON leagues FOR SELECT USING (true);
CREATE POLICY "Users can create leagues" ON leagues FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Service role can manage leagues" ON leagues FOR ALL USING (auth.role() = 'service_role');

-- Policies for user_leagues
CREATE POLICY "Users can see their own leagues" ON user_leagues FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can join leagues" ON user_leagues FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage user_leagues" ON user_leagues FOR ALL USING (auth.role() = 'service_role');

-- Policies for fantasy_teams
CREATE POLICY "Users can view teams in their leagues" ON fantasy_teams FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_leagues WHERE user_leagues.league_id = fantasy_teams.league_id AND user_leagues.user_id = auth.uid())
);
CREATE POLICY "Users can create their own teams" ON fantasy_teams FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own teams" ON fantasy_teams FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage fantasy_teams" ON fantasy_teams FOR ALL USING (auth.role() = 'service_role');

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
CREATE POLICY "Service role can manage team_players" ON team_players FOR ALL USING (auth.role() = 'service_role');

-- Add columns to fantasy_teams
ALTER TABLE fantasy_teams ADD COLUMN total_points_scored INT DEFAULT 0;
ALTER TABLE fantasy_teams ADD COLUMN budget INT DEFAULT 1000000;
ALTER TABLE fantasy_teams ADD COLUMN profile_image_url TEXT;

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
CREATE POLICY "Users can create auctions in their leagues" ON market_auctions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_leagues WHERE user_leagues.league_id = market_auctions.league_id AND user_leagues.user_id = auth.uid())
);
CREATE POLICY "Service role can manage market_auctions" ON market_auctions FOR ALL USING (auth.role() = 'service_role');

-- Table: market_player_rotation
CREATE TABLE market_player_rotation (
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    seen_in_cycle BOOLEAN NOT NULL DEFAULT false,
    last_shown_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (league_id, player_id)
);

CREATE INDEX idx_market_player_rotation_league_seen
    ON market_player_rotation (league_id, seen_in_cycle);

-- RLS for market_player_rotation
ALTER TABLE market_player_rotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view rotation in their leagues" ON market_player_rotation FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_leagues WHERE user_leagues.league_id = market_player_rotation.league_id AND user_leagues.user_id = auth.uid())
);
CREATE POLICY "Service role can manage market_player_rotation" ON market_player_rotation FOR ALL USING (auth.role() = 'service_role');

-- Table: tournaments
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    country_code TEXT,
    previous_winner_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    tournament_category TEXT CHECK (tournament_category IN ('grand_slam', 'masters_1000', 'atp_500', 'atp_250')),
    singles_player_count INT CHECK (singles_player_count IN (128, 96, 56, 48, 32, 28)),
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'on-going', 'completed')),
    is_active BOOLEAN DEFAULT false,
    start_budget INT DEFAULT 1000000,
    starter_team_target_value INT DEFAULT 0,
    starter_team_player_count INT DEFAULT 8 CHECK (starter_team_player_count > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE tournaments ADD CONSTRAINT tournaments_category_player_count_check CHECK (
    (tournament_category IS NULL AND singles_player_count IS NULL)
    OR (tournament_category = 'grand_slam' AND singles_player_count = 128)
    OR (tournament_category = 'masters_1000' AND singles_player_count IN (96, 56))
    OR (tournament_category = 'atp_500' AND singles_player_count IN (48, 32))
    OR (tournament_category = 'atp_250' AND singles_player_count IN (32, 28))
);

-- Table: tournament_players (Many-to-Many relationship between tournaments and players)
CREATE TABLE tournament_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    appearance_probability TEXT NOT NULL CHECK (appearance_probability IN ('Garantiert', 'Sehr Wahrscheinlich', 'Wahrscheinlich', 'Riskant', 'Sehr Riskant', 'Ausgeschlossen')),
    is_wildcard BOOLEAN NOT NULL DEFAULT false,
        seeding_status TEXT NOT NULL DEFAULT 'Main-Draw' CHECK (seeding_status IN ('Top-Seed', 'Main-Draw', 'Gesetzt', 'Qualifikation - R1', 'Qualifikation - R2')),
        tournament_seed_position INT,
        qualification_seed_position INT,
    market_value DECIMAL(10,2) DEFAULT 0,
    CHECK (NOT is_wildcard OR appearance_probability = 'Garantiert'),
        CHECK (
            (tournament_seed_position IS NULL OR tournament_seed_position > 0)
            AND (qualification_seed_position IS NULL OR qualification_seed_position > 0)
        ),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tournament_id, player_id)
);

-- RLS for tournaments
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "Service role can manage tournaments" ON tournaments FOR ALL USING (auth.role() = 'service_role');

-- RLS for tournament_players
ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view tournament players" ON tournament_players FOR SELECT USING (true);
CREATE POLICY "Service role can manage tournament players" ON tournament_players FOR ALL USING (auth.role() = 'service_role');

-- Table: tournament_lineups
CREATE TABLE tournament_lineups (
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id UUID REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    slot_index SMALLINT NOT NULL CHECK (slot_index BETWEEN 0 AND 6),
    PRIMARY KEY (tournament_id, team_id, player_id),
    UNIQUE (tournament_id, team_id, slot_index)
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

CREATE OR REPLACE FUNCTION validate_tournament_lineup_slot()
RETURNS TRIGGER AS $$
DECLARE
    player_ranking INT;
BEGIN
    IF NEW.slot_index >= 5 THEN
        SELECT ranking INTO player_ranking FROM players WHERE id = NEW.player_id;

        IF player_ranking IS NULL OR player_ranking <= 75 THEN
            RAISE EXCEPTION 'Reserve slots allow only players with ranking worse than 75';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_tournament_lineup_slot_before_write
    BEFORE INSERT OR UPDATE ON tournament_lineups
    FOR EACH ROW EXECUTE FUNCTION validate_tournament_lineup_slot();

-- Trigger to prevent player from being in both team_players and market_auctions for the same league
CREATE OR REPLACE FUNCTION check_player_assignment()
RETURNS TRIGGER AS $$
BEGIN
    -- For team_players insert
    IF TG_TABLE_NAME = 'team_players' THEN
        IF EXISTS (
            SELECT 1 FROM market_auctions ma
            JOIN fantasy_teams ft ON ft.league_id = ma.league_id
            WHERE ft.id = NEW.team_id AND ma.player_id = NEW.player_id
        ) THEN
            RAISE EXCEPTION 'Player is already assigned to an auction in this league';
        END IF;
    -- For market_auctions insert
    ELSIF TG_TABLE_NAME = 'market_auctions' THEN
        IF EXISTS (
            SELECT 1 FROM team_players tp
            JOIN fantasy_teams ft ON tp.team_id = ft.id
            WHERE ft.league_id = NEW.league_id AND tp.player_id = NEW.player_id
        ) THEN
            RAISE EXCEPTION 'Player is already assigned to a team in this league';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_team_players_assignment
    BEFORE INSERT ON team_players
    FOR EACH ROW EXECUTE FUNCTION check_player_assignment();

-- Function to calculate fantasy points based on match statistics and scoring rules
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

CREATE TRIGGER calculate_fantasy_points_before_insert
    BEFORE INSERT ON player_matches
    FOR EACH ROW EXECUTE FUNCTION calculate_match_fantasy_points();

CREATE TRIGGER calculate_fantasy_points_before_update
    BEFORE UPDATE ON player_matches
    FOR EACH ROW EXECUTE FUNCTION calculate_match_fantasy_points();

-- Function to update player's fantasy average based on last 10 matches
CREATE OR REPLACE FUNCTION update_player_fantasy_avg()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE players
    SET fantasy_avg = (
        SELECT COALESCE(AVG(fantasy_points), 0)
        FROM (
            SELECT fantasy_points
            FROM player_matches
            WHERE player_id = NEW.player_id
            ORDER BY match_date DESC
            LIMIT 10
        ) recent_matches
    )
    WHERE id = NEW.player_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_fantasy_avg_on_match_insert
    AFTER INSERT ON player_matches
    FOR EACH ROW EXECUTE FUNCTION update_player_fantasy_avg();

CREATE TRIGGER update_fantasy_avg_on_match_update
    AFTER UPDATE ON player_matches
    FOR EACH ROW EXECUTE FUNCTION update_player_fantasy_avg();

CREATE TRIGGER check_market_auctions_assignment
    BEFORE INSERT ON market_auctions
    FOR EACH ROW EXECUTE FUNCTION check_player_assignment();
