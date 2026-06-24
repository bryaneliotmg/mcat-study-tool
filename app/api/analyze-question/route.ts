import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { flash, parseJson, ask } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const { raw_text, subject, notes } = await request.json();

    const sectionToBooks: Record<string, string[]> = {
      'B/B': ['biology', 'biochemistry'],
      'C/P': ['gen_chem', 'org_chem', 'physics', 'biochemistry'],
      'P/S': ['behavioral'],
      'C/B': ['biology', 'biochemistry'],
    };
    const relevantBooks = sectionToBooks[subject] ?? [];

    let kaplanRef = '';
    if (relevantBooks.length > 0) {
      const { data: chapters } = await supabase
        .from('kaplan_chapters')
        .select('book_title, chapter_number, chapter_title, sections')
        .in('book', relevantBooks)
        .order('book')
        .order('chapter_number');

      if (chapters && chapters.length > 0) {
        kaplanRef = '\n\nKAPLAN REFERENCE BOOKS FOR THIS SECTION:\n';
        let currentBook = '';
        for (const ch of chapters) {
          if (ch.book_title !== currentBook) {
            currentBook = ch.book_title;
            kaplanRef += `\n${currentBook}:\n`;
          }
          const secs = Array.isArray(ch.sections)
            ? ch.sections.map((s: [string, string]) => `${s[0]} ${s[1]}`).join(', ')
            : '';
          kaplanRef += `  Ch.${ch.chapter_number}: ${ch.chapter_title}${secs ? ` (${secs.slice(0, 80)})` : ''}\n`;
        }
      }
    }

    const prompt = `You are an MCAT content expert with deep knowledge of both the AAMC content outline and the Kaplan MCAT review book series.

A student missed this MCAT question:

QUESTION TEXT: ${raw_text}
SECTION: ${subject}
STUDENT NOTES: ${notes || 'none'}
${kaplanRef}

Analyze this question and output ONLY this JSON. For kaplan_book and kaplan_chapter, use EXACTLY the book title and chapter number from the reference list above that best matches the concept tested:
{
  "concept_name": "The specific concept being tested (concise, 2-6 words)",
  "aamc_category": "The AAMC category code (e.g. '1A', '3B', '5D')",
  "aamc_category_name": "Full category name",
  "kaplan_book": "Exact book title from the reference list",
  "kaplan_chapter": "Ch.N: Chapter Title",
  "kaplan_section": "N.N Section title (most relevant subsection)",
  "gap_analysis": "2-3 sentences explaining exactly what knowledge or reasoning gap this question exposes and what she needs to strengthen",
  "priority": "critical|high|medium|low",
  "difficulty": 3
}`;

    const analysis = parseJson(await ask(flash, prompt));

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
          kaplan_chapter: `${analysis.kaplan_book ? analysis.kaplan_book + ' · ' : ''}${analysis.kaplan_chapter ?? ''}`,
          kaplan_section: analysis.kaplan_section,
          gap_analysis: analysis.gap_analysis,
          is_mastered: false,
        })
        .select()
        .single();
      concept = created;
    }

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
