import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { playerId, leagueId, tournamentId, daysUntilExpiration = 7 } = await request.json();

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

    // Check if player belongs to this team for this specific tournament
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

    // Check if the tournament is on-going and the player has matches
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

    const marketValue = tournamentPlayer?.market_value || 0;

    // Remove player from team first (to avoid trigger violation)
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

    // Create auction for player sale
    const endTime = new Date();
    endTime.setDate(endTime.getDate() + daysUntilExpiration);

    const { data: auction, error: auctionError } = await supabase
      .from('market_auctions')
      .insert({
        league_id: leagueId,
        player_id: playerId,
        tournament_id: tournamentId,
        seller_team_id: team.id,
        can_sell_to_market: true,
        end_time: endTime.toISOString(),
        highest_bid: marketValue,
        seller_offered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (auctionError) {
        console.error('Auction creation error:', auctionError);

    try {
    // Versuche den Spieler wiederherzustellen
    await supabase
      .from('team_players')
      .insert({ team_id: team.id, player_id: playerId, tournament_id: tournamentId });
        } catch (err) {
            console.error('Failed to restore player:', err);
        }
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
      { success: true, auction },
      { status: 201 }
    );
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
