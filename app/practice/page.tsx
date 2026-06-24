'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, Clock, ChevronRight, RotateCcw, CheckCircle, XCircle, BookOpen, Zap, AlertTriangle, Eye, Timer } from 'lucide-react';
import { getConcepts } from '@/lib/db';
import type { Concept, Subject } from '@/lib/db';

type Phase = 'select' | 'generating' | 'answering' | 'classifying' | 'review';

type GeneratedQuestion = {
  question: { id: string; raw_text: string; passage: string; aamc_category: string };
  answers: { label: string; text: string; is_correct: boolean }[];
  correct_label: string;
  explanations: {
    why_correct: string;
    why_b_wrong: string;
    why_c_wrong: string;
    why_d_wrong: string;
  };
};

type Classification = {
  failure_type: string;
  explanation: string;
  recommended_action: string;
};

const SUBJECT_META: Record<string, { color: string; bg: string; label: string }> = {
  'B/B': { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', label: 'Bio & Biochem' },
  'C/B': { color: '#6366f1', bg: 'rgba(99,102,241,0.12)', label: 'Cell Bio' },
  'P/S': { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: 'Psych & Soc' },
  'C/P': { color: '#14b8a6', bg: 'rgba(20,184,166,0.12)', label: 'Chem & Physics' },
};

const FAILURE_META: Record<string, { color: string; icon: React.ReactNode; label: string; tip: string }> = {
  KNOWLEDGE_GAP:    { color: '#ef4444', icon: <Brain size={16} />,       label: 'Knowledge Gap',    tip: 'You need to learn this concept — open the Kaplan chapter below.' },
  REASONING_GAP:    { color: '#f97316', icon: <Zap size={16} />,         label: 'Reasoning Gap',    tip: 'You know the material but applied it wrong. Work more practice problems on this topic.' },
  PASSAGE_MISREAD:  { color: '#eab308', icon: <Eye size={16} />,         label: 'Passage Misread',  tip: 'Your reasoning was sound — practice slowing down and re-reading key passage details.' },
  TIME_PRESSURE:    { color: '#a78bfa', icon: <Timer size={16} />,       label: 'Time Pressure',    tip: 'Incomplete reasoning. Practice timed sets to build speed without sacrificing accuracy.' },
  CARELESS:         { color: '#64748b', icon: <AlertTriangle size={16} />, label: 'Careless Error',  tip: 'You knew the answer. Practice flagging questions before submitting.' },
};

const SUBJECTS: Subject[] = ['B/B', 'C/B', 'P/S', 'C/P'];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PracticePage() {
  const [phase, setPhase] = useState<Phase>('select');
  const [selectedSubject, setSelectedSubject] = useState<Subject>('B/B');
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [generated, setGenerated] = useState<GeneratedQuestion | null>(null);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [classification, setClassification] = useState<Classification | null>(null);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getConcepts()
      .then(c => setConcepts(c.filter(x => !x.is_mastered)))
      .catch(() => {});
  }, []);

  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const filteredConcepts = concepts.filter(c => c.subject === selectedSubject);

  async function handleGenerate() {
    setError('');
    setPhase('generating');
    setGenerated(null);
    setPickedLabel(null);
    setReasoning('');
    setClassification(null);

    const concept = selectedConcept ?? filteredConcepts[0] ?? null;
    const body = {
      concept_id: concept?.id ?? null,
      concept_name: concept?.name ?? 'general MCAT concept',
      aamc_category: '1A',
      aamc_category_name: 'Structure and function of proteins',
      section: selectedSubject,
      failure_type: null,
      difficulty: concept ? Math.min(5, Math.ceil(concept.seen_count * 1.2)) : 3,
    };

    try {
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setGenerated(data);
      setPhase('answering');
      startTimer();
    } catch (err) {
      setError(String(err));
      setPhase('select');
    }
  }

  async function handleSubmit() {
    if (!pickedLabel || !generated) return;
    stopTimer();
    setPhase('classifying');

    const isCorrect = pickedLabel === generated.correct_label;
    const pickedAnswer = generated.answers.find(a => a.label === pickedLabel);

    if (!isCorrect && reasoning.trim()) {
      try {
        const res = await fetch('/api/classify-failure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question_id: generated.question.id,
            concept_name: selectedConcept?.name ?? 'MCAT concept',
            correct_answer: generated.answers.find(a => a.is_correct)?.text ?? '',
            student_answer: pickedAnswer?.text ?? '',
            reasoning_text: reasoning,
            question_type: 'application',
          }),
        });
        const data = await res.json();
        setClassification(data);
      } catch {
        // Non-fatal — still show review
      }
    }

    setPhase('review');
  }

  const isCorrect = pickedLabel === generated?.correct_label;

  // ── SELECT PHASE ──────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div style={{ padding: '2rem 2.5rem', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>
            Practice
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
            Claude generates a passage-based question targeting your weak concepts.
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        <div style={{ background: '#1e2433', border: '1px solid #2d3748', borderRadius: '0.85rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Subject */}
          <div>
            <div style={sectionLabel}>Section</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {SUBJECTS.map(s => {
                const meta = SUBJECT_META[s];
                const sel = selectedSubject === s;
                return (
                  <button key={s} onClick={() => { setSelectedSubject(s); setSelectedConcept(null); }}
                    style={{ padding: '0.4rem 1rem', borderRadius: 999, border: `1px solid ${sel ? meta.color : '#2d3748'}`, background: sel ? meta.bg : 'transparent', color: sel ? meta.color : '#64748b', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Concept */}
          <div>
            <div style={sectionLabel}>
              Focus Concept
              <span style={{ color: '#4a5568', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> — optional, leave blank for random</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 220, overflowY: 'auto' }}>
              <button
                onClick={() => setSelectedConcept(null)}
                style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderRadius: '0.4rem', border: `1px solid ${!selectedConcept ? '#6366f1' : '#2d3748'}`, background: !selectedConcept ? 'rgba(99,102,241,0.12)' : 'transparent', color: !selectedConcept ? '#818cf8' : '#64748b', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                Random from {SUBJECT_META[selectedSubject].label}
              </button>
              {filteredConcepts.map(c => (
                <button key={c.id} onClick={() => setSelectedConcept(c)}
                  style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderRadius: '0.4rem', border: `1px solid ${selectedConcept?.id === c.id ? '#6366f1' : '#2d3748'}`, background: selectedConcept?.id === c.id ? 'rgba(99,102,241,0.12)' : 'transparent', color: selectedConcept?.id === c.id ? '#818cf8' : '#94a3b8', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{c.name}</span>
                  <span style={{ fontSize: '0.7rem', color: c.priority === 'critical' ? '#ef4444' : c.priority === 'high' ? '#f97316' : '#64748b', fontWeight: 700 }}>
                    {c.seen_count}× · {c.priority}
                  </span>
                </button>
              ))}
              {filteredConcepts.length === 0 && (
                <p style={{ color: '#4a5568', fontSize: '0.8rem', margin: 0 }}>No concepts tracked yet for {selectedSubject}. Add some missed questions first.</p>
              )}
            </div>
          </div>

          <button onClick={handleGenerate}
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.7rem 1.5rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
            <Brain size={16} />
            Generate Question
          </button>
        </div>
      </div>
    );
  }

  // ── GENERATING PHASE ──────────────────────────────────────────
  if (phase === 'generating') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '3px solid #2d3748', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600 }}>Generating question...</div>
          <div style={{ color: '#4a5568', fontSize: '0.78rem', marginTop: '0.35rem' }}>Claude is writing a passage + quality checking</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── ANSWERING PHASE ───────────────────────────────────────────
  if ((phase === 'answering' || phase === 'classifying') && generated) {
    const timerColor = elapsed > 90 ? '#ef4444' : elapsed > 60 ? '#f97316' : '#64748b';
    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: SUBJECT_META[selectedSubject].bg, color: SUBJECT_META[selectedSubject].color, border: `1px solid ${SUBJECT_META[selectedSubject].color}44` }}>
              {selectedSubject}
            </span>
            {selectedConcept && (
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{selectedConcept.name}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: timerColor, fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.9rem' }}>
            <Clock size={15} />
            {formatTime(elapsed)}
          </div>
        </div>

        {/* Passage */}
        <div style={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: '0.75rem', padding: '1.25rem 1.5rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>Passage</div>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.875rem', lineHeight: 1.75 }}>{generated.question.passage}</p>
        </div>

        {/* Question */}
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>Question</div>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.6 }}>{generated.question.raw_text}</p>
        </div>

        {/* Answer choices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {generated.answers.map(a => {
            const sel = pickedLabel === a.label;
            return (
              <button key={a.label} onClick={() => phase === 'answering' && setPickedLabel(a.label)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: '0.6rem', border: `1px solid ${sel ? '#6366f1' : '#2d3748'}`, background: sel ? 'rgba(99,102,241,0.12)' : '#1a1f2e', color: sel ? '#e2e8f0' : '#94a3b8', textAlign: 'left', cursor: phase === 'answering' ? 'pointer' : 'default', transition: 'all 0.12s', width: '100%' }}>
                <span style={{ fontWeight: 800, color: sel ? '#818cf8' : '#4a5568', flexShrink: 0, fontSize: '0.9rem', minWidth: 20 }}>{a.label}.</span>
                <span style={{ fontSize: '0.875rem', lineHeight: 1.55 }}>{a.text}</span>
              </button>
            );
          })}
        </div>

        {/* Reasoning input */}
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>
            Your Reasoning <span style={{ color: '#4a5568', fontWeight: 400, textTransform: 'none' }}>(helps Claude diagnose why you got it wrong)</span>
          </label>
          <textarea className="input-base" rows={3}
            placeholder="Why did you pick that answer? What reasoning did you use?"
            value={reasoning} onChange={e => setReasoning(e.target.value)}
            style={{ resize: 'vertical', lineHeight: 1.6, fontSize: '0.85rem' }} />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => { stopTimer(); setPhase('select'); }}
            style={{ background: 'transparent', border: '1px solid #2d3748', borderRadius: '0.45rem', padding: '0.55rem 1rem', color: '#64748b', fontSize: '0.82rem', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!pickedLabel || phase === 'classifying'}
            style={{ background: pickedLabel ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#1e2433', color: pickedLabel ? '#fff' : '#4a5568', border: `1px solid ${pickedLabel ? 'transparent' : '#2d3748'}`, borderRadius: '0.45rem', padding: '0.55rem 1.25rem', fontSize: '0.875rem', fontWeight: 700, cursor: pickedLabel ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {phase === 'classifying' ? 'Analyzing...' : 'Submit Answer'}
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  // ── REVIEW PHASE ──────────────────────────────────────────────
  if (phase === 'review' && generated) {
    const correctAnswer = generated.answers.find(a => a.is_correct)!;
    const myAnswer = generated.answers.find(a => a.label === pickedLabel)!;
    const fm = classification ? FAILURE_META[classification.failure_type] : null;

    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Result banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', borderRadius: '0.75rem', background: isCorrect ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {isCorrect ? <CheckCircle size={28} color="#22c55e" /> : <XCircle size={28} color="#ef4444" />}
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: isCorrect ? '#22c55e' : '#ef4444' }}>
              {isCorrect ? 'Correct!' : 'Incorrect'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Time: {formatTime(elapsed)} · {selectedSubject} {generated.question.aamc_category ? `· AAMC ${generated.question.aamc_category}` : ''}
            </div>
          </div>
        </div>

        {/* Failure classification */}
        {!isCorrect && classification && fm && (
          <div style={{ padding: '0.9rem 1.1rem', borderRadius: '0.65rem', background: `rgba(${fm.color === '#ef4444' ? '239,68,68' : fm.color === '#f97316' ? '249,115,22' : fm.color === '#eab308' ? '234,179,8' : fm.color === '#a78bfa' ? '167,139,250' : '100,116,139'},0.1)`, border: `1px solid ${fm.color}44` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ color: fm.color }}>{fm.icon}</span>
              <span style={{ fontWeight: 700, color: fm.color, fontSize: '0.85rem' }}>{fm.label}</span>
            </div>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.55 }}>{classification.explanation}</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', lineHeight: 1.5 }}>→ {fm.tip}</p>
          </div>
        )}

        {/* Correct answer highlight */}
        {!isCorrect && (
          <div style={{ padding: '0.85rem 1rem', borderRadius: '0.6rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>Correct Answer</div>
            <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.875rem', fontWeight: 600 }}>{correctAnswer.label}. {correctAnswer.text}</p>
          </div>
        )}

        {/* Explanations */}
        <div style={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: '0.75rem', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Explanations</div>

          <ExplanationRow label={`Why ${correctAnswer.label} is correct`} color="#22c55e" text={generated.explanations.why_correct} />
          {generated.answers.filter(a => !a.is_correct).map(a => {
            const key = `why_${a.label.toLowerCase()}_wrong` as keyof typeof generated.explanations;
            return (
              <ExplanationRow key={a.label} label={`Why ${a.label} is wrong`} color={a.label === pickedLabel ? '#ef4444' : '#4a5568'} text={generated.explanations[key] ?? ''} />
            );
          })}
        </div>

        {/* Kaplan reference */}
        {selectedConcept?.kaplan_chapter && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.75rem 1rem', borderRadius: '0.6rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <BookOpen size={15} color="#818cf8" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>Study From</div>
              <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 600 }}>{selectedConcept.kaplan_chapter}</div>
              {selectedConcept.kaplan_section && (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.15rem' }}>§ {selectedConcept.kaplan_section}</div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
          <button onClick={() => setPhase('select')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: '1px solid #2d3748', borderRadius: '0.45rem', padding: '0.6rem 1.1rem', color: '#64748b', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            <RotateCcw size={14} />
            New Session
          </button>
          <button onClick={handleGenerate}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: '0.45rem', padding: '0.6rem 1.25rem', color: '#fff', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>
            <ChevronRight size={15} />
            Next Question
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function ExplanationRow({ label, color, text }: { label: string; color: string; text: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color, marginBottom: '0.25rem' }}>{label}</div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: '0.6rem',
};
