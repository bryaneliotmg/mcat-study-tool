'use client';

import { useState, useRef } from "react";
import { Upload, Type, Clipboard, Sparkles, CheckCircle, Brain, Zap, Eye, Timer, AlertTriangle } from "lucide-react";
import type { Subject as DBSubject } from "@/lib/db";

type Tab = "type" | "photo" | "paste";
type Subject = DBSubject | "";

const SUBJECTS: Subject[] = ["B/B", "C/B", "P/S", "C/P"];

const SUBJECT_META: Record<string, { color: string; bg: string }> = {
  "B/B": { color: "#22d3ee", bg: "rgba(6,182,212,0.15)" },
  "C/B": { color: "#818cf8", bg: "rgba(99,102,241,0.15)" },
  "P/S": { color: "#a78bfa", bg: "rgba(139,92,246,0.15)" },
  "C/P": { color: "#2dd4bf", bg: "rgba(20,184,166,0.15)" },
};

const FAILURE_META: Record<string, { color: string; icon: React.ReactNode; label: string; tip: string }> = {
  KNOWLEDGE_GAP:   { color: "#ef4444", icon: <Brain size={15} />,         label: "Knowledge Gap",   tip: "You need to learn this concept — open the Kaplan chapter referenced above." },
  REASONING_GAP:   { color: "#f97316", icon: <Zap size={15} />,           label: "Reasoning Gap",   tip: "You know the material but applied it incorrectly. Work more practice problems on this topic." },
  PASSAGE_MISREAD: { color: "#eab308", icon: <Eye size={15} />,           label: "Passage Misread", tip: "Your reasoning was sound — slow down and re-read key passage details before answering." },
  TIME_PRESSURE:   { color: "#a78bfa", icon: <Timer size={15} />,         label: "Time Pressure",   tip: "Incomplete reasoning under time pressure. Practice timed sets to build speed." },
  CARELESS:        { color: "#64748b", icon: <AlertTriangle size={15} />, label: "Careless Error",  tip: "You knew the answer. Double-check before submitting next time." },
};

type AnalysisResult = {
  concept_name: string;
  aamc_category: string;
  kaplan_book?: string;
  kaplan_chapter?: string;
  kaplan_section?: string;
  gap_analysis: string;
  priority: string;
};

type ClassificationResult = {
  failure_type: string;
  explanation: string;
  recommended_action: string;
};

