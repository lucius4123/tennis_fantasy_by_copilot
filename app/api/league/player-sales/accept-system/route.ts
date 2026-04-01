import { createClient as createServerAuthClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/lib/transfer-market';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
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

    // Verify the auction exists and belongs to this league
    const { data: auction, error: auctionError } = await supabase
      .from('market_auctions')
      .select('id, league_id, seller_team_id, player_id, tournament_id, can_sell_to_market')
      .eq('id', auctionId)
      .eq('league_id', leagueId)
      .single();

    if (auctionError || !auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    if (!auction.can_sell_to_market) {
      return NextResponse.json({ error: 'Direktverkauf an das System ist für diese Auktion nicht möglich' }, { status: 400 });
    }

    // Verify that the current user is the seller
    const { data: sellerTeam, error: sellerTeamError } = await supabase
      .from('fantasy_teams')
      .select('id, name, user_id')
      .eq('id', auction.seller_team_id)
      .eq('league_id', leagueId)
      .single();

    if (sellerTeamError || !sellerTeam || sellerTeam.user_id !== user.id) {
      return NextResponse.json({ error: 'Nur der Verkäufer kann das System-Angebot annehmen' }, { status: 403 });
    }

    const auctionTournamentId: string | null = auction.tournament_id ?? null;

    // Get current market value from tournament_players
    const { data: tournamentPlayer } = await supabase
      .from('tournament_players')
      .select('market_value')
      .eq('tournament_id', auctionTournamentId ?? '')
      .eq('player_id', auction.player_id)
      .single();

    const marketValue = Number(tournamentPlayer?.market_value ?? 0);

    if (marketValue <= 0) {
      return NextResponse.json({ error: 'Marktwert des Spielers ist nicht verfügbar' }, { status: 400 });
    }

    // Get player name for news messages
    const { data: player } = await supabase
      .from('players')
      .select('first_name, last_name')
      .eq('id', auction.player_id)
      .single();
    const playerName = player ? `${player.first_name} ${player.last_name}` : 'Spieler';

    // Get all bids on this auction to refund them
    const { data: bids } = await supabase
      .from('market_bids')
      .select('team_id, bid_amount')
      .eq('auction_id', auctionId);

    // Refund each bidder
    if (bids && bids.length > 0 && auctionTournamentId) {
      for (const bid of bids) {
        const { data: bidderStats } = await supabase
          .from('fantasy_team_tournament_stats')
          .select('budget')
          .eq('team_id', bid.team_id)
          .eq('tournament_id', auctionTournamentId)
          .single();

        if (bidderStats != null) {
          await supabase
            .from('fantasy_team_tournament_stats')
            .update({ budget: Number(bidderStats.budget ?? 0) + Number(bid.bid_amount ?? 0) })
            .eq('team_id', bid.team_id)
            .eq('tournament_id', auctionTournamentId);
        }
      }
    }

    // Delete bids and auction
    await supabase.from('market_bids').delete().eq('auction_id', auctionId);
    await supabase.from('market_auctions').delete().eq('id', auctionId);

    // Credit seller with market value
    if (auctionTournamentId) {
      const { data: sellerStats } = await supabase
        .from('fantasy_team_tournament_stats')
        .select('budget')
        .eq('team_id', sellerTeam.id)
        .eq('tournament_id', auctionTournamentId)
        .single();

      const sellerCurrentBudget = Number(sellerStats?.budget ?? 0);
      await supabase
        .from('fantasy_team_tournament_stats')
        .update({ budget: sellerCurrentBudget + marketValue })
        .eq('team_id', sellerTeam.id)
        .eq('tournament_id', auctionTournamentId);
    }

    // Record in sales history
    await supabase.from('player_sales_history').insert({
      auction_id: null,
      seller_team_id: sellerTeam.id,
      buyer_team_id: null,
      player_id: auction.player_id,
      league_id: leagueId,
      sale_price: marketValue,
      sale_type: 'market_sale',
    });

    // Notify seller
    await supabase.from('league_news').insert({
      league_id: leagueId,
      team_id: sellerTeam.id,
      title: 'Spieler an System verkauft',
      message: `Du hast ${playerName} für ${marketValue.toLocaleString('de-DE')}€ an das System verkauft.`,
    });

    // Notify losing bidders
    if (bids && bids.length > 0) {
      const loserTeamIds = Array.from(new Set(bids.map((b: any) => b.team_id as string)));
      const loserRows = loserTeamIds.map((teamId) => ({
        league_id: leagueId,
        team_id: teamId,
        title: 'Gebot abgelehnt',
        message: `Dein Gebot auf ${playerName} war nicht erfolgreich. ${sellerTeam.name} hat den Spieler an das System verkauft.`,
      }));
      if (loserRows.length > 0) {
        await supabase.from('league_news').insert(loserRows);
      }
    }

    return NextResponse.json({ success: true, soldAmount: marketValue });
  } catch (error: any) {
    console.error('Accept system bid error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
