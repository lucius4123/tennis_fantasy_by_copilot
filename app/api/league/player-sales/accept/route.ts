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
    const bidderTeamId = body?.bidderTeamId as string | undefined

    if (!auctionId || !leagueId) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: sellerTeam, error: sellerTeamError } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .single()

    if (sellerTeamError || !sellerTeam) {
      return NextResponse.json({ error: 'Team not found in league' }, { status: 404 })
    }

    // Get the active tournament for per-tournament budget operations
    const { data: activeTournament } = await supabase
      .from('tournaments')
      .select('id, start_budget')
      .eq('is_active', true)
      .single()

    const { data: auction, error: auctionError } = await supabase
      .from('market_auctions')
      .select('id, league_id, player_id, seller_team_id, end_time, tournament_id')
      .eq('id', auctionId)
      .eq('league_id', leagueId)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 })
    }

    if (!auction.seller_team_id || auction.seller_team_id !== sellerTeam.id) {
      return NextResponse.json({ error: 'Du kannst nur deine eigenen Angebote annehmen' }, { status: 403 })
    }

    const auctionTournamentId: string | null = auction.tournament_id ?? null

    const nowIso = new Date().toISOString()
    if (auction.end_time <= nowIso) {
      return NextResponse.json({ error: 'Auktion ist bereits abgelaufen' }, { status: 400 })
    }

    const { data: bids, error: bidsError } = await supabase
      .from('market_bids')
      .select('team_id, bid_amount, created_at')
      .eq('auction_id', auction.id)
      .order('bid_amount', { ascending: false })
      .order('created_at', { ascending: true })

    if (bidsError) {
      return NextResponse.json({ error: 'Failed to load bids' }, { status: 500 })
    }

    const winnerBid = bidderTeamId
      ? (bids || []).find((bid: any) => bid.team_id === bidderTeamId) || null
      : bids?.[0] || null

    if (!winnerBid) {
      if (bidderTeamId) {
        return NextResponse.json({ error: 'Das ausgewählte Gebot wurde nicht gefunden' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Es liegt noch kein Gebot vor' }, { status: 400 })
    }

    const winnerTeamId = winnerBid.team_id as string
    const winningAmount = Number(winnerBid.bid_amount || 0)

    if (!winnerTeamId || winningAmount <= 0) {
      return NextResponse.json({ error: 'Ungültiges Höchstgebot' }, { status: 400 })
    }

    const { data: winnerTeam, error: winnerTeamError } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('id', winnerTeamId)
      .single()

    if (winnerTeamError || !winnerTeam) {
      return NextResponse.json({ error: 'Bietendes Team nicht gefunden' }, { status: 404 })
    }

    // Check winner's tournament budget (allow overdraft up to 1/3 of start_budget)
    let winnerTournamentBudget = 0
    if (auctionTournamentId) {
      const { data: winnerStats } = await supabase
        .from('fantasy_team_tournament_stats')
        .select('budget')
        .eq('team_id', winnerTeamId)
        .eq('tournament_id', auctionTournamentId)
        .single()
      winnerTournamentBudget = Number(winnerStats?.budget ?? 0)
    }

    const maxOverdraft = Math.floor(Number(activeTournament?.start_budget ?? 0) / 3)
    const effectiveBudget = winnerTournamentBudget + maxOverdraft

    if (effectiveBudget < winningAmount) {
      return NextResponse.json({ error: 'Das bietende Team hat nicht mehr genug Budget' }, { status: 400 })
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, first_name, last_name')
      .eq('id', auction.player_id)
      .single()

    const playerName = player ? `${player.first_name} ${player.last_name}` : 'Spieler'

    await supabase.from('market_bids').delete().eq('auction_id', auction.id)
    await supabase.from('market_auctions').delete().eq('id', auction.id)

    const { error: assignError } = await supabase
      .from('team_players')
      .upsert(
        { team_id: winnerTeamId, player_id: auction.player_id, tournament_id: auction.tournament_id },
        { onConflict: 'team_id,player_id,tournament_id', ignoreDuplicates: true }
      )

    if (assignError) {
      return NextResponse.json({ error: 'Failed to transfer player' }, { status: 500 })
    }

    if (auctionTournamentId) {
      await supabase
        .from('fantasy_team_tournament_stats')
        .update({ budget: winnerTournamentBudget - winningAmount })
        .eq('team_id', winnerTeamId)
        .eq('tournament_id', auctionTournamentId)

      const { data: sellerStats } = await supabase
        .from('fantasy_team_tournament_stats')
        .select('budget')
        .eq('team_id', sellerTeam.id)
        .eq('tournament_id', auctionTournamentId)
        .single()
      const sellerCurrentBudget = Number(sellerStats?.budget ?? 0)
      await supabase
        .from('fantasy_team_tournament_stats')
        .update({ budget: sellerCurrentBudget + winningAmount })
        .eq('team_id', sellerTeam.id)
        .eq('tournament_id', auctionTournamentId)
    }

    const { error: historyError } = await supabase
      .from('player_sales_history')
      .insert({
        auction_id: null,
        seller_team_id: sellerTeam.id,
        buyer_team_id: winnerTeamId,
        player_id: auction.player_id,
        league_id: leagueId,
        sale_price: winningAmount,
        sale_type: 'auction_win',
      })

    if (historyError) {
      return NextResponse.json({ error: `Failed to write sales history: ${historyError.message}` }, { status: 500 })
    }

    const loserTeamIds = Array.from(
      new Set(
        (bids || [])
          .map((b: any) => b.team_id as string)
          .filter((teamId: string) => teamId !== winnerTeamId)
      )
    )

    if (loserTeamIds.length > 0) {
      const rows = loserTeamIds.map((teamId) => ({
        league_id: leagueId,
        team_id: teamId,
        title: 'Gebot abgelehnt',
        message: `Dein Gebot auf ${playerName} war nicht erfolgreich. ${winnerTeam.name} hat den Spieler erhalten.`,
      }))
      await supabase.from('league_news').insert(rows)
    }

    await supabase.from('league_news').insert([
      {
        league_id: leagueId,
        team_id: sellerTeam.id,
        title: 'Gebot angenommen',
        message: `Du hast das Gebot von ${winnerTeam.name} auf ${playerName} für ${winningAmount.toLocaleString('de-DE')}€ angenommen.`,
      },
      {
        league_id: leagueId,
        team_id: winnerTeamId,
        title: 'Spieler gekauft',
        message: `Du hast ${playerName} für ${winningAmount.toLocaleString('de-DE')}€ gekauft.`,
      },
    ])

    return NextResponse.json({ success: true, winningAmount, winnerTeamName: winnerTeam.name })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Accept failed' }, { status: 500 })
  }
}
