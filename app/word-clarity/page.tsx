'use client';

import { useState, useEffect } from "react";
import { Search, CheckCircle, Clock, ChevronDown, ChevronUp, Sparkles, Lightbulb } from "lucide-react";
import { createWordClaritySession, markWordCleared, getWordClaritySessions } from "@/lib/db";
import type { WordClaritySession } from "@/lib/db";

interface AIResult {
  definitions: Definition[];
  eli5: string;
  mcat_tip: string;
}

interface ClearedWord {
  word: string;
  clearedAt: string;
  context: string;
}

interface Definition {
  sense: string;
  text: string;
}

const MOCK_DEFINITIONS: Record<string, Definition[]> = {
  "osmosis": [
    { sense: "Biology / Chemistry", text: "The spontaneous net movement of solvent molecules through a semipermeable membrane from a region of lower solute concentration to a region of higher solute concentration, reducing the free energy of the system." },
    { sense: "Colloquial", text: "The gradual, often unconscious process of assimilation or absorption of ideas or knowledge." },
  ],
  "depolarization": [
    { sense: "Physiology", text: "A change in a cell's membrane potential that makes it more positive (less negative). In neurons, depolarization occurs when sodium ions rush into the cell, bringing the membrane potential toward the threshold for an action potential." },
  ],
  "equilibrium": [
    { sense: "Chemistry", text: "A state in which the rate of the forward reaction equals the rate of the reverse reaction, resulting in no net change in the concentrations of reactants and products." },
    { sense: "Physics / Mechanics", text: "A condition in which all forces or influences are balanced; a body is in equilibrium when the net force and net torque acting on it are both zero." },
    { sense: "Economics", text: "A market state where supply equals demand, resulting in a stable price." },
  ],
};

function getMockDefinition(word: string): Definition[] {
  const lower = word.toLowerCase().trim();
  return (
    MOCK_DEFINITIONS[lower] ?? [
      {
        sense: "General",
        text: `Definition for "${word}" not found in local database. In a real session, this would query an AI model for a precise, MCAT-relevant definition.`,
      },
    ]
  );
}

