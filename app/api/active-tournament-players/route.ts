import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get all active tournaments
    const { data: activeTournaments, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('id')
      .eq('is_active', true)

    if (tournamentsError) {
      console.error('Error fetching active tournaments:', tournamentsError)
      return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 })
    }

    if (!activeTournaments || activeTournaments.length === 0) {
      return NextResponse.json({ players: [] })
    }

    const tournamentIds = activeTournaments.map(t => t.id)

    // Get all players assigned to active tournaments
    const { data: tournamentPlayers, error: playersError } = await supabase
      .from('tournament_players')
      .select('player_id, player:players(id, first_name, last_name, ranking, country, points, image_url)')
      .in('tournament_id', tournamentIds)

    if (playersError) {
      console.error('Error fetching tournament players:', playersError)
      return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })
    }

    const uniquePlayers = Array.from(
  new Map(
    tournamentPlayers
      .map(tp => tp.player)
      .filter((p): p is any => p !== null) // Type Guard hinzugefügt
      .map(p => [p.id, p])
  ).values()
);

    return NextResponse.json({ players: uniquePlayers })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
