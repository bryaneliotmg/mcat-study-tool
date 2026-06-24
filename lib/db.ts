import { supabase } from './supabase';

export type Subject = 'B/B' | 'C/B' | 'P/S' | 'C/P';
export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface Concept {
  id: string;
  name: string;
  subject: Subject;
  seen_count: number;
  priority: Priority;
  kaplan_chapter: string | null;
  kaplan_section: string | null;
  gap_analysis: string | null;
  is_mastered: boolean;
  aamc_category: string | null;
  dominant_failure_type: string | null;
  failure_counts: Record<string, number> | null;
  review_needed: boolean | null;
  review_unlocked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  raw_text: string;
  input_method: 'type' | 'paste' | 'photo';
  subject: Subject | null;
  notes: string | null;
  concept_id: string | null;
  created_at: string;
}

export interface WordClaritySession {
  id: string;
  word: string;
  context: string | null;
  definitions: { meaning: string; partOfSpeech: string }[] | null;
  sentences: string[] | null;
  is_cleared: boolean;
  cleared_at: string | null;
  created_at: string;
}

export interface ConceptRelationship {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  relationship_label: string | null;
}

// Concepts
export async function getConcepts() {
  const { data, error } = await supabase
    .from('concepts')
    .select('*')
    .order('seen_count', { ascending: false });
  if (error) throw error;
  return data as Concept[];
}

export async function createConcept(concept: Omit<Concept, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('concepts')
    .insert(concept)
    .select()
    .single();
  if (error) throw error;
  return data as Concept;
}

export async function incrementConceptSeen(id: string) {
  const { data, error } = await supabase.rpc('increment_concept_seen', { concept_id: id });
  if (error) {
    // Fallback: manual increment
    const { data: concept } = await supabase.from('concepts').select('seen_count, priority').eq('id', id).single();
    if (concept) {
      const newCount = concept.seen_count + 1;
      const priority: Priority = newCount >= 4 ? 'critical' : newCount >= 2 ? 'high' : newCount === 2 ? 'medium' : 'low';
      await supabase.from('concepts').update({ seen_count: newCount, priority }).eq('id', id);
    }
  }
  return data;
}

export async function markConceptMastered(id: string) {
  const { error } = await supabase
    .from('concepts')
    .update({ is_mastered: true, priority: 'low' })
    .eq('id', id);
  if (error) throw error;
}

// Questions
export async function createQuestion(question: Omit<Question, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('questions')
    .insert(question)
    .select()
    .single();
  if (error) throw error;
  return data as Question;
}

// Word clarity
export async function getWordClaritySessions() {
  const { data, error } = await supabase
    .from('word_clarity_sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as WordClaritySession[];
}

export async function createWordClaritySession(session: Omit<WordClaritySession, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('word_clarity_sessions')
    .insert(session)
    .select()
    .single();
  if (error) throw error;
  return data as WordClaritySession;
}

export async function markWordCleared(id: string, sentences: string[]) {
  const { error } = await supabase
    .from('word_clarity_sessions')
    .update({ is_cleared: true, cleared_at: new Date().toISOString(), sentences })
    .eq('id', id);
  if (error) throw error;
}

// Knowledge graph
export async function getConceptRelationships() {
  const { data, error } = await supabase
    .from('concept_relationships')
    .select('*');
  if (error) throw error;
  return data as ConceptRelationship[];
}
