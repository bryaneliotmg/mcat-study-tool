'use client';

import { useState, useEffect, useRef } from 'react';
import { BookOpen, ChevronRight, RotateCcw, CheckCircle, XCircle, Eye, EyeOff, Clock, Zap, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type CARSQuestion = {
  stem: string;
  type: string;
  correct: string;
  wrong_a: string;
  wrong_b: string;
  wrong_c: string;
  explanation: string;
};

type Answer = {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  is_correct: boolean;
};

type QuestionState = {
  answers: Answer[];
  correct_label: string;
  original: CARSQuestion;
};

type Phase = 'select' | 'reading' | 'answering' | 'review' | 'history';

type HistoryPassage = {
  id: string;
  passage_text: string;
  topic_domain: string;
  difficulty_level: number;
  questions: CARSQuestion[];
  created_at: string;
  score?: number; // correct out of 4, from responses
};

type PatternEntry = {
  type: string;
  label: string;
  accuracy: number;
  total: number;
  avg_seconds: number;
  tip: string | null;
  weak: boolean;
  strong: boolean;
};

type PatternData = {
  patterns: PatternEntry[];
  dominantWeakness: PatternEntry | null;
  totalSessions: number;
} | null;

const TYPE_LABELS: Record<string, string> = {
  main_idea: 'Main Idea',
  author_attitude: 'Author Attitude',
  inference: 'Inference',
  strengthen_weaken: 'Strengthen/Weaken',
  detail: 'Detail',
  function: 'Function',
};

const DIFFICULTY_LABELS = ['', 'Foundation', 'Standard', 'Moderate', 'Advanced', 'MCAT-level'];

// Reading window: passage auto-locks after this many seconds
const READ_WINDOW = 180;

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Passage({ text, color = '#94a3b8', size = '0.875rem' }: { text: string; color?: string; size?: string }) {
  const paras = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} style={{ margin: 0, marginBottom: i < paras.length - 1 ? '0.85em' : 0, color, fontSize: size, lineHeight: 1.85 }}>{p}</p>
      ))}
    </>
  );
}

function shuffleAnswers(q: CARSQuestion): QuestionState {
  const pool: Answer[] = [
    { label: 'A', text: q.correct, is_correct: true },
    { label: 'B', text: q.wrong_a, is_correct: false },
    { label: 'C', text: q.wrong_b, is_correct: false },
    { label: 'D', text: q.wrong_c, is_correct: false },
  ];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const labels: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const answers = pool.map((a, i) => ({ ...a, label: labels[i] }));
  const correct_label = answers.find(a => a.is_correct)!.label;
  return { answers, correct_label, original: q };
}

