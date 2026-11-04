import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Wallet,
  Calendar,
  Send,
  Eye,
  Briefcase,
  AlertCircle
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Modal from '../components/common/Modal.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Toast from '../components/common/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getFreelancersApi, getProjectsApi, createInvitationApi } from '../services/api.js';
import { shortenAddress } from '../services/blockchain.js';

export default function FreelancersPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [freelancers, setFreelancers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Invite Modal state
  const [inviteModal, setInviteModal] = useState({
    isOpen: false,
    freelancer: null,
    projectId: '',
    message: ''
  });
  const [clientOpenProjects, setClientOpenProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    loadFreelancers();
  }, []);

  const loadFreelancers = async () => {
    setLoading(true);
    try {
      const res = await getFreelancersApi();
      if (res.data?.success) {
        setFreelancers(res.data.freelancers || []);
      }
    } catch (err) {
      console.error('Failed to load freelancers:', err);
    } finally {
      setLoading(false);
    }
  };

  const openInviteModal = async (freelancer) => {
    setInviteError('');
    setInviteModal({
      isOpen: true,
      freelancer,
      projectId: '',
      message: `Hi ${freelancer.name}, I would like to invite you to collaborate on our escrow project.`
    });

    if (user?._id || user?.id) {
      setLoadingProjects(true);
      try {
        const res = await getProjectsApi({ client: user._id || user.id, status: 'OPEN' });
        if (res.data?.success) {
          const openProjects = (res.data.projects || []).filter(p => !p.freelancer);
          setClientOpenProjects(openProjects);
          if (openProjects.length > 0) {
            setInviteModal(prev => ({ ...prev, projectId: openProjects[0]._id }));
          }
        }
      } catch (err) {
        console.error('Failed to load client projects for invite:', err);
      } finally {
        setLoadingProjects(false);
      }
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteError('');

    if (!inviteModal.projectId) {
      setInviteError('Please select a project to invite the freelancer to.');
      return;
    }

    setSubmittingInvite(true);
    try {
      const res = await createInvitationApi(inviteModal.projectId, {
        freelancerId: inviteModal.freelancer._id,
        message: inviteModal.message
      });

      if (res.data?.success) {
        setToastMessage(`Invitation sent to ${inviteModal.freelancer.name}!`);
        setInviteModal({ isOpen: false, freelancer: null, projectId: '', message: '' });
      } else {
        setInviteError(res.data?.message || 'Failed to send invitation');
      }
    } catch (err) {
      setInviteError(err.response?.data?.message || 'Failed to send invitation');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const filteredFreelancers = freelancers.filter(f => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const nameMatch = f.name?.toLowerCase().includes(q);
    const bioMatch = f.bio?.toLowerCase().includes(q);
    const skillsMatch = (f.skills || []).some(s => s.toLowerCase().includes(q));
    return nameMatch || bioMatch || skillsMatch;
  });

  return (
    <DashboardLayout title="Freelancer Discovery">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}

      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Explore Top Web3 & Tech Freelancers</h2>
          <p className="text-xs text-slate-500">
            Browse verified talent profiles and send project invitations directly
          </p>
        </div>

        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, skill, or bio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-xs"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Loading message="Fetching registered freelancers from database..." />
      ) : filteredFreelancers.length === 0 ? (
        <EmptyState
          title="No freelancers found"
          description={
            search
              ? "No freelancers matched your search query. Try broadening your keywords."
              : "No freelancers have registered yet. Once freelancers sign up, they will appear here."
          }
          icon={Users}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFreelancers.map((f) => (
            <Card key={f._id} hover className="p-6 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                  <img
                    src={
                      f.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                        f.name || 'Freelancer'
                      )}`
                    }
                    alt={f.name}
                    className="w-14 h-14 rounded-2xl object-cover border border-slate-100 shadow-xs shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-900 truncate">{f.name}</h3>
                    <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
                      Freelance Specialist
                    </p>
                    {f.walletAddress && (
                      <p className="text-[10px] font-mono text-slate-400 flex items-center gap-1 mt-1 truncate">
                        <Wallet className="w-3 h-3 shrink-0" />
                        {shortenAddress(f.walletAddress)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bio */}
                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-4">
                  {f.bio || 'Independent professional on the EscrowX decentralized escrow network.'}
                </p>

                {/* Skills */}
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {(f.skills && f.skills.length > 0 ? f.skills : ['Web3', 'Escrow', 'Developer']).map(
                    (skill, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-medium"
                      >
                        {skill}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Eye}
                  className="flex-1"
                  onClick={() => navigate(`/profile/${f._id}`)}
                >
                  View Profile
                </Button>
                {role === 'client' && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Send}
                    className="flex-1"
                    onClick={() => openInviteModal(f)}
                  >
                    Invite
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={inviteModal.isOpen}
        onClose={() => setInviteModal({ isOpen: false, freelancer: null, projectId: '', message: '' })}
        title={`Invite ${inviteModal.freelancer?.name || 'Freelancer'} to Project`}
      >
        <form onSubmit={handleSendInvite} className="space-y-4">
          {inviteError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{inviteError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Open Project
            </label>
            {loadingProjects ? (
              <p className="text-xs text-slate-400 py-2">Loading your open projects...</p>
            ) : clientOpenProjects.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
                <p className="text-xs text-slate-600 mb-2">
                  You don't have any open unassigned projects right now.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInviteModal({ isOpen: false, freelancer: null, projectId: '', message: '' });
                    navigate('/projects/create');
                  }}
                >
                  Create a New Project
                </Button>
              </div>
            ) : (
              <select
                value={inviteModal.projectId}
                onChange={(e) => setInviteModal({ ...inviteModal, projectId: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                {clientOpenProjects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title} (₹{p.totalAmount} - {p.milestones?.length || 0} Milestones)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Invitation Note / Deliverable Brief
            </label>
            <textarea
              rows={3}
              value={inviteModal.message}
              onChange={(e) => setInviteModal({ ...inviteModal, message: e.target.value })}
              placeholder="Explain why you'd like to work with this freelancer..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInviteModal({ isOpen: false, freelancer: null, projectId: '', message: '' })}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              icon={Send}
              loading={submittingInvite}
              disabled={clientOpenProjects.length === 0}
            >
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
