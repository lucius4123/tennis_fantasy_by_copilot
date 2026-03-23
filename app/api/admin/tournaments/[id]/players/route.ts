import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  isValidSeedingStatus,
  recomputeTournamentSeeding,
} from '@/lib/tournament-seeding'

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

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('tournament_players')
    .select('id, tournament_id, player_id, appearance_probability, market_value, is_wildcard, seeding_status, tournament_seed_position, qualification_seed_position, player:players(id, first_name, last_name, ranking, image_url)')
    .eq('tournament_id', id)

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ tournamentPlayers: data || [] })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const body = await request.json()
  const playerId = body?.player_id as string
  const rawAppearanceProbability = (body?.appearance_probability as string) || 'Garantiert'
  const marketValue = (body?.market_value as number) || 0
  const isWildcard = body?.is_wildcard === true
  const seedingStatusRaw = body?.seeding_status
  const validValues = ['Garantiert', 'Sehr Wahrscheinlich', 'Wahrscheinlich', 'Riskant', 'Sehr Riskant', 'Ausgeschlossen']
  const appearanceProbability = isWildcard ? 'Garantiert' : rawAppearanceProbability
  const seedingStatus = seedingStatusRaw === undefined ? 'Main-Draw' : seedingStatusRaw

  if (!playerId) {
    return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
  }

  if (!validValues.includes(appearanceProbability)) {
    return NextResponse.json({ error: 'Invalid appearance_probability' }, { status: 400 })
  }

  if (typeof marketValue !== 'number' || marketValue < 0) {
    return NextResponse.json({ error: 'Invalid market_value. Must be a non-negative number' }, { status: 400 })
  }

  if (!isValidSeedingStatus(seedingStatus)) {
    return NextResponse.json({ error: 'Invalid seeding_status' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('tournament_players')
    .insert({
      tournament_id: id,
      player_id: playerId,
      appearance_probability: appearanceProbability,
      market_value: marketValue,
      is_wildcard: isWildcard,
      seeding_status: seedingStatus,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  try {
    await recomputeTournamentSeeding(supabase, id)
  } catch (seedingError: any) {
    return NextResponse.json({ error: seedingError.message || 'Failed to recompute tournament seeding' }, { status: 500 })
  }

  return NextResponse.json({ tournamentPlayer: data })
}
