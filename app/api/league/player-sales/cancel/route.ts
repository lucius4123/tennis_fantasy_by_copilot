import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
    // Get the auction
    const { data: auction, error: auctionError } = await supabase
      .from('market_auctions')
      .select('id, seller_team_id, player_id, highest_bidder_id, highest_bid')
      .eq('id', auctionId)
      .single();

    if (auctionError || !auction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      );
    }

    // Verify user owns the selling team
    const { data: team } = await supabase
      .from('fantasy_teams')
      .select('id, user_id')
      .eq('id', auction.seller_team_id)
      .single();

    if (team?.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to cancel this auction' },
        { status: 403 }
      );
    }

    // If there's a highest bid and bidder, refund the bid
    if (auction.highest_bidder_id && auction.highest_bid > 0) {
      const { data: bidderTeam } = await supabase
        .from('fantasy_teams')
        .select('id, budget')
        .eq('id', auction.highest_bidder_id)
        .single();

      if (bidderTeam) {
        await supabase
          .from('fantasy_teams')
          .update({ budget: bidderTeam.budget + auction.highest_bid })
          .eq('id', bidderTeam.id);
      }
    }

    // Delete the auction
    const { error: deleteError } = await supabase
      .from('market_auctions')
      .delete()
      .eq('id', auctionId);

    if (deleteError) {
      console.error('Auction deletion error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to cancel auction' },
        { status: 500 }
      );
    }

    // Return player to team
    const { error: insertError } = await supabase
      .from('team_players')
      .insert({
        team_id: auction.seller_team_id,
        player_id: auction.player_id,
      });

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
