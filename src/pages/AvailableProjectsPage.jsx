import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Search,
  DollarSign,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  User
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { getAvailableProjectsApi } from '../services/api.js';

export default function AvailableProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await getAvailableProjectsApi();
      if (res.data?.success) {
        setProjects(res.data.projects || []);
      }
    } catch (err) {
      console.error('Failed to load available projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.clientName?.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout title="Available Projects">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Open Escrow Opportunities</h2>
          <p className="text-xs text-slate-500">
            Browse verified client projects open for proposals with smart contract escrow backing
          </p>
        </div>

        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search open projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-xs"
          />
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <Loading message="Fetching open projects from database..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No projects are currently available"
          description={
            search
              ? "No available projects matched your search. Try different keywords."
              : "There are currently no open projects waiting for proposals. Please check back soon."
          }
          icon={Briefcase}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((proj) => (
            <Card key={proj._id} hover className="p-6 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {proj._id?.substring(proj._id.length - 6)}
                  </span>
                  <StatusBadge status={proj.status || 'OPEN'} />
                </div>

                <h3 className="text-base font-bold text-slate-900 line-clamp-1 mb-2">
                  {proj.title}
                </h3>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-4">
                  {proj.description}
                </p>

                {/* Details Pills */}
                <div className="space-y-2 py-3 border-y border-slate-100 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <User className="w-3.5 h-3.5" /> Client:
                    </span>
                    <span className="font-semibold text-slate-800">{proj.clientName || 'Client'}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Layers className="w-3.5 h-3.5" /> Milestones:
                    </span>
                    <span className="font-semibold text-slate-800">
                      {proj.milestones?.length || 0} Deliverables
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <DollarSign className="w-3.5 h-3.5" /> Total Budget:
                    </span>
                    <span className="font-extrabold text-indigo-600">
                      ₹{proj.totalAmount?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4 mt-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  icon={ArrowRight}
                  onClick={() => navigate(`/projects/${proj._id}`)}
                >
                  View Project & Send Proposal
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
