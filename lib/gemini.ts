import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const flash = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export function parseJson(text: string) {
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

export async function ask(model: ReturnType<typeof genAI.getGenerativeModel>, prompt: string): Promise<string> {
  const result = await model.generateContent(prompt);
  return result.response.text();
}
