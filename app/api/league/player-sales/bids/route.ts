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
    const leagueId = body?.leagueId as string
    const auctionIds = Array.isArray(body?.auctionIds) ? (body.auctionIds as string[]) : []

    if (!leagueId || auctionIds.length === 0) {
      return NextResponse.json({ bidsByAuction: {} })
    }

    const supabase = createAdminClient()

    const { data: sellerTeam, error: sellerTeamError } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .single()

    if (sellerTeamError || !sellerTeam) {
      return NextResponse.json({ error: 'Team not found in league' }, { status: 404 })
    }

    const { data: sellerAuctions, error: auctionsError } = await supabase
      .from('market_auctions')
      .select('id')
      .eq('league_id', leagueId)
      .eq('seller_team_id', sellerTeam.id)
      .in('id', auctionIds)

    if (auctionsError) {
      return NextResponse.json({ error: 'Failed to load auctions' }, { status: 500 })
    }

    const ownAuctionIds = (sellerAuctions || []).map((auction: any) => auction.id as string)
    if (ownAuctionIds.length === 0) {
      return NextResponse.json({ bidsByAuction: {} })
    }

    const { data: bids, error: bidsError } = await supabase
      .from('market_bids')
      .select('auction_id, team_id, bid_amount, created_at')
      .in('auction_id', ownAuctionIds)
      .order('bid_amount', { ascending: false })
      .order('created_at', { ascending: true })

    if (bidsError) {
      return NextResponse.json({ error: 'Failed to load bids' }, { status: 500 })
    }

    const bidderIds = Array.from(new Set((bids || []).map((bid: any) => bid.team_id as string)))
    let bidderNameMap = new Map<string, string>()

    if (bidderIds.length > 0) {
      const { data: bidderTeams } = await supabase
        .from('fantasy_teams')
        .select('id, name')
        .in('id', bidderIds)

      bidderNameMap = new Map((bidderTeams || []).map((team: any) => [team.id, team.name]))
    }

    const bidsByAuction: Record<string, Array<{ team_id: string; team_name: string; bid_amount: number; created_at: string }>> = {}

    for (const bid of bids || []) {
      const auctionId = bid.auction_id as string
      if (!bidsByAuction[auctionId]) bidsByAuction[auctionId] = []

      bidsByAuction[auctionId].push({
        team_id: bid.team_id as string,
        team_name: bidderNameMap.get(bid.team_id as string) || 'Team',
        bid_amount: Number(bid.bid_amount || 0),
        created_at: bid.created_at as string,
      })
    }

    return NextResponse.json({ bidsByAuction })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load incoming bids' }, { status: 500 })
  }
}
