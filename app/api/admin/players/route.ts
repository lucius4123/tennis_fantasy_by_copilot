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
    const rawData = XLSX.utils.sheet_to_json(sheet) as Array<Record<string, unknown>>

    // Normalize column names: lowercase and replace umlauts to handle Excel variations
    const data = rawData.map((row) => {
      const normalized: Record<string, unknown> = {}
      for (const key of Object.keys(row)) {
        const normalizedKey = key
          .toLowerCase()
          .replace(/ä/g, 'a')
          .replace(/ö/g, 'o')
          .replace(/ü/g, 'u')
        normalized[normalizedKey] = row[key]
      }
      return normalized as {
        atp_id: number
        vorname: string
        nachname: string
        nationalitat: string
        ranking: number
      }
    })

    const supabase = getAdminClient()
    const inserted: any[] = []
    const updated: string[] = []

    for (const row of data) {
      const atpId = row.atp_id
      if (!atpId) continue

      const playerLabel = [row.vorname, row.nachname].filter(Boolean).join(' ') || String(atpId)

      // Find existing player by atp_id
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('id, first_name, last_name, ranking, country')
        .eq('atp_id', atpId)
        .single()

      if (existingPlayer) {
        // Update only non-empty fields that differ from existing values
        const updateFields: Record<string, string | number> = {}

        if (row.vorname?.trim() && row.vorname.trim() !== existingPlayer.first_name) {
          updateFields.first_name = row.vorname.trim()
        }
        if (row.nachname?.trim() && row.nachname.trim() !== existingPlayer.last_name) {
          updateFields.last_name = row.nachname.trim()
        }
        if (row.nationalitat?.trim() && row.nationalitat.trim() !== existingPlayer.country) {
          updateFields.country = row.nationalitat.trim()
        }
        if (row.ranking != null && row.ranking !== existingPlayer.ranking) {
          const oldRank = existingPlayer.ranking
          const newRank = row.ranking

          if (oldRank != null) {
            if (newRank < oldRank) {
              // Player moves up: shift players between newRank and oldRank-1 down by 1
              const { data: affected } = await supabase
                .from('players')
                .select('id, ranking')
                .gte('ranking', newRank)
                .lt('ranking', oldRank)
                .neq('id', existingPlayer.id)

              for (const p of affected ?? []) {
                await supabase.from('players').update({ ranking: (p.ranking as number) + 1 }).eq('id', p.id)
              }
            } else {
              // Player moves down: shift players between oldRank+1 and newRank up by 1
              const { data: affected } = await supabase
                .from('players')
                .select('id, ranking')
                .gt('ranking', oldRank)
                .lte('ranking', newRank)
                .neq('id', existingPlayer.id)

              for (const p of affected ?? []) {
                await supabase.from('players').update({ ranking: (p.ranking as number) - 1 }).eq('id', p.id)
              }
            }
          }

          updateFields.ranking = newRank
        }

        if (Object.keys(updateFields).length > 0) {
          const { error } = await supabase
            .from('players')
            .update(updateFields)
            .eq('id', existingPlayer.id)

          if (error) {
            console.error(`Error updating player ${playerLabel}:`, error)
          } else {
            updated.push(playerLabel)
          }
        }
        continue
      }

      // Insert new player
      const { data: newPlayer, error } = await supabase
        .from('players')
        .insert({
          atp_id: atpId,
          first_name: row.vorname?.trim() || null,
          last_name: row.nachname?.trim() || null,
          ranking: row.ranking || null,
          country: row.nationalitat?.trim() || null,
        })
        .select()
        .single()

      if (error) {
        console.error(`Error inserting player ${playerLabel}:`, error)
      } else {
        inserted.push(newPlayer)
      }
    }

    return NextResponse.json({
      success: true,
      inserted: inserted.length,
      updated: updated.length,
      updatedPlayers: updated,
      message: `${inserted.length} Spieler hinzugefügt, ${updated.length} aktualisiert`
    })
  } catch (error) {
    console.error('Error processing Excel file:', error)
    return NextResponse.json(
      { error: 'Error processing file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
