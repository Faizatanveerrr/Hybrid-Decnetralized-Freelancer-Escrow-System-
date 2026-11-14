import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, Lock } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ChatPanel from '../components/common/ChatPanel.jsx';
import { getConversationsApi } from '../services/api.js';

const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function MessagesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(params.get('project') || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  // The server returns ONLY projects where you are the client or the hired freelancer.
  const loadConversations = useCallback(async (initial = false) => {
    try {
      const res = await getConversationsApi();
      const list = res.data.conversations || [];
      setConversations(list);
      setError('');
      if (initial || !selectedRef.current || !list.some((c) => String(c.projectId) === String(selectedRef.current))) {
        const wanted = list.find((c) => String(c.projectId) === String(selectedRef.current));
        setSelectedId(wanted ? String(wanted.projectId) : list[0] ? String(list[0].projectId) : null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your conversations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations(true);
    const t = setInterval(() => { if (!document.hidden) loadConversations(false); }, 15000);
    return () => clearInterval(t);
  }, [loadConversations]);

  const select = (id) => {
    setSelectedId(String(id));
    setParams({ project: String(id) }, { replace: true });
  };

  const selected = conversations.find((c) => String(c.projectId) === String(selectedId));

  return (
    <DashboardLayout title="Messages">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Project Communications</h2>
        <p className="text-xs text-slate-500">Private chats between a project's client and its hired freelancer</p>
      </div>

      {loading ? (
        <Loading message="Loading project conversations..." />
      ) : error && conversations.length === 0 ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet."
          description="A project chat opens once a freelancer is hired. Only that project's client and freelancer can see it."
          actionLabel="View Projects"
          onAction={() => navigate('/projects')}
          icon={MessageSquare}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-3 overflow-y-auto flex flex-col space-y-1 max-h-[620px]">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2">Your projects</span>
            {conversations.map((c) => {
              const active = String(c.projectId) === String(selectedId);
              return (
                <button
                  key={c.projectId}
                  onClick={() => select(c.projectId)}
                  className={`text-left p-3 rounded-xl transition-all cursor-pointer ${
                    active ? 'bg-indigo-50/80 border border-indigo-200 text-indigo-900 shadow-xs' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold truncate">{c.title}</p>
                    {c.unread > 0 && !active && (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white">{c.unread}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    with {c.otherName} • you are the {c.role}
                  </p>
                  {c.lastMessage && (
                    <p className={`text-[11px] mt-1 truncate ${c.unread > 0 && !active ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
                      {c.lastMessage.mine ? 'You: ' : ''}{c.lastMessage.text}
                      <span className="ml-1 text-slate-300">· {timeAgo(c.lastMessage.createdAt)}</span>
                    </p>
                  )}
                </button>
              );
            })}
          </Card>

          <Card className="md:col-span-2 flex flex-col p-4">
            {selected ? (
              <>
                <div className="p-3 border-b border-slate-100 mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{selected.title}</h3>
                    <p className="text-[11px] text-slate-400">Chatting with {selected.otherName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${selected.projectId}`)}
                    className="shrink-0 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    Open project
                  </button>
                </div>
                <ChatPanel
                  key={selected.projectId}
                  projectId={String(selected.projectId)}
                  heightClass="h-[400px]"
                  onActivity={() => loadConversations(false)}
                />
              </>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-xs text-slate-400">
                <Lock className="w-6 h-6 mb-2" /> Select a project to open its private chat.
              </div>
            )}
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
