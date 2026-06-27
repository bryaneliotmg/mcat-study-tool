'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, Clock, ChevronRight, RotateCcw, CheckCircle, XCircle, BookOpen, Zap, AlertTriangle, Eye, Timer, EyeOff, Lock, History } from 'lucide-react';
import { getConcepts } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Concept, Subject } from '@/lib/db';

type Phase = 'select' | 'generating' | 'answering' | 'classifying' | 'review' | 'history';

type QuestionSet = {
  passage: string;
  passage_id: string | null;
  questions: Array<{
    question: { id: string; raw_text: string; aamc_category: string };
    answers: { label: string; text: string; is_correct: boolean }[];
    correct_label: string;
    explanations: { why_correct: string; why_b_wrong: string; why_c_wrong: string; why_d_wrong: string };
  }>;
};

type Classification = {
  failure_type: string;
  explanation: string;
  recommended_action: string;
};

type HistorySession = {
  id: string;
  passage_text: string;
  subject: string;
  created_at: string;
  score?: number;
  questions: Array<{
    id: string;
    raw_text: string;
    answer_a: string;
    answer_b: string;
    answer_c: string;
    answer_d: string;
    correct_answer: string;
    explanations: { why_correct: string };
    answer_given?: string;
    is_correct?: boolean;
  }>;
};

