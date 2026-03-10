import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Helper function to fetch players from RapidAPI
async function fetchPlayersFromAPI() {
  const url = 'https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/atp/ranking/singles/'
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY || '',
      'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com'
    }
  }

  const response = await fetch(url, options)
  
  if (!response.ok) {
    throw new Error(`RapidAPI responded with status: ${response.status}`)
  }

  const data = await response.json()
  return data
}

export async function GET(request: Request) {
  try {
    // 1. Security: Protect the endpoint with a secret token
    // This prevents unauthorized users from triggering the sync and costing you API calls
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.SYNC_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Supabase client with service role key to bypass RLS
    // This is safe because this code only runs on the server
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase credentials not configured' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    // 2. Fetch data from RapidAPI
    const apiData = await fetchPlayersFromAPI()
    
    // Ranking endpoint response structure: { data: [{ position, point, player: { id, name, ... } }] }
    const allPlayers = Array.isArray(apiData) ? apiData : (apiData.data || [])

    if (!allPlayers || allPlayers.length === 0) {
      return NextResponse.json({ error: 'No players found from API' }, { status: 404 })
    }

    // 3. Keep players with ATP singles ranking 1-200
    const topPlayers = allPlayers.filter((p: any) => {
      const rankingPosition = Number(p.position)
      return Number.isFinite(rankingPosition) && rankingPosition > 0 && rankingPosition <= 200
    })

    if (topPlayers.length === 0) {
      return NextResponse.json({ error: 'No players with ranking <= 200 found' }, { status: 404 })
    }

    // 4. Map ranking data to our Supabase schema
    const defaultImageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`
    const playersToUpsert = topPlayers
      .map((p: any) => {
        const fullName = (p.player?.name || '').trim()
        const nameParts = fullName.split(' ').filter(Boolean)
        const firstName = nameParts[0] || 'Unknown'
        const lastName = nameParts.slice(1).join(' ') || 'Unknown'

        return {
          atp_id: p.player?.id ?? null,
          first_name: firstName,
          last_name: lastName,
          ranking: Number(p.position) || null,
          points: Number(p.point) || 0,
          country: p.player?.country?.name || p.player?.countryAcr || p.countryAcr || null,
          image_url: defaultImageUrl,
          updated_at: new Date().toISOString()
        }
      })
      .filter((p: { atp_id: number | null }) => p.atp_id !== null)

    if (playersToUpsert.length === 0) {
      return NextResponse.json({ error: 'No valid players with player.id found in API response' }, { status: 404 })
    }

    // 5. Upsert into Supabase
    // We use the service role key here to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('players')
      .upsert(playersToUpsert, { 
        onConflict: 'atp_id',
        ignoreDuplicates: false 
      })
      .select()

    if (error) {
      console.error('Supabase Upsert Error:', error)
      return NextResponse.json({ error: 'Failed to upsert players to database' }, { status: 500 })
    }

    // ensure any existing row without an image gets the default placeholder
    await supabaseAdmin
      .from('players')
      .update({ image_url: defaultImageUrl })
      .is('image_url', null)

    return NextResponse.json({ 
      message: `Successfully synced ${data.length} players with ATP ranking <= 200`, 
      count: data.length,
      players: data
    })

  } catch (error: any) {
    console.error('Sync Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
