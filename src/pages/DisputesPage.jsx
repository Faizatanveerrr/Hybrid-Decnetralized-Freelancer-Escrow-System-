import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Bot, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { getDisputesApi } from '../services/api.js';

export default function DisputesPage() {
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, ACTIVE, UNDER_AI_REVIEW, APPEALS, RESOLVED

  useEffect(() => {
    loadDisputes();
  }, [activeTab]);

  const loadDisputes = async () => {
    setLoading(true);
    try {
      const res = await getDisputesApi({ status: activeTab });
      if (res.data.success) {
        setDisputes(res.data.disputes || []);
      }
    } catch (err) {
      console.error('Failed to load disputes:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Disputes & AI Arbitration">
      {/* Top Banner explaining AI Arbitration */}
      <div className="mb-6 p-6 rounded-2xl bg-gradient-to-r from-purple-900 to-indigo-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-purple-950/20">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-400/30">
            <Bot className="w-3.5 h-3.5" /> AI Legal Arbitrator Powered by Gemini
          </div>
          <h2 className="text-xl font-bold tracking-tight">Decentralized Dispute Resolution</h2>
          <p className="text-xs text-purple-200/80 max-w-xl">
            When client expectations and freelancer submissions conflict, the AI Arbitrator parses acceptance criteria, analyzes uploaded proofs, and generates binding rulings.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl mb-6 max-w-fit overflow-x-auto">
        {[
          { id: 'ALL', label: 'All Disputes' },
          { id: 'ACTIVE', label: 'Active / Evidence' },
          { id: 'UNDER_AI_REVIEW', label: 'Under AI Review' },
          { id: 'APPEALS', label: 'Appeals' },
          { id: 'RESOLVED', label: 'Resolved' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading message="Syncing dispute evidence dossier..." />
      ) : disputes.length === 0 ? (
        <EmptyState
          title="No disputes yet."
          description="All escrow contracts and milestones are proceeding smoothly without contested claims."
          icon={Scale}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {disputes.map((d) => (
            <Card key={d._id} hover className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <StatusBadge status={d.status} />
                  <span className="text-sm font-extrabold text-slate-900">
                    ₹{d.amount?.toLocaleString()} <span className="text-xs text-indigo-600">INR</span>
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900">
                  {d.projectTitle}
                </h3>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Milestone: {d.milestoneTitle}
                </p>

                {/* Evidence preview box */}
                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-500">
                    <span>Opened By:</span>
                    <strong className="text-slate-800">{d.openedByName} ({d.openedByRole})</strong>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Evidence Files:</span>
                    <strong className="text-indigo-600">{(d.evidence || []).length} items submitted</strong>
                  </div>
                  {d.aiWinner && (
                    <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-200/60">
                      <span>AI Ruling Favors:</span>
                      <strong className="text-purple-700 font-bold uppercase">{d.aiWinner} ({d.aiConfidence}% confidence)</strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  icon={ArrowRight}
                  onClick={() => navigate(`/disputes/${d._id}`)}
                >
                  Review AI Case Dossier
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