export default function CARSPage() {
  const [phase, setPhase] = useState<Phase>('select');
  const [difficulty, setDifficulty] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [passage, setPassage] = useState('');
  const [domain, setDomain] = useState('');
  const [passageId, setPassageId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionState[]>([]);
  const [patternData, setPatternData] = useState<PatternData>(null);
  const [openQs, setOpenQs] = useState<Set<number>>(new Set([0]));

  const [readTimer, setReadTimer] = useState(0);
  const [passageLocked, setPassageLocked] = useState(false);
  const [passageHidden, setPassageHidden] = useState(false);
  const readTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [qIndex, setQIndex] = useState(0);
  const [picks, setPicks] = useState<(string | null)[]>([null, null, null, null]);
  const [submitted, setSubmitted] = useState<boolean[]>([false, false, false, false]);
  const [qTimers, setQTimers] = useState<number[]>([0, 0, 0, 0]);
  const qTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [history, setHistory] = useState<HistoryPassage[]>([]);
  const [historyPassage, setHistoryPassage] = useState<HistoryPassage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    async function fetchHistory() {
      setHistoryLoading(true);
      const { data: passages } = await supabase
        .from('cars_passages')
        .select('id, passage_text, topic_domain, difficulty_level, questions, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!passages) { setHistoryLoading(false); return; }

      // Fetch response counts per passage
      const ids = passages.map(p => p.id);
      const { data: responses } = await supabase
        .from('cars_responses')
        .select('passage_id, is_correct')
        .in('passage_id', ids);

      const scoreMap: Record<string, number> = {};
      for (const r of responses ?? []) {
        if (r.is_correct && r.passage_id) scoreMap[r.passage_id] = (scoreMap[r.passage_id] ?? 0) + 1;
      }

      setHistory(passages.map(p => ({ ...p, score: scoreMap[p.id] })));
      setHistoryLoading(false);
    }
    fetchHistory();
  }, []);

  function openHistoryPassage(p: HistoryPassage) {
    setHistoryPassage(p);
    setPhase('history');
  }

  function stopAll() {
    if (readTimerRef.current) { clearInterval(readTimerRef.current); readTimerRef.current = null; }
    if (qTimerRef.current) { clearInterval(qTimerRef.current); qTimerRef.current = null; }
  }

  useEffect(() => () => stopAll(), []);

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setPicks([null, null, null, null]);
    setSubmitted([false, false, false, false]);
    setQIndex(0);
    setReadTimer(0);
    setPassageLocked(false);
    setPassageHidden(false);
    setQTimers([0, 0, 0, 0]);
    stopAll();

    try {
      const res = await fetch('/api/generate-cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');

      setPassage(data.passage.passage_text);
      setDomain(data.passage.topic_domain);
      setPassageId(data.passage.id ?? null);
      setQuestions(data.questions.map(shuffleAnswers));
      setPhase('reading');
      setLoading(false);

      // 3-minute reading window, then passage locks
      readTimerRef.current = setInterval(() => {
        setReadTimer(t => {
          if (t + 1 >= READ_WINDOW) {
            setPassageLocked(true);
            clearInterval(readTimerRef.current!);
          }
          return t + 1;
        });
      }, 1000);

    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  function startAnswering() {
    stopAll();
    setPhase('answering');
    setPassageLocked(true);
    qTimerRef.current = setInterval(() => {
      setQTimers(prev => {
        const next = [...prev];
        next[qIndex] = (next[qIndex] ?? 0) + 1;
        return next;
      });
    }, 1000);
  }

  async function submitQuestion() {
    const newSub = [...submitted]; newSub[qIndex] = true;
    setSubmitted(newSub);

    const q = questions[qIndex];
    const isCorrect = picks[qIndex] === q.correct_label;

    try {
      const res = await fetch('/api/record-cars-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passage_id: passageId,
          question_type: q.original.type,
          is_correct: isCorrect,
          time_taken_seconds: qTimers[qIndex] ?? 0,
          difficulty_level: difficulty,
          topic_domain: domain,
        }),
      });
      const data = await res.json();
      if (data.patterns) setPatternData({ patterns: data.patterns, dominantWeakness: data.dominantWeakness, totalSessions: data.totalSessions });
    } catch {
      // non-blocking
    }
  }

  function nextQuestion() {
    if (qIndex < 3) {
      setQIndex(i => i + 1);
    } else {
      stopAll();
      setPhase('review');
    }
  }

  const currentQ = questions[qIndex];
  const currentPick = picks[qIndex];
  const isSubmitted = submitted[qIndex];

  // ── SELECT ────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div style={{ padding: '2rem 2.5rem', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
            <BookOpen size={20} color="#6366f1" />
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>CARS Practice</h1>
          </div>
          <p style={{ margin: 0, color: '#4a5568', fontSize: '0.82rem', lineHeight: 1.6 }}>
            Critical Analysis and Reasoning Skills · 30% of your MCAT score · Pure reading comprehension — no science knowledge required
          </p>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.82rem', marginBottom: '1rem' }}>{error}</div>}

        <div style={{ background: '#1a1f2e', border: '1px solid #1e2433', borderRadius: '0.85rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* How it works */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              ['📖', '3-minute reading window', 'Read the passage carefully. You have 3 minutes before it locks.'],
              ['⚡', 'Answer from memory', 'CARS tests your comprehension of what you just read, not recall.'],
              ['🎯', '4 question types', 'Main idea · Author attitude · Inference · Strengthen/Weaken'],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: '0.75rem', padding: '0.65rem 0.85rem', background: '#0a0e17', borderRadius: '0.55rem', border: '1px solid #1e2433' }}>
                <span style={{ fontSize: '1rem' }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: '0.8rem' }}>{title}</div>
                  <div style={{ color: '#4a5568', fontSize: '0.75rem', marginTop: '0.1rem' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Difficulty */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Difficulty</div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[2, 3, 4, 5].map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  style={{ padding: '0.35rem 0.8rem', borderRadius: 999, border: `1px solid ${difficulty === d ? '#6366f1' : '#2d3748'}`, background: difficulty === d ? 'rgba(99,102,241,0.1)' : 'transparent', color: difficulty === d ? '#818cf8' : '#4a5568', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleGenerate} disabled={loading}
            style={{ background: loading ? '#1a1f2e' : 'linear-gradient(135deg, #6366f1, #4f46e5)', color: loading ? '#334155' : '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.7rem 1.25rem', fontSize: '0.875rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
            {loading ? (
              <><span style={{ width: 14, height: 14, border: '2px solid #334155', borderTop: '2px solid #6366f1', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Generating passage…</>
            ) : (
              <><BookOpen size={15} /> Generate CARS Passage</>
            )}
          </button>
        </div>
        {/* Past Passages */}
        {history.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <History size={14} color="#4a5568" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Past Passages</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {history.map(p => (
                <button key={p.id} onClick={() => openHistoryPassage(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: '#1a1f2e', border: '1px solid #1e2433', borderRadius: '0.55rem', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.topic_domain}</div>
                    <div style={{ fontSize: '0.68rem', color: '#334155', marginTop: '0.15rem' }}>
                      Difficulty {p.difficulty_level}/5 · {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  {p.score !== undefined ? (
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: p.score >= 3 ? '#22c55e' : p.score >= 2 ? '#eab308' : '#ef4444', flexShrink: 0 }}>{p.score}/4</span>
                  ) : (
                    <span style={{ fontSize: '0.68rem', color: '#2d3748', flexShrink: 0 }}>not attempted</span>
                  )}
                  <ChevronRight size={13} color="#2d3748" />
                </button>
              ))}
            </div>
          </div>
        )}
        {historyLoading && <div style={{ fontSize: '0.72rem', color: '#334155', marginTop: '1rem', textAlign: 'center' }}>Loading history…</div>}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── READING ───────────────────────────────────────────────────
  if (phase === 'reading') {
    const timeLeft = Math.max(0, READ_WINDOW - readTimer);
    const pct = readTimer / READ_WINDOW;
    const barColor = timeLeft < 30 ? '#ef4444' : timeLeft < 60 ? '#f97316' : '#22c55e';

    return (
      <div style={{ padding: '1.25rem 1.75rem', maxWidth: 760, margin: '0 auto' }}>
        {/* Reading header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1, height: 4, background: '#1e2433', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(1 - pct) * 100}%`, background: barColor, transition: 'width 1s linear, background 0.3s' }} />
          </div>
          <span style={{ fontSize: '0.72rem', color: timeLeft < 30 ? '#ef4444' : '#334155', fontVariantNumeric: 'tabular-nums', fontWeight: 700, minWidth: 40 }}>
            {fmt(timeLeft)}
          </span>
          <button onClick={startAnswering}
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', border: 'none', borderRadius: '0.4rem', padding: '0.4rem 0.9rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            Done reading <ChevronRight size={13} />
          </button>
        </div>

        {passageLocked && (
          <div style={{ padding: '0.5rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '0.45rem', marginBottom: '0.75rem', fontSize: '0.75rem', color: '#ef4444', fontWeight: 700, textAlign: 'center' }}>
            Reading time ended — answer from your comprehension
          </div>
        )}

        <div style={{ background: '#0a0e17', border: '1px solid #1e2433', borderRadius: '0.85rem', overflow: 'hidden' }}>
          <div style={{ padding: '0.65rem 1.25rem', borderBottom: '1px solid #1e2433', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Passage</span>
            <span style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 700, textTransform: 'capitalize' }}>{domain}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#2d3748' }}>Difficulty {difficulty}/5</span>
          </div>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <Passage text={passage} />
          </div>
        </div>

        {passageLocked && (
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button onClick={startAnswering}
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.65rem 1.5rem', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>
              Begin Questions →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── ANSWERING ─────────────────────────────────────────────────
  if (phase === 'answering' && currentQ) {
    const qTime = qTimers[qIndex] ?? 0;
    const timerColor = qTime > 120 ? '#ef4444' : qTime > 80 ? '#f97316' : '#4a5568';
    const questionIsCorrect = currentPick === currentQ.correct_label;
    const correctAns = currentQ.answers.find(a => a.is_correct)!;

    const COL_HEIGHT = 'calc(100vh - 44px)';

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem', borderBottom: '1px solid #1e2433', height: 44, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: submitted[i] ? (picks[i] === questions[i]?.correct_label ? '#22c55e' : '#ef4444') : i === qIndex ? '#6366f1' : '#1e2433', border: i === qIndex ? '2px solid #6366f1' : '1px solid #2d3748' }} />
            ))}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#4a5568' }}>Q{qIndex + 1} of 4</span>
          <span style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 700 }}>{TYPE_LABELS[currentQ.original.type] ?? currentQ.original.type}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: timerColor, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
            <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />{fmt(qTime)}
          </span>
          <button onClick={() => setPhase('select')} style={{ background: 'transparent', border: '1px solid #1e2433', borderRadius: '0.35rem', padding: '0.2rem 0.6rem', color: '#334155', cursor: 'pointer', fontSize: '0.65rem' }}>Exit</button>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'flex', height: COL_HEIGHT }}>

          {/* LEFT — passage */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', borderRight: '1px solid #1e2433' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Passage</span>
              <span style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 700, textTransform: 'capitalize' }}>{domain}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#2d3748' }}>{difficulty}/5</span>
            </div>
            <Passage text={passage} />
          </div>

          {/* RIGHT — question + answers */}
          <div style={{ width: 400, flexShrink: 0, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#0a0e17' }}>
            <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.65 }}>{currentQ.original.stem}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {currentQ.answers.map(a => {
                const sel = currentPick === a.label;
                let borderColor = sel ? '#6366f1' : '#1e2433';
                let bg = sel ? 'rgba(99,102,241,0.12)' : 'transparent';
                let textColor = sel ? '#e2e8f0' : '#64748b';
                if (isSubmitted) {
                  if (a.is_correct) { borderColor = '#22c55e'; bg = 'rgba(34,197,94,0.08)'; textColor = '#e2e8f0'; }
                  else if (sel && !a.is_correct) { borderColor = '#ef4444'; bg = 'rgba(239,68,68,0.08)'; textColor = '#e2e8f0'; }
                }
                return (
                  <button key={a.label} onClick={() => !isSubmitted && setPicks(prev => { const n = [...prev]; n[qIndex] = a.label; return n; })}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.65rem 0.9rem', borderRadius: '0.5rem', border: `1px solid ${borderColor}`, background: bg, color: textColor, textAlign: 'left', cursor: isSubmitted ? 'default' : 'pointer', width: '100%' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.8rem', flexShrink: 0, minWidth: 16, color: isSubmitted && a.is_correct ? '#22c55e' : isSubmitted && sel && !a.is_correct ? '#ef4444' : textColor }}>{a.label}.</span>
                    <span style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>{a.text}</span>
                  </button>
                );
              })}
            </div>

            {isSubmitted ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.85rem', borderRadius: '0.5rem', background: questionIsCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${questionIsCorrect ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                  {questionIsCorrect ? <CheckCircle size={14} color="#22c55e" /> : <XCircle size={14} color="#ef4444" />}
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: questionIsCorrect ? '#22c55e' : '#ef4444' }}>{questionIsCorrect ? 'Correct' : `Incorrect · ${correctAns.label} was right`}</span>
                </div>
                <div style={{ padding: '0.6rem 0.85rem', background: '#12161f', borderRadius: '0.45rem', borderLeft: `3px solid ${questionIsCorrect ? '#22c55e55' : '#ef444455'}` }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Why {correctAns.label} is correct</div>
                  <div style={{ fontSize: '0.77rem', color: '#94a3b8', lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{correctAns.text} — </span>
                    {currentQ.original.explanation}
                  </div>
                </div>
                <button onClick={nextQuestion}
                  style={{ alignSelf: 'flex-end', background: qIndex < 3 ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#fff', border: 'none', borderRadius: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {qIndex < 3 ? <>Next <ChevronRight size={13} /></> : <>Results <ChevronRight size={13} /></>}
                </button>
              </div>
            ) : (
              <button onClick={submitQuestion} disabled={!currentPick}
                style={{ background: currentPick ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#1a1f2e', color: currentPick ? '#fff' : '#334155', border: 'none', borderRadius: '0.4rem', padding: '0.55rem 1rem', fontSize: '0.8rem', fontWeight: 700, cursor: currentPick ? 'pointer' : 'not-allowed', alignSelf: 'flex-end' }}>
                Submit Answer
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── REVIEW ────────────────────────────────────────────────────
  if (phase === 'review') {
    const score = picks.filter((p, i) => p === questions[i]?.correct_label).length;
    const totalTime = qTimers.reduce((a, b) => a + b, 0);

    return (
      <div style={{ padding: '1.5rem 1.75rem', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Score card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.25rem 1.5rem', background: '#0a0e17', border: '1px solid #1e2433', borderRadius: '0.85rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: score >= 3 ? '#22c55e' : score >= 2 ? '#eab308' : '#ef4444', lineHeight: 1 }}>{score}/4</div>
            <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: '0.2rem' }}>correct</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.9rem' }}>
              {score === 4 ? 'Excellent comprehension' : score === 3 ? 'Strong — one question tripped you up' : score === 2 ? 'Moderate — re-read explanation carefully' : 'Re-read the passage and review each explanation'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#334155', marginTop: '0.25rem' }}>
              Total time: {fmt(totalTime)} · Avg per question: {fmt(Math.round(totalTime / 4))}
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)', textTransform: 'capitalize' }}>{domain}</span>
          </div>
        </div>

        {/* CARS strategy tip based on score */}
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '0.55rem' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
            <Zap size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Session Tip
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.6 }}>
            {score <= 1
              ? 'Focus on identifying the author\'s main argument before looking at questions. Read the first and last sentence of each paragraph first.'
              : score === 2
              ? 'Watch for extreme language in wrong answers ("always", "never", "only"). CARS answers are usually moderate and well-qualified.'
              : score === 3
              ? 'For the question you missed: trace the specific passage location that supports or contradicts each choice before selecting.'
              : 'Try increasing the difficulty level. MCAT-level passages use implicit theses and multiple competing viewpoints.'}
          </p>
        </div>

        {/* Pattern analysis — shows after enough data */}
        {patternData && patternData.patterns.length > 0 && (
          <div style={{ background: '#0a0e17', border: '1px solid #1e2433', borderRadius: '0.85rem', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #1e2433', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={14} color="#eab308" />
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#e2e8f0' }}>Your CARS Pattern</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#334155' }}>{patternData.totalSessions} questions tracked</span>
            </div>

            {/* Dominant weakness callout */}
            {patternData.dominantWeakness && (
              <div style={{ margin: '0.75rem 1.25rem 0', padding: '0.65rem 0.9rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.5rem' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                  Consistent weak spot · {patternData.dominantWeakness.label} ({patternData.dominantWeakness.accuracy}% accuracy)
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.6 }}>{patternData.dominantWeakness.tip}</p>
              </div>
            )}

            {/* Per-type accuracy bars */}
            <div style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {patternData.patterns.map(p => (
                <div key={p.type} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.72rem', color: p.weak ? '#ef4444' : p.strong ? '#22c55e' : '#64748b', fontWeight: 700, minWidth: 130 }}>{p.label}</span>
                  <div style={{ flex: 1, height: 5, background: '#1e2433', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.accuracy}%`, background: p.weak ? '#ef4444' : p.strong ? '#22c55e' : '#6366f1', borderRadius: 3, transition: 'width 0.6s ease' }} />
                  </div>
                  <span style={{ fontSize: '0.68rem', color: p.weak ? '#ef4444' : p.strong ? '#22c55e' : '#4a5568', fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>{p.accuracy}%</span>
                  <span style={{ fontSize: '0.65rem', color: '#2d3748', minWidth: 28, textAlign: 'right' }}>n={p.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-question breakdown */}
        {questions.map((q, i) => {
          const correct = picks[i] === q.correct_label;
          return (
            <div key={i} style={{ background: '#0a0e17', border: `1px solid ${correct ? '#22c55e22' : '#ef444422'}`, borderRadius: '0.65rem', overflow: 'hidden' }}>
              <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #1a1f2e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {correct ? <CheckCircle size={14} color="#22c55e" /> : <XCircle size={14} color="#ef4444" />}
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6366f1' }}>{TYPE_LABELS[q.original.type]}</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', flex: 1 }}>Q{i + 1}: {q.original.stem.slice(0, 70)}{q.original.stem.length > 70 ? '…' : ''}</span>
                <span style={{ fontSize: '0.65rem', color: '#2d3748', fontVariantNumeric: 'tabular-nums' }}>{fmt(qTimers[i] ?? 0)}</span>
              </div>
              <div style={{ padding: '0.65rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Correct: {q.answers.find(a => a.is_correct)?.text}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.6 }}>
                  {q.original.explanation}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button onClick={() => setPhase('select')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: '1px solid #1e2433', borderRadius: '0.4rem', padding: '0.5rem 0.9rem', color: '#4a5568', fontSize: '0.8rem', cursor: 'pointer' }}>
            <RotateCcw size={13} /> Select Difficulty
          </button>
          <button onClick={handleGenerate} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: '0.4rem', padding: '0.5rem 1.1rem', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            <ChevronRight size={14} /> New Passage
          </button>
        </div>
      </div>
    );
  }

  // ── HISTORY REVIEW ───────────────────────────────────────────
  if (phase === 'history' && historyPassage) {
    const qs: CARSQuestion[] = historyPassage.questions ?? [];
    const toggleQ = (i: number) => setOpenQs(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem', borderBottom: '1px solid #1e2433', flexShrink: 0, height: 44, boxSizing: 'border-box' }}>
          <button onClick={() => setPhase('select')} style={{ background: 'transparent', border: '1px solid #1e2433', borderRadius: '0.4rem', padding: '0.25rem 0.65rem', color: '#4a5568', fontSize: '0.72rem', cursor: 'pointer' }}>← Back</button>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', textTransform: 'capitalize' }}>{historyPassage.topic_domain}</span>
          <span style={{ fontSize: '0.68rem', color: '#334155' }}>Difficulty {historyPassage.difficulty_level}/5 · {new Date(historyPassage.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          {historyPassage.score !== undefined && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: historyPassage.score >= 3 ? '#22c55e' : historyPassage.score >= 2 ? '#eab308' : '#ef4444' }}>{historyPassage.score}/4 correct</span>}
        </div>

        {/* Two-column body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* LEFT — passage */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', borderRight: '1px solid #1e2433' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem' }}>Passage</div>
            <Passage text={historyPassage.passage_text} />
          </div>

          {/* RIGHT — accordion questions */}
          <div style={{ width: 460, flexShrink: 0, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: '#0a0e17' }}>
            {qs.map((q, i) => {
              const isOpen = openQs.has(i);
              const options = [
                { label: 'A', text: q.correct, correct: true },
                { label: 'B', text: q.wrong_a, correct: false },
                { label: 'C', text: q.wrong_b, correct: false },
                { label: 'D', text: q.wrong_c, correct: false },
              ];
              return (
                <div key={i} style={{ border: '1px solid #1e2433', borderRadius: '0.65rem', overflow: 'hidden' }}>
                  {/* Accordion header */}
                  <button onClick={() => toggleQ(i)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.9rem', background: '#0f1117', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#6366f1', flexShrink: 0 }}>Q{i + 1}</span>
                    <span style={{ fontSize: '0.62rem', color: '#334155', fontWeight: 700, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{TYPE_LABELS[q.type] ?? q.type}</span>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', flex: 1, lineHeight: 1.4 }}>{q.stem}</span>
                    <span style={{ color: '#334155', fontSize: '0.75rem', flexShrink: 0, display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
                  </button>

                  {/* Accordion body */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid #1e2433', padding: '0.85rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {options.map(opt => (
                        <div key={opt.label} style={{
                          display: 'flex', gap: '0.6rem', padding: '0.55rem 0.8rem',
                          background: opt.correct ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.04)',
                          border: `1px solid ${opt.correct ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.14)'}`,
                          borderRadius: '0.45rem', alignItems: 'flex-start',
                        }}>
                          <span style={{ fontWeight: 800, fontSize: '0.78rem', flexShrink: 0, color: opt.correct ? '#22c55e' : '#ef4444', minWidth: 16 }}>{opt.label}.</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', color: opt.correct ? '#e2e8f0' : '#64748b', lineHeight: 1.5 }}>{opt.text}</div>
                            <div style={{ fontSize: '0.63rem', fontWeight: 700, color: opt.correct ? '#22c55e' : '#ef444488', marginTop: '0.18rem' }}>
                              {opt.correct ? '✓ Correct answer' : '✗ Incorrect'}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: '0.2rem', padding: '0.65rem 0.8rem', background: '#0f1117', borderRadius: '0.4rem', borderLeft: '3px solid #6366f140' }}>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>Explanation</div>
                        <div style={{ fontSize: '0.76rem', color: '#94a3b8', lineHeight: 1.72 }}>{q.explanation}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <button onClick={() => setPhase('select')} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: '1px solid #1e2433', borderRadius: '0.4rem', padding: '0.4rem 0.8rem', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', marginTop: '0.25rem' }}>
              <RotateCcw size={12} /> Back to CARS
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
