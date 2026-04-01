import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createAdminClient, refillTransferMarketForActiveTournament } from '@/lib/transfer-market'

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

  let config: { targetActivePcOffers?: number; auctionDurationMinHours?: number; auctionDurationMaxHours?: number } = {}
  try {
    const body = await request.json()
    if (typeof body?.targetActivePcOffers === 'number') config.targetActivePcOffers = body.targetActivePcOffers
    if (typeof body?.auctionDurationMinHours === 'number') config.auctionDurationMinHours = body.auctionDurationMinHours
    if (typeof body?.auctionDurationMaxHours === 'number') config.auctionDurationMaxHours = body.auctionDurationMaxHours
  } catch {
    // No body or invalid JSON — use defaults
  }

  try {
    const supabase = createAdminClient()
    const summary = await refillTransferMarketForActiveTournament(supabase, config)
    return NextResponse.json({ success: true, summary })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Maintenance failed' }, { status: 500 })
  }
}
