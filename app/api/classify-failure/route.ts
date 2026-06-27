import { NextResponse } from 'next/server';
import { flash, ask, askJson } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const { question_id, concept_name, correct_answer, student_answer, reasoning_text, question_type } = await request.json();

    const prompt = `You are an MCAT learning diagnostician. Classify student errors precisely.

A student answered an MCAT question incorrectly.

Concept being tested: ${concept_name}
Question type: ${question_type}
Correct answer: ${correct_answer}
Student chose: ${student_answer}
Student's reasoning: ${reasoning_text}

Classify this failure as EXACTLY ONE of:
- KNOWLEDGE_GAP: Student lacks the foundational information needed
- REASONING_GAP: Student has the knowledge but applied it incorrectly under pressure
- PASSAGE_MISREAD: Student's reasoning was sound but they misread or misinterpreted the passage
- TIME_PRESSURE: Reasoning is incomplete, likely because student rushed
- CARELESS: Student stated or implied the correct concept but chose the wrong answer

Output ONLY this JSON:
{
  "failure_type": "KNOWLEDGE_GAP",
  "explanation": "One sentence explaining why this classification fits",
  "recommended_action": "One sentence on what she should do next"
}`;

    const result = await askJson<any>(prompt);
    return NextResponse.json({ question_id, ...result });
  } catch (err) {
    console.error('classify-failure error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
