import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { flash, parseJson, ask } from '@/lib/gemini';

async function generateSet(params: {
  concept_name: string;
  aamc_category: string;
  aamc_category_name: string;
  section: string;
  failure_type: string | null;
  difficulty: number;
}) {
  const failureHint = params.failure_type === 'KNOWLEDGE_GAP'
    ? 'This student has a knowledge gap — at least 2 questions should test direct recall of key facts.'
    : params.failure_type === 'REASONING_GAP'
    ? 'This student struggles to apply knowledge under pressure — all questions must require multi-step reasoning from the passage, not recall.'
    : params.failure_type === 'PASSAGE_MISREAD'
    ? 'This student misreads passages — include one question that requires very careful reading of a specific passage detail.'
    : '';

  const prompt = `You are an expert MCAT question writer. Write passage-based question sets exactly like those on the real MCAT.

Rules:
- One passage (150-200 words) with a scenario, experiment, or data table
- 4 questions on that single passage, each testing a different reasoning skill
- Questions must require the passage — they cannot be answered from memory alone
- Wrong answers are crafted traps: common misconceptions, partial truths, passage misreadings
- Output ONLY valid JSON

Write an MCAT ${params.section} passage + 4-question set targeting:
AAMC Category ${params.aamc_category}: ${params.aamc_category_name}
Concept: ${params.concept_name}
Difficulty: ${params.difficulty}/5
${failureHint}

Output this exact JSON:
{
  "passage": "150-200 word passage with scenario/experiment/data",
  "questions": [
    {
      "stem": "Question stem",
      "type": "recall|application|reasoning|data_interpretation",
      "correct": "Correct answer text",
      "wrong_b": "Common misconception answer",
      "wrong_c": "Partially correct / missing reasoning step",
      "wrong_d": "Passage misreading trap",
      "why_correct": "Why correct is right",
      "why_b_wrong": "Why B is wrong",
      "why_c_wrong": "Why C is wrong",
      "why_d_wrong": "Why D is wrong"
    }
  ]
}
Write exactly 4 questions. Vary question types across: recall, application, reasoning, data_interpretation.`;

  return parseJson(await ask(flash, prompt));
}

async function qualityCheck(passage: string, questions: Array<{ stem: string; correct: string; wrong_b: string }>) {
  const prompt = `You are an MCAT quality auditor. Evaluate question sets strictly.

PASSAGE: ${passage}

${questions.map((q, i) => `Q${i + 1}: ${q.stem}\nCorrect: ${q.correct}\nB: ${q.wrong_b}`).join('\n\n')}

Rate each:
1. Can any question be answered without reading the passage? (yes/no)
2. Are wrong answers genuinely tricky MCAT-level distractors? (1-5)
3. Do questions span different reasoning skills? (yes/no)

Output ONLY this JSON:
{"memory_only": false, "distractor_quality": 4, "skill_variety": true, "approved": true}`;

  const result = parseJson(await ask(flash, prompt));
  result.approved = !result.memory_only && result.distractor_quality >= 3 && result.skill_variety;
  return result;
}

function shuffleAnswers(q: { correct: string; wrong_b: string; wrong_c: string; wrong_d: string }) {
  const pool = [
    { text: q.correct, is_correct: true },
    { text: q.wrong_b, is_correct: false },
    { text: q.wrong_c, is_correct: false },
    { text: q.wrong_d, is_correct: false },
  ];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const labels = ['A', 'B', 'C', 'D'];
  const answers = pool.map((a, i) => ({ ...a, label: labels[i] }));
  const correct_label = answers.find(a => a.is_correct)!.label;
  return { answers, correct_label };
}

export async function POST(request: Request) {
  try {
    const { concept_id, concept_name, aamc_category, aamc_category_name, section, failure_type, difficulty } = await request.json();

    let generated = await generateSet({ concept_name, aamc_category, aamc_category_name, section, failure_type, difficulty });
    let quality = await qualityCheck(generated.passage, generated.questions);

    if (!quality.approved) {
      generated = await generateSet({ concept_name, aamc_category, aamc_category_name, section, failure_type, difficulty });
      quality = await qualityCheck(generated.passage, generated.questions);
    }

    const { data: passageRow } = await supabase
      .from('passages')
      .insert({ passage_text: generated.passage, subject: section, concept_id: concept_id ?? null, aamc_category, difficulty })
      .select().single();

    const passageId = passageRow?.id ?? null;

    const savedQuestions = [];
    for (const q of generated.questions) {
      const { answers, correct_label } = shuffleAnswers(q);
      const { data: saved } = await supabase.from('questions').insert({
        concept_id: concept_id ?? null,
        raw_text: q.stem,
        input_method: 'generated',
        subject: section,
        passage: generated.passage,
        passage_group_id: passageId,
        answer_a: answers[0].text,
        answer_b: answers[1].text,
        answer_c: answers[2].text,
        answer_d: answers[3].text,
        correct_answer: correct_label,
        explanations: {
          why_correct: q.why_correct,
          why_b_wrong: q.why_b_wrong,
          why_c_wrong: q.why_c_wrong,
          why_d_wrong: q.why_d_wrong,
        },
        question_type: q.type,
        quality_approved: quality.approved,
        quality_score: quality.distractor_quality,
        difficulty,
        aamc_category,
      }).select().single();

      if (saved) {
        savedQuestions.push({ question: saved, answers, correct_label, explanations: { why_correct: q.why_correct, why_b_wrong: q.why_b_wrong, why_c_wrong: q.why_c_wrong, why_d_wrong: q.why_d_wrong } });
      }
    }

    return NextResponse.json({ passage: generated.passage, passage_id: passageId, questions: savedQuestions, quality });
  } catch (err) {
    console.error('generate-question error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
