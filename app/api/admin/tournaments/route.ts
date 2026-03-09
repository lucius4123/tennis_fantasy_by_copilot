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

  if (!name || !startDate) {
    return NextResponse.json({ error: 'name and startDate are required' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      start_date: new Date(startDate).toISOString(),
      is_active: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ tournament: data })
}
