import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Search, FolderGit2, ArrowRight } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getProjectsApi } from '../services/api.js';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, ACTIVE, COMPLETED, CREATED_BY_ME
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await getProjectsApi();
      if (res.data.success) {
        setProjects(res.data.projects || []);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter((proj) => {
    // Tab filter
    if (filter === 'ACTIVE' && proj.status !== 'ACTIVE') return false;
    if (filter === 'COMPLETED' && proj.status !== 'COMPLETED') return false;
    if (filter === 'CREATED_BY_ME') {
      const isCreator = proj.client === (user?.id || user?._id) || proj.clientName === user?.name;
      if (!isCreator) return false;
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        proj.title.toLowerCase().includes(q) ||
        proj.description.toLowerCase().includes(q) ||
        (proj.clientName && proj.clientName.toLowerCase().includes(q)) ||
        (proj.freelancerName && proj.freelancerName.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

  return (
    <DashboardLayout title="Projects">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Escrow Projects</h2>
          <p className="text-xs text-slate-500">Track and manage milestone-based freelance contracts</p>
        </div>

        <Button
          variant="primary"
          icon={PlusCircle}
          onClick={() => navigate('/projects/create')}
        >
          Create Project
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl max-w-fit">
          {['ALL', 'ACTIVE', 'COMPLETED', 'CREATED_BY_ME'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === tab
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'CREATED_BY_ME' ? 'Created by Me' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search projects or parties..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <Loading message="Fetching escrow projects from database..." />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          title={projects.length === 0 ? "No projects yet." : "No matching projects found"}
          description={projects.length === 0 ? "There are no escrow projects in MongoDB. Create your first project to get started." : "No projects match your filter or search criteria."}
          actionLabel="Create Project"
          onAction={() => navigate('/projects/create')}
          icon={FolderGit2}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((proj) => {
            const milestonesList = proj.milestones || [];
            const milestoneCount = milestonesList.length || 0;
            const releasedCount = milestonesList.filter(m => m.status === 'RELEASED').length;

            return (
              <Card
                key={proj._id}
                hover
                className="flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <StatusBadge status={proj.status} />
                    <span className="text-xs font-bold text-slate-900">
                      ₹{proj.totalAmount?.toLocaleString()} <span className="text-[10px] text-indigo-600">INR</span>
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 line-clamp-1">
                    {proj.title}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1.5 leading-relaxed">
                    {proj.description}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Client:</span>
                      <span className="font-semibold text-slate-800">{proj.clientName || 'Client'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Freelancer:</span>
                      <span className="font-semibold text-slate-800">{proj.freelancerName || 'Unassigned'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Milestones:</span>
                      <span className="font-semibold text-indigo-600">{releasedCount} / {milestoneCount} Released</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between"
                    onClick={() => navigate(`/projects/${proj._id}`)}
                  >
                    <span>View Contract Details</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
