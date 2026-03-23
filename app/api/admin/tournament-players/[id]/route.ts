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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const body = await request.json()
  const probability = body?.appearance_probability as string
  const marketValue = body?.market_value as number | undefined
  const isWildcard = body?.is_wildcard as boolean | undefined
  const seedingStatus = body?.seeding_status as string | undefined

  const updateData: any = {}

  if (probability !== undefined) {
    const validValues = ['Garantiert', 'Sehr Wahrscheinlich', 'Wahrscheinlich', 'Riskant', 'Sehr Riskant', 'Ausgeschlossen']
    if (!validValues.includes(probability)) {
      return NextResponse.json({ error: 'Invalid appearance_probability' }, { status: 400 })
    }
    updateData.appearance_probability = probability
    if (probability !== 'Garantiert') {
      updateData.is_wildcard = false
    }
  }

  if (isWildcard !== undefined) {
    if (typeof isWildcard !== 'boolean') {
      return NextResponse.json({ error: 'Invalid is_wildcard. Must be a boolean' }, { status: 400 })
    }

    updateData.is_wildcard = isWildcard
    if (isWildcard) {
      updateData.appearance_probability = 'Garantiert'
    }
  }

  if (marketValue !== undefined) {
    if (typeof marketValue !== 'number' || marketValue < 0) {
      return NextResponse.json({ error: 'Invalid market_value. Must be a non-negative number' }, { status: 400 })
    }
    updateData.market_value = marketValue
  }

  if (seedingStatus !== undefined) {
    if (!isValidSeedingStatus(seedingStatus)) {
      return NextResponse.json({ error: 'Invalid seeding_status' }, { status: 400 })
    }
    updateData.seeding_status = seedingStatus
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data: beforeUpdate, error: beforeUpdateError } = await supabase
    .from('tournament_players')
    .select('tournament_id')
    .eq('id', id)
    .single()

  if (beforeUpdateError) {
    return NextResponse.json({ error: beforeUpdateError.message, code: beforeUpdateError.code }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('tournament_players')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  try {
    await recomputeTournamentSeeding(supabase, beforeUpdate.tournament_id)
  } catch (seedingError: any) {
    return NextResponse.json({ error: seedingError.message || 'Failed to recompute tournament seeding' }, { status: 500 })
  }

  return NextResponse.json({ tournamentPlayer: data })
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const supabase = getAdminClient()

  const { data: existingRow, error: rowError } = await supabase
    .from('tournament_players')
    .select('tournament_id')
    .eq('id', id)
    .single()

  if (rowError) {
    return NextResponse.json({ error: rowError.message, code: rowError.code }, { status: 500 })
  }

  const { error } = await supabase
    .from('tournament_players')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  try {
    await recomputeTournamentSeeding(supabase, existingRow.tournament_id)
  } catch (seedingError: any) {
    return NextResponse.json({ error: seedingError.message || 'Failed to recompute tournament seeding' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