const SUBJECT_META: Record<string, { color: string; bg: string }> = {
  'B/B': { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
  'C/B': { color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  'P/S': { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  'C/P': { color: '#14b8a6', bg: 'rgba(20,184,166,0.1)' },
};

const FAILURE_META: Record<string, { color: string; icon: React.ReactNode; label: string; tip: string }> = {
  KNOWLEDGE_GAP:    { color: '#ef4444', icon: <Brain size={15} />,         label: 'Knowledge Gap',   tip: 'Open the Kaplan chapter before doing more questions on this concept.' },
  REASONING_GAP:    { color: '#f97316', icon: <Zap size={15} />,           label: 'Reasoning Gap',   tip: 'You know the material — work more passage problems without re-reading your notes first.' },
  PASSAGE_MISREAD:  { color: '#eab308', icon: <Eye size={15} />,           label: 'Passage Misread', tip: 'Slow your reading. Underline the key claim in each paragraph before looking at the questions.' },
  TIME_PRESSURE:    { color: '#a78bfa', icon: <Timer size={15} />,         label: 'Time Pressure',   tip: 'Practice committing to an answer faster. MCAT average is ~1:45 per question.' },
  CARELESS:         { color: '#64748b', icon: <AlertTriangle size={15} />, label: 'Careless Error',  tip: 'You knew it. Re-read the question stem before submitting next time.' },
};

const SUBJECTS: Subject[] = ['B/B', 'C/B', 'P/S', 'C/P'];

const REVEAL_SECONDS = 90;

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function PracticePage() {
  const [phase, setPhase] = useState<Phase>('select');
  const [selectedSubject, setSelectedSubject] = useState<Subject>('B/B');
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);

  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [passageHidden, setPassageHidden] = useState(false);
  const [passageTimer, setPassageTimer] = useState(0);
  const [questionTimers, setQuestionTimers] = useState<number[]>([]);

  const [picks, setPicks] = useState<(string | null)[]>([null, null, null, null]);
  const [reasonings, setReasonings] = useState<string[]>(['', '', '', '']);
  const [classifications, setClassifications] = useState<(Classification | null)[]>([null, null, null, null]);
  const [submitted, setSubmitted] = useState<boolean[]>([false, false, false, false]);

  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [nextReview, setNextReview] = useState<string | null>(null);

  const [kaplanContent, setKaplanContent] = useState<{ section_title: string; content: string } | null>(null);
  const [kaplanLoading, setKaplanLoading] = useState(false);

  const [history, setHistory] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySession, setHistorySession] = useState<HistorySession | null>(null);

  useEffect(() => {
    getConcepts().then(c => setConcepts(c.filter(x => !x.is_mastered))).catch(() => {});
    fetchHistory();
  }, []);

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const { data: passages } = await supabase
        .from('passages')
        .select('id, passage_text, subject, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!passages || passages.length === 0) { setHistoryLoading(false); return; }

      const passageIds = passages.map(p => p.id);

      const { data: questions } = await supabase
        .from('questions')
        .select('id, passage_group_id, raw_text, answer_a, answer_b, answer_c, answer_d, correct_answer, explanations')
        .in('passage_group_id', passageIds)
        .eq('input_method', 'generated');

      const questionIds = (questions ?? []).map(q => q.id);
      const { data: responses } = questionIds.length > 0
        ? await supabase.from('responses').select('question_id, answer_given, is_correct').in('question_id', questionIds)
        : { data: [] };

      const responseMap: Record<string, { answer_given: string; is_correct: boolean }> = {};
      for (const r of responses ?? []) {
        if (r.question_id) responseMap[r.question_id] = { answer_given: r.answer_given, is_correct: r.is_correct };
      }

      const questionsByPassage: Record<string, HistorySession['questions']> = {};
      for (const q of questions ?? []) {
        if (!q.passage_group_id) continue;
        if (!questionsByPassage[q.passage_group_id]) questionsByPassage[q.passage_group_id] = [];
        const resp = responseMap[q.id];
        questionsByPassage[q.passage_group_id].push({
          id: q.id,
          raw_text: q.raw_text,
          answer_a: q.answer_a,
          answer_b: q.answer_b,
          answer_c: q.answer_c,
          answer_d: q.answer_d,
          correct_answer: q.correct_answer,
          explanations: q.explanations,
          answer_given: resp?.answer_given,
          is_correct: resp?.is_correct,
        });
      }

      const scoreMap: Record<string, number> = {};
      for (const [pid, qs] of Object.entries(questionsByPassage)) {
        scoreMap[pid] = qs.filter(q => q.is_correct).length;
      }

      setHistory(passages.map(p => ({
        ...p,
        score: scoreMap[p.id],
        questions: questionsByPassage[p.id] ?? [],
      })).filter(p => p.questions.length > 0));
    } catch { /* silent */ }
    setHistoryLoading(false);
  }

  function openHistorySession(s: HistorySession) {
    setHistorySession(s);
    setPhase('history');
  }

  async function fetchKaplanSection(chapter: string, section: string | null) {
    setKaplanLoading(true);
    setKaplanContent(null);
    try {
      const res = await fetch(`/api/kaplan-section?chapter=${encodeURIComponent(chapter)}&section=${encodeURIComponent(section ?? '')}`);
      const data = await res.json();
      if (data.content) setKaplanContent(data);
    } catch { /* silent */ } finally {
      setKaplanLoading(false);
    }
  }

  const stopAll = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (qTimerRef.current) { clearInterval(qTimerRef.current); qTimerRef.current = null; }
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const filteredConcepts = concepts.filter(c => c.subject === selectedSubject);
  const currentQ = questionSet?.questions[qIndex];
  const currentPick = picks[qIndex];
  const isCorrect = currentPick === currentQ?.correct_label;
  const allSubmitted = submitted.every(Boolean);

  async function handleGenerate() {
    setError('');
    setPhase('generating');
    setQuestionSet(null);
    setPicks([null, null, null, null]);
    setReasonings(['', '', '', '']);
    setClassifications([null, null, null, null]);
    setSubmitted([false, false, false, false]);
    setQIndex(0);
    setPassageHidden(false);
    setPassageTimer(0);
    setQuestionTimers([0, 0, 0, 0]);
    setNextReview(null);
    stopAll();

    const concept = selectedConcept ?? filteredConcepts[0] ?? null;
    try {
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: concept?.id ?? null,
          concept_name: concept?.name ?? 'general MCAT concept',
          aamc_category: concept?.aamc_category ?? '1A',
          aamc_category_name: 'MCAT concept',
          section: selectedSubject,
          failure_type: concept?.dominant_failure_type ?? null,
          difficulty: concept ? Math.min(5, Math.ceil(concept.seen_count * 1.2)) : 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');

      setQuestionSet(data);
      setPhase('answering');

      timerRef.current = setInterval(() => {
        setPassageTimer(t => {
          if (t + 1 >= REVEAL_SECONDS) {
            setPassageHidden(true);
            clearInterval(timerRef.current!);
          }
          return t + 1;
        });
      }, 1000);

      qTimerRef.current = setInterval(() => {
        setQuestionTimers(prev => {
          const next = [...prev];
          next[qIndex] = (next[qIndex] ?? 0) + 1;
          return next;
        });
      }, 1000);

    } catch (err) {
      setError(String(err));
      setPhase('select');
    }
  }

  function advanceQuestion() {
    if (qIndex < 3) {
      setQIndex(i => i + 1);
    } else {
      setPhase('review');
      stopAll();
    }
  }

  async function handleSubmitQuestion() {
    if (!currentPick || !currentQ || !questionSet) return;

    const isCorr = currentPick === currentQ.correct_label;
    const timeTaken = questionTimers[qIndex] ?? 0;
    const reasoning = reasonings[qIndex] ?? '';

    setPhase('classifying');

    let classification: Classification | null = null;
    if (!isCorr && reasoning.trim()) {
      try {
        const res = await fetch('/api/classify-failure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question_id: currentQ.question.id,
            concept_name: selectedConcept?.name ?? 'MCAT concept',
            correct_answer: currentQ.answers.find(a => a.is_correct)?.text ?? '',
            student_answer: currentQ.answers.find(a => a.label === currentPick)?.text ?? '',
            reasoning_text: reasoning,
            question_type: 'application',
          }),
        });
        const d = await res.json();
        if (res.ok) classification = d;
      } catch { /* non-fatal */ }
    }

    try {
      const res = await fetch('/api/record-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: selectedConcept?.id ?? null,
          question_id: currentQ.question.id,
          answer_given: currentPick,
          reasoning_text: reasoning,
          is_correct: isCorr,
          failure_type: classification?.failure_type ?? null,
          time_taken_seconds: timeTaken,
        }),
      });
      const d = await res.json();
      if (d.next_review) setNextReview(d.next_review);
    } catch { /* non-fatal */ }

    const newSub = [...submitted]; newSub[qIndex] = true;
    const newClass = [...classifications]; newClass[qIndex] = classification;
    setSubmitted(newSub);
    setClassifications(newClass);

    setPhase('answering');
  }

  // ── SELECT ────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div style={{ padding: '2rem 2.5rem', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>Practice</h1>
          <p style={{ margin: '0.35rem 0 0', color: '#4a5568', fontSize: '0.825rem' }}>
            Claude writes a passage + 4 questions. You read the passage, then it hides — answer from memory + reasoning.
          </p>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.82rem', marginBottom: '1rem' }}>{error}</div>}

        <div style={{ background: '#1a1f2e', border: '1px solid #1e2433', borderRadius: '0.85rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <div style={sLabel}>Section</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {SUBJECTS.map(s => {
                const m = SUBJECT_META[s]; const sel = selectedSubject === s;
                return <button key={s} onClick={() => { setSelectedSubject(s); setSelectedConcept(null); }} style={{ padding: '0.35rem 1rem', borderRadius: 999, border: `1px solid ${sel ? m.color : '#2d3748'}`, background: sel ? m.bg : 'transparent', color: sel ? m.color : '#4a5568', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>{s}</button>;
              })}
            </div>
          </div>

          <div>
            <div style={sLabel}>Focus Concept <span style={{ color: '#2d3748', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— optional</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 200, overflowY: 'auto' }}>
              <button onClick={() => setSelectedConcept(null)} style={{ textAlign: 'left', padding: '0.45rem 0.7rem', borderRadius: '0.4rem', border: `1px solid ${!selectedConcept ? '#6366f1' : '#1e2433'}`, background: !selectedConcept ? 'rgba(99,102,241,0.1)' : 'transparent', color: !selectedConcept ? '#818cf8' : '#4a5568', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                Random from {selectedSubject}
              </button>
              {filteredConcepts.map(c => (
                <button key={c.id} onClick={() => setSelectedConcept(c)} style={{ textAlign: 'left', padding: '0.45rem 0.7rem', borderRadius: '0.4rem', border: `1px solid ${selectedConcept?.id === c.id ? '#6366f1' : '#1e2433'}`, background: selectedConcept?.id === c.id ? 'rgba(99,102,241,0.1)' : 'transparent', color: selectedConcept?.id === c.id ? '#818cf8' : '#94a3b8', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {c.review_needed && <Lock size={11} color="#ef4444" />}
                    {c.name}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: c.priority === 'critical' ? '#ef4444' : c.priority === 'high' ? '#f97316' : '#4a5568', fontWeight: 700 }}>{c.seen_count}× · {c.priority}</span>
                </button>
              ))}
            </div>

            {selectedConcept?.review_needed && (
              <div style={{ marginTop: '0.85rem', padding: '0.9rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Lock size={14} color="#ef4444" />
                  <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.82rem' }}>Knowledge Gap — Review First</span>
                </div>
                <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                  You have a knowledge gap on <strong style={{ color: '#e2e8f0' }}>{selectedConcept.name}</strong>. Practicing without reviewing will reinforce wrong reasoning. Open the Kaplan chapter, study it, then come back.
                </p>
                {selectedConcept.kaplan_chapter && (
                  <div style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 700, marginBottom: '0.6rem' }}>
                    📖 {selectedConcept.kaplan_chapter}
                    {selectedConcept.kaplan_section && ` — ${selectedConcept.kaplan_section}`}
                  </div>
                )}
                <button
                  onClick={async () => {
                    await fetch('/api/mark-reviewed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concept_id: selectedConcept.id }) });
                    setConcepts(prev => prev.map(c => c.id === selectedConcept.id ? { ...c, review_needed: false } : c));
                    setSelectedConcept(prev => prev ? { ...prev, review_needed: false } : null);
                  }}
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.4rem', padding: '0.4rem 0.85rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                  ✓ I've reviewed the chapter — unlock practice
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={!!selectedConcept?.review_needed}
            style={{ background: selectedConcept?.review_needed ? '#1a1f2e' : 'linear-gradient(135deg, #6366f1, #4f46e5)', color: selectedConcept?.review_needed ? '#2d3748' : '#fff', border: `1px solid ${selectedConcept?.review_needed ? '#2d3748' : 'transparent'}`, borderRadius: '0.5rem', padding: '0.65rem 1.25rem', fontSize: '0.875rem', fontWeight: 700, cursor: selectedConcept?.review_needed ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
            <Brain size={15} />
            Generate 4-Question Set
          </button>
        </div>

        {/* Past Sessions */}
        {(history.length > 0 || historyLoading) && (
          <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <History size={14} color="#334155" />
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Past Sessions</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {history.map(s => {
                const sm = SUBJECT_META[s.subject] ?? SUBJECT_META['B/B'];
                const score = s.score ?? 0;
                const scoreColor = score >= 3 ? '#22c55e' : score >= 2 ? '#eab308' : '#ef4444';
                return (
                  <button key={s.id} onClick={() => openHistorySession(s)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.75rem 1rem', background: '#0a0e17', border: '1px solid #1e2433', borderRadius: '0.55rem', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d3748')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2433')}
                  >
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: scoreColor, minWidth: 32, textAlign: 'center' }}>{score}/4</span>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.passage_text.slice(0, 80)}…
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: '0.2rem' }}>
                        {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {s.questions.length} questions
                      </div>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: sm.bg, color: sm.color, border: `1px solid ${sm.color}44`, flexShrink: 0 }}>{s.subject}</span>
                    <ChevronRight size={13} color="#2d3748" />
                  </button>
                );
              })}
              {historyLoading && <div style={{ fontSize: '0.72rem', color: '#334155', marginTop: '0.5rem', textAlign: 'center' }}>Loading history…</div>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── GENERATING ────────────────────────────────────────────────
  if (phase === 'generating') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, border: '3px solid #1e2433', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <div style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600 }}>Writing passage + 4 questions...</div>
          <div style={{ color: '#334155', fontSize: '0.75rem', marginTop: '0.3rem' }}>Adapted to your failure pattern · Quality checked</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── ANSWERING ─────────────────────────────────────────────────
  if ((phase === 'answering' || phase === 'classifying') && questionSet && currentQ) {
    const passageTimeLeft = Math.max(0, REVEAL_SECONDS - passageTimer);
    const questionTime = questionTimers[qIndex] ?? 0;
    const timerColor = questionTime > 120 ? '#ef4444' : questionTime > 80 ? '#f97316' : '#4a5568';
    const isSubmitted = submitted[qIndex];
    const myClassification = classifications[qIndex];
    const correctAns = currentQ.answers.find(a => a.is_correct)!;
    const questionIsCorrect = currentPick === currentQ.correct_label;

    return (
      <div style={{ padding: '1.25rem 1.75rem', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: submitted[i] ? (picks[i] === questionSet.questions[i].correct_label ? '#22c55e' : '#ef4444') : i === qIndex ? '#6366f1' : '#1e2433', border: i === qIndex ? '2px solid #6366f1' : '1px solid #2d3748' }} />
            ))}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#334155' }}>Q{qIndex + 1} of 4</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', color: timerColor, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />{fmt(questionTime)}
            </span>
          </div>
        </div>

        <div style={{ background: '#0a0e17', border: '1px solid #1e2433', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', borderBottom: '1px solid #1e2433' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Passage</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {!passageHidden && (
                <span style={{ fontSize: '0.65rem', color: passageTimeLeft < 20 ? '#ef4444' : '#334155', fontVariantNumeric: 'tabular-nums' }}>
                  hides in {passageTimeLeft}s
                </span>
              )}
              <button onClick={() => setPassageHidden(h => !h)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: 'none', color: '#334155', cursor: 'pointer', fontSize: '0.65rem' }}>
                {passageHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                {passageHidden ? 'show' : 'hide'}
              </button>
            </div>
          </div>
          <div style={{ padding: '1rem 1.25rem', filter: passageHidden ? 'blur(6px)' : 'none', userSelect: passageHidden ? 'none' : 'auto', transition: 'filter 0.3s' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.845rem', lineHeight: 1.75 }}>{questionSet.passage}</p>
          </div>
          {passageHidden && (
            <div style={{ padding: '0.5rem 1.25rem 0.75rem', textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>⚡ Active recall mode — answer without looking</span>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            Question {qIndex + 1} · {currentQ.question.aamc_category || selectedSubject}
          </div>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.925rem', fontWeight: 600, lineHeight: 1.6 }}>{currentQ.question.raw_text}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {currentQ.answers.map(a => {
            const sel = currentPick === a.label;
            let borderColor = sel ? '#6366f1' : '#1e2433';
            let bg = sel ? 'rgba(99,102,241,0.1)' : '#0a0e17';
            let textColor = sel ? '#e2e8f0' : '#64748b';
            if (isSubmitted) {
              if (a.is_correct) { borderColor = '#22c55e'; bg = 'rgba(34,197,94,0.08)'; textColor = '#e2e8f0'; }
              else if (sel && !a.is_correct) { borderColor = '#ef4444'; bg = 'rgba(239,68,68,0.08)'; textColor = '#e2e8f0'; }
            }
            return (
              <button key={a.label} onClick={() => !isSubmitted && setPicks(prev => { const n = [...prev]; n[qIndex] = a.label; return n; })}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', padding: '0.75rem 1rem', borderRadius: '0.55rem', border: `1px solid ${borderColor}`, background: bg, color: textColor, textAlign: 'left', cursor: isSubmitted ? 'default' : 'pointer', transition: 'all 0.1s', width: '100%' }}>
                <span style={{ fontWeight: 800, fontSize: '0.82rem', flexShrink: 0, minWidth: 18, color: isSubmitted && a.is_correct ? '#22c55e' : isSubmitted && sel && !a.is_correct ? '#ef4444' : textColor }}>{a.label}.</span>
                <span style={{ fontSize: '0.845rem', lineHeight: 1.55 }}>{a.text}</span>
              </button>
            );
          })}
        </div>

        {isSubmitted && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.75rem 1rem', borderRadius: '0.6rem', background: questionIsCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${questionIsCorrect ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
              {questionIsCorrect ? <CheckCircle size={18} color="#22c55e" /> : <XCircle size={18} color="#ef4444" />}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: questionIsCorrect ? '#22c55e' : '#ef4444' }}>{questionIsCorrect ? 'Correct' : 'Incorrect'}</div>
                {!questionIsCorrect && <div style={{ fontSize: '0.72rem', color: '#4a5568' }}>Correct: {correctAns.label}. {correctAns.text.slice(0, 60)}{correctAns.text.length > 60 ? '…' : ''}</div>}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#2d3748', fontVariantNumeric: 'tabular-nums' }}>{fmt(questionTimers[qIndex] ?? 0)}</div>
            </div>

            {myClassification && (() => { const fm = FAILURE_META[myClassification.failure_type]; return fm ? (
              <div style={{ padding: '0.75rem 1rem', borderRadius: '0.55rem', background: `${fm.color}12`, border: `1px solid ${fm.color}33` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem', color: fm.color }}>
                  {fm.icon}<span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{fm.label}</span>
                </div>
                <p style={{ margin: '0 0 0.3rem', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.55 }}>{myClassification.explanation}</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#4a5568', fontStyle: 'italic' }}>→ {fm.tip}</p>
              </div>
            ) : null; })()}

            <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.6, padding: '0.6rem 0.85rem', background: '#0a0e17', borderRadius: '0.45rem', borderLeft: '3px solid #22c55e33' }}>
              <span style={{ fontWeight: 700, color: '#22c55e', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Why correct: </span>
              {currentQ.explanations.why_correct}
            </div>

            <button onClick={advanceQuestion}
              style={{ alignSelf: 'flex-end', background: qIndex < 3 ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#fff', border: 'none', borderRadius: '0.45rem', padding: '0.55rem 1.1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {qIndex < 3 ? <>Next Question <ChevronRight size={14} /></> : <>See Full Results <ChevronRight size={14} /></>}
            </button>
          </div>
        )}

        {!isSubmitted && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <textarea
              className="input-base" rows={2}
              placeholder="Your reasoning — why did you pick that answer?"
              value={reasonings[qIndex]}
              onChange={e => setReasonings(prev => { const n = [...prev]; n[qIndex] = e.target.value; return n; })}
              style={{ resize: 'none', lineHeight: 1.55, fontSize: '0.82rem' }}
            />
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { stopAll(); setPhase('select'); }} style={{ background: 'transparent', border: '1px solid #1e2433', borderRadius: '0.4rem', padding: '0.45rem 0.85rem', color: '#334155', fontSize: '0.78rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmitQuestion} disabled={!currentPick || phase === 'classifying'}
                style={{ background: currentPick ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#1a1f2e', color: currentPick ? '#fff' : '#334155', border: 'none', borderRadius: '0.4rem', padding: '0.45rem 1.1rem', fontSize: '0.82rem', fontWeight: 700, cursor: currentPick ? 'pointer' : 'not-allowed' }}>
                {phase === 'classifying' ? 'Analyzing…' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── REVIEW (all 4 done) ───────────────────────────────────────
  if (phase === 'review' && questionSet) {
    const score = picks.filter((p, i) => p === questionSet.questions[i]?.correct_label).length;
    const sm = SUBJECT_META[selectedSubject];

    return (
      <div style={{ padding: '1.5rem 1.75rem', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.1rem 1.25rem', background: '#0a0e17', border: '1px solid #1e2433', borderRadius: '0.75rem' }}>
          <div style={{ textAlign: 'center', minWidth: 60 }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: score >= 3 ? '#22c55e' : score >= 2 ? '#eab308' : '#ef4444', lineHeight: 1 }}>{score}/4</div>
            <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: '0.2rem' }}>correct</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.9rem' }}>
              {score === 4 ? 'Perfect set — concept is strengthening' : score >= 3 ? 'Strong — one more pass and this concept will be solid' : score >= 2 ? 'Partial understanding — focus on what tripped you up' : 'Knowledge or reasoning gap — open the Kaplan chapter'}
            </div>
            {nextReview && <div style={{ fontSize: '0.72rem', color: '#334155', marginTop: '0.25rem' }}>Next SM-2 review: {nextReview}</div>}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sm.bg, color: sm.color, border: `1px solid ${sm.color}44` }}>{selectedSubject}</span>
        </div>

        {questionSet.questions.map((q, i) => {
          const myPick = picks[i];
          const correct = myPick === q.correct_label;
          const cl = classifications[i];
          const fm = cl ? FAILURE_META[cl.failure_type] : null;
          return (
            <div key={i} style={{ background: '#0a0e17', border: `1px solid ${correct ? '#22c55e22' : '#ef444422'}`, borderRadius: '0.65rem', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #1a1f2e', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {correct ? <CheckCircle size={15} color="#22c55e" /> : <XCircle size={15} color="#ef4444" />}
                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#e2e8f0', flex: 1 }}>Q{i + 1}: {q.question.raw_text.slice(0, 70)}{q.question.raw_text.length > 70 ? '…' : ''}</span>
                <span style={{ fontSize: '0.65rem', color: '#2d3748', fontVariantNumeric: 'tabular-nums' }}>{fmt(questionTimers[i] ?? 0)}</span>
              </div>
              <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {!correct && fm && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: fm.color, fontWeight: 700 }}>
                    {fm.icon}{fm.label}: {cl?.explanation}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: '#22c55e' }}>✓ </span>{q.explanations.why_correct}
                </p>
              </div>
            </div>
          );
        })}

        {selectedConcept?.kaplan_chapter && (
          <div>
            <button
              onClick={() => kaplanContent ? setKaplanContent(null) : fetchKaplanSection(selectedConcept.kaplan_chapter!, selectedConcept.kaplan_section)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 1rem', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: kaplanContent ? '0.55rem 0.55rem 0 0' : '0.55rem', width: '100%', cursor: 'pointer', textAlign: 'left' }}
            >
              <BookOpen size={14} color="#6366f1" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Study from</div>
                <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: 600 }}>{selectedConcept.kaplan_chapter}{selectedConcept.kaplan_section ? ` — ${selectedConcept.kaplan_section}` : ''}</div>
              </div>
              {kaplanLoading
                ? <span style={{ fontSize: '0.7rem', color: '#6366f1' }}>Loading…</span>
                : <span style={{ color: '#6366f1', fontSize: '0.75rem' }}>{kaplanContent ? '▲' : '▼'}</span>
              }
            </button>
            {kaplanContent && (
              <div style={{ border: '1px solid rgba(99,102,241,0.2)', borderTop: 'none', borderRadius: '0 0 0.55rem 0.55rem', padding: '1rem 1.1rem', background: '#0d1018', maxHeight: 420, overflowY: 'auto' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.65rem' }}>{kaplanContent.section_title}</div>
                <div style={{ fontSize: '0.83rem', color: '#94a3b8', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{kaplanContent.content}</div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button onClick={() => { fetchHistory(); setPhase('select'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: '1px solid #1e2433', borderRadius: '0.4rem', padding: '0.55rem 1rem', color: '#4a5568', fontSize: '0.8rem', cursor: 'pointer' }}>
            <RotateCcw size={13} /> New Session
          </button>
          <button onClick={handleGenerate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: '0.4rem', padding: '0.55rem 1.1rem', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            <ChevronRight size={14} /> Same Concept, New Passage
          </button>
        </div>
      </div>
    );
  }

  // ── HISTORY (view past session) ───────────────────────────────
  if (phase === 'history' && historySession) {
    const sm = SUBJECT_META[historySession.subject] ?? SUBJECT_META['B/B'];
    const score = historySession.score ?? 0;
    const scoreColor = score >= 3 ? '#22c55e' : score >= 2 ? '#eab308' : '#ef4444';
    const labels = ['A', 'B', 'C', 'D'];
    const answerKeys = ['answer_a', 'answer_b', 'answer_c', 'answer_d'] as const;

    return (
      <div style={{ padding: '1.5rem 1.75rem', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', background: '#0a0e17', border: '1px solid #1e2433', borderRadius: '0.75rem' }}>
          <div style={{ textAlign: 'center', minWidth: 52 }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{score}/4</div>
            <div style={{ fontSize: '0.6rem', color: '#334155', marginTop: '0.2rem' }}>correct</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.68rem', color: '#334155', marginBottom: '0.15rem' }}>
              {new Date(historySession.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5 }}>
              {historySession.passage_text.slice(0, 120)}…
            </div>
          </div>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sm.bg, color: sm.color, border: `1px solid ${sm.color}44`, flexShrink: 0 }}>{historySession.subject}</span>
        </div>

        {/* Passage */}
        <div style={{ background: '#0a0e17', border: '1px solid #1e2433', borderRadius: '0.65rem', padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>Passage</div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.845rem', lineHeight: 1.75 }}>{historySession.passage_text}</p>
        </div>

        {/* Questions */}
        {historySession.questions.map((q, i) => {
          const answered = q.answer_given != null;
          const correct = q.is_correct ?? false;
          const answers = answerKeys.map((key, li) => ({
            label: labels[li],
            text: q[key],
            is_correct: labels[li] === q.correct_answer,
          }));

          return (
            <div key={q.id} style={{ background: '#0a0e17', border: `1px solid ${answered ? (correct ? '#22c55e22' : '#ef444422') : '#1e2433'}`, borderRadius: '0.65rem', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #1a1f2e', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {answered
                  ? (correct ? <CheckCircle size={15} color="#22c55e" /> : <XCircle size={15} color="#ef4444" />)
                  : <div style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid #2d3748' }} />}
                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#e2e8f0', flex: 1 }}>Q{i + 1}: {q.raw_text}</span>
              </div>

              <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {answers.map(a => {
                  const wasPicked = q.answer_given === a.label;
                  let borderColor = '#1a1f2e';
                  let bg = 'transparent';
                  let textColor = '#4a5568';
                  if (a.is_correct) { borderColor = '#22c55e44'; bg = 'rgba(34,197,94,0.06)'; textColor = '#e2e8f0'; }
                  else if (wasPicked && !a.is_correct) { borderColor = '#ef444444'; bg = 'rgba(239,68,68,0.06)'; textColor = '#94a3b8'; }
                  return (
                    <div key={a.label} style={{ display: 'flex', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '0.4rem', border: `1px solid ${borderColor}`, background: bg }}>
                      <span style={{ fontWeight: 800, fontSize: '0.78rem', flexShrink: 0, color: a.is_correct ? '#22c55e' : wasPicked ? '#ef4444' : '#2d3748' }}>{a.label}.</span>
                      <span style={{ fontSize: '0.8rem', color: textColor, lineHeight: 1.5 }}>{a.text}</span>
                      {a.is_correct && <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>✓ correct</span>}
                      {wasPicked && !a.is_correct && <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>your pick</span>}
                    </div>
                  );
                })}

                {q.explanations?.why_correct && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.6, padding: '0.5rem 0.75rem', background: '#060810', borderRadius: '0.4rem', borderLeft: '3px solid #22c55e33' }}>
                    <span style={{ fontWeight: 700, color: '#22c55e', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Why correct: </span>
                    {q.explanations.why_correct}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button onClick={() => setPhase('select')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: '1px solid #1e2433', borderRadius: '0.4rem', padding: '0.55rem 1rem', color: '#4a5568', fontSize: '0.8rem', cursor: 'pointer' }}>
            <RotateCcw size={13} /> Back
          </button>
          <button onClick={handleGenerate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: '0.4rem', padding: '0.55rem 1.1rem', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            <Brain size={14} /> New Session
          </button>
        </div>
      </div>
    );
  }

  return null;
}

const sLabel: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: '#334155',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem',
};
