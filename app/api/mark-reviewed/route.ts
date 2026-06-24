import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { concept_id } = await request.json();

    await supabase.from('concepts').update({
      review_needed: false,
      review_unlocked_at: new Date().toISOString(),
    }).eq('id', concept_id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
