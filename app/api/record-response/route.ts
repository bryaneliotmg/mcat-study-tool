import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sm2, outcomeToQuality } from '@/lib/sm2';

export async function POST(request: Request) {
  try {
    const {
      concept_id,
      question_id,
      answer_given,
      reasoning_text,
      is_correct,
      failure_type,
      time_taken_seconds,
    } = await request.json();

    // 1. Record the response
    await supabase.from('responses').insert({
      concept_id,
      question_id,
      answer_given,
      reasoning_text,
      is_correct,
      failure_type: failure_type ?? null,
      time_taken_seconds,
    });

    // 2. Log failure to error_log if wrong
    if (!is_correct && failure_type) {
      await supabase.from('error_log').insert({
        concept_id,
        question_id,
        failure_type,
        is_resolved: false,
      });

      // Update failure_counts on concept
      const { data: concept } = await supabase
        .from('concepts')
        .select('failure_counts, review_needed')
        .eq('id', concept_id)
        .maybeSingle();

      if (concept) {
        const counts: Record<string, number> = concept.failure_counts ?? {};
        counts[failure_type] = (counts[failure_type] ?? 0) + 1;

        // Dominant failure type = the one with most occurrences
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        await supabase.from('concepts').update({
          failure_counts: counts,
          dominant_failure_type: dominant,
          // Gate practice if knowledge gap
          review_needed: failure_type === 'KNOWLEDGE_GAP' ? true : concept.review_needed,
        }).eq('id', concept_id);
      }
    } else if (is_correct) {
      // Clear review gate on correct answer
      await supabase.from('concepts')
        .update({ review_needed: false, review_unlocked_at: new Date().toISOString() })
        .eq('id', concept_id);
    }

    // 3. Update SM-2 queue
    const { data: existing } = await supabase
      .from('spaced_repetition_queue')
      .select('*')
      .eq('concept_id', concept_id)
      .maybeSingle();

    const quality = outcomeToQuality(is_correct, failure_type, time_taken_seconds);
    const currentState = existing ?? { interval_days: 1, easiness_factor: 2.5, correct_streak: 0 };
    const next = sm2(quality, currentState);

    if (existing) {
      await supabase.from('spaced_repetition_queue').update({
        next_review_date: next.next_review_date,
        interval_days: next.interval_days,
        easiness_factor: next.easiness_factor,
        correct_streak: next.correct_streak,
        last_quality: quality,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('spaced_repetition_queue').insert({
        concept_id,
        next_review_date: next.next_review_date,
        interval_days: next.interval_days,
        easiness_factor: next.easiness_factor,
        correct_streak: next.correct_streak,
        last_quality: quality,
      });
    }

    return NextResponse.json({ ok: true, next_review: next.next_review_date, quality });
  } catch (err) {
    console.error('record-response error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
