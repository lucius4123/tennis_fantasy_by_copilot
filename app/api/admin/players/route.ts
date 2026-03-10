import { NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

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

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet) as Array<{
      Rank: number
      'Player name': string
      Country: string
      Points: number
      atp_id: number
    }>

    const supabase = getAdminClient()
    const inserted: any[] = []
    const skipped: string[] = []

    for (const row of data) {
      const playerName = row['Player name'].trim()
      const nameParts = playerName.split(' ')
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ')

      // Check if player already exists
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('id')
        .eq('first_name', firstName)
        .eq('last_name', lastName)
        .single()

      if (existingPlayer) {
        skipped.push(playerName)
        continue
      }

      // Insert new player
      const { data: newPlayer, error } = await supabase
        .from('players')
        .insert({
          atp_id: row.atp_id,
          first_name: firstName,
          last_name: lastName,
          ranking: row.Rank,
          points: row.Points,
          country: row.Country
        })
        .select()
        .single()

      if (error) {
        console.error(`Error inserting player ${playerName}:`, error)
      } else {
        inserted.push(newPlayer)
      }
    }

    return NextResponse.json({
      success: true,
      inserted: inserted.length,
      skipped: skipped.length,
      skippedPlayers: skipped,
      message: `${inserted.length} Spieler hinzugefügt, ${skipped.length} übersprungen`
    })
  } catch (error) {
    console.error('Error processing Excel file:', error)
    return NextResponse.json(
      { error: 'Error processing file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
