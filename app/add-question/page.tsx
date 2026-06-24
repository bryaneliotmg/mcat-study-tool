'use client';

import { useState, useRef } from "react";
import { Upload, Type, Clipboard, Sparkles, CheckCircle } from "lucide-react";
import { createQuestion } from "@/lib/db";
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

export default function AddQuestionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("type");
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState<Subject>("");
  const [notes, setNotes] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [extractedConcept, setExtractedConcept] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    const rawText =
      activeTab === "type" ? question.trim() :
      activeTab === "paste" ? pasteText.trim() :
      uploadedFile?.name ?? "";

    setSubmitError("");
    setSubmitting(true);
    try {
      await createQuestion({
        raw_text: rawText,
        input_method: activeTab === "photo" ? "photo" : activeTab === "paste" ? "paste" : "type",
        subject: subject !== "" ? (subject as DBSubject) : null,
        notes: notes.trim() || null,
        concept_id: null,
      });
      // Reset form
      setQuestion("");
      setSubject("");
      setNotes("");
      setPasteText("");
      setExtractedConcept("");
      setUploadedFile(null);
      setActiveTab("type");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      setSubmitError("Failed to save question. Please try again.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleExtract() {
    if (!pasteText.trim()) return;
    setExtracting(true);
    setTimeout(() => {
      setExtractedConcept("Oxidative Phosphorylation — Electron Transport Chain");
      setExtracting(false);
    }, 1200);
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

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#e2e8f0", letterSpacing: "-0.02em" }}>
          Add Missed Question
        </h1>
        <p style={{ margin: "0.4rem 0 0", color: "#64748b", fontSize: "0.875rem" }}>
          Log a concept you missed so it gets added to your study queue.
        </p>
      </div>

      <div
        style={{
          background: "#1e2433",
          border: "1px solid #2d3748",
          borderRadius: "0.85rem",
          overflow: "hidden",
        }}
      >
        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid #2d3748" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                padding: "0.85rem 1rem",
                background: "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #6366f1" : "2px solid transparent",
                color: activeTab === tab.id ? "#e2e8f0" : "#64748b",
                fontWeight: activeTab === tab.id ? 700 : 400,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "1.5rem" }}>
          {/* Subject selector — shown on all tabs */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#94a3b8", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Subject
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {SUBJECTS.map(s => {
                const meta = SUBJECT_META[s];
                const selected = subject === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSubject(selected ? "" : s)}
                    style={{
                      padding: "0.35rem 0.9rem",
                      borderRadius: 999,
                      border: `1px solid ${selected ? meta.color : "#2d3748"}`,
                      background: selected ? meta.bg : "transparent",
                      color: selected ? meta.color : "#64748b",
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TYPE TAB */}
          {activeTab === "type" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              <div>
                <label style={labelStyle}>Question or Concept</label>
                <textarea
                  className="input-base"
                  rows={5}
                  placeholder="Type or paste the question you missed, or the concept that tripped you up..."
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  style={{ resize: "vertical", lineHeight: 1.6 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea
                  className="input-base"
                  rows={3}
                  placeholder="What specifically confused you? Any partial understanding to note?"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ resize: "vertical", lineHeight: 1.6 }}
                />
              </div>
            </div>
          )}

          {/* PHOTO TAB */}
          {activeTab === "photo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "#6366f1" : "#2d3748"}`,
                  borderRadius: "0.75rem",
                  padding: "3rem 2rem",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.02)",
                  transition: "all 0.15s",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => setUploadedFile(e.target.files?.[0] ?? null)}
                />
                {uploadedFile ? (
                  <div>
                    <CheckCircle size={32} color="#22c55e" style={{ marginBottom: "0.75rem" }} />
                    <div style={{ color: "#22c55e", fontWeight: 700, fontSize: "0.9rem" }}>
                      {uploadedFile.name}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                      {(uploadedFile.size / 1024).toFixed(0)} KB · Click to replace
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload size={32} color="#4a5568" style={{ marginBottom: "0.75rem" }} />
                    <div style={{ color: "#94a3b8", fontWeight: 600, fontSize: "0.9rem" }}>
                      Drop an image here or click to upload
                    </div>
                    <div style={{ color: "#4a5568", fontSize: "0.78rem", marginTop: "0.35rem" }}>
                      PNG, JPG, HEIC supported · Photo of your test, textbook, or notes
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea
                  className="input-base"
                  rows={3}
                  placeholder="What tripped you up on this question?"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ resize: "vertical", lineHeight: 1.6 }}
                />
              </div>
            </div>
          )}

          {/* PASTE TAB */}
          {activeTab === "paste" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              <div>
                <label style={labelStyle}>Paste Question Text</label>
                <textarea
                  className="input-base"
                  rows={8}
                  placeholder="Paste the full question, answer choices, and any explanation. The more context, the better the concept extraction."
                  value={pasteText}
                  onChange={e => { setPasteText(e.target.value); setExtractedConcept(""); }}
                  style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }}
                />
              </div>

              <button
                onClick={handleExtract}
                disabled={!pasteText.trim() || extracting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  alignSelf: "flex-start",
                  background: pasteText.trim() ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)",
                  color: pasteText.trim() ? "#818cf8" : "#4a5568",
                  border: `1px solid ${pasteText.trim() ? "rgba(99,102,241,0.4)" : "#2d3748"}`,
                  borderRadius: "0.45rem",
                  padding: "0.45rem 1rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: pasteText.trim() ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                }}
              >
                <Sparkles size={14} />
                {extracting ? "Extracting..." : "Extract Concept"}
              </button>

              {extractedConcept && (
                <div
                  style={{
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    borderRadius: "0.5rem",
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  <CheckCircle size={16} color="#22c55e" />
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "#22c55e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Concept Extracted</div>
                    <div style={{ fontSize: "0.875rem", color: "#e2e8f0", fontWeight: 600 }}>{extractedConcept}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div style={{ marginTop: "1.5rem", borderTop: "1px solid #2d3748", paddingTop: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.78rem", color: submitError ? "#ef4444" : "#4a5568" }}>
              {submitError || "Will be added to your study queue and ranked by priority."}
            </span>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.6rem 1.4rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <Sparkles size={15} />
              {submitting ? "Saving..." : "Analyze & Add to Queue"}
            </button>
          </div>
        </div>
      </div>

      {showToast && (
        <div className="toast">
          ✓ Concept added to your study queue!
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
