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

function getRandomAuctionEndTime(minHours = 3, maxHours = 24) {
  const now = new Date()
  const hours = randomInt(minHours, maxHours)
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
  tournamentId: string,
  candidatePlayerIds: string[],
  needed: number,
  shownAtIso: string
) {
  if (needed <= 0 || candidatePlayerIds.length === 0) return [] as { playerId: string; tournamentId: string }[]

  const { data: rotationRows, error: rotationError } = await supabase
    .from('market_player_rotation')
    .select('player_id, seen_in_cycle')
    .eq('league_id', leagueId)
    .eq('tournament_id', tournamentId)
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
        .eq('tournament_id', tournamentId)
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
      tournament_id: tournamentId,
      seen_in_cycle: true,
      last_shown_at: shownAtIso,
    }))

    const { error: upsertError } = await supabase
      .from('market_player_rotation')
      .upsert(rotationUpserts, { onConflict: 'league_id,player_id,tournament_id' })

    if (upsertError) throw upsertError
  }

  return selectedPlayers.map((playerId) => ({ playerId, tournamentId }))
}

async function pickPlayersForLeagueCycleBalancedAcrossTournaments(
  supabase: AdminClient,
  leagueId: string,
  candidatesByTournament: Map<string, string[]>,
  needed: number,
  shownAtIso: string
): Promise<{ playerId: string; tournamentId: string }[]> {
  if (needed <= 0 || candidatesByTournament.size === 0) return []

  // Build deduplicated (player, tournament) pairs — same player in two tournaments = two entries
  const allCandidatePairs: { playerId: string; tournamentId: string }[] = []
  const pairSet = new Set<string>()
  for (const [tId, playerIds] of candidatesByTournament.entries()) {
    for (const playerId of playerIds) {
      const key = `${playerId}:${tId}`
      if (!pairSet.has(key)) {
        pairSet.add(key)
        allCandidatePairs.push({ playerId, tournamentId: tId })
      }
    }
  }

  if (allCandidatePairs.length === 0) return []

  const allCandidateIds = Array.from(new Set(allCandidatePairs.map((p) => p.playerId)))

  // Query rotation rows keyed by (player_id, tournament_id)
  const { data: rotationRows, error: rotationError } = await supabase
    .from('market_player_rotation')
    .select('player_id, tournament_id, seen_in_cycle')
    .eq('league_id', leagueId)
    .in('player_id', allCandidateIds)

  if (rotationError) throw rotationError

  // seenMap key: `playerId:tournamentId`
  const seenMap = new Map<string, boolean>()
  for (const row of rotationRows || []) {
    const key = `${row.player_id}:${row.tournament_id}`
    seenMap.set(key, Boolean(row.seen_in_cycle))
  }

  const makePools = (onlyUnseen: boolean) => {
    const pools = new Map<string, string[]>()
    for (const [tId, playerIds] of candidatesByTournament.entries()) {
      const filtered = playerIds.filter((playerId) => {
        const isSeen = Boolean(seenMap.get(`${playerId}:${tId}`))
        return onlyUnseen ? !isSeen : isSeen
      })
      if (filtered.length > 0) {
        pools.set(tId, pickRandomItems(filtered, filtered.length))
      }
    }
    return pools
  }

  // alreadySelected uses `playerId:tournamentId` keys to support same player in multiple tournaments
  const pickRoundRobin = (
    pools: Map<string, string[]>,
    limit: number,
    alreadySelected: Set<string>
  ) => {
    const selected: { playerId: string; tournamentId: string }[] = []
    if (limit <= 0 || pools.size === 0) return selected

    const tournamentOrder = pickRandomItems(Array.from(pools.keys()), pools.size)

    while (selected.length < limit) {
      let progressed = false

      for (const tId of tournamentOrder) {
        if (selected.length >= limit) break

        const pool = pools.get(tId)
        if (!pool || pool.length === 0) continue

        while (pool.length > 0) {
          const candidate = pool.pop() as string
          const key = `${candidate}:${tId}`
          if (alreadySelected.has(key)) continue

          alreadySelected.add(key)
          selected.push({ playerId: candidate, tournamentId: tId })
          progressed = true
          break
        }
      }

      if (!progressed) break
    }

    return selected
  }

  const selectedSet = new Set<string>()
  const unseenPools = makePools(true)
  let selectedPlayers = pickRoundRobin(unseenPools, needed, selectedSet)

  if (selectedPlayers.length < needed) {
    // Reset seen_in_cycle per tournament so we start a new cycle
    for (const [tId, playerIds] of candidatesByTournament.entries()) {
      if (playerIds.length === 0) continue
      const { error: resetError } = await supabase
        .from('market_player_rotation')
        .update({ seen_in_cycle: false })
        .eq('league_id', leagueId)
        .eq('tournament_id', tId)
        .in('player_id', playerIds)
      if (resetError) throw resetError
    }

    // seenMap still holds the pre-reset state so makePools(false) returns formerly-seen players
    const seenPools = makePools(false)
    const topUp = pickRoundRobin(seenPools, needed - selectedPlayers.length, selectedSet)
    selectedPlayers = [...selectedPlayers, ...topUp]
  }

  if (selectedPlayers.length > 0) {
    const rotationUpserts = selectedPlayers.map(({ playerId, tournamentId: tId }) => ({
      league_id: leagueId,
      player_id: playerId,
      tournament_id: tId,
      seen_in_cycle: true,
      last_shown_at: shownAtIso,
    }))

    const { error: upsertError } = await supabase
      .from('market_player_rotation')
      .upsert(rotationUpserts, { onConflict: 'league_id,player_id,tournament_id' })

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

/**
 * Initializes per-tournament budget entries for all existing fantasy teams.
 * Called when a tournament is activated. Existing entries for the same tournament
 * are left unchanged (ignoreDuplicates: true) to preserve in-progress budgets.
 */
export async function initializeTournamentTeamStats(
  supabase: AdminClient,
  tournamentId: string,
  startBudget: number
) {
  const { data: teams, error: teamsError } = await supabase
    .from('fantasy_teams')
    .select('id')
    .not('id', 'is', null)

  if (teamsError) {
    throw new Error(`Failed to fetch teams: ${teamsError.message}`)
  }

  if (!teams || teams.length === 0) return

  const upserts = teams.map((team: { id: string }) => ({
    team_id: team.id,
    tournament_id: tournamentId,
    budget: startBudget,
    points_scored: 0,
  }))

  const { error } = await supabase
    .from('fantasy_team_tournament_stats')
    .upsert(upserts, { onConflict: 'team_id,tournament_id', ignoreDuplicates: true })

  if (error) {
    throw new Error(`Failed to initialize tournament team stats: ${error.message}`)
  }
}

export async function assignInitialTeamLineups(
  supabase: AdminClient,
  tournamentId: string,
  starterTeamTargetValue = 0,
  starterTeamPlayerCount = 8
) {
  // Step 1: Get all players for this tournament
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

  const eligiblePlayers = (tournamentPlayers || [])
    .map((tp: any) => ({
      playerId: tp.player_id as string,
      marketValue: Number(tp.market_value || 0),
    }))

  if (eligiblePlayers.length === 0) {
    throw new Error('Keine Spieler sind diesem Turnier zugewiesen.')
  }

  // Step 2: Get all teams across all leagues
  const { data: allTeams, error: teamsError } = await supabase
    .from('fantasy_teams')
    .select('id, league_id')

  if (teamsError) {
    throw new Error(`Failed to fetch teams: ${teamsError.message}`)
  }

  const teams = allTeams || []
  const normalizedStarterTeamPlayerCount = Math.max(1, Math.floor(Number(starterTeamPlayerCount || 8)))
  const normalizedTarget = Math.max(0, Number(starterTeamTargetValue || 0))

  // Group teams by league — player pools are independent between leagues,
  // so the same player can grace multiple leagues' starter teams.
  const teamsByLeague = new Map<string, Array<{ id: string; league_id: string }>>()
  for (const team of teams) {
    const list = teamsByLeague.get(team.league_id) || []
    list.push(team)
    teamsByLeague.set(team.league_id, list)
  }

  // Step 3: Validate that each league has enough unique players for its teams.
  for (const [leagueId, leagueTeams] of teamsByLeague.entries()) {
    const requiredForLeague = leagueTeams.length * normalizedStarterTeamPlayerCount
    if (eligiblePlayers.length < requiredForLeague) {
      throw new Error(
        `Nicht genügend Spieler verfügbar für Liga ${leagueId}. ` +
        `Benötigt: ${requiredForLeague} (${leagueTeams.length} Teams × ${normalizedStarterTeamPlayerCount} Spieler), ` +
        `Verfügbar: ${eligiblePlayers.length}. Bitte weise mehr Spieler diesem Turnier zu.`
      )
    }
  }

  // Step 4: For each league independently, assign starter team players while
  // approximating the desired starter team value. Players are unique within a
  // league but may be shared across leagues.
  const teamPlayerRows: Array<{ team_id: string; player_id: string; tournament_id: string }> = []
  let totalAssignedStarterValue = 0

  for (const leagueTeams of teamsByLeague.values()) {
    // Each league starts with a freshly shuffled copy of the full eligible player pool.
    const remainingPlayers = pickRandomItems<EligibleStarterPlayer>(eligiblePlayers, eligiblePlayers.length)

    for (const team of leagueTeams) {
      const selectedPlayers = pickStarterTeamForTarget(remainingPlayers, normalizedStarterTeamPlayerCount, normalizedTarget)
      const selectedPlayerIds = new Set(selectedPlayers.map((player) => player.playerId))

      for (const player of selectedPlayers) {
        teamPlayerRows.push({
          team_id: team.id,
          player_id: player.playerId,
          tournament_id: tournamentId,
        })
        totalAssignedStarterValue += player.marketValue
      }

      // Remove picked players from this league's pool so each team gets unique players.
      const nextRemainingPlayers = remainingPlayers.filter((player) => !selectedPlayerIds.has(player.playerId))
      remainingPlayers.splice(0, remainingPlayers.length, ...nextRemainingPlayers)
    }
  }

  // Step 5: Insert all players into team_players (tournament-scoped)
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
    starterTeamPlayerCount: normalizedStarterTeamPlayerCount,
    starterTeamTargetValue: normalizedTarget,
    averageStarterTeamValue: teams.length > 0 ? Math.round(totalAssignedStarterValue / teams.length) : 0,
  }
}

async function resolveExpiredAuctionsForLeague(supabase: AdminClient, leagueId: string, nowIso: string) {
  // Budget helpers keyed by tournament_id from the auction itself
  async function getTournamentBudget(teamId: string, tournamentId: string): Promise<number> {
    const { data } = await supabase
      .from('fantasy_team_tournament_stats')
      .select('budget')
      .eq('team_id', teamId)
      .eq('tournament_id', tournamentId)
      .single()
    return Number(data?.budget ?? 0)
  }

  async function setTournamentBudget(teamId: string, tournamentId: string, newBudget: number) {
    await supabase
      .from('fantasy_team_tournament_stats')
      .update({ budget: newBudget })
      .eq('team_id', teamId)
      .eq('tournament_id', tournamentId)
  }

  const { data: expiredAuctions, error: expiredError } = await supabase
    .from('market_auctions')
    .select('id, player_id, highest_bidder_id, highest_bid, seller_team_id, tournament_id')
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
    const rawWinningAmount = Number(winnerBid?.bid_amount || auction.highest_bid || 0)
    const winningAmount = Number.isFinite(rawWinningAmount) ? rawWinningAmount : 0
    const isPlayerSale = !!auction.seller_team_id

    // Remove bids + auction first so DB trigger allows assigning player to team.
    await supabase.from('market_bids').delete().eq('auction_id', auction.id)
    await supabase.from('market_auctions').delete().eq('id', auction.id)

    // If no winner and this is a player sale, return player to seller
    if (!winnerTeamId && isPlayerSale && auction.seller_team_id) {
      const { error: returnError } = await supabase
        .from('team_players')
        .upsert(
          { team_id: auction.seller_team_id, player_id: auction.player_id, tournament_id: auction.tournament_id },
          { onConflict: 'team_id,player_id,tournament_id', ignoreDuplicates: true }
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
          { team_id: winnerTeamId, player_id: auction.player_id, tournament_id: auction.tournament_id },
          { onConflict: 'team_id,player_id,tournament_id', ignoreDuplicates: true }
        )

      if (assignError) throw assignError

      // If this is a player sale, remove player from seller team
      if (isPlayerSale && auction.seller_team_id && auction.seller_team_id !== winnerTeamId) {
        await supabase
          .from('team_players')
          .delete()
          .eq('team_id', auction.seller_team_id)
          .eq('player_id', auction.player_id)
          .eq('tournament_id', auction.tournament_id)

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

      const { data: winnerTeam, error: winnerTeamError } = await supabase
        .from('fantasy_teams')
        .select('id, name')
        .eq('id', winnerTeamId)
        .single()

      if (winnerTeamError || !winnerTeam) {
        throw winnerTeamError || new Error('Winner team not found during auction resolution')
      }

      if (winningAmount > 0 && auction.tournament_id) {
        const winnerBudget = await getTournamentBudget(winnerTeamId, auction.tournament_id)
        await setTournamentBudget(winnerTeamId, auction.tournament_id, winnerBudget - winningAmount)

        // For player sales, add seller budget increase
        if (isPlayerSale && auction.seller_team_id && auction.seller_team_id !== winnerTeamId) {
          const sellerBudget = await getTournamentBudget(auction.seller_team_id, auction.tournament_id)
          await setTournamentBudget(auction.seller_team_id, auction.tournament_id, sellerBudget + winningAmount)
        }
      }

      // Record every successful auction in sales history.
      // For market/PC auctions, seller_team_id stays null.
      const { error: historyError } = await supabase
        .from('player_sales_history')
        .insert({
          auction_id: null,
          seller_team_id: auction.seller_team_id || null,
          buyer_team_id: winnerTeamId,
          player_id: auction.player_id,
          league_id: leagueId,
          sale_price: winningAmount,
          sale_type: 'auction_win',
        })

      if (historyError) {
        throw new Error(`Failed to insert player sales history: ${historyError.message}`)
      }

      const playerName = playerNameMap.get(auction.player_id) || 'Spieler'
      const { error: winnerNewsError } = await supabase.from('league_news').insert([
        {
          league_id: leagueId,
          team_id: winnerTeamId,
          title: 'Spieler gekauft',
          message: `Du hast ${playerName} für ${winningAmount.toLocaleString('de-DE')}€ gekauft.`,
        },
      ])

      if (winnerNewsError) {
        throw new Error(`Failed to insert winner news entry: ${winnerNewsError.message}`)
      }

      const loserTeamIds: string[] = Array.from(
        new Set((bids || []).map((b: any) => b.team_id as string).filter((teamId: string) => teamId !== winnerTeamId))
      )

      if (loserTeamIds.length > 0) {
        const newsRows = loserTeamIds.map((teamId: string) => ({
          league_id: leagueId,
          team_id: teamId,
          title: 'Gebot abgelehnt',
          message: `Dein Gebot auf ${playerName} war nicht erfolgreich. ${winnerTeam.name} hat den Spieler erhalten.`,
        }))

        const { error: newsError } = await supabase.from('league_news').insert(newsRows)
        if (newsError) {
          throw new Error(`Failed to insert loser news entries: ${newsError.message}`)
        }
      }
    }

    resolvedCount += 1
  }

  return resolvedCount
}

export interface TransferMarketConfig {
  targetActivePcOffers?: number
  auctionDurationMinHours?: number
  auctionDurationMaxHours?: number
}

export async function refillTransferMarketForActiveTournament(supabase: AdminClient, config?: TransferMarketConfig) {
  const nowIso = new Date().toISOString()
  const targetActivePcOffers = Math.max(1, Math.floor(config?.targetActivePcOffers ?? 8))
  const auctionDurationMinHours = Math.max(1, Math.floor(config?.auctionDurationMinHours ?? 3))
  const auctionDurationMaxHours = Math.max(auctionDurationMinHours, Math.floor(config?.auctionDurationMaxHours ?? 24))

  const { data: activeTournaments, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('is_active', true)
    .neq('status', 'on-going')

  if (tournamentError) throw tournamentError

  if (!activeTournaments || activeTournaments.length === 0) {
    // No active tournament means no active offers should remain.
    await supabase.from('market_auctions').delete().gt('end_time', nowIso)
    return { leaguesProcessed: 0, offersCreated: 0, activeTournamentPlayers: 0 }
  }

  const tournamentIds = activeTournaments.map((t: any) => t.id)

  const { data: tournamentPlayers, error: tpError } = await supabase
    .from('tournament_players')
    .select('tournament_id, player_id, appearance_probability')
    .in('tournament_id', tournamentIds)

  if (tpError) throw tpError

  const activeTournamentPlayerIds = Array.from(
    new Set(
      (tournamentPlayers || [])
        .filter((tp: any) => tp.appearance_probability !== 'Ausgeschlossen')
        .map((tp: any) => tp.player_id as string)
    )
  )

  const tournamentPlayerIdsMap = new Map<string, string[]>()
  for (const tournamentId of tournamentIds) {
    tournamentPlayerIdsMap.set(tournamentId as string, [])
  }

  for (const row of tournamentPlayers || []) {
    if (row.appearance_probability === 'Ausgeschlossen') continue
    const tournamentId = row.tournament_id as string
    const playerId = row.player_id as string
    if (!tournamentId || !playerId) continue

    const existing = tournamentPlayerIdsMap.get(tournamentId) || []
    existing.push(playerId)
    tournamentPlayerIdsMap.set(tournamentId, existing)
  }

  for (const [tournamentId, playerIds] of tournamentPlayerIdsMap.entries()) {
    tournamentPlayerIdsMap.set(tournamentId, Array.from(new Set(playerIds)))
  }

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
      .select('player_id, tournament_id, seller_team_id')
      .eq('league_id', league.id)
      .gt('end_time', nowIso)

    if (auctionError) throw auctionError

    // Key: `playerId:tournamentId` — same player can be auctioned for different tournaments simultaneously
    const activeAuctionKeys = new Set<string>(
      (activeAuctions || []).map((a: any) => `${a.player_id}:${a.tournament_id}`)
    )
    const activePcOfferCount = (activeAuctions || []).filter((a: any) => !a.seller_team_id).length

    // Keep exactly 16 active PC offers, independent of additional manager offers.
    if (activePcOfferCount >= targetActivePcOffers) continue

    const { data: leagueTeams, error: teamsError } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('league_id', league.id)

    if (teamsError) throw teamsError

    const teamIds = (leagueTeams || []).map((t: any) => t.id as string)
    // Key: `playerId:tournamentId` — same player can be owned in different tournaments by different teams
    let teamPlayerKeys = new Set<string>()

    if (teamIds.length > 0) {
      const { data: teamPlayers, error: teamPlayersError } = await supabase
        .from('team_players')
        .select('player_id, tournament_id')
        .in('team_id', teamIds)

      if (teamPlayersError) throw teamPlayersError
      teamPlayerKeys = new Set<string>(
        (teamPlayers || []).map((tp: any) => `${tp.player_id}:${tp.tournament_id}`)
      )
    }

    const candidatesByTournament = new Map<string, string[]>()
    let totalCandidates = 0

    for (const [tournamentId, tournamentPlayerIds] of tournamentPlayerIdsMap.entries()) {
      const tournamentCandidates = tournamentPlayerIds.filter(
        (playerId: string) => {
          const key = `${playerId}:${tournamentId}`
          return !activeAuctionKeys.has(key) && !teamPlayerKeys.has(key)
        }
      )

      if (tournamentCandidates.length > 0) {
        candidatesByTournament.set(tournamentId, tournamentCandidates)
        totalCandidates += tournamentCandidates.length
      }
    }

    const needed = Math.min(targetActivePcOffers - activePcOfferCount, totalCandidates)
    if (needed <= 0) continue

    const selectedPlayers = await pickPlayersForLeagueCycleBalancedAcrossTournaments(
      supabase,
      league.id,
      candidatesByTournament,
      needed,
      nowIso
    )

    if (selectedPlayers.length === 0) continue

    const auctionRows = selectedPlayers.map(({ playerId, tournamentId }) => ({
      league_id: league.id,
      player_id: playerId,
      tournament_id: tournamentId,
      end_time: getRandomAuctionEndTime(auctionDurationMinHours, auctionDurationMaxHours),
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
