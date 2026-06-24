import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const client = new Anthropic();

function parseJson(text: string) {
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

async function generateQuestion(params: {
  concept_name: string;
  aamc_category: string;
  aamc_category_name: string;
  section: string;
  failure_type: string | null;
  difficulty: number;
}) {
  const generatorSystem = `You are an expert MCAT question writer working for a medical education company. You must follow these rules without exception:
- Write a 150-200 word passage containing a scenario, experiment, or data relevant to the concept
- The question MUST be unsolvable from memory alone — it must require reasoning from the passage
- Wrong answer B represents the most common misconception about this concept
- Wrong answer C is partially correct but missing a key reasoning step
- Wrong answer D is plausible only if the student misread or misinterpreted the passage
- Tag the question type as exactly one of: recall, application, or reasoning
- Output ONLY valid JSON, no other text`;

  const generatorUser = `Generate an MCAT ${params.section} question targeting this AAMC concept:
Category ${params.aamc_category}: ${params.aamc_category_name}
Specific topic: ${params.concept_name}
Student failure type: ${params.failure_type ?? 'unknown'}
Difficulty level: ${params.difficulty}/5

Output this exact JSON structure:
{
  "passage": "150-200 word passage with scenario/experiment/data",
  "question": "The question stem",
  "correct_answer": "The correct answer text",
  "wrong_answer_b": "Common misconception answer",
  "wrong_answer_c": "Partially correct answer",
  "wrong_answer_d": "Passage misreading trap answer",
  "explanations": {
    "why_correct": "Why the correct answer is right",
    "why_b_wrong": "Why B is wrong specifically",
    "why_c_wrong": "Why C is wrong specifically",
    "why_d_wrong": "Why D is wrong specifically"
  },
  "question_type": "recall|application|reasoning"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: generatorSystem,
    messages: [{ role: 'user', content: generatorUser }],
  });

  return parseJson(response.content[0].type === 'text' ? response.content[0].text : '');
}

async function checkQuality(generated: {
  passage: string;
  question: string;
  correct_answer: string;
  wrong_answer_b: string;
  wrong_answer_c: string;
  wrong_answer_d: string;
}) {
  const checkerSystem = `You are an MCAT quality auditor. You have no knowledge of how this question was generated. Your job is to ensure questions meet rigorous MCAT standards.`;

  const checkerUser = `Evaluate this MCAT question:

PASSAGE: ${generated.passage}
QUESTION: ${generated.question}
CORRECT ANSWER: ${generated.correct_answer}
WRONG ANSWER B: ${generated.wrong_answer_b}
WRONG ANSWER C: ${generated.wrong_answer_c}
WRONG ANSWER D: ${generated.wrong_answer_d}

Answer these specifically:
1. Can this question be answered correctly from memory alone without reading the passage? (yes/no)
2. Do the wrong answers represent real MCAT-level misconceptions, or are they obviously wrong? (rate 1-5)
3. Does this question test reasoning or just trivia recall? (rate 1-5, where 5=pure reasoning)
4. Is the passage 150-200 words and does it contain actual data, scenario, or experimental context? (yes/no)

Output ONLY this JSON:
{
  "memory_only": false,
  "wrong_answer_quality": 4,
  "reasoning_level": 4,
  "passage_quality": true,
  "approved": true,
  "rejection_reason": null
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: checkerSystem,
    messages: [{ role: 'user', content: checkerUser }],
  });

  const result = parseJson(response.content[0].type === 'text' ? response.content[0].text : '');

  result.approved =
    result.memory_only === false &&
    result.wrong_answer_quality >= 3 &&
    result.reasoning_level >= 3 &&
    result.passage_quality === true;

  return result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { concept_id, concept_name, aamc_category, aamc_category_name, section, failure_type, difficulty } = body;

    // Call 1: Generate
    let generated = await generateQuestion({ concept_name, aamc_category, aamc_category_name, section, failure_type, difficulty });

    // Call 2: Quality check
    let quality = await checkQuality(generated);

    // Retry once if rejected
    if (!quality.approved) {
      generated = await generateQuestion({ concept_name, aamc_category, aamc_category_name, section, failure_type, difficulty });
      quality = await checkQuality(generated);
    }

    const qualityScore = Math.round((quality.wrong_answer_quality + quality.reasoning_level) / 2);

    // Shuffle answers (A=correct, B/C/D=wrong — randomize positions)
    const answers = [
      { text: generated.correct_answer, label: 'A', is_correct: true },
      { text: generated.wrong_answer_b, label: 'B', is_correct: false },
      { text: generated.wrong_answer_c, label: 'C', is_correct: false },
      { text: generated.wrong_answer_d, label: 'D', is_correct: false },
    ];
    // Shuffle
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }
    answers.forEach((a, i) => { a.label = ['A', 'B', 'C', 'D'][i]; });

    const correctLabel = answers.find(a => a.is_correct)!.label;

    // Store in DB
    const { data: question, error } = await supabase
      .from('questions')
      .insert({
        concept_id: concept_id ?? null,
        raw_text: generated.question,
        input_method: 'generated',
        subject: section,
        passage: generated.passage,
        answer_a: answers[0].text,
        answer_b: answers[1].text,
        answer_c: answers[2].text,
        answer_d: answers[3].text,
        correct_answer: correctLabel,
        explanations: generated.explanations,
        question_type: generated.question_type,
        quality_approved: quality.approved,
        quality_score: qualityScore,
        difficulty,
        aamc_category,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      question,
      answers,
      correct_label: correctLabel,
      explanations: generated.explanations,
      quality,
    });
  } catch (err) {
    console.error('generate-question error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