export default function AddQuestionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("type");
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState<Subject>("");
  const [myAnswer, setMyAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [extractedConcept, setExtractedConcept] = useState("");
  const [extracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    const rawText =
      activeTab === "type" ? question.trim() :
      activeTab === "paste" ? pasteText.trim() :
      uploadedFile?.name ?? "";

    if (!rawText || !subject) {
      setSubmitError("Please enter a question and select a subject.");
      return;
    }

    setSubmitError("");
    setAnalysis(null);
    setClassification(null);
    setSubmitting(true);

    try {
      // Step 1: Analyze the question → concept + Kaplan reference
      const analyzeRes = await fetch("/api/analyze-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: rawText,
          subject,
          notes: [
            myAnswer.trim() ? `My answer: ${myAnswer.trim()}` : null,
            reasoning.trim() ? `My reasoning: ${reasoning.trim()}` : null,
          ].filter(Boolean).join(" | ") || null,
        }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error ?? "Analysis failed");
      setAnalysis(analyzeData.analysis);

      // Step 2: Classify failure if she gave her answer + reasoning
      if (myAnswer.trim() && reasoning.trim()) {
        const classifyRes = await fetch("/api/classify-failure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: analyzeData.question?.id ?? null,
            concept_name: analyzeData.analysis.concept_name,
            correct_answer: "unknown — she marked it missed",
            student_answer: myAnswer.trim(),
            reasoning_text: reasoning.trim(),
            question_type: "application",
          }),
        });
        const classifyData = await classifyRes.json();
        if (classifyRes.ok) setClassification(classifyData);
      }

      // Reset form
      setQuestion(""); setSubject(""); setMyAnswer(""); setReasoning("");
      setPasteText(""); setExtractedConcept(""); setUploadedFile(null);
      setActiveTab("type");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } catch (err) {
      setSubmitError("Failed to analyze question. Please try again.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleExtract() {
    if (!pasteText.trim()) return;
    setExtractedConcept("Ready — click Analyze & Add to Queue to process.");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) setUploadedFile(file);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "type",  label: "Type",  icon: <Type size={15} /> },
    { id: "photo", label: "Photo", icon: <Upload size={15} /> },
    { id: "paste", label: "Paste", icon: <Clipboard size={15} /> },
  ];

  const fm = classification ? FAILURE_META[classification.failure_type] : null;

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#e2e8f0", letterSpacing: "-0.02em" }}>
          Add Missed Question
        </h1>
        <p style={{ margin: "0.4rem 0 0", color: "#64748b", fontSize: "0.875rem" }}>
          Log a question you missed. Claude will identify the concept, map it to Kaplan, and diagnose exactly why you got it wrong.
        </p>
      </div>

      <div style={{ background: "#1e2433", border: "1px solid #2d3748", borderRadius: "0.85rem", overflow: "hidden" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid #2d3748" }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", padding: "0.85rem 1rem", background: "transparent", border: "none", borderBottom: activeTab === tab.id ? "2px solid #6366f1" : "2px solid transparent", color: activeTab === tab.id ? "#e2e8f0" : "#64748b", fontWeight: activeTab === tab.id ? 700 : 400, fontSize: "0.875rem", cursor: "pointer", transition: "all 0.15s" }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Subject */}
          <div>
            <label style={labelStyle}>Subject</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {SUBJECTS.map(s => {
                const meta = SUBJECT_META[s];
                const selected = subject === s;
                return (
                  <button key={s} onClick={() => setSubject(selected ? "" : s)}
                    style={{ padding: "0.35rem 0.9rem", borderRadius: 999, border: `1px solid ${selected ? meta.color : "#2d3748"}`, background: selected ? meta.bg : "transparent", color: selected ? meta.color : "#64748b", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", transition: "all 0.15s" }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TYPE TAB */}
          {activeTab === "type" && (
            <div>
              <label style={labelStyle}>Question or Concept</label>
              <textarea className="input-base" rows={5}
                placeholder="Type or paste the question you missed, or the concept that tripped you up..."
                value={question} onChange={e => setQuestion(e.target.value)}
                style={{ resize: "vertical", lineHeight: 1.6 }} />
            </div>
          )}

          {/* PHOTO TAB */}
          {activeTab === "photo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ border: `2px dashed ${dragOver ? "#6366f1" : "#2d3748"}`, borderRadius: "0.75rem", padding: "3rem 2rem", textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.02)", transition: "all 0.15s" }}>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => setUploadedFile(e.target.files?.[0] ?? null)} />
                {uploadedFile ? (
                  <div>
                    <CheckCircle size={32} color="#22c55e" style={{ marginBottom: "0.75rem" }} />
                    <div style={{ color: "#22c55e", fontWeight: 700, fontSize: "0.9rem" }}>{uploadedFile.name}</div>
                    <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.25rem" }}>{(uploadedFile.size / 1024).toFixed(0)} KB · Click to replace</div>
                  </div>
                ) : (
                  <div>
                    <Upload size={32} color="#4a5568" style={{ marginBottom: "0.75rem" }} />
                    <div style={{ color: "#94a3b8", fontWeight: 600, fontSize: "0.9rem" }}>Drop an image here or click to upload</div>
                    <div style={{ color: "#4a5568", fontSize: "0.78rem", marginTop: "0.35rem" }}>PNG, JPG, HEIC · Photo of your test, textbook, or notes</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PASTE TAB */}
          {activeTab === "paste" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>Paste Question Text</label>
                <textarea className="input-base" rows={7}
                  placeholder="Paste the full question and answer choices. Include the explanation if available."
                  value={pasteText} onChange={e => { setPasteText(e.target.value); setExtractedConcept(""); }}
                  style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }} />
              </div>
              <button onClick={handleExtract} disabled={!pasteText.trim() || extracting}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", alignSelf: "flex-start", background: pasteText.trim() ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)", color: pasteText.trim() ? "#818cf8" : "#4a5568", border: `1px solid ${pasteText.trim() ? "rgba(99,102,241,0.4)" : "#2d3748"}`, borderRadius: "0.45rem", padding: "0.45rem 1rem", fontSize: "0.8rem", fontWeight: 700, cursor: pasteText.trim() ? "pointer" : "not-allowed", transition: "all 0.15s" }}>
                <Sparkles size={14} />{extracting ? "Extracting..." : "Preview"}
              </button>
              {extractedConcept && (
                <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "0.5rem", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <CheckCircle size={16} color="#22c55e" />
                  <span style={{ fontSize: "0.875rem", color: "#e2e8f0", fontWeight: 600 }}>{extractedConcept}</span>
                </div>
              )}
            </div>
          )}

          {/* ── WHAT DID YOU ANSWER? ── always visible ── */}
          <div style={{ borderTop: "1px solid #2d3748", paddingTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Why You Got It Wrong
              <span style={{ color: "#334155", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> — helps Claude diagnose your mistake</span>
            </div>

            <div>
              <label style={labelStyle}>What answer did you choose?</label>
              <input
                className="input-base"
                type="text"
                placeholder="e.g. A — mitochondria produce ATP via substrate-level phosphorylation"
                value={myAnswer}
                onChange={e => setMyAnswer(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={labelStyle}>What was your reasoning?</label>
              <textarea className="input-base" rows={3}
                placeholder="Walk through your thinking — even if it was wrong. The more detail, the more specific the feedback."
                value={reasoning} onChange={e => setReasoning(e.target.value)}
                style={{ resize: "vertical", lineHeight: 1.6 }} />
            </div>
          </div>

          {/* Submit */}
          <div style={{ borderTop: "1px solid #2d3748", paddingTop: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.78rem", color: submitError ? "#ef4444" : "#4a5568" }}>
              {submitError || "Added to your study queue and diagnosed immediately."}
            </span>
            <button onClick={handleSubmit} disabled={submitting}
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", border: "none", borderRadius: "0.5rem", padding: "0.6rem 1.4rem", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", opacity: submitting ? 0.7 : 1, transition: "opacity 0.15s" }}>
              <Sparkles size={15} />
              {submitting ? "Analyzing..." : "Analyze & Add to Queue"}
            </button>
          </div>
        </div>
      </div>

      {showToast && <div className="toast">✓ Concept added to your study queue!</div>}

      {/* Results card */}
      {analysis && (
        <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>

          {/* Failure classification — most important, shown first */}
          {classification && fm && (
            <div style={{ padding: "1rem 1.1rem", borderRadius: "0.75rem", background: `${fm.color}18`, border: `1px solid ${fm.color}44` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span style={{ color: fm.color }}>{fm.icon}</span>
                <span style={{ fontWeight: 800, color: fm.color, fontSize: "0.9rem" }}>{fm.label}</span>
              </div>
              <p style={{ margin: "0 0 0.4rem", fontSize: "0.85rem", color: "#e2e8f0", lineHeight: 1.6 }}>
                {classification.explanation}
              </p>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.55, fontStyle: "italic" }}>
                → {fm.tip}
              </p>
              <div style={{ fontSize: "0.8rem", color: fm.color, fontWeight: 700, background: `${fm.color}22`, borderRadius: "0.4rem", padding: "0.4rem 0.75rem", display: "inline-block" }}>
                Next step: {classification.recommended_action}
              </div>
            </div>
          )}

          {/* Concept + Kaplan reference */}
          <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "0.75rem", padding: "1.1rem 1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <Brain size={15} color="#818cf8" />
              <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#818cf8" }}>Concept Analysis</span>
              <span style={{ marginLeft: "auto", fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                background: analysis.priority === "critical" ? "rgba(239,68,68,0.2)" : analysis.priority === "high" ? "rgba(249,115,22,0.2)" : analysis.priority === "medium" ? "rgba(234,179,8,0.2)" : "rgba(34,197,94,0.2)",
                color: analysis.priority === "critical" ? "#ef4444" : analysis.priority === "high" ? "#f97316" : analysis.priority === "medium" ? "#eab308" : "#22c55e",
                textTransform: "capitalize" }}>
                {analysis.priority} priority
              </span>
            </div>
            <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: "0.95rem", marginBottom: "0.25rem" }}>
              {analysis.concept_name}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#6366f1", fontWeight: 700, marginBottom: "0.65rem" }}>
              AAMC {analysis.aamc_category}
            </div>
            <p style={{ margin: "0 0 0.85rem", fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.65 }}>
              {analysis.gap_analysis}
            </p>
            {(analysis.kaplan_chapter) && (
              <div style={{ background: "rgba(99,102,241,0.12)", borderRadius: "0.45rem", padding: "0.5rem 0.75rem" }}>
                <div style={{ fontSize: "0.68rem", color: "#6366f1", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem" }}>Study From</div>
                <div style={{ fontSize: "0.82rem", color: "#e2e8f0", fontWeight: 700 }}>{analysis.kaplan_chapter}</div>
                {analysis.kaplan_section && (
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.15rem" }}>§ {analysis.kaplan_section}</div>
                )}
              </div>
            )}
          </div>
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
