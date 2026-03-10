import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createAdminClient, refillTransferMarketForActiveTournament, assignInitialTeamLineups } from '@/lib/transfer-market'

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
  const isActive = body?.is_active as boolean | undefined
  const status = body?.status as string | undefined

  const updateData: any = {}
  
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be boolean' }, { status: 400 })
    }
    updateData.is_active = isActive
  }

  if (status !== undefined) {
    const validStatuses = ['upcoming', 'on-going', 'completed']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'status must be one of: upcoming, on-going, completed' }, { status: 400 })
    }
    updateData.status = status
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = getAdminClient()
  
  if (isActive === true) {
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
      .update(updateData)
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

    // Assign initial team players (8 players per team) BEFORE filling transfer market
    let lineupSummary
    try {
      lineupSummary = await assignInitialTeamLineups(supabase, id)
    } catch (assignError: any) {
      // Roll back the tournament activation if lineup assignment fails
      await supabase
        .from('tournaments')
        .update({ is_active: false })
        .eq('id', id)
      
      return NextResponse.json({ 
        error: assignError.message || 'Fehler beim Zuweisen der Spieler', 
        details: 'Turnier konnte nicht aktiviert werden. Bitte weise ausreichend Spieler außerhalb der Top 20 dem Turnier zu.'
      }, { status: 400 })
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

    return NextResponse.json({ tournament, refillSummary, lineupSummary })
  }

  const { data, error } = await supabase
    .from('tournaments')
    .update(updateData)
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