export default function WordClarityPage() {
  const [inputWord, setInputWord] = useState("");
  const [activeWord, setActiveWord] = useState("");
  const [context, setContext] = useState("");
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [eli5, setEli5] = useState('');
  const [mcatTip, setMcatTip] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [sentenceCount, setSentenceCount] = useState(5);
  const [sentences, setSentences] = useState<string[]>([]);
  const [defSentences, setDefSentences] = useState<Record<number, string>>({});
  const [cleared, setCleared] = useState<ClearedWord[]>([]);
  const [isCleared, setIsCleared] = useState(false);
  const [showCleared, setShowCleared] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    getWordClaritySessions()
      .then(sessions => {
        const clearedSessions = sessions.filter(s => s.is_cleared);
        setCleared(clearedSessions.map(s => ({
          word: s.word,
          clearedAt: s.cleared_at
            ? new Date(s.cleared_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : "",
          context: s.context ?? "",
        })));
      })
      .catch(err => console.error("Failed to load word clarity sessions:", err));
  }, []);

  async function handleSearch() {
    const word = inputWord.trim();
    if (!word) return;
    setActiveWord(word);
    setDefinitions([]);
    setEli5('');
    setMcatTip('');
    setAiError('');
    setSentences(Array(sentenceCount).fill(""));
    setDefSentences({});
    setIsCleared(false);
    setContext("");
    setActiveSessionId(null);
    setAiLoading(true);

    try {
      const res = await fetch('/api/word-clarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, context }),
      });
      const data: AIResult = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'AI failed');
      setDefinitions(data.definitions);
      setEli5(data.eli5);
      setMcatTip(data.mcat_tip);

      const session = await createWordClaritySession({
        word,
        context: context || null,
        definitions: data.definitions.map(d => ({ meaning: d.text, partOfSpeech: d.sense })),
        sentences: null,
        is_cleared: false,
        cleared_at: null,
      });
      setActiveSessionId(session.id);
    } catch (err) {
      setAiError(String(err));
      // fallback to mock
      const defs = getMockDefinition(word);
      setDefinitions(defs);
    } finally {
      setAiLoading(false);
    }
  }

  function handleSentenceCountChange(n: number) {
    const clamped = Math.max(1, Math.min(20, n));
    setSentenceCount(clamped);
    setSentences(Array(clamped).fill(""));
  }

  function updateSentence(i: number, val: string) {
    setSentences(prev => prev.map((s, idx) => (idx === i ? val : s)));
  }

  function updateDefSentence(i: number, val: string) {
    setDefSentences(prev => ({ ...prev, [i]: val }));
  }

  async function handleMarkCleared() {
    if (!activeWord) return;
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    setCleared(prev => [{ word: activeWord, clearedAt: timestamp, context }, ...prev]);
    setIsCleared(true);

    if (activeSessionId) {
      try {
        await markWordCleared(activeSessionId, sentences.filter(Boolean));
      } catch (err) {
        console.error("Failed to mark word cleared:", err);
      }
    }
  }

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 820, margin: "0 auto" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#e2e8f0", letterSpacing: "-0.02em" }}>
          Word Clarity
        </h1>
        <p style={{ margin: "0.4rem 0 0", color: "#8899aa", fontSize: "0.875rem" }}>
          Encounter a term you don&apos;t fully own? Define it, contextualize it, and write sentences until it sticks.
        </p>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "2rem" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search
            size={16}
            color="#7a8fa3"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input-base"
            style={{ paddingLeft: "2.2rem" }}
            placeholder="Enter a word or term you don't understand..."
            value={inputWord}
            onChange={e => setInputWord(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
        </div>
        <button
          onClick={handleSearch}
          style={{
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: "0.5rem",
            padding: "0 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Look Up
        </button>
      </div>

      {/* Try suggestions if nothing searched yet */}
      {!activeWord && (
        <div
          style={{
            background: "#1e2433",
            border: "1px solid #2d3748",
            borderRadius: "0.75rem",
            padding: "1.5rem",
            marginBottom: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "0.875rem", color: "#8899aa", marginBottom: "0.75rem" }}>Try one of these:</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            {["osmosis", "depolarization", "equilibrium"].map(w => (
              <button
                key={w}
                onClick={() => { setInputWord(w); }}
                style={{
                  background: "rgba(99,102,241,0.12)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  color: "#818cf8",
                  borderRadius: 999,
                  padding: "0.3rem 0.85rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active word content */}
      {activeWord && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Word header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#e2e8f0" }}>{activeWord}</h2>
              <div style={{ fontSize: "0.75rem", color: "#8899aa", marginTop: 2 }}>
                {definitions.length} definition{definitions.length !== 1 ? "s" : ""} found
              </div>
            </div>
            {isCleared ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "rgba(34,197,94,0.12)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  color: "#22c55e",
                  borderRadius: 999,
                  padding: "0.35rem 0.9rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                }}
              >
                <CheckCircle size={14} />
                Cleared
              </span>
            ) : (
              <button
                onClick={handleMarkCleared}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "rgba(34,197,94,0.12)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  color: "#22c55e",
                  borderRadius: "0.5rem",
                  padding: "0.4rem 1rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              >
                <CheckCircle size={14} />
                Mark as Cleared
              </button>
            )}
          </div>

          {/* Context field */}
          <div
            style={{
              background: "#1e2433",
              border: "1px solid #2d3748",
              borderRadius: "0.75rem",
              padding: "1.1rem 1.25rem",
            }}
          >
            <label style={labelStyle}>What subject/context did you encounter this in?</label>
            <input
              className="input-base"
              placeholder="e.g. B/B — renal physiology section on nephron function"
              value={context}
              onChange={e => setContext(e.target.value)}
            />
          </div>

          {/* Definitions */}
          <div
            style={{
              background: "#1e2433",
              border: "1px solid #2d3748",
              borderRadius: "0.75rem",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #2d3748" }}>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0" }}>Definition{definitions.length > 1 ? "s" : ""}</span>
            </div>
            {aiLoading && (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "#7a8fa3", fontSize: "0.82rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                <span style={{ width: 14, height: 14, border: "2px solid #2d3748", borderTop: "2px solid #6366f1", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                Asking Claude…
              </div>
            )}
            {aiError && (
              <div style={{ padding: "0.75rem 1.25rem", fontSize: "0.78rem", color: "#f97316" }}>Using local definition (AI unavailable)</div>
            )}
            {definitions.map((def, i) => (
              <div
                key={i}
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: i < definitions.length - 1 ? "1px solid #2d3748" : "none",
                }}
              >
                <div
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: "#6366f1",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: "0.4rem",
                  }}
                >
                  {def.sense}
                </div>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#e2e8f0", lineHeight: 1.7 }}>{def.text}</p>
              </div>
            ))}
          </div>

          {/* ELI5 */}
          {eli5 && (
            <div style={{ background: "#1e2433", border: "1px solid #2d3748", borderRadius: "0.75rem", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #2d3748", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Sparkles size={15} color="#eab308" />
                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0" }}>Explain Like I&apos;m 5</span>
              </div>
              <div style={{ padding: "1rem 1.25rem" }}>
                <p style={{ margin: 0, fontSize: "0.925rem", color: "#fde68a", lineHeight: 1.75, fontStyle: "italic" }}>&ldquo;{eli5}&rdquo;</p>
              </div>
              {mcatTip && (
                <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid #2d3748", display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                  <Lightbulb size={13} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.6 }}><span style={{ fontWeight: 700, color: "#6366f1" }}>MCAT tip: </span>{mcatTip}</p>
                </div>
              )}
            </div>
          )}

          {/* Sentence practice */}
          <div
            style={{
              background: "#1e2433",
              border: "1px solid #2d3748",
              borderRadius: "0.75rem",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1rem 1.25rem",
                borderBottom: "1px solid #2d3748",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0" }}>Sentence Practice</div>
                <div style={{ fontSize: "0.75rem", color: "#8899aa", marginTop: 2 }}>
                  Write your own sentences to build encoding depth.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <label style={{ fontSize: "0.78rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
                  How many sentences?
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={sentenceCount}
                  onChange={e => handleSentenceCountChange(parseInt(e.target.value) || 1)}
                  style={{
                    background: "#141820",
                    border: "1px solid #2d3748",
                    borderRadius: "0.35rem",
                    color: "#e2e8f0",
                    padding: "0.3rem 0.5rem",
                    width: 56,
                    fontSize: "0.875rem",
                    textAlign: "center",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div style={{ padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {sentences.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: "#7a8fa3",
                      marginTop: "0.65rem",
                      minWidth: 20,
                      textAlign: "right",
                    }}
                  >
                    {i + 1}.
                  </span>
                  <textarea
                    className="input-base"
                    rows={2}
                    placeholder={`Write a sentence using "${activeWord}"...`}
                    value={s}
                    onChange={e => updateSentence(i, e.target.value)}
                    style={{ resize: "vertical", lineHeight: 1.5 }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Check Alternatives — only show if multiple definitions */}
          {definitions.length > 1 && (
            <div
              style={{
                background: "#1e2433",
                border: "1px solid #2d3748",
                borderRadius: "0.75rem",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #2d3748" }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0" }}>Check Alternatives</div>
                <div style={{ fontSize: "0.75rem", color: "#8899aa", marginTop: 2 }}>
                  This word has {definitions.length} distinct meanings — write a sentence per definition to disambiguate.
                </div>
              </div>
              <div style={{ padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {definitions.map((def, i) => (
                  <div key={i}>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "#6366f1",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: "0.4rem",
                      }}
                    >
                      Definition {i + 1}: {def.sense}
                    </div>
                    <textarea
                      className="input-base"
                      rows={2}
                      placeholder={`Write a sentence that clearly means "${activeWord}" in the "${def.sense}" sense...`}
                      value={defSentences[i] ?? ""}
                      onChange={e => updateDefSentence(i, e.target.value)}
                      style={{ resize: "vertical", lineHeight: 1.5 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cleared words list */}
      {cleared.length > 0 && (
        <div
          style={{
            marginTop: "2.5rem",
            background: "#1e2433",
            border: "1px solid #2d3748",
            borderRadius: "0.75rem",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setShowCleared(p => !p)}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              padding: "1rem 1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              borderBottom: showCleared ? "1px solid #2d3748" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CheckCircle size={16} color="#22c55e" />
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0" }}>
                Cleared Words ({cleared.length})
              </span>
            </div>
            {showCleared ? <ChevronUp size={16} color="#8899aa" /> : <ChevronDown size={16} color="#8899aa" />}
          </button>

          {showCleared && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {cleared.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: "0.75rem 1.25rem",
                    borderBottom: i < cleared.length - 1 ? "1px solid #2d3748" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <CheckCircle size={14} color="#22c55e" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#e2e8f0" }}>{item.word}</div>
                      {item.context && (
                        <div style={{ fontSize: "0.75rem", color: "#8899aa", marginTop: 2 }}>{item.context}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#7a8fa3", whiteSpace: "nowrap", flexShrink: 0 }}>
                    <Clock size={12} />
                    <span style={{ fontSize: "0.72rem" }}>{item.clearedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: "0.5rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
