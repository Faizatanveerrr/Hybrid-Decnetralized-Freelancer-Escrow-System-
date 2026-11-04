import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, MessageSquare, User, ShieldCheck } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectsApi, getMessagesApi, sendMessageApi } from '../services/api.js';

export default function MessagesPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadMessages(selectedProjectId);
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await getProjectsApi();
      if (res.data.success && res.data.projects?.length > 0) {
        setProjects(res.data.projects);
        setSelectedProjectId(res.data.projects[0]._id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (projId) => {
    try {
      const res = await getMessagesApi(projId);
      if (res.data.success) {
        setMessages(res.data.messages || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !selectedProjectId) return;
    if (!user || !(user._id || user.id)) {
      alert('You must be logged in to send messages.');
      return;
    }

    setSending(true);
    try {
      const res = await sendMessageApi(selectedProjectId, {
        sender: user?._id || user?.id,
        senderName: user?.name || (role === 'client' ? 'Client' : 'Freelancer'),
        senderRole: role,
        text: text.trim()
      });
      if (res.data.success) {
        setMessages(prev => [...(prev || []), res.data.message]);
        setText('');
      }
    } catch (err) {
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const selectedProject = projects.find(p => p._id === selectedProjectId);

  return (
    <DashboardLayout title="Messages">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Project Communications</h2>
        <p className="text-xs text-slate-500">Coordinate deliverable scopes and milestone approvals</p>
      </div>

      {loading ? (
        <Loading message="Loading project conversations..." />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No messages yet."
          description="There are no active projects to message within. Create an escrow project to begin communicating."
          actionLabel="Create Project"
          onAction={() => navigate('/projects/create')}
          icon={MessageSquare}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[550px]">
          
          {/* Left: Project Selector List */}
          <Card className="p-3 overflow-y-auto flex flex-col space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2">
              Projects
            </span>
            {projects.map((p) => (
              <button
                key={p._id}
                onClick={() => setSelectedProjectId(p._id)}
                className={`text-left p-3 rounded-xl transition-all cursor-pointer ${
                  selectedProjectId === p._id
                    ? 'bg-indigo-50/80 border border-indigo-200 text-indigo-900 shadow-xs'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <p className="text-xs font-bold truncate">{p.title}</p>
                <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                  <span>₹{p.totalAmount}</span>
                  <span>{p.freelancerName || 'Freelancer'}</span>
                </div>
              </button>
            ))}
          </Card>

          {/* Right: Chat Window (2 Cols) */}
          <Card className="md:col-span-2 flex flex-col p-4">
            
            {/* Chat Header */}
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedProject?.title}</h3>
                <p className="text-[11px] text-slate-400">
                  Client: {selectedProject?.clientName || 'Client'} • Freelancer: {selectedProject?.freelancerName || 'Freelancer'}
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Connected
              </span>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                  <p className="font-semibold text-slate-600">No messages yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Send a message below to start the conversation.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender === (user?.id || user?._id) || m.senderRole === role;
                  return (
                    <div
                      key={m._id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[10px] text-slate-400 mb-0.5">
                        {m.senderName} ({m.senderRole})
                      </span>
                      <div
                        className={`max-w-md px-3.5 py-2 rounded-2xl text-xs ${
                          isMe
                            ? 'bg-indigo-600 text-white rounded-br-xs'
                            : 'bg-slate-100 text-slate-800 rounded-bl-xs'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSend} className="p-2 border-t border-slate-100 flex gap-2">
              <input
                type="text"
                placeholder="Write a message to your collaborator..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="flex-1 px-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Button type="submit" variant="primary" size="sm" icon={Send} loading={sending}>
                Send
              </Button>
            </form>

          </Card>

        </div>
      )}
    </DashboardLayout>
  );
}
