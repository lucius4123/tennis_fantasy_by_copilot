import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { findTournamentTypeOption } from '@/lib/tournament-types'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireUser() {
  const authClient = await createServerAuthClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

export async function GET() {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('start_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ tournaments: data || [] })
}

export async function POST(request: NextRequest) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const name = body?.name as string
  const startDate = body?.startDate as string
  const startBudget = body?.start_budget as number | undefined
  const starterTeamTargetValue = body?.starter_team_target_value as number | undefined
  const starterTeamPlayerCount = body?.starter_team_player_count as number | undefined
  const countryCodeRaw = body?.country_code as string | undefined
  const previousWinnerPlayerIdRaw = body?.previous_winner_player_id as string | null | undefined
  const tournamentTypeRaw = body?.tournament_type as string | null | undefined
  const newcomerEnabled = body?.newcomer_enabled as boolean | undefined

  if (!name || !startDate) {
    return NextResponse.json({ error: 'name and startDate are required' }, { status: 400 })
  }

  if (startBudget !== undefined && (!Number.isFinite(startBudget) || startBudget < 0)) {
    return NextResponse.json({ error: 'start_budget must be a non-negative number' }, { status: 400 })
  }

  if (starterTeamTargetValue !== undefined && (!Number.isFinite(starterTeamTargetValue) || starterTeamTargetValue < 0)) {
    return NextResponse.json({ error: 'starter_team_target_value must be a non-negative number' }, { status: 400 })
  }

  if (starterTeamPlayerCount !== undefined && (!Number.isInteger(starterTeamPlayerCount) || starterTeamPlayerCount <= 0)) {
    return NextResponse.json({ error: 'starter_team_player_count must be a positive integer' }, { status: 400 })
  }

  const countryCode = countryCodeRaw?.trim().toUpperCase()
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    return NextResponse.json({ error: 'country_code must be a 2-letter ISO code (e.g. DE)' }, { status: 400 })
  }

  const previousWinnerPlayerId = typeof previousWinnerPlayerIdRaw === 'string'
    ? previousWinnerPlayerIdRaw.trim() || null
    : null

  const tournamentType = typeof tournamentTypeRaw === 'string' ? tournamentTypeRaw.trim() : ''
  const tournamentTypeOption = tournamentType ? findTournamentTypeOption(tournamentType) : null
  if (tournamentType && !tournamentTypeOption) {
    return NextResponse.json({ error: 'tournament_type is invalid' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      start_date: new Date(startDate).toISOString(),
      is_active: false,
      status: 'upcoming',
      start_budget: startBudget ?? 1000000,
      starter_team_target_value: starterTeamTargetValue ?? 0,
      starter_team_player_count: starterTeamPlayerCount ?? 8,
      country_code: countryCode || null,
      previous_winner_player_id: previousWinnerPlayerId,
      tournament_category: tournamentTypeOption?.category ?? null,
      singles_player_count: tournamentTypeOption?.singlesPlayerCount ?? null,
      newcomer_enabled: newcomerEnabled !== false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ tournament: data })
}
