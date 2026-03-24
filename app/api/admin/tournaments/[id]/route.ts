import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createAdminClient, refillTransferMarketForActiveTournament } from '@/lib/transfer-market'
import { findTournamentTypeOption } from '@/lib/tournament-types'

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
  const startBudget = body?.start_budget as number | undefined
  const starterTeamTargetValue = body?.starter_team_target_value as number | undefined
  const starterTeamPlayerCount = body?.starter_team_player_count as number | undefined
  const countryCodeRaw = body?.country_code as string | null | undefined
  const previousWinnerPlayerIdRaw = body?.previous_winner_player_id as string | null | undefined
  const tournamentTypeRaw = body?.tournament_type as string | null | undefined

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

  if (startBudget !== undefined) {
    if (!Number.isFinite(startBudget) || startBudget < 0) {
      return NextResponse.json({ error: 'start_budget must be a non-negative number' }, { status: 400 })
    }
    updateData.start_budget = startBudget
  }

  if (starterTeamTargetValue !== undefined) {
    if (!Number.isFinite(starterTeamTargetValue) || starterTeamTargetValue < 0) {
      return NextResponse.json({ error: 'starter_team_target_value must be a non-negative number' }, { status: 400 })
    }
    updateData.starter_team_target_value = starterTeamTargetValue
  }

  if (starterTeamPlayerCount !== undefined) {
    if (!Number.isInteger(starterTeamPlayerCount) || starterTeamPlayerCount <= 0) {
      return NextResponse.json({ error: 'starter_team_player_count must be a positive integer' }, { status: 400 })
    }
    updateData.starter_team_player_count = starterTeamPlayerCount
  }

  if (countryCodeRaw !== undefined) {
    const countryCode = (countryCodeRaw || '').trim().toUpperCase()
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      return NextResponse.json({ error: 'country_code must be a 2-letter ISO code (e.g. DE)' }, { status: 400 })
    }
    updateData.country_code = countryCode || null
  }

  if (previousWinnerPlayerIdRaw !== undefined) {
    const previousWinnerPlayerId = typeof previousWinnerPlayerIdRaw === 'string'
      ? previousWinnerPlayerIdRaw.trim() || null
      : null
    updateData.previous_winner_player_id = previousWinnerPlayerId
  }

  if (tournamentTypeRaw !== undefined) {
    const tournamentType = typeof tournamentTypeRaw === 'string' ? tournamentTypeRaw.trim() : ''
    const tournamentTypeOption = tournamentType ? findTournamentTypeOption(tournamentType) : null

    if (tournamentType && !tournamentTypeOption) {
      return NextResponse.json({ error: 'tournament_type is invalid' }, { status: 400 })
    }

    updateData.tournament_category = tournamentTypeOption?.category ?? null
    updateData.singles_player_count = tournamentTypeOption?.singlesPlayerCount ?? null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = getAdminClient()
  
  if (isActive === true) {
    const { data: activatedTournament, error: activateError } = await supabase
      .from('tournaments')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (activateError) {
      return NextResponse.json({ error: activateError.message, code: activateError.code }, { status: 500 })
    }

    // When activating tournaments, only reset transfer market state.
    const { error: clearAuctionsError } = await supabase.from('market_auctions').delete().not('id', 'is', null)
    if (clearAuctionsError) {
      return NextResponse.json({ error: clearAuctionsError.message, code: clearAuctionsError.code }, { status: 500 })
    }

    const { error: clearRotationError } = await supabase.from('market_player_rotation').delete().not('league_id', 'is', null)
    if (clearRotationError) {
      return NextResponse.json({ error: clearRotationError.message, code: clearRotationError.code }, { status: 500 })
    }

    const refillSummary = await refillTransferMarketForActiveTournament(supabase)
    return NextResponse.json({ tournament: activatedTournament, refillSummary })
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
