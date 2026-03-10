import { NextRequest, NextResponse } from 'next/server';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET - Fetch all scoring rules
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    
    const { data: rules, error } = await (supabase as any)
      .from('scoring_rules')
      .select('*')
      .order('stat_name', { ascending: true });

    if (error) {
      console.error('Error fetching scoring rules:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new scoring rule
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stat_name, points_per_unit, description } = body;

    if (!stat_name || points_per_unit === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: rule, error } = await (supabase as any)
      .from('scoring_rules')
      .insert({ stat_name, points_per_unit, description })
      .select()
      .single();

    if (error) {
      console.error('Error creating scoring rule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
