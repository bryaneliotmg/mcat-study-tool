#!/usr/bin/env node
/**
 * Kaplan PDF Seeder
 * Usage: node scripts/seed-kaplan.mjs <path-to-pdf>
 *
 * Strategy: AI identifies section headings only (tiny output, no truncation).
 * Raw text is split by those headings directly — no AI needed for content.
 *
 * Requirements (already installed):
 *   pdfjs-dist @google/generative-ai @supabase/supabase-js dotenv
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
GlobalWorkerOptions.workerSrc = join(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error('Missing env vars. Check .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'mcat' } });
const genAI    = new GoogleGenerativeAI(GEMINI_KEY);
const jsonModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
});

const pdfPath = process.argv[2];
if (!pdfPath) { console.error('Usage: node scripts/seed-kaplan.mjs <path-to-pdf>'); process.exit(1); }

// ── 1. Extract raw text from PDF ──────────────────────────────────────────────
console.log(`Reading PDF: ${pdfPath}`);
const pdfBuffer = readFileSync(pdfPath);
const pdfDoc    = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
let rawText = '';
for (let p = 1; p <= pdfDoc.numPages; p++) {
  const page    = await pdfDoc.getPage(p);
  const content = await page.getTextContent();
  rawText += content.items.map(i => ('str' in i ? i.str : '')).join(' ') + '\n';
}
console.log(`Extracted ${rawText.length.toLocaleString()} chars from ${pdfDoc.numPages} pages`);

// ── 2. Ask Gemini for book title + ALL section headings only (small output) ───
console.log('Identifying book structure from table of contents...');

// Use first 25k chars — enough to cover TOC and book title
const tocText = rawText.slice(0, 25000);

const structurePrompt = `You are parsing a Kaplan MCAT review book PDF. The text below is from the beginning of the book including the table of contents.

Return JSON with the book title and every chapter and section listed in the table of contents.
Section numbers follow the pattern "1.1", "2.3", etc. Include ALL sections from ALL chapters.

JSON shape (no markdown, no explanation):
{
  "book_title": "Kaplan MCAT Biology Review",
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_title": "THE CELL",
      "sections": [
        { "section_number": "1.1", "section_title": "Cell Theory" },
        { "section_number": "1.2", "section_title": "Eukaryotic Cells" }
      ]
    }
  ]
}

PDF TEXT:
${tocText}`;

const structureResp = await jsonModel.generateContent(structurePrompt);
let structure;
try {
  structure = JSON.parse(structureResp.response.text());
} catch (e) {
  console.error('Failed to parse structure:', e.message);
  console.error(structureResp.response.text().slice(0, 300));
  process.exit(1);
}

console.log(`Book: ${structure.book_title}`);
console.log(`Chapters: ${structure.chapters.length}, Sections: ${structure.chapters.reduce((n, c) => n + c.sections.length, 0)}`);

// ── 3. Split raw text by section headings (no AI, no truncation) ─────────────
// Build a flat list of all sections with their chapter info
const allSectionDefs = [];
for (const ch of structure.chapters) {
  for (const sec of ch.sections) {
    allSectionDefs.push({ ...sec, chapter_number: ch.chapter_number, chapter_title: ch.chapter_title });
  }
}

// For each section, find where it starts in rawText by searching for the section number + title
function findSectionStart(text, sectionNumber, sectionTitle) {
  // Try exact "N.N Title" pattern first
  const escapedNum = sectionNumber.replace('.', '\\.');
  // Match section number followed by title words (flexible whitespace from PDF extraction)
  const titleWords  = sectionTitle.split(/\s+/).slice(0, 3).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern     = new RegExp(escapedNum + '[\\s\\S]{0,30}' + titleWords.join('[\\s\\S]{0,20}'), 'i');
  const match       = text.search(pattern);
  return match;
}

console.log('\nSplitting text by section boundaries...');
const located = [];
for (const sec of allSectionDefs) {
  const pos = findSectionStart(rawText, sec.section_number, sec.section_title);
  if (pos >= 0) {
    located.push({ ...sec, start: pos });
  } else {
    console.log(`  Could not locate: ${sec.section_number} ${sec.section_title}`);
  }
}

// Sort by position in text
located.sort((a, b) => a.start - b.start);

// Extract content = text from this section's start to the next section's start
const sectionsWithContent = located.map((sec, i) => {
  const end     = i + 1 < located.length ? located[i + 1].start : rawText.length;
  const content = rawText.slice(sec.start, end).trim();
  return { ...sec, content };
});

console.log(`Located ${sectionsWithContent.length}/${allSectionDefs.length} sections`);

// ── 4. Upsert chapter rows ────────────────────────────────────────────────────
const { data: existingChapters } = await supabase
  .from('kaplan_chapters')
  .select('id, chapter_number')
  .eq('book_title', structure.book_title);

const chapterIdMap = {};
for (const ch of existingChapters ?? []) chapterIdMap[ch.chapter_number] = ch.id;

for (const ch of structure.chapters) {
  if (!chapterIdMap[ch.chapter_number]) {
    const { data, error } = await supabase
      .from('kaplan_chapters')
      .insert({
        book_title:     structure.book_title,
        book:           structure.book_title,
        chapter_number: ch.chapter_number,
        chapter_title:  ch.chapter_title,
        sections:       ch.sections.map(s => [s.section_number, s.section_title]),
        mcat_sections:  [],
      })
      .select('id')
      .single();
    if (error) { console.warn(`Chapter insert error ch${ch.chapter_number}:`, error.message); continue; }
    chapterIdMap[ch.chapter_number] = data.id;
  }
}

// ── 5. Insert sections ────────────────────────────────────────────────────────
console.log('\nInserting sections into database...');
let inserted = 0, skipped = 0;

for (const s of sectionsWithContent) {
  const chapterId = chapterIdMap[s.chapter_number];
  if (!chapterId) { skipped++; continue; }

  const { error } = await supabase
    .from('kaplan_sections')
    .upsert({
      chapter_id:     chapterId,
      book_title:     structure.book_title,
      chapter_number: s.chapter_number,
      chapter_title:  s.chapter_title,
      section_number: s.section_number,
      section_title:  s.section_title,
      content:        s.content,
    }, { onConflict: 'book_title,chapter_number,section_number' });

  if (error) {
    console.warn(`  Insert error ${s.section_number}:`, error.message);
    skipped++;
  } else {
    inserted++;
    process.stdout.write(`\r  Inserted ${inserted}/${sectionsWithContent.length}...`);
  }
}

console.log(`\n\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
console.log(`"${structure.book_title}" is now fully loaded in the app.`);
