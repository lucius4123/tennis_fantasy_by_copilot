import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/transfer-market'

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerAuthClient()
    const { data: { user }, error: userError } = await authClient.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const teamId = formData.get('teamId') as string | null
    const leagueId = formData.get('leagueId') as string | null

    if (!file || !teamId || !leagueId) {
      return NextResponse.json({ error: 'file, teamId und leagueId sind erforderlich' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Datei muss ein Bild sein' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Datei ist größer als 2MB' }, { status: 400 })
    }

    const { data: team, error: teamError } = await supabase
      .from('fantasy_teams')
      .select('id, user_id, league_id')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team nicht gefunden' }, { status: 404 })
    }

    if (team.user_id !== user.id || team.league_id !== leagueId) {
      return NextResponse.json({ error: 'Keine Berechtigung für dieses Team' }, { status: 403 })
    }

    const fileExt = file.name.split('.').pop() || 'png'
    const fileName = `teams/${teamId}-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('player-images')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: 'Upload fehlgeschlagen' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('player-images')
      .getPublicUrl(fileName)

    const { error: updateError } = await supabase
      .from('fantasy_teams')
      .update({ profile_image_url: publicUrl })
      .eq('id', teamId)

    if (updateError) {
      return NextResponse.json({ error: 'Team konnte nicht aktualisiert werden' }, { status: 500 })
    }

    return NextResponse.json({ imageUrl: publicUrl })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
