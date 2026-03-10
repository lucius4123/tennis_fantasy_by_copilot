import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/transfer-market'

async function requireUser() {
  const authClient = await createServerAuthClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

export async function POST(request: NextRequest) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const tournamentId = body?.tournamentId as string

    if (!tournamentId) {
      return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Step 1: Load current scoring rules
    const { data: scoringRules, error: rulesError } = await supabase
      .from('scoring_rules')
      .select('*')

    if (rulesError) {
      return NextResponse.json({ error: rulesError.message }, { status: 500 })
    }

    // Create a map for quick lookup
    const rulesMap = new Map<string, number>()
    for (const rule of scoringRules || []) {
      rulesMap.set(rule.stat_name, Number(rule.points_per_unit))
    }

    const getRulePoints = (...keys: string[]) => {
      for (const key of keys) {
        const value = rulesMap.get(key)
        if (value !== undefined) return value
      }
      return 0
    }

    // Step 2: Get all matches for this tournament
    const { data: matches, error: matchesError } = await supabase
      .from('player_matches')
      .select('*')
      .eq('tournament_id', tournamentId)

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 500 })
    }

    // Step 3: Recalculate fantasy_points for each match
    const matchUpdates: Array<{ id: string; fantasy_points: number }> = []
    
    for (const match of matches || []) {
      let points = 0

      // Calculate points based on match result
      const matchResultPoints = getRulePoints('match_result', 'win')
      if (match.match_result === 'won') {
        points += matchResultPoints
      }
      if (match.match_result === 'lost') {
        points += getRulePoints('loss')
      }

      // Add points for each statistic
      points += (match.aces || 0) * getRulePoints('aces', 'ace')
      points += (match.double_faults || 0) * getRulePoints('double_faults', 'double_fault')
      points += (match.break_points_won || 0) * getRulePoints('break_points_won', 'break_point_won')
      points += (match.net_points_won || 0) * getRulePoints('net_points_won')
      points += (match.breaks_conceded || 0) * getRulePoints('breaks_conceded')
      points += (match.winners || 0) * getRulePoints('winners', 'winner')
      points += (match.unforced_errors || 0) * getRulePoints('unforced_errors', 'unforced_error')
      points += (match.total_points_won || 0) * getRulePoints('total_points_won')

      // Store for batch update
      matchUpdates.push({
        id: match.id,
        fantasy_points: Math.round(points)
      })
    }

    // Step 4: Update all matches with new fantasy_points
    let matchesUpdated = 0
    for (const update of matchUpdates) {
      const { error: updateError } = await supabase
        .from('player_matches')
        .update({ fantasy_points: update.fantasy_points })
        .eq('id', update.id)

      if (!updateError) {
        matchesUpdated++
      }
    }

    // Step 5: Aggregate points per player (now with updated values)
    const playerPoints = new Map<string, number>()

    for (const update of matchUpdates) {
      // Find the corresponding match to get player_id
      const match = matches?.find((m: { id: string }) => m.id === update.id)
      if (match) {
        const currentPoints = playerPoints.get(match.player_id) || 0
        playerPoints.set(match.player_id, currentPoints + update.fantasy_points)
      }
    }

    // Step 6: Get all lineups for this tournament
    const { data: lineups, error: lineupsError } = await supabase
      .from('tournament_lineups')
      .select('team_id, player_id')
      .eq('tournament_id', tournamentId)

    if (lineupsError) {
      return NextResponse.json({ error: lineupsError.message }, { status: 500 })
    }

    // Step 7: Calculate points per team
    const teamPoints = new Map<string, number>()
    for (const lineup of lineups || []) {
      const points = playerPoints.get(lineup.player_id) || 0
      const currentTeamPoints = teamPoints.get(lineup.team_id) || 0
      teamPoints.set(lineup.team_id, currentTeamPoints + points)
    }

    // Step 8: Update fantasy_teams with the accumulated points
    let teamsUpdated = 0
    for (const [teamId, points] of teamPoints.entries()) {
      const { error: teamUpdateError } = await supabase
        .from('fantasy_teams')
        .update({ total_points_scored: points })
        .eq('id', teamId)
      
      if (!teamUpdateError) {
        teamsUpdated++
      }
    }

    return NextResponse.json({ 
      success: true,
      matchesRecalculated: matchesUpdated,
      teamsUpdated: teamsUpdated,
      playerPointsMap: Object.fromEntries(playerPoints),
      teamPointsMap: Object.fromEntries(teamPoints)
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update points' }, { status: 500 })
  }
}
