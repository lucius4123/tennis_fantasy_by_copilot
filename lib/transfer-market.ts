import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type AdminClient = any

type EligibleStarterPlayer = {
  playerId: string
  marketValue: number
}

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

function sumMarketValue(players: EligibleStarterPlayer[]) {
  return players.reduce((sum, player) => sum + player.marketValue, 0)
}

function pickStarterTeamForTarget(
  availablePlayers: EligibleStarterPlayer[],
  teamSize: number,
  targetValue: number
) {
  if (availablePlayers.length <= teamSize) {
    return availablePlayers.slice(0, teamSize)
  }

  if (targetValue <= 0) {
    return pickRandomItems(availablePlayers, teamSize)
  }

  let bestTeam = pickRandomItems(availablePlayers, teamSize)
  let bestDiff = Math.abs(sumMarketValue(bestTeam) - targetValue)

  const sortedAscending = [...availablePlayers].sort((a, b) => a.marketValue - b.marketValue)
  const sortedDescending = [...sortedAscending].reverse()
  const midpoint = Math.max(0, Math.floor(sortedAscending.length / 2) - Math.floor(teamSize / 2))
  const deterministicCandidates = [
    sortedAscending.slice(0, teamSize),
    sortedDescending.slice(0, teamSize),
    sortedAscending.slice(midpoint, midpoint + teamSize),
  ].filter((team) => team.length === teamSize)

  for (const candidate of deterministicCandidates) {
    const diff = Math.abs(sumMarketValue(candidate) - targetValue)
    if (diff < bestDiff) {
      bestTeam = candidate
      bestDiff = diff
    }
  }

  const iterations = Math.min(750, Math.max(200, availablePlayers.length * 8))
  for (let i = 0; i < iterations; i++) {
    const candidate = pickRandomItems(availablePlayers, teamSize)
    const diff = Math.abs(sumMarketValue(candidate) - targetValue)

    if (diff < bestDiff) {
      bestTeam = candidate
      bestDiff = diff

      if (bestDiff === 0) break
    }
  }

  return bestTeam
}

async function pickPlayersForLeagueCycle(
  supabase: AdminClient,
  leagueId: string,
  candidatePlayerIds: string[],
  needed: number,
  shownAtIso: string
) {
  if (needed <= 0 || candidatePlayerIds.length === 0) return [] as string[]

  const { data: rotationRows, error: rotationError } = await supabase
    .from('market_player_rotation')
    .select('player_id, seen_in_cycle')
    .eq('league_id', leagueId)
    .in('player_id', candidatePlayerIds)

  if (rotationError) throw rotationError

  const seenMap = new Map<string, boolean>()
  for (const row of rotationRows || []) {
    seenMap.set(row.player_id as string, Boolean(row.seen_in_cycle))
  }

  const unseenCandidates = candidatePlayerIds.filter((playerId) => !seenMap.get(playerId))

  let selectedPlayers: string[] = []

  if (unseenCandidates.length >= needed) {
    selectedPlayers = pickRandomItems(unseenCandidates, needed)
  } else {
    selectedPlayers = pickRandomItems(unseenCandidates, unseenCandidates.length)

    if (candidatePlayerIds.length > 0) {
      const { error: resetError } = await supabase
        .from('market_player_rotation')
        .update({ seen_in_cycle: false })
        .eq('league_id', leagueId)
        .in('player_id', candidatePlayerIds)

      if (resetError) throw resetError
    }

    const remainingNeeded = needed - selectedPlayers.length
    if (remainingNeeded > 0) {
      const remainingPool = candidatePlayerIds.filter((playerId) => !selectedPlayers.includes(playerId))
      const topUp = pickRandomItems(remainingPool, Math.min(remainingNeeded, remainingPool.length))
      selectedPlayers = [...selectedPlayers, ...topUp]
    }
  }

  if (selectedPlayers.length > 0) {
    const rotationUpserts = selectedPlayers.map((playerId) => ({
      league_id: leagueId,
      player_id: playerId,
      seen_in_cycle: true,
      last_shown_at: shownAtIso,
    }))

    const { error: upsertError } = await supabase
      .from('market_player_rotation')
      .upsert(rotationUpserts, { onConflict: 'league_id,player_id' })

    if (upsertError) throw upsertError
  }

  return selectedPlayers
}

