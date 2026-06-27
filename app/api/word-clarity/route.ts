import { NextResponse } from 'next/server';
import { flash, ask, askJson } from '@/lib/gemini';

export async function POST(request: Request) {
  try {
    const { word, context } = await request.json();

    const prompt = `You are an expert MCAT tutor. You give precise, MCAT-relevant definitions and simple explanations. Output only valid JSON.

Define the word or term: "${word}"${context ? ` (encountered in: ${context})` : ''}

Output ONLY this JSON:
{
  "definitions": [
    { "sense": "Biology / Physiology (or the relevant field)", "text": "Precise, MCAT-level definition" }
  ],
  "eli5": "Explain this concept as if talking to a curious 5-year-old. Use a simple analogy, everyday objects, and zero jargon. 2-3 sentences max.",
  "mcat_tip": "One sentence on how this concept most commonly appears on the MCAT or what students confuse about it."
}

Include 1-3 definitions covering the most MCAT-relevant senses. The eli5 must be genuinely simple — a child should understand it.`;

    const result = await askJson<any>(prompt);
    return NextResponse.json(result);
  } catch (err) {
    console.error('word-clarity error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
