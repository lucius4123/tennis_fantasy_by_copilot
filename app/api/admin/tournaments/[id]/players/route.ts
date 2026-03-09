import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
    .select('id, tournament_id, player_id, appearance_probability, player:players(id, first_name, last_name, ranking, image_url)')
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
  const appearanceProbability = (body?.appearance_probability as string) || 'Wahrscheinlich'
  const validValues = ['Garantiert', 'Sehr Wahrscheinlich', 'Wahrscheinlich', 'Riskant', 'Sehr Riskant']

  if (!playerId) {
    return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
  }

  if (!validValues.includes(appearanceProbability)) {
    return NextResponse.json({ error: 'Invalid appearance_probability' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('tournament_players')
    .insert({
      tournament_id: id,
      player_id: playerId,
      appearance_probability: appearanceProbability,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ tournamentPlayer: data })
}
