import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

config({ path: path.resolve(__dirname, '../.env.local') });

async function insertDummyPlayers(supabase: any) {
  const dummyPlayers = [
    { atp_id: 1001, first_name: 'Roger', last_name: 'Federer', ranking: 1, points: 10000, country: 'Switzerland' },
    { atp_id: 1002, first_name: 'Rafael', last_name: 'Nadal', ranking: 2, points: 9500, country: 'Spain' },
    { atp_id: 1003, first_name: 'Novak', last_name: 'Djokovic', ranking: 3, points: 9200, country: 'Serbia' },
    { atp_id: 1004, first_name: 'Andy', last_name: 'Murray', ranking: 4, points: 8800, country: 'UK' },
    { atp_id: 1005, first_name: 'Stan', last_name: 'Wawrinka', ranking: 5, points: 8500, country: 'Switzerland' },
    { atp_id: 1006, first_name: 'Kei', last_name: 'Nishikori', ranking: 6, points: 8200, country: 'Japan' },
    { atp_id: 1007, first_name: 'Milos', last_name: 'Raonic', ranking: 7, points: 8000, country: 'Canada' },
    { atp_id: 1008, first_name: 'Dominic', last_name: 'Thiem', ranking: 8, points: 7800, country: 'Austria' },
    { atp_id: 1009, first_name: 'Alexander', last_name: 'Zverev', ranking: 9, points: 7600, country: 'Germany' },
    { atp_id: 1010, first_name: 'Juan Martin', last_name: 'Del Potro', ranking: 10, points: 7400, country: 'Argentina' }
  ];

  await supabase.from('players').upsert(dummyPlayers, { onConflict: 'atp_id' });
}

async function generateTestData(userId1: string, userId2: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Create league (use fixed UUID for consistency)
  const fixedLeagueId = '550e8400-e29b-41d4-a716-446655440000';
  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .upsert({ id: fixedLeagueId, name: 'Test League', created_by: userId1 }, { onConflict: 'id' })
    .select()
    .single();

  if (leagueError) throw leagueError;

  // Clean up existing data for the league to ensure consistency
  await supabase.from('user_leagues').delete().eq('league_id', league.id);
  await supabase.from('market_auctions').delete().eq('league_id', league.id);
  await supabase.from('fantasy_teams').delete().eq('league_id', league.id);
  await supabase.from('tournaments').delete(); // Delete all tournaments since they are global

  // Add users to league
  await supabase.from('user_leagues').insert([
    { user_id: userId1, league_id: league.id },
    { user_id: userId2, league_id: league.id }
  ]);

  // Create teams
  const { data: team1 } = await supabase
    .from('fantasy_teams')
    .insert({ user_id: userId1, league_id: league.id, name: 'Team 1' })
    .select()
    .single();

  const { data: team2 } = await supabase
    .from('fantasy_teams')
    .insert({ user_id: userId2, league_id: league.id, name: 'Team 2' })
    .select()
    .single();

  // Get players
  let { data: players } = await supabase
    .from('players')
    .select('id')
    .limit(10);

  if (!players || players.length < 5) {
    console.log('Not enough players, inserting dummy players...');
    await insertDummyPlayers(supabase);
    // Re-fetch
    const { data: newPlayers } = await supabase
      .from('players')
      .select('id')
      .limit(10);
    if (!newPlayers || newPlayers.length < 5) {
      throw new Error('Failed to ensure enough players');
    }
    players = newPlayers;
  }

  // Add some players directly to team1
  const teamPlayers = players.slice(0, 3).map(player => ({
    team_id: team1.id,
    player_id: player.id
  }));

  await supabase.from('team_players').insert(teamPlayers);

  // Create auctions for remaining players (active transfer market)
  const auctions = players.slice(3).map(player => ({
    league_id: league.id,
    player_id: player.id,
    end_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }));

  // Insert auctions and get ids
  const { data: insertedAuctions } = await supabase
    .from('market_auctions')
    .insert(auctions)
    .select('id');

  // Place some bids
  if (insertedAuctions && insertedAuctions.length > 0) {
    await supabase
      .from('market_auctions')
      .update({ highest_bid: 100000, highest_bidder_id: team1.id })
      .eq('id', insertedAuctions[0].id);

    await supabase
      .from('fantasy_teams')
      .update({ budget: 900000 })
      .eq('id', team1.id);
  }

  // Create some tournaments (global, not league-specific)
  const tournaments = [
    { name: 'Wimbledon Qualifiers', start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
    { name: 'US Open Championship', start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() },
    { name: 'Australian Open Finals', start_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString() }
  ];

  await supabase.from('tournaments').insert(tournaments);

  console.log('Test data generated successfully');
}

// Run with args
const [,, user1, user2] = process.argv;
if (!user1 || !user2) {
  console.error('Usage: ts-node scripts/generate-test-data.ts <userId1> <userId2>');
  process.exit(1);
}

generateTestData(user1, user2).catch(console.error);