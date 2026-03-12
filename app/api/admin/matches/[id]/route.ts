import { NextRequest, NextResponse } from 'next/server';

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

// PATCH - Update match
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const matchId = params.id;
    const allowedFields = [
      'player_id',
      'tournament_id',
      'tournament_name',
      'round',
      'opponent_name',
      'match_result',
      'match_date',
      'aces',
      'double_faults',
      'first_serve_percentage',
      'break_points_won',
      'break_points_faced',
      'net_points_won',
      'breaks_conceded',
      'total_points_won',
      'winners',
      'unforced_errors',
    ];

    const updatePayload: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'match_date') {
          const normalizedMatchDate = normalizeMatchDate(body[field]);
          if (!normalizedMatchDate) {
            return NextResponse.json({ error: 'Invalid match_date' }, { status: 400 });
          }
          updatePayload[field] = normalizedMatchDate;
          continue;
        }

        if (field === 'round') {
          if (!allowedRounds.includes(body[field])) {
            return NextResponse.json({ error: 'Invalid round. Allowed values: R1, R2, R3, QF, SF, F' }, { status: 400 });
          }
        }

        updatePayload[field] = body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: match, error } = await (supabase as any)
      .from('player_matches')
      .update(updatePayload)
      .eq('id', matchId)
      .select()
      .single();

    if (error) {
      console.error('Error updating match:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ match });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete match
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const matchId = params.id;
    const supabase = createAdminClient();

    const { error } = await (supabase as any)
      .from('player_matches')
      .delete()
      .eq('id', matchId);

    if (error) {
      console.error('Error deleting match:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