export function createAdminClient(): AdminClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any
}

export async function resetAllTeamBudgets(supabase: AdminClient, startBudget: number) {
  const { error } = await supabase
    .from('fantasy_teams')
    .update({ budget: startBudget })
    .not('id', 'is', null)

  if (error) {
    throw new Error(`Failed to reset team budgets: ${error.message}`)
  }
}

export async function assignInitialTeamLineups(
  supabase: AdminClient,
  tournamentId: string,
  starterTeamTargetValue = 0
) {
  // Step 1: Get all players for this tournament with ranking > 20 (outside top 20)
  const { data: tournamentPlayers, error: tpError } = await supabase
    .from('tournament_players')
    .select(`
      player_id,
      market_value,
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
  const eligiblePlayers = (tournamentPlayers || [])
    .filter((tp: any) => {
      const ranking = tp.players?.ranking
      return ranking === null || ranking > 20
    })
    .map((tp: any) => ({
      playerId: tp.player_id as string,
      marketValue: Number(tp.market_value || 0),
    }))

  if (eligiblePlayers.length === 0) {
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
  if (eligiblePlayers.length < requiredPlayers) {
    throw new Error(
      `Nicht genügend Spieler verfügbar. Benötigt: ${requiredPlayers} (${teams.length} Teams × 8 Spieler), ` +
      `Verfügbar: ${eligiblePlayers.length}. Bitte weise mehr Spieler außerhalb der Top 20 diesem Turnier zu.`
    )
  }

  // Step 4: Assign 8 players to each team while approximating the desired starter team value.
  const teamPlayerRows: Array<{ team_id: string; player_id: string }> = []
  // Zeile 227 ändern zu:
  const remainingPlayers = pickRandomItems<EligibleStarterPlayer>(eligiblePlayers, eligiblePlayers.length);
  const normalizedTarget = Math.max(0, Number(starterTeamTargetValue || 0))
  let totalAssignedStarterValue = 0

  for (const team of teams) {
    const selectedPlayers = pickStarterTeamForTarget(remainingPlayers, 8, normalizedTarget)
    const selectedPlayerIds = new Set(selectedPlayers.map((player) => player.playerId))

    for (const player of selectedPlayers) {
      teamPlayerRows.push({
        team_id: team.id,
        player_id: player.playerId
      })
      totalAssignedStarterValue += player.marketValue
    }

    const nextRemainingPlayers = remainingPlayers.filter((player) => !selectedPlayerIds.has(player.playerId))
    remainingPlayers.splice(0, remainingPlayers.length, ...nextRemainingPlayers)
  }

  // Step 5: Insert all players into team_players
  const { error: insertError } = await supabase
    .from('team_players')
    .insert(teamPlayerRows)

  if (insertError) {
    throw new Error(`Failed to insert team players: ${insertError.message}`)
  }

  return {
    teamsProcessed: teams.length,
    playersAssigned: teamPlayerRows.length,
    eligiblePlayers: eligiblePlayers.length,
    starterTeamTargetValue: normalizedTarget,
    averageStarterTeamValue: teams.length > 0 ? Math.round(totalAssignedStarterValue / teams.length) : 0,
  }
}

async function resolveExpiredAuctionsForLeague(supabase: AdminClient, leagueId: string, nowIso: string) {
  const { data: expiredAuctions, error: expiredError } = await supabase
    .from('market_auctions')
    .select('id, player_id, highest_bidder_id, highest_bid, seller_team_id')
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
    const isPlayerSale = !!auction.seller_team_id

    // Remove bids + auction first so DB trigger allows assigning player to team.
    await supabase.from('market_bids').delete().eq('auction_id', auction.id)
    await supabase.from('market_auctions').delete().eq('id', auction.id)

    // If no winner and this is a player sale, return player to seller
    if (!winnerTeamId && isPlayerSale && auction.seller_team_id) {
      const { error: returnError } = await supabase
        .from('team_players')
        .upsert(
          { team_id: auction.seller_team_id, player_id: auction.player_id },
          { onConflict: 'team_id,player_id', ignoreDuplicates: true }
        )

      if (returnError) throw returnError

      const playerName = playerNameMap.get(auction.player_id) || 'Spieler'
      await supabase
        .from('league_news')
        .insert([{
          league_id: leagueId,
          team_id: auction.seller_team_id,
          title: 'Auktion abgelaufen',
          message: `${playerName} wurde nicht verkauft und ist zurück in deinem Team.`,
        }])
    } else if (winnerTeamId) {
      const { error: assignError } = await supabase
        .from('team_players')
        .upsert(
          { team_id: winnerTeamId, player_id: auction.player_id },
          { onConflict: 'team_id,player_id', ignoreDuplicates: true }
        )

      if (assignError) throw assignError

      // If this is a player sale, remove player from seller team
      if (isPlayerSale && auction.seller_team_id && auction.seller_team_id !== winnerTeamId) {
        await supabase
          .from('team_players')
          .delete()
          .eq('team_id', auction.seller_team_id)
          .eq('player_id', auction.player_id)

        // Add seller to news if bidder is different
        const { data: sellerTeam } = await supabase
          .from('fantasy_teams')
          .select('id, name')
          .eq('id', auction.seller_team_id)
          .single()

        if (sellerTeam && winnerTeamId !== auction.seller_team_id) {
          const { data: winnerTeam } = await supabase
            .from('fantasy_teams')
            .select('id, name')
            .eq('id', winnerTeamId)
            .single()

          const playerName = playerNameMap.get(auction.player_id) || 'Spieler'
          await supabase
            .from('league_news')
            .insert([{
              league_id: leagueId,
              team_id: auction.seller_team_id,
              title: 'Spieler verkauft',
              message: `${playerName} wurde an ${winnerTeam?.name || 'Team'} verkauft.`,
            }])
        }
      }

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

          // For player sales, add seller budget increase
          if (isPlayerSale && auction.seller_team_id && auction.seller_team_id !== winnerTeamId) {
            const { data: sellerTeam } = await supabase
              .from('fantasy_teams')
              .select('id, budget')
              .eq('id', auction.seller_team_id)
              .single()

            if (sellerTeam) {
              const sellerNewBudget = Number(sellerTeam.budget || 0) + winningAmount
              await supabase
                .from('fantasy_teams')
                .update({ budget: sellerNewBudget })
                .eq('id', auction.seller_team_id)
            }
          }

          // Record in sales history if player sale
          if (isPlayerSale) {
            await supabase
              .from('player_sales_history')
              .insert({
                auction_id: auction.id,
                seller_team_id: auction.seller_team_id || null,
                buyer_team_id: winnerTeamId,
                player_id: auction.player_id,
                league_id: leagueId,
                sale_price: winningAmount,
                sale_type: 'auction_win',
              })
          }

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
    .select('player_id, appearance_probability')
    .in('tournament_id', tournamentIds)

  if (tpError) throw tpError

  const activeTournamentPlayerIds = Array.from(
    new Set(
      (tournamentPlayers || [])
        .filter((tp: any) => tp.appearance_probability !== 'Ausgeschlossen')
        .map((tp: any) => tp.player_id as string)
    )
  )

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

    const selectedPlayers = await pickPlayersForLeagueCycle(supabase, league.id, candidates, needed, nowIso)

    if (selectedPlayers.length === 0) continue

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
