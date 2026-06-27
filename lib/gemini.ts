import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const flash     = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
export const flashJson = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 65536 },
});

export function parseJson(text: string) {
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

export async function ask(model: ReturnType<typeof genAI.getGenerativeModel>, prompt: string): Promise<string> {
  const result = await model.generateContent(prompt);
  return result.response.text();
}

function fixJson(raw: string): string {
  // Strip trailing commas before } or ] — Gemini occasionally outputs these
  return raw.replace(/,(\s*[}\]])/g, '$1');
}

export async function askJson<T = unknown>(prompt: string): Promise<T> {
  const result = await flashJson.generateContent(prompt);
  const raw = result.response.text();
  return JSON.parse(fixJson(raw)) as T;
}
