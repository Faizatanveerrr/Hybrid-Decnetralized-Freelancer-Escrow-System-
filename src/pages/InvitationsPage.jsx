import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MailCheck,
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  DollarSign,
  User,
  AlertCircle
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Toast from '../components/common/Toast.jsx';
import { getInvitationsApi, acceptInvitationApi, rejectInvitationApi } from '../services/api.js';

export default function InvitationsPage() {
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    setLoading(true);
    try {
      const res = await getInvitationsApi();
      if (res.data?.success) {
        setInvitations(res.data.invitations || []);
      }
    } catch (err) {
      console.error('Failed to load invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitationId) => {
    setProcessingId(invitationId);
    try {
      const res = await acceptInvitationApi(invitationId);
      if (res.data?.success) {
        setToastMessage(res.data.message || 'Invitation accepted! You are now assigned to the project.');
        loadInvitations();
      } else {
        alert(res.data?.message || 'Failed to accept invitation');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to accept invitation');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (invitationId) => {
    if (!window.confirm('Are you sure you want to decline this invitation?')) return;

    setProcessingId(invitationId);
    try {
      const res = await rejectInvitationApi(invitationId);
      if (res.data?.success) {
        setToastMessage('Invitation declined.');
        loadInvitations();
      } else {
        alert(res.data?.message || 'Failed to reject invitation');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject invitation');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <DashboardLayout title="Project Invitations">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}

      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Direct Client Invitations</h2>
        <p className="text-xs text-slate-500">
          Review invitations sent directly to you by project clients looking to hire your services
        </p>
      </div>

      {loading ? (
        <Loading message="Fetching invitations from database..." />
      ) : invitations.length === 0 ? (
        <EmptyState
          title="No invitations"
          description="You haven't received any project invitations yet. When clients invite you to collaborate, their requests will appear here."
          icon={MailCheck}
        />
      ) : (
        <div className="space-y-4 max-w-4xl">
          {invitations.map((inv) => {
            const project = inv.projectId;
            const client = inv.clientId;
            const isPending = inv.status === 'PENDING';

            return (
              <Card key={inv._id} className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-bold text-slate-900">
                        {project?.title || 'Escrow Project'}
                      </h3>
                      <StatusBadge status={inv.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        Client: <strong className="text-slate-700">{client?.name || project?.clientName || 'Client'}</strong>
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-indigo-600">
                        <DollarSign className="w-3.5 h-3.5" />
                        ₹{project?.totalAmount?.toLocaleString() || 0}
                      </span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    icon={Eye}
                    onClick={() => navigate(`/projects/${project?._id || project}`)}
                  >
                    View Project
                  </Button>
                </div>

                {/* Message */}
                {inv.message && (
                  <div className="py-3 text-xs text-slate-600 italic">
                    "{inv.message}"
                  </div>
                )}

                {/* Description */}
                {project?.description && (
                  <p className="text-xs text-slate-600 line-clamp-2 my-2">
                    {project.description}
                  </p>
                )}

                {/* Actions */}
                {isPending && (
                  <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-end gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={XCircle}
                      disabled={processingId === inv._id}
                      onClick={() => handleReject(inv._id)}
                    >
                      Decline
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={CheckCircle}
                      loading={processingId === inv._id}
                      onClick={() => handleAccept(inv._id)}
                    >
                      Accept & Begin Project
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
