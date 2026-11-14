import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Lock, MessageSquare, Check, CheckCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { getMessagesApi, sendMessageApi } from '../../services/api.js';

const MAX_LEN = 2000;
const POLL_MS = 4000;

const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const timeLabel = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Private chat for ONE project, between its client and its hired freelancer only.
 * The server enforces that; this component just shows what the server returns.
 */
export default function ChatPanel({ projectId, heightClass = 'h-96', onActivity }) {
  const { user } = useAuth();
  const meId = String(user?._id || user?.id || '');

  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState({ chatOpen: true, closedReason: '', participants: null });
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const lastTime = useRef('');
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  const applyMeta = (data) =>
    setMeta({ chatOpen: data.chatOpen !== false, closedReason: data.closedReason || '', participants: data.participants || null });

  // ---- first load (and when the project changes)
  useEffect(() => {
    let alive = true;
    setMessages([]); setHasMore(false); setError(''); setDenied(false); setSendError(''); setLoading(true);
    lastTime.current = '';
    stickToBottom.current = true;
    getMessagesApi(projectId)
      .then((res) => {
        if (!alive) return;
        const list = res.data.messages || [];
        setMessages(list);
        setHasMore(Boolean(res.data.hasMore));
        applyMeta(res.data);
        lastTime.current = list.length ? list[list.length - 1].createdAt : '';
        onActivityRef.current?.();
      })
      .catch((err) => {
        if (!alive) return;
        if (err.response?.status === 403) setDenied(true);
        else setError(err.response?.data?.message || 'Could not load the chat. Check your connection and try again.');
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [projectId]);

  // ---- polling for new messages while the tab is visible
  const poll = useCallback(async () => {
    if (document.hidden || denied) return;
    try {
      const params = lastTime.current ? { after: lastTime.current } : {};
      const res = await getMessagesApi(projectId, params);
      const fresh = res.data.messages || [];
      const seen = new Set(res.data.seenIds || []);
      applyMeta(res.data);
      setMessages((prev) => {
        const known = new Set(prev.map((m) => String(m._id)));
        const add = fresh.filter((m) => !known.has(String(m._id)));
        const next = prev.map((m) => (m.mine && !m.seen && seen.has(String(m._id)) ? { ...m, seen: true } : m));
        if (add.length) {
          lastTime.current = add[add.length - 1].createdAt;
          onActivityRef.current?.();
          return [...next, ...add];
        }
        return next;
      });
    } catch { /* a missed poll is fine; the next one retries */ }
  }, [projectId, denied]);

  useEffect(() => {
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // ---- keep the view at the newest message unless the user scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadEarlier = async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    try {
      const res = await getMessagesApi(projectId, { before: messages[0].createdAt, peek: 1 });
      const older = res.data.messages || [];
      stickToBottom.current = false;
      setMessages((prev) => [...older, ...prev]);
      setHasMore(Boolean(res.data.hasMore));
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
    } catch {
      setError('Could not load earlier messages.');
    } finally {
      setLoadingMore(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await sendMessageApi(projectId, { text: body });
      const m = res.data.message;
      stickToBottom.current = true;
      setMessages((prev) => (prev.some((x) => String(x._id) === String(m._id)) ? prev : [...prev, m]));
      lastTime.current = m.createdAt;
      setText('');
      onActivityRef.current?.();
    } catch (err) {
      setSendError(err.response?.data?.message || 'Message not sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ---------------------------------------------------------------- render
  if (denied) {
    return (
      <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
        <Lock className="w-6 h-6 mx-auto mb-2 text-slate-400" />
        This chat is private to the project's client and hired freelancer.
      </div>
    );
  }

  const parts = meta.participants;
  const otherName = parts
    ? (String(parts.client?.id) === meId ? parts.freelancer?.name : parts.client?.name) || 'the other party'
    : 'the other party';

  const lastMine = [...messages].reverse().find((m) => m.mine);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2 mb-3">
        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Private chat: only you and <b className="text-slate-700">{otherName}</b> can read these messages.</span>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className={`${heightClass} overflow-y-auto p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5`}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading messages...
          </div>
        ) : error && !messages.length ? (
          <p className="text-xs text-rose-600 text-center py-12">{error}</p>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs text-center">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="font-semibold text-slate-600">No messages yet.</p>
            <p className="text-[11px] mt-0.5">{meta.chatOpen ? 'Say hello to start coordinating milestones.' : meta.closedReason}</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center pb-2">
                <button type="button" onClick={loadEarlier} disabled={loadingMore} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer disabled:opacity-60">
                  {loadingMore ? 'Loading...' : 'Load earlier messages'}
                </button>
              </div>
            )}
            {messages.map((m, i) => {
              const showDay = i === 0 || new Date(m.createdAt).toDateString() !== new Date(messages[i - 1].createdAt).toDateString();
              const sameSender = i > 0 && messages[i - 1].sender === m.sender && !showDay;
              return (
                <React.Fragment key={m._id}>
                  {showDay && (
                    <div className="flex justify-center py-2">
                      <span className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-full px-2.5 py-0.5">{dayLabel(m.createdAt)}</span>
                    </div>
                  )}
                  <div className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'} ${sameSender ? '' : 'pt-1.5'}`}>
                    {!sameSender && !m.mine && (
                      <span className="text-[10px] text-slate-400 mb-0.5">{m.senderName} ({m.senderRole})</span>
                    )}
                    <div
                      className={`max-w-md px-3.5 py-2 rounded-2xl text-xs whitespace-pre-wrap break-words ${
                        m.mine ? 'bg-indigo-600 text-white rounded-br-xs' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                      }`}
                    >
                      {m.text}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      {timeLabel(m.createdAt)}
                      {m.mine && lastMine && String(lastMine._id) === String(m._id) && (
                        m.seen
                          ? <span className="flex items-center gap-0.5 text-emerald-600"><CheckCheck className="w-3 h-3" />Seen</span>
                          : <span className="flex items-center gap-0.5"><Check className="w-3 h-3" />Sent</span>
                      )}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      {meta.chatOpen ? (
        <div className="mt-3">
          {sendError && <p className="text-[11px] text-rose-600 font-medium mb-1.5">{sendError}</p>}
          <div className="flex gap-2 items-end">
            <textarea
              rows={1}
              maxLength={MAX_LEN}
              placeholder="Type a message (Enter to send, Shift+Enter for a new line)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              className="flex-1 resize-none max-h-28 px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !text.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
            </button>
          </div>
          {text.length > MAX_LEN - 300 && (
            <p className={`text-[10px] mt-1 text-right ${text.length >= MAX_LEN ? 'text-rose-600' : 'text-slate-400'}`}>{text.length}/{MAX_LEN}</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-slate-500 bg-slate-100 rounded-xl px-3 py-2 text-center">{meta.closedReason}</p>
      )}
    </div>
  );
}
