import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { flash, ask, askJson } from '@/lib/gemini';

const DOMAINS = [
  'philosophy of mind',
  'ethics and moral philosophy',
  'art history and criticism',
  'social anthropology',
  'economics and public policy',
  'literary theory',
  'history of science',
  'political theory',
  'cultural sociology',
  'archaeology',
];

export async function POST(request: Request) {
  try {
    const { difficulty = 3 } = await request.json();
    const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];

    const prompt = `You are an expert MCAT CARS passage writer. Write dense, academically rigorous passages in the humanities and social sciences — the kind that appear on the real MCAT. Every question must be answerable from the passage alone — no outside knowledge required.

Write an MCAT CARS passage on the topic of ${domain} at difficulty level ${difficulty}/5.

Difficulty ${difficulty} means: ${
  difficulty <= 2 ? 'clear argument structure, explicit thesis, familiar vocabulary' :
  difficulty <= 3 ? 'moderately complex argument, some inference required, academic tone' :
  'dense academic prose, implicit thesis, multiple competing viewpoints, requires careful re-reading'
}.

Output ONLY this JSON:
{
  "passage": "500-600 word passage in dense academic prose, organized into 4-5 paragraphs separated by \\n\\n. Must contain: a central argument or thesis, supporting evidence or examples, at least one counterargument or qualification, and author's position. Each paragraph focuses on one idea.",
  "topic_domain": "${domain}",
  "questions": [
    {
      "stem": "Question stem",
      "type": "main_idea|author_attitude|inference|strengthen_weaken|detail|function",
      "correct": "The correct answer",
      "wrong_a": "Plausible distractor — too broad or misrepresents passage",
      "wrong_b": "Plausible distractor — contradicts passage or uses passage language misleadingly",
      "wrong_c": "Plausible distractor — outside the passage scope or extreme language",
      "explanation": "Why correct is right and why each wrong answer fails"
    }
  ]
}

Write exactly 4 questions covering these types in order:
1. Main idea or primary purpose
2. Author's attitude or tone
3. Inference (what can be concluded)
4. Strengthen/weaken or function of a specific paragraph`;

    const generated = await askJson<any>(prompt);

    const { data: saved } = await supabase
      .from('cars_passages')
      .insert({
        passage_text: generated.passage,
        topic_domain: generated.topic_domain,
        difficulty_level: difficulty,
        questions: generated.questions,
        quality_approved: true,
      })
      .select()
      .single();

    return NextResponse.json({ passage: saved, questions: generated.questions });
  } catch (err) {
    console.error('generate-cars error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
