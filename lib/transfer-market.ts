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

export async function assignInitialTeamLineups(supabase: AdminClient, tournamentId: string) {
  // Step 1: Get all players for this tournament with ranking > 20 (outside top 20)
  const { data: tournamentPlayers, error: tpError } = await supabase
    .from('tournament_players')
    .select(`
      player_id,
      players!inner (
        id,
        ranking
      )
    `)
    .eq('tournament_id', tournamentId)

  if (tpError) {
    throw new Error(`Failed to fetch tournament players: ${tpError.message}`)
  }

  // Filter to only include players with ranking > 20 or null ranking
  const eligiblePlayerIds = (tournamentPlayers || [])
    .filter((tp: any) => {
      const ranking = tp.players?.ranking
      return ranking === null || ranking > 20
    })
    .map((tp: any) => tp.player_id as string)

  if (eligiblePlayerIds.length === 0) {
    throw new Error('Keine Spieler außerhalb der Top 20 sind diesem Turnier zugewiesen.')
  }

  // Step 2: Get all teams across all leagues
  const { data: allTeams, error: teamsError } = await supabase
    .from('fantasy_teams')
    .select('id, league_id')

  if (teamsError) {
    throw new Error(`Failed to fetch teams: ${teamsError.message}`)
  }

  const teams = allTeams || []
  const requiredPlayers = teams.length * 8

  // Step 3: Validate we have enough players
  if (eligiblePlayerIds.length < requiredPlayers) {
    throw new Error(
      `Nicht genügend Spieler verfügbar. Benötigt: ${requiredPlayers} (${teams.length} Teams × 8 Spieler), ` +
      `Verfügbar: ${eligiblePlayerIds.length}. Bitte weise mehr Spieler außerhalb der Top 20 diesem Turnier zu.`
    )
  }

  // Step 4: Shuffle all eligible players
  const shuffledPlayers = [...eligiblePlayerIds]
  for (let i = shuffledPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]]
  }

  // Step 5: Assign 8 players to each team
  const teamPlayerRows: Array<{ team_id: string; player_id: string }> = []
  let playerIndex = 0

  for (const team of teams) {
    for (let i = 0; i < 8; i++) {
      teamPlayerRows.push({
        team_id: team.id,
        player_id: shuffledPlayers[playerIndex]
      })
      playerIndex++
    }
  }

  // Step 6: Insert all players into team_players
  const { error: insertError } = await supabase
    .from('team_players')
    .insert(teamPlayerRows)

  if (insertError) {
    throw new Error(`Failed to insert team players: ${insertError.message}`)
  }

  return {
    teamsProcessed: teams.length,
    playersAssigned: teamPlayerRows.length,
    eligiblePlayers: eligiblePlayerIds.length
  }
}

async function resolveExpiredAuctionsForLeague(supabase: AdminClient, leagueId: string, nowIso: string) {
  const { data: expiredAuctions, error: expiredError } = await supabase
    .from('market_auctions')
    .select('id, player_id, highest_bidder_id, highest_bid')
    .eq('league_id', leagueId)
    .lte('end_time', nowIso)

  if (expiredError) throw expiredError
  if (!expiredAuctions || expiredAuctions.length === 0) return 0

  const playerIds = Array.from(new Set(expiredAuctions.map((a: any) => a.player_id)))
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .in('id', playerIds)

  const playerNameMap = new Map<string, string>()
  for (const player of players || []) {
    playerNameMap.set(player.id, `${player.first_name} ${player.last_name}`)
  }

  let resolvedCount = 0

  for (const auction of expiredAuctions) {
    const { data: bids, error: bidsError } = await supabase
      .from('market_bids')
      .select('team_id, bid_amount, created_at')
      .eq('auction_id', auction.id)
      .order('bid_amount', { ascending: false })
      .order('created_at', { ascending: true })

    if (bidsError) throw bidsError

    const winnerBid = bids?.[0] || null
    const winnerTeamId = winnerBid?.team_id || auction.highest_bidder_id || null
    const winningAmount = Number(winnerBid?.bid_amount || auction.highest_bid || 0)

    // Remove bids + auction first so DB trigger allows assigning player to team.
    await supabase.from('market_bids').delete().eq('auction_id', auction.id)
    await supabase.from('market_auctions').delete().eq('id', auction.id)

    if (winnerTeamId) {
      const { error: assignError } = await supabase
        .from('team_players')
        .upsert(
          { team_id: winnerTeamId, player_id: auction.player_id },
          { onConflict: 'team_id,player_id', ignoreDuplicates: true }
        )

      if (assignError) throw assignError

      if (winningAmount > 0) {
        const { data: winnerTeam } = await supabase
          .from('fantasy_teams')
          .select('id, name, budget')
          .eq('id', winnerTeamId)
          .single()

        if (winnerTeam) {
          const nextBudget = Math.max(0, Number(winnerTeam.budget || 0) - winningAmount)
          await supabase
            .from('fantasy_teams')
            .update({ budget: nextBudget })
            .eq('id', winnerTeamId)

          const loserTeamIds: string[] = Array.from(
            new Set((bids || []).map((b: any) => b.team_id as string).filter((teamId: string) => teamId !== winnerTeamId))
          )

          if (loserTeamIds.length > 0) {
            const playerName = playerNameMap.get(auction.player_id) || 'Spieler'
            const newsRows = loserTeamIds.map((teamId: string) => ({
              league_id: leagueId,
              team_id: teamId,
              title: 'Gebot abgelehnt',
              message: `Dein Gebot auf ${playerName} war nicht erfolgreich. ${winnerTeam.name} hat den Spieler erhalten.`,
            }))

            const { error: newsError } = await supabase.from('league_news').insert(newsRows)
            if (newsError) {
              console.error('Failed to insert loser news entries:', newsError)
            }
          }
        }
      }
    }

    resolvedCount += 1
  }

  return resolvedCount
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
    // Resolve finished auctions before counting active offers.
    await resolveExpiredAuctionsForLeague(supabase, league.id, nowIso)

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
