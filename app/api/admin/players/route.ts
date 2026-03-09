import { NextResponse } from 'next/server'
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

export async function GET() {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('players')
    .select('id, first_name, last_name, ranking, image_url')
    .order('ranking', { ascending: true, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ players: data || [] })
}
