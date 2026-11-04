import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User, Mail, Wallet, Briefcase, Edit3, CheckCircle2, AlertCircle, Send, ArrowLeft } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Modal from '../components/common/Modal.jsx';
import Toast from '../components/common/Toast.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Loading from '../components/common/Loading.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { updateUserApi, getUserByIdApi, getProjectsApi, createInvitationApi } from '../services/api.js';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, role, setUser } = useAuth();

  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    walletAddress: '',
    skills: ''
  });
  const [saving, setSaving] = useState(false);

  // Invite Modal state if client views freelancer
  const [inviteModal, setInviteModal] = useState({
    isOpen: false,
    projectId: '',
    message: ''
  });
  const [clientOpenProjects, setClientOpenProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const isOwnProfile = !id || id === user?._id || id === user?.id;

  useEffect(() => {
    if (id && (!user || (id !== user._id && id !== user.id))) {
      loadTargetUser(id);
    } else {
      setTargetUser(user);
    }
  }, [id, user]);

  const loadTargetUser = async (userId) => {
    setLoading(true);
    try {
      const res = await getUserByIdApi(userId);
      if (res.data?.success) {
        setTargetUser(res.data.user);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = () => {
    const active = targetUser || user;
    setFormData({
      name: active?.name || '',
      bio: active?.bio || '',
      walletAddress: active?.walletAddress || '',
      skills: (active?.skills || []).join(', ')
    });
    setEditModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?._id && !user?.id) return;
    setSaving(true);
    try {
      const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(Boolean);
      const res = await updateUserApi(user._id || user.id, {
        name: formData.name.trim(),
        bio: formData.bio.trim(),
        walletAddress: formData.walletAddress.trim(),
        skills: skillsArray
      });

      if (res.data?.success) {
        setUser(res.data.user);
        setTargetUser(res.data.user);
        setToastMessage('Profile updated in MongoDB successfully!');
        setEditModal(false);
      }
    } catch (err) {
      alert('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const openInviteModal = async () => {
    setInviteError('');
    setInviteModal({
      isOpen: true,
      projectId: '',
      message: `Hi ${targetUser.name}, I would like to invite you to collaborate on our escrow project.`
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
        console.error('Failed to load projects for invite:', err);
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
        freelancerId: targetUser._id,
        message: inviteModal.message
      });

      if (res.data?.success) {
        setToastMessage(`Invitation sent to ${targetUser.name}!`);
        setInviteModal({ isOpen: false, projectId: '', message: '' });
      } else {
        setInviteError(res.data?.message || 'Failed to send invitation');
      }
    } catch (err) {
      setInviteError(err.response?.data?.message || 'Failed to send invitation');
    } finally {
      setSubmittingInvite(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="User Profile">
        <Loading message="Loading profile details..." />
      </DashboardLayout>
    );
  }

  const displayedUser = targetUser || user;

  if (!displayedUser) {
    return (
      <DashboardLayout title="User Profile">
        <EmptyState
          title="No user profile found"
          description="Please register an account or sign in to view and manage profiles."
          actionLabel="Sign In / Register"
          onAction={() => navigate('/login')}
          icon={User}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={isOwnProfile ? "My Profile" : `${displayedUser.name}'s Profile`}>
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}

      <div className="max-w-4xl mx-auto space-y-6">
        {!isOwnProfile && (
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
        )}

        {/* Profile Card */}
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-5">
              <img
                src={
                  displayedUser.avatar ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayedUser.name || 'User')}`
                }
                alt={displayedUser.name}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-100 shadow-md"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">{displayedUser.name}</h2>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    displayedUser.role === 'client' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {displayedUser.role?.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{displayedUser.email}</p>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  {displayedUser.walletAddress || 'No wallet address stored'}
                </p>
              </div>
            </div>

            {isOwnProfile ? (
              <Button variant="outline" size="sm" icon={Edit3} onClick={handleOpenEdit}>
                Edit Profile
              </Button>
            ) : role === 'client' && displayedUser.role === 'freelancer' ? (
              <Button variant="primary" size="sm" icon={Send} onClick={openInviteModal}>
                Invite to Project
              </Button>
            ) : null}
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">About / Bio</h3>
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                {displayedUser.bio || 'No bio specified.'}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Skills & Specializations</h3>
              <div className="flex flex-wrap gap-2">
                {(displayedUser.skills && displayedUser.skills.length > 0) ? (
                  displayedUser.skills.map((sk, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-medium px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100"
                    >
                      {sk}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">No skills listed yet.</span>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Account Role</span>
                <span className="font-bold text-slate-800 capitalize">{displayedUser.role}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Wallet Connection</span>
                <span className="font-bold text-slate-800">
                  {displayedUser.walletAddress ? 'Linked' : 'Not Linked'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Member Since</span>
                <span className="font-bold text-slate-800">
                  {displayedUser.createdAt ? new Date(displayedUser.createdAt).toLocaleDateString() : 'Active Member'}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Edit Profile Modal */}
      {isOwnProfile && (
        <Modal
          isOpen={editModal}
          onClose={() => setEditModal(false)}
          title="Edit Profile Information"
        >
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bio / Profile Headline</label>
              <textarea
                rows={3}
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Skills (comma-separated)
              </label>
              <input
                type="text"
                value={formData.skills}
                onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                placeholder="React, Solidity, Node.js, UI/UX"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Web3 Wallet Address</label>
              <input
                type="text"
                value={formData.walletAddress}
                onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                placeholder="0x..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={saving}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={inviteModal.isOpen}
        onClose={() => setInviteModal({ isOpen: false, projectId: '', message: '' })}
        title={`Invite ${targetUser?.name || 'Freelancer'} to Project`}
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
                    setInviteModal({ isOpen: false, projectId: '', message: '' });
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
              onClick={() => setInviteModal({ isOpen: false, projectId: '', message: '' })}
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
