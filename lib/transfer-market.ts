import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type AdminClient = any

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickRandomItems<T>(items: T[], count: number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

function getRandomAuctionEndTime() {
  const now = new Date()
  const hours = randomInt(1, 24)
  const end = new Date(now.getTime() + hours * 60 * 60 * 1000)
  return end.toISOString()
}

export function createAdminClient(): AdminClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any
}

export async function refillTransferMarketForActiveTournament(supabase: AdminClient) {
  const nowIso = new Date().toISOString()

  const { data: activeTournaments, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('is_active', true)

  if (tournamentError) throw tournamentError

  if (!activeTournaments || activeTournaments.length === 0) {
    // No active tournament means no active offers should remain.
    await supabase.from('market_auctions').delete().gt('end_time', nowIso)
    return { leaguesProcessed: 0, offersCreated: 0, activeTournamentPlayers: 0 }
  }

  const tournamentIds = activeTournaments.map((t: any) => t.id)

  const { data: tournamentPlayers, error: tpError } = await supabase
    .from('tournament_players')
    .select('player_id')
    .in('tournament_id', tournamentIds)

  if (tpError) throw tpError

  const activeTournamentPlayerIds = Array.from(new Set((tournamentPlayers || []).map((tp: any) => tp.player_id as string)))

  if (activeTournamentPlayerIds.length === 0) {
    await supabase.from('market_auctions').delete().gt('end_time', nowIso)
    return { leaguesProcessed: 0, offersCreated: 0, activeTournamentPlayers: 0 }
  }

  const { data: leagues, error: leagueError } = await supabase.from('leagues').select('id')
  if (leagueError) throw leagueError

  let offersCreated = 0

  for (const league of leagues || []) {
    // Keep table clean by removing expired auctions before counting active offers.
    await supabase.from('market_auctions').delete().eq('league_id', league.id).lte('end_time', nowIso)

    const { data: activeAuctions, error: auctionError } = await supabase
      .from('market_auctions')
      .select('player_id')
      .eq('league_id', league.id)
      .gt('end_time', nowIso)

    if (auctionError) throw auctionError

    const activeAuctionPlayerIds = new Set<string>((activeAuctions || []).map((a: any) => a.player_id as string))
    const activeCount = activeAuctions?.length || 0

    if (activeCount >= 5) continue

    const { data: leagueTeams, error: teamsError } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('league_id', league.id)

    if (teamsError) throw teamsError

    const teamIds = (leagueTeams || []).map((t: any) => t.id as string)
    let teamPlayerIds = new Set<string>()

    if (teamIds.length > 0) {
      const { data: teamPlayers, error: teamPlayersError } = await supabase
        .from('team_players')
        .select('player_id')
        .in('team_id', teamIds)

      if (teamPlayersError) throw teamPlayersError
      teamPlayerIds = new Set<string>((teamPlayers || []).map((tp: any) => tp.player_id as string))
    }

    const candidates = (activeTournamentPlayerIds as string[]).filter(
      (playerId: string) => !activeAuctionPlayerIds.has(playerId) && !teamPlayerIds.has(playerId)
    )

    const needed = Math.min(5 - activeCount, candidates.length)
    if (needed <= 0) continue

    const selectedPlayers = pickRandomItems(candidates, needed)
    const auctionRows = selectedPlayers.map((playerId) => ({
      league_id: league.id,
      player_id: playerId,
      end_time: getRandomAuctionEndTime(),
    }))

    const { error: insertError } = await supabase.from('market_auctions').insert(auctionRows)
    if (insertError) throw insertError

    offersCreated += auctionRows.length
  }

  return {
    leaguesProcessed: leagues?.length || 0,
    offersCreated,
    activeTournamentPlayers: activeTournamentPlayerIds.length,
  }
}
