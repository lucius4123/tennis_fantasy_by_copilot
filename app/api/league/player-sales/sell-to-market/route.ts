import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { playerId, leagueId } = await request.json();

  if (!playerId || !leagueId) {
    return NextResponse.json(
      { error: 'playerId and leagueId are required' },
      { status: 400 }
    );
  }

  try {
    // Get user's team in this league
    const { data: team, error: teamError } = await supabase
      .from('fantasy_teams')
      .select('id, budget')
      .eq('user_id', user.id)
      .eq('league_id', leagueId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: 'Team not found in this league' },
        { status: 404 }
      );
    }

    // Check if player belongs to this team
    const { data: teamPlayer, error: tpError } = await supabase
      .from('team_players')
      .select('player_id')
      .eq('team_id', team.id)
      .eq('player_id', playerId)
      .single();

    if (tpError || !teamPlayer) {
      return NextResponse.json(
        { error: 'Player does not belong to your team' },
        { status: 400 }
      );
    }

    // Check if player is in current lineup (cannot sell)
    const { data: activeTournament } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('is_active', true)
      .single();

    if (activeTournament?.status === 'on-going') {
      const { data: playerMatches } = await supabase
        .from('player_matches')
        .select('id')
        .eq('player_id', playerId)
        .eq('tournament_id', activeTournament.id)
        .limit(1);

      if (playerMatches && playerMatches.length > 0) {
        return NextResponse.json(
          { error: 'Cannot sell player during ongoing tournament' },
          { status: 400 }
        );
      }
    }

    // Get market value
    let marketValue = 100000; // Default fallback value
    if (activeTournament) {
      const { data: tournamentPlayer } = await supabase
        .from('tournament_players')
        .select('market_value')
        .eq('tournament_id', activeTournament.id)
        .eq('player_id', playerId)
        .single();

      marketValue = tournamentPlayer?.market_value || marketValue;
    }

    // Update team budget: add the market value
    const { error: budgetError } = await supabase
      .from('fantasy_teams')
      .update({ budget: team.budget + marketValue })
      .eq('id', team.id);

    if (budgetError) {
      console.error('Budget update error:', budgetError);
      return NextResponse.json(
        { error: 'Failed to update budget' },
        { status: 500 }
      );
    }

    // Remove player from team
    const { error: removeError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', team.id)
      .eq('player_id', playerId);

    if (removeError) {
      console.error('Player removal error:', removeError);
      return NextResponse.json(
        { error: 'Failed to remove player from team' },
        { status: 500 }
      );
    }

    // Create sales history entry
    await supabase
      .from('player_sales_history')
      .insert({
        seller_team_id: team.id,
        player_id: playerId,
        league_id: leagueId,
        sale_price: marketValue,
        sale_type: 'market_sale',
      });

    // Add player to market_player_rotation
    await supabase
      .from('market_player_rotation')
      .upsert(
        {
          league_id: leagueId,
          player_id: playerId,
          seen_in_cycle: false,
          last_shown_at: new Date().toISOString(),
        },
        { onConflict: 'league_id,player_id' }
      );

    return NextResponse.json(
      {
        success: true,
        message: `Player sold for ${marketValue.toLocaleString('de-DE')}€`,
        newBudget: team.budget + marketValue,
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
