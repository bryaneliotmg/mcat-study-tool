import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const TYPE_LABELS: Record<string, string> = {
  main_idea: 'Main Idea',
  author_attitude: 'Author Attitude',
  inference: 'Inference',
  strengthen_weaken: 'Strengthen / Weaken',
  detail: 'Detail',
  function: 'Function',
};

const TYPE_TIPS: Record<string, string> = {
  main_idea: 'Identify the author\'s central claim before reading questions. Wrong answers are usually too narrow (one example) or too broad (beyond the passage scope).',
  author_attitude: 'Watch for tone words throughout. Authors rarely take extreme positions — if an answer says "strongly opposes" or "enthusiastically endorses," look twice.',
  inference: 'The correct inference must follow necessarily from the passage, not just be consistent with it. Ask: "Does the passage prove this, or merely allow it?"',
  strengthen_weaken: 'Identify exactly what claim is being strengthened or weakened before looking at choices. Wrong answers often address a related but different claim.',
  detail: 'Go back to the passage — detail questions reward the student who reads carefully the first time. Paraphrase the detail in your own words before selecting.',
  function: 'Ask why the author included this paragraph or example, not just what it says. Function answers explain purpose, not content.',
};

export async function POST(request: Request) {
  try {
    const { passage_id, question_type, is_correct, time_taken_seconds, difficulty_level, topic_domain } = await request.json();

    // Record the response
    await supabase.from('cars_responses').insert({
      passage_id: passage_id ?? null,
      question_type,
      is_correct,
      time_taken_seconds: time_taken_seconds ?? null,
      difficulty_level: difficulty_level ?? null,
      topic_domain: topic_domain ?? null,
    });

    // Pull last 40 responses for pattern analysis
    const { data: recent } = await supabase
      .from('cars_responses')
      .select('question_type, is_correct, time_taken_seconds')
      .order('created_at', { ascending: false })
      .limit(40);

    if (!recent || recent.length < 4) {
      return NextResponse.json({ ok: true, patterns: null });
    }

    // Aggregate by question type
    const byType: Record<string, { correct: number; total: number; totalTime: number }> = {};
    for (const r of recent) {
      if (!byType[r.question_type]) byType[r.question_type] = { correct: 0, total: 0, totalTime: 0 };
      byType[r.question_type].total++;
      if (r.is_correct) byType[r.question_type].correct++;
      byType[r.question_type].totalTime += r.time_taken_seconds ?? 0;
    }

    const patterns = Object.entries(byType)
      .filter(([, v]) => v.total >= 2)
      .map(([type, v]) => ({
        type,
        label: TYPE_LABELS[type] ?? type,
        accuracy: Math.round((v.correct / v.total) * 100),
        total: v.total,
        avg_seconds: Math.round(v.totalTime / v.total),
        tip: TYPE_TIPS[type] ?? null,
        weak: v.correct / v.total < 0.6,
        strong: v.correct / v.total >= 0.85 && v.total >= 3,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const weakTypes = patterns.filter(p => p.weak);
    const dominantWeakness = weakTypes[0] ?? null;

    return NextResponse.json({ ok: true, patterns, dominantWeakness, totalSessions: recent.length });
  } catch (err) {
    console.error('record-cars-response error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
