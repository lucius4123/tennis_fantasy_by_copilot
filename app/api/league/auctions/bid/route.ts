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
      .select('id, end_time, player_id, seller_team_id, tournament_id')
      .eq('id', auctionId)
      .eq('league_id', leagueId)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 })
    }

    if (auction.end_time <= nowIso) {
      return NextResponse.json({ error: 'Auction has already ended' }, { status: 400 })
    }

    if (auction.seller_team_id && auction.seller_team_id === team.id) {
      return NextResponse.json({ error: 'Du kannst nicht auf dein eigenes Angebot bieten' }, { status: 400 })
    }

    // Determine which tournament this auction belongs to and load the team's budget for it.
    // Use auction.tournament_id directly; fall back to looking up via tournament_players if missing.
    let auctionTournamentId: string | null = auction.tournament_id ?? null
    let auctionMarketValue: number | null = null

    // Market-value minimum check — still reads from tournament_players
    const { data: auctionTournamentPlayer } = await supabase
      .from('tournament_players')
      .select('market_value')
      .eq('player_id', auction.player_id)
      .eq('tournament_id', auctionTournamentId ?? '')
      .maybeSingle()

    auctionMarketValue = auctionTournamentPlayer?.market_value ?? null

    // Market-value minimum check
    if (auctionMarketValue != null) {
      if (bidAmount < auctionMarketValue) {
        return NextResponse.json({
          error: `Gebot muss mindestens dem Marktwert von ${auctionMarketValue}€ entsprechen`
        }, { status: 400 })
      }
    }

    // Read per-tournament budget for this team
    let teamBudget = 0
    if (auctionTournamentId) {
      const { data: stats } = await supabase
        .from('fantasy_team_tournament_stats')
        .select('budget')
        .eq('team_id', team.id)
        .eq('tournament_id', auctionTournamentId)
        .single()
      teamBudget = Number(stats?.budget ?? 0)
    }

    // Determine overdraft allowance: up to 1/3 of the tournament's start_budget
    let maxOverdraft = 0
    if (auctionTournamentId) {
      const { data: tournamentRow } = await supabase
        .from('tournaments')
        .select('start_budget')
        .eq('id', auctionTournamentId)
        .single()
      maxOverdraft = Math.floor(Number(tournamentRow?.start_budget ?? 0) / 3)
    }
    const effectiveBudget = teamBudget + maxOverdraft

    // Sum all bids the team already has on other still-active auctions FOR THE SAME TOURNAMENT.
    // Budgets are per-tournament, so bids on auctions of other tournaments must not be counted here.
    const { data: activeOtherAuctions } = await supabase
      .from('market_auctions')
      .select('id')
      .gt('end_time', nowIso)
      .neq('id', auctionId)
      .eq('tournament_id', auctionTournamentId ?? '')

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

    if (sumOtherActiveBids + bidAmount > effectiveBudget) {
      return NextResponse.json({
        error: `Nicht genug Budget. Bereits für andere Auktionen geboten: ${sumOtherActiveBids.toLocaleString('de-DE')}\u20ac, verfügbares Budget inkl. Überziehungsrahmen: ${effectiveBudget.toLocaleString('de-DE')}\u20ac`
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

    const newTopBid = topBidRows?.[0] ?? null

    await supabase
      .from('market_auctions')
      .update({
        highest_bid: newTopBid ? Number(newTopBid.bid_amount) : 0,
        highest_bidder_id: newTopBid ? newTopBid.team_id : null,
      })
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
