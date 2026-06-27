import { NextResponse } from 'next/server';
import { flash, ask } from '@/lib/gemini';

export async function POST(req: Request) {
  const { message, context, history } = await req.json();

  if (!message?.trim()) return NextResponse.json({ error: 'No message' }, { status: 400 });

  const systemPrompt = `You are an expert MCAT tutor helping a student understand difficult material. You give clear, concise, accurate answers. You connect concepts to the MCAT when relevant (AAMC categories, test strategies, common traps).

${context ? `The student is asking about this specific content:\n\n"""${context}"""\n\nFocus your answers on this content unless they ask something broader.` : 'Answer general MCAT questions.'}

Keep answers focused and scannable — use bullet points or short paragraphs. If the student asks about a vocabulary word, define it clearly then explain its MCAT relevance.`;

  const historyText = (history ?? [])
    .map((m: { role: string; text: string }) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`)
    .join('\n');

  const fullPrompt = `${systemPrompt}

${historyText ? `Prior conversation:\n${historyText}\n` : ''}Student: ${message}
Tutor:`;

  try {
    const result = await ask(flash, fullPrompt);
    return NextResponse.json({ reply: result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
