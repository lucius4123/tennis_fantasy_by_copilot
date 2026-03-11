import { createClient as createServerAuthClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/lib/transfer-market';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
  const authClient = await createServerAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auctionId, leagueId } = await request.json();

  if (!auctionId || !leagueId) {
    return NextResponse.json(
      { error: 'auctionId and leagueId are required' },
      { status: 400 }
    );
  }

  try {
    const supabase = createAdminClient();

    // Get the auction
    const { data: auction, error: auctionError } = await supabase
      .from('market_auctions')
      .select('id, league_id, seller_team_id, player_id')
      .eq('id', auctionId)
      .single();

    if (auctionError || !auction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      );
    }

    if (auction.league_id !== leagueId) {
      return NextResponse.json(
        { error: 'Auction does not belong to this league' },
        { status: 400 }
      );
    }

    // Verify user owns the selling team
    const { data: team } = await supabase
      .from('fantasy_teams')
      .select('id, user_id')
      .eq('id', auction.seller_team_id)
      .eq('league_id', leagueId)
      .single();

    if (team?.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to cancel this auction' },
        { status: 403 }
      );
    }

    // Find all auctions for this player in this league to avoid trigger conflicts.
    const { data: relatedAuctions, error: relatedAuctionsError } = await supabase
      .from('market_auctions')
      .select('id, highest_bidder_id, highest_bid')
      .eq('league_id', leagueId)
      .eq('player_id', auction.player_id);

    if (relatedAuctionsError) {
      console.error('Related auctions query error:', relatedAuctionsError);
      return NextResponse.json(
        { error: 'Failed to inspect related auctions' },
        { status: 500 }
      );
    }

    const auctionsToDelete = relatedAuctions || [];

    // Refund highest bids for every related auction that gets removed.
    for (const relatedAuction of auctionsToDelete) {
      if (!relatedAuction.highest_bidder_id || Number(relatedAuction.highest_bid || 0) <= 0) {
        continue;
      }

      const { data: bidderTeam } = await supabase
        .from('fantasy_teams')
        .select('id, budget')
        .eq('id', relatedAuction.highest_bidder_id)
        .single();

      if (bidderTeam) {
        await supabase
          .from('fantasy_teams')
          .update({ budget: Number(bidderTeam.budget || 0) + Number(relatedAuction.highest_bid || 0) })
          .eq('id', bidderTeam.id);
      }
    }

    // Delete every related auction for this player in this league.
    const { error: deleteError } = await supabase
      .from('market_auctions')
      .delete()
      .eq('league_id', leagueId)
      .eq('player_id', auction.player_id);

    if (deleteError) {
      console.error('Auction deletion error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to cancel auction' },
        { status: 500 }
      );
    }

    // Return player to team.
    const { error: insertError } = await supabase
      .from('team_players')
      .upsert({
        team_id: auction.seller_team_id,
        player_id: auction.player_id,
      }, { onConflict: 'team_id,player_id' });

    if (insertError) {
      console.error('Player reinsertion error:', insertError);
      return NextResponse.json(
        { error: 'Failed to return player to team' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Auction cancelled and player returned to team' },
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
