import { createClient as createServerAuthClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/transfer-market';

export async function POST(request: NextRequest) {
  const authClient = await createServerAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { playerId, leagueId, tournamentId } = await request.json();

  if (!playerId || !leagueId || !tournamentId) {
    return NextResponse.json(
      { error: 'playerId, leagueId and tournamentId are required' },
      { status: 400 }
    );
  }

  try {
    // Get user's team in this league
    const { data: team, error: teamError } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('user_id', user.id)
      .eq('league_id', leagueId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: 'Team not found in this league' },
        { status: 404 }
      );
    }

    // Check if player belongs to this team for this tournament
    const { data: teamPlayer, error: tpError } = await supabase
      .from('team_players')
      .select('player_id')
      .eq('team_id', team.id)
      .eq('player_id', playerId)
      .eq('tournament_id', tournamentId)
      .single();

    if (tpError || !teamPlayer) {
      return NextResponse.json(
        { error: 'Player does not belong to your team for this tournament' },
        { status: 400 }
      );
    }

    // Check if the tournament is on-going (cannot sell if player has matches)
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .single();

    if (tournament?.status === 'on-going') {
      const { data: playerMatches } = await supabase
        .from('player_matches')
        .select('id')
        .eq('player_id', playerId)
        .eq('tournament_id', tournamentId)
        .limit(1);

      if (playerMatches && playerMatches.length > 0) {
        return NextResponse.json(
          { error: 'Cannot sell player during ongoing tournament' },
          { status: 400 }
        );
      }
    }

    // Get market value for this player in this tournament
    const { data: tournamentPlayer } = await supabase
      .from('tournament_players')
      .select('market_value')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .single();

    const marketValue = tournamentPlayer?.market_value || 100000;

    // Update per-tournament budget: add the market value
    const { data: stats } = await supabase
      .from('fantasy_team_tournament_stats')
      .select('budget')
      .eq('team_id', team.id)
      .eq('tournament_id', tournamentId)
      .single();
    const newBudget = Number(stats?.budget ?? 0) + marketValue;
    const { error: budgetError } = await supabase
      .from('fantasy_team_tournament_stats')
      .update({ budget: newBudget })
      .eq('team_id', team.id)
      .eq('tournament_id', tournamentId);
    if (budgetError) {
      console.error('Budget update error:', budgetError);
      return NextResponse.json(
        { error: 'Failed to update budget' },
        { status: 500 }
      );
    }

    // Remove player from team (tournament-scoped)
    const { error: removeError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', team.id)
      .eq('player_id', playerId)
      .eq('tournament_id', tournamentId);

    if (removeError) {
      console.error('Player removal error:', removeError);
      return NextResponse.json(
        { error: 'Failed to remove player from team' },
        { status: 500 }
      );
    }

    // Create sales history entry
    const { error: historyError } = await supabase
      .from('player_sales_history')
      .insert({
        seller_team_id: team.id,
        player_id: playerId,
        league_id: leagueId,
        sale_price: marketValue,
        sale_type: 'market_sale',
      });

    if (historyError) {
      console.error('Sales history insert error:', historyError);
      return NextResponse.json(
        { error: 'Failed to write sales history' },
        { status: 500 }
      );
    }

    // Add player to market_player_rotation
    await supabase
      .from('market_player_rotation')
      .upsert(
        {
          league_id: leagueId,
          player_id: playerId,
          tournament_id: tournamentId,
          seen_in_cycle: false,
          last_shown_at: new Date().toISOString(),
        },
        { onConflict: 'league_id,player_id,tournament_id' }
      );

    return NextResponse.json(
      {
        success: true,
        message: `Player sold for ${marketValue.toLocaleString('de-DE')}€`,
        newBudget: newBudget,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
