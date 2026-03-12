import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const allowedRounds = ['R1', 'R2', 'R3', 'QF', 'SF', 'F'] as const;

function normalizeMatchDate(matchDate: unknown) {
  if (typeof matchDate !== 'string' || !matchDate.trim()) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) {
    return `${matchDate}T12:00:00.000Z`;
  }

  const parsed = new Date(matchDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET - Fetch all matches
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    
    const { data: matches, error } = await (supabase as any)
      .from('player_matches')
      .select(`
        *,
        player:players(id, first_name, last_name, ranking, image_url)
      `)
      .order('match_date', { ascending: false });

    if (error) {
      console.error('Error fetching matches:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new match
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      player_id,
      tournament_id,
      tournament_name,
      round,
      opponent_name,
      match_result,
      match_date,
      aces = 0,
      double_faults = 0,
      first_serve_percentage = 0,
      break_points_won = 0,
      break_points_faced = 0,
      net_points_won = 0,
      breaks_conceded = 0,
      total_points_won = 0,
      winners = 0,
      unforced_errors = 0,
    } = body;

    if (!player_id || !tournament_name || !opponent_name || !match_result || !match_date) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (round !== undefined && !allowedRounds.includes(round)) {
      return NextResponse.json(
        { error: 'Invalid round. Allowed values: R1, R2, R3, QF, SF, F' },
        { status: 400 }
      );
    }

    const normalizedRound = round ?? 'R1';

    const normalizedMatchDate = normalizeMatchDate(match_date);
    if (!normalizedMatchDate) {
      return NextResponse.json(
        { error: 'Invalid match_date' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: match, error } = await (supabase as any)
      .from('player_matches')
      .insert({
        player_id,
        tournament_id: tournament_id || null,
        tournament_name,
        round: normalizedRound,
        opponent_name,
        match_result,
        match_date: normalizedMatchDate,
        aces,
        double_faults,
        first_serve_percentage,
        break_points_won,
        break_points_faced,
        net_points_won,
        breaks_conceded,
        total_points_won,
        winners,
        unforced_errors,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating match:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ match }, { status: 201 });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
