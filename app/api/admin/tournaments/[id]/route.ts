import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createAdminClient, refillTransferMarketForActiveTournament } from '@/lib/transfer-market'

function getAdminClient() {
  return createAdminClient()
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
  const isActive = body?.is_active as boolean

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'is_active must be boolean' }, { status: 400 })
  }

  const supabase = getAdminClient()
  if (isActive) {
    // Ensure only one active tournament at a time.
    const { error: deactivateOthersError } = await supabase
      .from('tournaments')
      .update({ is_active: false })
      .neq('id', id)

    if (deactivateOthersError) {
      return NextResponse.json({ error: deactivateOthersError.message, code: deactivateOthersError.code }, { status: 500 })
    }

    const { error: activateError } = await supabase
      .from('tournaments')
      .update({ is_active: true })
      .eq('id', id)

    if (activateError) {
      return NextResponse.json({ error: activateError.message, code: activateError.code }, { status: 500 })
    }

    // Reset league state for the newly active tournament.
    const { error: clearAuctionsError } = await supabase.from('market_auctions').delete().not('id', 'is', null)
    if (clearAuctionsError) {
      return NextResponse.json({ error: clearAuctionsError.message, code: clearAuctionsError.code }, { status: 500 })
    }

    const { error: clearTeamPlayersError } = await supabase.from('team_players').delete().not('team_id', 'is', null)
    if (clearTeamPlayersError) {
      return NextResponse.json({ error: clearTeamPlayersError.message, code: clearTeamPlayersError.code }, { status: 500 })
    }

    const { error: clearLineupsError } = await supabase.from('tournament_lineups').delete().not('tournament_id', 'is', null)
    if (clearLineupsError) {
      return NextResponse.json({ error: clearLineupsError.message, code: clearLineupsError.code }, { status: 500 })
    }

    const refillSummary = await refillTransferMarketForActiveTournament(supabase)

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .single()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message, code: tournamentError.code }, { status: 500 })
    }

    return NextResponse.json({ tournament, refillSummary })
  }

  const { data, error } = await supabase
    .from('tournaments')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  await refillTransferMarketForActiveTournament(supabase)
  return NextResponse.json({ tournament: data })
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const supabase = getAdminClient()

  const { error } = await supabase
    .from('tournaments')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
