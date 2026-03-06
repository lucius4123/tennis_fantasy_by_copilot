import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Helper function to fetch players from RapidAPI
async function fetchPlayersFromAPI() {
  const url = 'https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/atp/player/' // Limit kann eingestellt werden (Anzahl der Zugriffe)
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
    
    // Assuming the API returns an array of players in a 'data' property or directly as an array
    // We need to adapt this based on the actual API response structure.
    // Let's assume it returns { data: [...] } or just [...]
    let allPlayers = Array.isArray(apiData) ? apiData : (apiData.data || [])

    if (!allPlayers || allPlayers.length === 0) {
      return NextResponse.json({ error: 'No players found from API' }, { status: 404 })
    }

    // 3. Pick 10 random players
    // Shuffle array and take first 10
    // const shuffled = allPlayers.sort(() => 0.5 - Math.random())
    // const selectedPlayers = shuffled.slice(0, 10)

    // 4. Map API data to our Supabase schema
    // Note: You might need to adjust the property names based on the actual RapidAPI response
    const defaultImageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`
    const playersToUpsert = allPlayers.map((p: any) => ({
      atp_id: p.id || p.player_id, // Adjust based on actual API
      first_name: p.first_name || p.name?.split(' ')[0] || 'Unknown',
      last_name: p.last_name || p.name?.split(' ').slice(1).join(' ') || 'Unknown',
      ranking: p.ranking || p.rank || null,
      points: p.points || 0,
      country: p.country || p.nationality || null,
      image_url: defaultImageUrl,
      updated_at: new Date().toISOString()
    }))

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
      message: 'Successfully synced 10 players', 
      count: data.length,
      players: data
    })

  } catch (error: any) {
    console.error('Sync Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
