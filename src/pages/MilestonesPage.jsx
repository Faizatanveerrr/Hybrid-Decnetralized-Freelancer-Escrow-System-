import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ArrowRight, ListTodo, ShieldAlert } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { getMilestonesApi } from '../services/api.js';

export default function MilestonesPage() {
  const navigate = useNavigate();
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    loadMilestones();
  }, []);

  const loadMilestones = async () => {
    setLoading(true);
    try {
      const res = await getMilestonesApi();
      if (res.data.success) {
        setMilestones(res.data.milestones || []);
      }
    } catch (err) {
      console.error('Failed to load milestones:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = milestones.filter((m) => {
    if (filter === 'ALL') return true;
    return m.status === filter;
  });

  return (
    <DashboardLayout title="Milestones">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Milestone Tracker</h2>
          <p className="text-xs text-slate-500">All deliverables across active and completed escrow contracts</p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
          {['ALL', 'PENDING', 'FUNDED', 'SUBMITTED', 'RELEASED', 'DISPUTED'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                filter === tab
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Loading message="Loading deliverables and escrow milestones..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={milestones.length === 0 ? "No milestones yet" : "No milestones match"}
          description={milestones.length === 0 ? "No milestones exist in MongoDB yet. Create a project to define escrow milestones." : "Try changing your filter selection."}
          actionLabel={milestones.length === 0 ? "Create Project" : undefined}
          onAction={milestones.length === 0 ? () => navigate('/projects/create') : undefined}
          icon={ListTodo}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3.5 px-4">Milestone</th>
                  <th className="py-3.5 px-4">Project</th>
                  <th className="py-3.5 px-4">Escrow Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Due Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => (
                  <tr key={m._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4">
                      <p className="font-bold text-slate-900 text-sm">{m.title}</p>
                      <p className="text-[11px] text-slate-400 line-clamp-1 max-w-xs">{m.description}</p>
                    </td>
                    <td className="py-4 px-4 font-medium text-slate-700">
                      {m.projectId?.title || m.projectTitle || 'Project'}
                    </td>
                    <td className="py-4 px-4 font-extrabold text-slate-900">
                      ₹{m.amount?.toLocaleString()} <span className="text-[10px] text-indigo-600">INR</span>
                    </td>
                    <td className="py-4 px-4">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="py-4 px-4 text-slate-500">
                      {m.dueDate || 'Flexible'}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/projects/${m.projectId?._id || m.projectId}`)}
                        icon={ArrowRight}
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
