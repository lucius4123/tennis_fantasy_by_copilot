import { NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/transfer-market'

async function requireUser() {
  const authClient = await createServerAuthClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const auctionId = body?.auctionId as string
    const leagueId = body?.leagueId as string
    const bidAmount = Number(body?.bidAmount)

    if (!auctionId || !leagueId || !Number.isFinite(bidAmount) || bidAmount <= 0) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: team, error: teamError } = await supabase
      .from('fantasy_teams')
      .select('id, budget')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found in league' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    const { data: auction, error: auctionError } = await supabase
      .from('market_auctions')
      .select('id, end_time, player_id')
      .eq('id', auctionId)
      .eq('league_id', leagueId)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 })
    }

    if (auction.end_time <= nowIso) {
      return NextResponse.json({ error: 'Auction has already ended' }, { status: 400 })
    }

    // Get the market value for the player in the active tournament
    const { data: activeTournament } = await supabase
      .from('tournaments')
      .select('id')
      .eq('is_active', true)
      .single()

    if (activeTournament) {
      const { data: tournamentPlayer } = await supabase
        .from('tournament_players')
        .select('market_value')
        .eq('tournament_id', activeTournament.id)
        .eq('player_id', auction.player_id)
        .single()

      if (tournamentPlayer && tournamentPlayer.market_value) {
        if (bidAmount < tournamentPlayer.market_value) {
          return NextResponse.json({ 
            error: `Gebot muss mindestens dem Marktwert von ${tournamentPlayer.market_value}€ entsprechen` 
          }, { status: 400 })
        }
      }
    }

    const { data: myExistingBid } = await supabase
      .from('market_bids')
      .select('bid_amount')
      .eq('auction_id', auctionId)
      .eq('team_id', team.id)
      .maybeSingle()

    if (myExistingBid && bidAmount <= Number(myExistingBid.bid_amount || 0)) {
      return NextResponse.json({ error: 'New bid must be higher than your previous bid' }, { status: 400 })
    }

    const { data: topBidRows, error: topBidError } = await supabase
      .from('market_bids')
      .select('team_id, bid_amount')
      .eq('auction_id', auctionId)
      .order('bid_amount', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)

    if (topBidError) {
      return NextResponse.json({ error: 'Failed to evaluate current top bid' }, { status: 500 })
    }

    const currentTopBid = Number(topBidRows?.[0]?.bid_amount || 0)
    if (bidAmount <= currentTopBid) {
      return NextResponse.json({ error: 'Bid too low' }, { status: 400 })
    }

    // Sum all bids the team already has on other still-active auctions
    const { data: activeOtherAuctions } = await supabase
      .from('market_auctions')
      .select('id')
      .gt('end_time', nowIso)
      .neq('id', auctionId)

    const activeOtherIds = (activeOtherAuctions || []).map((a: any) => a.id as string)
    let sumOtherActiveBids = 0
    if (activeOtherIds.length > 0) {
      const { data: otherBids } = await supabase
        .from('market_bids')
        .select('bid_amount')
        .eq('team_id', team.id)
        .in('auction_id', activeOtherIds)
      sumOtherActiveBids = (otherBids || []).reduce((sum: number, b: any) => sum + Number(b.bid_amount), 0)
    }

    if (sumOtherActiveBids + bidAmount > Number(team.budget || 0)) {
      return NextResponse.json({
        error: `Nicht genug Budget. Bereits für andere Auktionen geboten: ${sumOtherActiveBids.toLocaleString('de-DE')}\u20ac, verfügbares Budget: ${Number(team.budget).toLocaleString('de-DE')}\u20ac`
      }, { status: 400 })
    }

    const { error: bidUpsertError } = await supabase
      .from('market_bids')
      .upsert(
        {
          auction_id: auctionId,
          team_id: team.id,
          bid_amount: bidAmount,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'auction_id,team_id',
          ignoreDuplicates: false,
        }
      )

    if (bidUpsertError) {
      return NextResponse.json({ error: 'Failed to place bid' }, { status: 500 })
    }

    await supabase
      .from('market_auctions')
      .update({ highest_bid: bidAmount, highest_bidder_id: team.id })
      .eq('id', auctionId)

    return NextResponse.json({ success: true, myBid: bidAmount })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Bid failed' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const auctionId = body?.auctionId as string
    const leagueId = body?.leagueId as string

    if (!auctionId || !leagueId) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: team, error: teamError } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found in league' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    const { data: auction, error: auctionError } = await supabase
      .from('market_auctions')
      .select('id, end_time, highest_bidder_id')
      .eq('id', auctionId)
      .eq('league_id', leagueId)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 })
    }

    if (auction.end_time <= nowIso) {
      return NextResponse.json({ error: 'Auction has already ended' }, { status: 400 })
    }

    // Delete the bid
    const { error: deleteError } = await supabase
      .from('market_bids')
      .delete()
      .eq('auction_id', auctionId)
      .eq('team_id', team.id)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to withdraw bid' }, { status: 500 })
    }

    // Recalculate highest bid from remaining bids
    const { data: remainingBids } = await supabase
      .from('market_bids')
      .select('team_id, bid_amount')
      .eq('auction_id', auctionId)
      .order('bid_amount', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)

    const newTopBid = remainingBids?.[0] ?? null
    await supabase
      .from('market_auctions')
      .update({
        highest_bid: newTopBid ? Number(newTopBid.bid_amount) : 0,
        highest_bidder_id: newTopBid ? newTopBid.team_id : null,
      })
      .eq('id', auctionId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Withdraw failed' }, { status: 500 })
  }
}
