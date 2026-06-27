'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, MessageCircle, Loader2 } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; text: string };

type ContextMenu = { x: number; y: number; text: string } | null;

export default function ContextualChat() {
  const [open, setOpen]               = useState(false);
  const [context, setContext]         = useState<string>('');
  const [contextLabel, setContextLabel] = useState<string>('');
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [ctxMenu, setCtxMenu]         = useState<ContextMenu>(null);
  const [selTooltip, setSelTooltip]   = useState<{ x: number; y: number; text: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  function openWithContext(text: string, label?: string) {
    setContext(text);
    setContextLabel(label ?? text.slice(0, 60) + (text.length > 60 ? '…' : ''));
    setMessages([]);
    setOpen(true);
  }

  // ── Right-click context menu ──────────────────────────────────────────────
  const handleContextMenu = useCallback((e: MouseEvent) => {
    const selection = window.getSelection()?.toString().trim();
    const target    = e.target as HTMLElement;
    const text      = selection || target.innerText?.trim() || target.getAttribute('aria-label') || '';
    if (!text) return;

    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, text });
    setSelTooltip(null);
  }, []);

  // ── Text selection tooltip ────────────────────────────────────────────────
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (ctxMenu) return;
    const selection = window.getSelection()?.toString().trim();
    if (!selection || selection.length < 3) { setSelTooltip(null); return; }
    setSelTooltip({ x: e.clientX, y: e.clientY, text: selection });
  }, [ctxMenu]);

  // ── Dismiss menus on outside click ───────────────────────────────────────
  const handleClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-ctx-menu]') && !target.closest('[data-sel-tooltip]')) {
      setCtxMenu(null);
      setSelTooltip(null);
    }
  }, []);

  // ── Escape closes drawer ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); setCtxMenu(null); setSelTooltip(null); }
  }, []);

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleContextMenu, handleMouseUp, handleClick, handleKeyDown]);

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', text: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, context, history: messages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', text: data.reply ?? 'Sorry, something went wrong.' }]);
    } catch {
      setMessages([...newMessages, { role: 'assistant', text: 'Connection error — please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleInputKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // ── Clamp menu position so it stays on screen ─────────────────────────────
  function clampedPos(x: number, y: number, w = 200, h = 60) {
    return {
      left: Math.min(x, window.innerWidth  - w - 12),
      top:  Math.min(y, window.innerHeight - h - 12),
    };
  }

  return (
    <>
      {/* ── Floating chat button ── */}
      {!open && (
        <button
          onClick={() => { setContext(''); setContextLabel(''); setMessages([]); setOpen(true); }}
          title="MCAT Tutor"
          className="contextual-chat-btn"
          style={{
            position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 900,
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <MessageCircle size={20} color="#fff" />
        </button>
      )}

      {/* ── Right-click context menu ── */}
      {ctxMenu && (
        <div
          data-ctx-menu
          style={{
            position: 'fixed', zIndex: 9999,
            ...clampedPos(ctxMenu.x, ctxMenu.y),
            background: '#1e2433', border: '1px solid #2d3748',
            borderRadius: '0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            overflow: 'hidden', minWidth: 180,
          }}
        >
          <button
            onClick={() => { openWithContext(ctxMenu.text); setCtxMenu(null); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.65rem 0.9rem', background: 'transparent', border: 'none',
              color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <MessageCircle size={14} color="#818cf8" />
            MCAT Tutor about this
          </button>
        </div>
      )}

      {/* ── Text-selection tooltip ── */}
      {selTooltip && (
        <div
          data-sel-tooltip
          style={{
            position: 'fixed', zIndex: 9999,
            left: selTooltip.x - 90, top: selTooltip.y - 44,
            background: '#1e2433', border: '1px solid #4f46e5',
            borderRadius: '0.4rem', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <button
            onClick={() => { openWithContext(selTooltip.text); setSelTooltip(null); window.getSelection()?.removeAllRanges(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.75rem', background: 'transparent', border: 'none',
              color: '#818cf8', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <MessageCircle size={13} /> MCAT Tutor →
          </button>
        </div>
      )}

      {/* ── Chat drawer ── */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1000,
        width: open ? 380 : 0, transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        background: '#12161f', borderLeft: open ? '1px solid #2d3748' : 'none',
        boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.5)' : 'none',
      }}>
        {open && (
          <>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem', borderBottom: '1px solid #2d3748', flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MessageCircle size={15} color="#818cf8" /> MCAT Tutor
                </div>
                {contextLabel && (
                  <div style={{
                    fontSize: '0.7rem', color: '#4a5568', marginTop: '0.2rem',
                    maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    Context: {contextLabel}
                  </div>
                )}
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5568', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {messages.length === 0 && (
                <div style={{ color: '#334155', fontSize: '0.82rem', lineHeight: 1.6, textAlign: 'center', marginTop: '2rem' }}>
                  {contextLabel
                    ? <>Ask anything about <span style={{ color: '#6366f1' }}>&ldquo;{contextLabel}&rdquo;</span></>
                    : 'Ask any MCAT question — highlight text on the page and right-click to load it as context.'}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '88%', padding: '0.6rem 0.9rem', borderRadius: m.role === 'user' ? '1rem 1rem 0.2rem 1rem' : '1rem 1rem 1rem 0.2rem',
                    background: m.role === 'user' ? 'rgba(99,102,241,0.25)' : '#1e2433',
                    border: m.role === 'user' ? '1px solid rgba(99,102,241,0.4)' : '1px solid #2d3748',
                    color: '#e2e8f0', fontSize: '0.83rem', lineHeight: 1.65,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#4a5568', fontSize: '0.78rem' }}>
                  <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #2d3748', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleInputKey}
                  rows={1}
                  placeholder="Ask a question… (Enter to send)"
                  style={{
                    flex: 1, background: '#0f1117', border: '1px solid #2d3748', borderRadius: '0.5rem',
                    padding: '0.6rem 0.75rem', color: '#e2e8f0', fontSize: '0.83rem', fontFamily: 'inherit',
                    outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#6366f1')}
                  onBlur={e  => (e.target.style.borderColor = '#2d3748')}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  style={{
                    background: input.trim() && !loading ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : '#1e2433',
                    border: 'none', borderRadius: '0.5rem', padding: '0.6rem 0.75rem',
                    cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: 'background 0.15s',
                  }}
                >
                  <Send size={16} color={input.trim() && !loading ? '#fff' : '#2d3748'} />
                </button>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#2d3748', marginTop: '0.4rem' }}>
                Shift+Enter for new line · Esc to close
              </div>
            </div>
          </>
        )}
      </div>

      {/* Backdrop on mobile / narrow */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.3)',
            display: 'none', // hidden on desktop, show on narrow if needed
          }}
        />
      )}
    </>
  );
}
