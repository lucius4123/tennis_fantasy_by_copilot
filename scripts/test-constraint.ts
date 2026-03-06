import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

config({ path: path.resolve(__dirname, '../.env.local') });

async function testConstraint() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Assume league and player exist
  const leagueId = 'some-league-id';
  const playerId = 'some-player-id';
  const teamId = 'some-team-id';

  try {
    // Try to add player to team
    await supabase.from('team_players').insert({ team_id: teamId, player_id: playerId });
    console.log('Added to team');

    // Try to create auction for same player in same league
    await supabase.from('market_auctions').insert({
      league_id: leagueId,
      player_id: playerId,
      end_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    console.log('Created auction - constraint failed!');
  } catch (error) {
    console.log('Constraint worked:', (error as Error).message);
  }
}

testConstraint();