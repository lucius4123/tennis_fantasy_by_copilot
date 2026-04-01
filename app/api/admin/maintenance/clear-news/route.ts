import { NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/transfer-market'

export async function POST() {
  const authClient = await createServerAuthClient()
  const { data, error: authError } = await authClient.auth.getUser()
  if (authError || !data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { error: newsError } = await supabase.from('league_news').delete().not('id', 'is', null)
  if (newsError) {
    return NextResponse.json({ error: newsError.message, code: newsError.code }, { status: 500 })
  }

  const { error: salesError } = await supabase.from('player_sales_history').delete().not('id', 'is', null)
  if (salesError) {
    return NextResponse.json({ error: salesError.message, code: salesError.code }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
