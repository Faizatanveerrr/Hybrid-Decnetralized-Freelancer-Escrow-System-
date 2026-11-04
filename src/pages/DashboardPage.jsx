import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  Clock,
  Scale,
  Coins,
  PlusCircle,
  ShieldCheck,
  ArrowRight,
  Wallet,
  AlertCircle
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import StatCard from '../components/common/StatCard.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';
import { getProjectsApi, getMilestonesApi, getDisputesApi } from '../services/api.js';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { balance, connected, network } = useWallet();

  const [projects, setProjects] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, [user, role]);

  const loadDashboardData = async () => {
    setLoading(true);
    setDbError('');
    try {
      const [projRes, msRes, dispRes] = await Promise.all([
        getProjectsApi(),
        getMilestonesApi(),
        getDisputesApi()
      ]);

      if (projRes.data?.success) setProjects(projRes.data.projects || []);
      if (msRes.data?.success) setMilestones(msRes.data.milestones || []);
      if (dispRes.data?.success) setDisputes(dispRes.data.disputes || []);
    } catch (err) {
      if (err.response?.status === 503 || err.response?.data?.error === 'DATABASE_UNAVAILABLE') {
        setDbError('MongoDB is currently disconnected or unavailable. Please ensure MongoDB is running at mongodb://localhost:27017/escrowx.');
      } else {
        console.error('Failed to load dashboard metrics:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const isClient = role === 'client';

  // Metrics derived strictly from database records
  const activeProjectsCount = projects.filter(p => p.status === 'ACTIVE').length;
  const awaitingApprovalCount = milestones.filter(m => m.status === 'SUBMITTED').length;
  const activeDisputesCount = disputes.filter(d => d.status !== 'FINALIZED').length;
  
  const totalVolume = milestones
    .filter(m => m.status === 'RELEASED')
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  return (
    <DashboardLayout title="Dashboard">
      {dbError && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold">Database Notice</p>
            <p className="mt-0.5">{dbError}</p>
          </div>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-700 rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-indigo-700/10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold mb-3 border border-white/15">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Role: {isClient ? 'Client' : 'Freelancer'}
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {user ? `Welcome back, ${user.name}!` : 'Welcome to EscrowX'}
          </h2>
          <p className="text-indigo-100 text-xs sm:text-sm mt-1 max-w-xl">
            {isClient
              ? 'Create contracts, fund milestone escrows, and inspect verified deliverable submissions.'
              : 'Submit deliverables, request milestone approvals, and claim escrow payouts.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isClient ? (
            <Button
              variant="outline"
              icon={PlusCircle}
              onClick={() => navigate('/projects/create')}
              className="bg-white text-indigo-700 hover:bg-indigo-50 border-transparent shadow-md"
            >
              New Project
            </Button>
          ) : (
            <Button
              variant="outline"
              icon={FolderGit2}
              onClick={() => navigate('/projects')}
              className="bg-white text-indigo-700 hover:bg-indigo-50 border-transparent shadow-md"
            >
              Browse Projects
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Loading message="Loading MongoDB data..." />
      ) : (
        <>
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <StatCard
              title="Active Projects"
              value={activeProjectsCount}
              subtitle="Current contracts"
              icon={FolderGit2}
              color="indigo"
            />
            <StatCard
              title="Awaiting Approval"
              value={awaitingApprovalCount}
              subtitle="Submitted deliverables"
              icon={Clock}
              color="amber"
            />
            <StatCard
              title="Open Disputes"
              value={activeDisputesCount}
              subtitle="Under arbitration"
              icon={Scale}
              color="purple"
            />
            <StatCard
              title="Settled Volume"
              value={`$${totalVolume.toLocaleString()}`}
              subtitle="Released INR"
              icon={Coins}
              color="emerald"
            />
          </div>

          {/* Main 2-Column Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Recent Projects */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">Recent Projects</h3>
                  <p className="text-xs text-slate-500">Live contracts stored in MongoDB</p>
                </div>
                {projects.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/projects')}
                    className="text-xs"
                  >
                    View All ({projects.length})
                  </Button>
                )}
              </div>

              {projects.length === 0 ? (
                <EmptyState
                  title="No projects yet"
                  description="No projects exist in MongoDB. Create your first escrow project to begin."
                  actionLabel={isClient ? 'Create Project' : undefined}
                  onAction={isClient ? () => navigate('/projects/create') : undefined}
                />
              ) : (
                <div className="space-y-3.5">
                  {projects.slice(0, 3).map((proj) => {
                    const milestonesList = proj.milestones || [];
                    const completedMilestones = milestonesList.filter(m => m.status === 'RELEASED').length;
                    const totalMilestones = milestonesList.length || 1;
                    const progressPercent = Math.round((completedMilestones / totalMilestones) * 100);

                    return (
                      <Card
                        key={proj._id}
                        hover
                        onClick={() => navigate(`/projects/${proj._id}`)}
                        className="p-5 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <StatusBadge status={proj.status} />
                              <span className="text-xs font-semibold text-slate-400">
                                • {milestonesList.length} Milestones
                              </span>
                            </div>
                            <h4 className="text-base font-bold text-slate-900 hover:text-indigo-600 transition-colors">
                              {proj.title}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-1 mt-1">
                              {proj.description}
                            </p>
                          </div>
                          
                          <div className="text-right shrink-0">
                            <span className="text-xs font-semibold text-slate-400">Total Escrow</span>
                            <p className="text-lg font-extrabold text-slate-900">
                              ₹{proj.totalAmount?.toLocaleString()} <span className="text-xs font-medium text-indigo-600">INR</span>
                            </p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          <div className="flex items-center gap-2">
                            <span>Client: <strong className="text-slate-700">{proj.clientName || 'Client'}</strong></span>
                            <span>•</span>
                            <span>Freelancer: <strong className="text-slate-700">{proj.freelancerName || 'Unassigned'}</strong></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-indigo-600 h-full rounded-full transition-all"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className="font-bold text-slate-700">{progressPercent}%</span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Wallet Quick Card & Active Disputes summary */}
            <div className="space-y-6">
              
              {/* Wallet Summary Card */}
              <Card className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl">
                <div className="flex items-center justify-between text-indigo-200 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider">Web3 Wallet Status</span>
                  <Wallet className="w-5 h-5 text-indigo-300" />
                </div>
                <p className="text-xs text-indigo-300">Available INR Balance</p>
                <h3 className="text-3xl font-extrabold mt-1 tracking-tight">
                  ₹{balance.toLocaleString()} <span className="text-sm font-medium text-indigo-300">INR</span>
                </h3>
                <div className="mt-6 pt-4 border-t border-indigo-800/80 flex items-center justify-between text-xs">
                  <div>
                    <p className="text-[11px] text-indigo-300">Network</p>
                    <p className="font-semibold text-white">{connected ? network : 'Disconnected'}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/wallet')}
                    className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs py-1.5"
                  >
                    View Wallet
                  </Button>
                </div>
              </Card>

              {/* AI Dispute Quick Status */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Scale className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">AI Arbitration</h4>
                      <p className="text-[11px] text-slate-500">Autonomous dispute rulings</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                    Live
                  </span>
                </div>

                {disputes.length > 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 truncate">{disputes[0].projectTitle}</span>
                      <StatusBadge status={disputes[0].status} />
                    </div>
                    <p className="text-slate-600 line-clamp-2">{disputes[0].aiReasoning || 'AI Arbitrator reviewing evidence...'}</p>
                    <button
                      onClick={() => navigate(`/disputes/${disputes[0]._id}`)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer pt-1"
                    >
                      Inspect AI Ruling <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    <Scale className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-700">No disputes yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">All milestones are running smoothly without active conflicts.</p>
                  </div>
                )}
              </Card>

            </div>

          </div>
        </>
      )}
    </DashboardLayout>
  );
}
