import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const client = new Anthropic();

function parseJson(text: string) {
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

export async function POST(request: Request) {
  try {
    const { raw_text, subject, notes } = await request.json();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: 'You are an MCAT content expert with deep knowledge of the AAMC content outline.',
      messages: [
        {
          role: 'user',
          content: `A student missed this MCAT question:

QUESTION TEXT: ${raw_text}
SECTION: ${subject}
STUDENT NOTES: ${notes || 'none'}

Analyze this question and output ONLY this JSON:
{
  "concept_name": "The specific concept being tested (concise, 2-6 words)",
  "aamc_category": "The AAMC category code (e.g. '1A', '3B', '5D')",
  "aamc_category_name": "Full category name",
  "kaplan_chapter": "Estimated Kaplan chapter (e.g. 'Ch. 4')",
  "kaplan_section": "Estimated section (e.g. '§2')",
  "gap_analysis": "2-3 sentences explaining exactly what knowledge or reasoning gap this question exposes and what she needs to strengthen",
  "priority": "critical|high|medium|low",
  "difficulty": 3
}`,
        },
      ],
    });

    const analysis = parseJson(response.content[0].type === 'text' ? response.content[0].text : '');

    // Check for existing concept (case-insensitive)
    const { data: existing } = await supabase
      .from('concepts')
      .select('*')
      .ilike('name', analysis.concept_name)
      .eq('subject', subject)
      .maybeSingle();

    let concept;
    if (existing) {
      const newCount = existing.seen_count + 1;
      const priority =
        newCount >= 4 ? 'critical' : newCount === 3 ? 'high' : newCount === 2 ? 'medium' : 'low';

      const { data: updated } = await supabase
        .from('concepts')
        .update({
          seen_count: newCount,
          priority,
          gap_analysis: analysis.gap_analysis,
          kaplan_chapter: analysis.kaplan_chapter,
          kaplan_section: analysis.kaplan_section,
        })
        .eq('id', existing.id)
        .select()
        .single();
      concept = updated;
    } else {
      const { data: created } = await supabase
        .from('concepts')
        .insert({
          name: analysis.concept_name,
          subject,
          seen_count: 1,
          priority: analysis.priority,
          kaplan_chapter: analysis.kaplan_chapter,
          kaplan_section: analysis.kaplan_section,
          gap_analysis: analysis.gap_analysis,
          is_mastered: false,
        })
        .select()
        .single();
      concept = created;
    }

    // Insert question
    const { data: question } = await supabase
      .from('questions')
      .insert({
        raw_text,
        input_method: 'type',
        subject,
        notes: notes || null,
        concept_id: concept?.id ?? null,
        aamc_category: analysis.aamc_category,
      })
      .select()
      .single();

    return NextResponse.json({ concept, question, analysis });
  } catch (err) {
    console.error('analyze-question error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
