import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chapter = searchParams.get('chapter') ?? '';
  const section = searchParams.get('section') ?? '';

  if (!chapter) return NextResponse.json({ error: 'chapter required' }, { status: 400 });

  // Parse chapter number from strings like "Ch.2: ENZYMES" or "Biology Review · Ch.2: ENZYMES"
  const chNumMatch = chapter.match(/Ch\.?(\d+)/i);
  const chapterNumber = chNumMatch ? parseInt(chNumMatch[1]) : null;

  // Parse section number from strings like "2.1 Enzymes as Biological Catalysts"
  const secNumMatch = section.match(/^(\d+\.\d+)/);
  const sectionNumber = secNumMatch ? secNumMatch[1] : null;

  if (!chapterNumber) {
    return NextResponse.json({ error: 'Could not parse chapter number' }, { status: 400 });
  }

  let query = supabase
    .from('kaplan_sections')
    .select('section_number, section_title, content')
    .eq('chapter_number', chapterNumber);

  if (sectionNumber) {
    query = query.eq('section_number', sectionNumber);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    // Fallback: return null so UI shows "not loaded yet" message
    return NextResponse.json({ content: null, message: 'Section not yet loaded. Run the PDF seeder for this book.' });
  }

  return NextResponse.json({
    section_title: `${data.section_number} ${data.section_title}`,
    content: data.content,
  });
}
