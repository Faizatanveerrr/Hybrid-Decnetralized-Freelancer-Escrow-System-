import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Scale,
  Bot,
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Coins
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Modal from '../components/common/Modal.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import Toast from '../components/common/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';
import {
  getDisputeByIdApi,
  addEvidenceApi,
  runAIRulingApi,
  appealRulingApi,
  finalizeRulingApi,
  getProjectByIdApi
} from '../services/api.js';
import { shortenAddress } from '../services/blockchain.js';
import { onchain, chainError, txPrompt } from '../services/chain.js';

const errMsg = (err, fallback) => err?.response?.data?.message || chainError(err) || fallback;

export default function DisputeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { refreshWallet } = useWallet();

  const [dispute, setDispute] = useState(null);
  const [project, setProject] = useState(null); // needed for on-chain settlement
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [runningAI, setRunningAI] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Evidence modal state
  const [evidenceModal, setEvidenceModal] = useState({
    isOpen: false,
    name: '',
    description: ''
  });

  // Appeal modal state
  const [appealModal, setAppealModal] = useState({
    isOpen: false,
    reason: ''
  });

  useEffect(() => {
    loadDispute();
  }, [id]);

  const loadDispute = async () => {
    setLoading(true);
    try {
      const res = await getDisputeByIdApi(id);
      if (res.data.success) {
        setDispute(res.data.dispute);
        try {
          const pid = res.data.dispute.projectId?._id || res.data.dispute.projectId;
          const pRes = await getProjectByIdApi(pid);
          if (pRes.data?.success) setProject(pRes.data.project);
        } catch (e) {
          // project lookup only matters for on-chain projects
        }
      } else {
        setError('Dispute not found');
      }
    } catch (err) {
      setError(err.message || 'Error loading dispute');
    } finally {
      setLoading(false);
    }
  };

  // Run AI Arbitration Analysis
  const handleRunAI = async () => {
    setRunningAI(true);
    try {
      const res = await runAIRulingApi(id);
      if (res.data.success) {
        setToastMessage(res.data.message || 'AI Arbitration analysis complete!');
        setDispute(res.data.dispute);
      }
    } catch (err) {
      alert(errMsg(err, 'AI Arbitration error'));
    } finally {
      setRunningAI(false);
    }
  };

  // Submit Evidence
  const handleSubmitEvidence = async (e) => {
    e.preventDefault();
    if (!evidenceModal.name || !evidenceModal.description) return;

    try {
      const res = await addEvidenceApi(id, {
        submittedBy: role,
        name: evidenceModal.name,
        description: evidenceModal.description
      });
      if (res.data.success) {
        setToastMessage('Evidence added to case dossier.');
        setEvidenceModal({ isOpen: false, name: '', description: '' });
        setDispute(res.data.dispute);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit evidence');
    }
  };

  // The on-chain milestone this dispute belongs to (null for off-chain projects)
  const chainMilestone = () =>
    project?.escrowAddress
      ? (project.milestones || []).find((m) => String(m._id) === String(dispute.milestoneId))
      : null;

  // Submit Appeal
  const handleConfirmAppeal = async (e) => {
    e.preventDefault();
    if (!appealModal.reason.trim()) return;

    try {
      const ms = chainMilestone();
      if (ms) {
        setToastMessage(txPrompt(user, 'appeal transaction'));
        await onchain.appeal(project, ms, user);
      }
      const res = await appealRulingApi(id, {
        reason: appealModal.reason,
        appealedBy: user?.name || role
      });
      if (res.data.success) {
        setToastMessage('Appeal filed. Case status updated to Appeal Window.');
        setAppealModal({ isOpen: false, reason: '' });
        setDispute(res.data.dispute);
      }
    } catch (err) {
      alert(errMsg(err, 'Appeal submission failed'));
    }
  };

  // Finalize Ruling and execute on-chain payout to winner
  const handleFinalizeRuling = async () => {
    setFinalizing(true);
    try {
      let txHash;
      const ms = chainMilestone();
      if (ms) {
        setToastMessage(txPrompt(user, 'payout transaction'));
        txHash = (await onchain.finalize(project, ms, user)).txHash;
      }
      const res = await finalizeRulingApi(id, txHash ? { txHash } : {});
      if (res.data.success) {
        setToastMessage(`Dispute finalized! On-chain payout executed. Tx: ${shortenAddress(res.data.txHash, 6)}`);
        setDispute(res.data.dispute);
        await refreshWallet();
      }
    } catch (err) {
      alert(errMsg(err, 'Finalization failed'));
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading Case Dossier...">
        <Loading message="Parsing case evidence and smart contract records..." />
      </DashboardLayout>
    );
  }

  if (error || !dispute) {
    return (
      <DashboardLayout title="Error">
        <ErrorState
          title="Dispute Dossier Not Found"
          message={error || 'Unable to locate case files.'}
          onRetry={loadDispute}
        />
      </DashboardLayout>
    );
  }

  const isResolved = dispute.status === 'FINALIZED';

  return (
    <DashboardLayout title="Dispute Case Dossier">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowLeft}
          onClick={() => navigate('/disputes')}
        >
          Back to Disputes
        </Button>

        <div className="flex items-center gap-3">
          <StatusBadge status={dispute.status} size="lg" />
          <span className="text-sm font-bold text-slate-800 bg-white px-3 py-1 rounded-xl border border-slate-200">
            Escrow at Stake: ₹{dispute.amount?.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (2 Cols): Case Information & Evidence */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Case Metadata Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <span className="text-[11px] font-mono text-slate-400 block">Case ID: {dispute._id}</span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">{dispute.projectTitle}</h2>
                <p className="text-xs font-semibold text-indigo-600">Milestone: {dispute.milestoneTitle}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Locked in Escrow</span>
                <p className="text-2xl font-extrabold text-slate-900">₹{dispute.amount}</p>
              </div>
            </div>

            {/* Acceptance Criteria (Contractual Benchmark) */}
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 mb-5">
              <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider block mb-1">
                ⚖️ Binding Acceptance Criteria (Contract Reference)
              </span>
              <p className="text-xs text-indigo-950 font-medium leading-relaxed">
                {dispute.acceptanceCriteria || 'Deliverables verified and passing unit assertions.'}
              </p>
            </div>

            {/* Claims Comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-xs font-bold text-slate-800 block">Client Claim:</span>
                <p className="text-xs text-slate-600 leading-relaxed italic">
                  "{dispute.clientClaim || 'Deliverables failed to satisfy acceptance criteria specifications.'}"
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-xs font-bold text-slate-800 block">Freelancer Rebuttal:</span>
                <p className="text-xs text-slate-600 leading-relaxed italic">
                  "{dispute.freelancerClaim || 'Delivered all agreed assets on schedule as per technical guidelines.'}"
                </p>
              </div>
            </div>
          </Card>

          {/* Evidence Dossier Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Submitted Evidence & Proofs</h3>
                <p className="text-xs text-slate-500">
                  Screenshots, test logs, code repositories, and recorded inspection videos
                </p>
              </div>
              {!isResolved && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={UploadCloud}
                  onClick={() => setEvidenceModal({ isOpen: true, name: '', description: '' })}
                >
                  Add Evidence
                </Button>
              )}
            </div>

            {(dispute.evidence || []).length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center bg-slate-50 rounded-xl">
                No formal evidence filed yet. Click Add Evidence to submit proof for AI consideration.
              </p>
            ) : (
              <div className="space-y-3">
                {dispute.evidence.map((ev, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        {ev.name}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ev.submittedBy === 'client' ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        Submitted by {ev.submittedBy?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{ev.description}</p>
                    <span className="text-[10px] text-slate-400 block mt-2">
                      Timestamp: {new Date(ev.date || Date.now()).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* Right Column (1 Col): AI Arbitrator Ruling Panel */}
        <div className="space-y-6">
          
          <Card className="p-6 bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 text-white rounded-2xl shadow-xl border-purple-900/40">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">AI Legal Arbitrator</h3>
                  <p className="text-[10px] text-purple-300">Autonomous Escrow Judge</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-400/30">
                v2.5 Flash
              </span>
            </div>

            {/* AI Status Indicator */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 mb-4 text-xs">
              <span className="text-purple-300 font-semibold block text-[10px] uppercase">Arbitration Status</span>
              <p className="font-bold text-white mt-0.5">{dispute.status}</p>
            </div>

            {/* Ruling Card if AI has run */}
            {dispute.aiWinner ? (
              <div className="space-y-4">
                
                {/* Winner Pill */}
                <div className="p-4 rounded-xl bg-purple-900/50 border border-purple-500/40 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                    Rendered AI Ruling
                  </span>
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-xl font-extrabold text-white capitalize">
                      Favors: {dispute.aiWinner}
                    </h4>
                    <span className="text-xs font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30">
                      {dispute.aiConfidence}% Confidence
                    </span>
                  </div>
                </div>

                {/* Reasoning Quote */}
                <div className="space-y-1.5 text-xs text-purple-100/90 leading-relaxed bg-black/20 p-3.5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-purple-300 uppercase block">
                    Legal & Technical Reasoning:
                  </span>
                  <p className="whitespace-pre-line text-xs">{dispute.aiReasoning}</p>
                </div>

                {/* Secondary review result (overrides the primary ruling) */}
                {dispute.secondaryWinner && (
                  <div className="p-4 rounded-xl bg-indigo-900/50 border border-indigo-500/40 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                      Secondary Review (Final)
                    </span>
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-lg font-extrabold text-white capitalize">
                        Favors: {dispute.secondaryWinner}
                      </h4>
                      <span className="text-xs font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30">
                        {dispute.secondaryConfidence}% Confidence
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-xs text-purple-100/90">{dispute.secondaryReasoning}</p>
                  </div>
                )}

                {/* Actions based on state (mirrors the smart-contract rules) */}
                {!isResolved && (() => {
                  const needsSecondary =
                    !dispute.secondaryWinner && (dispute.appealed || dispute.needsSecondaryReview);
                  const windowEnd = dispute.appealPeriodExpires ? new Date(dispute.appealPeriodExpires) : null;
                  const windowOpen =
                    !dispute.secondaryWinner && !needsSecondary && windowEnd && new Date() < windowEnd;

                  return (
                    <div className="space-y-2 pt-2">
                      {needsSecondary && (
                        <>
                          <p className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                            {dispute.appealed
                              ? 'This ruling was appealed. A secondary review must be completed before payout.'
                              : 'The AI was not confident enough (below 70%). A secondary review is required before payout.'}
                          </p>
                          <Button
                            variant="primary"
                            icon={Sparkles}
                            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold"
                            onClick={handleRunAI}
                            loading={runningAI}
                          >
                            Run Secondary Review
                          </Button>
                        </>
                      )}

                      {windowOpen && (
                        <p className="text-[11px] text-purple-200 bg-white/5 border border-white/10 rounded-lg p-2.5">
                          Appeal window open until {windowEnd.toLocaleString()}. Payout unlocks once it closes.
                        </p>
                      )}

                      {!needsSecondary && (
                        <Button
                          variant="primary"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
                          onClick={handleFinalizeRuling}
                          loading={finalizing}
                          disabled={windowOpen}
                        >
                          Finalize Ruling & Execute Payout
                        </Button>
                      )}

                      {windowOpen && (
                        <Button
                          variant="outline"
                          className="w-full bg-white/5 hover:bg-white/10 text-purple-200 border-white/20 text-xs"
                          onClick={() => setAppealModal({ isOpen: true, reason: '' })}
                        >
                          File Formal Appeal
                        </Button>
                      )}
                    </div>
                  );
                })()}

                {isResolved && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center text-xs text-emerald-300 font-bold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Ruling Enforced & Payout Completed
                  </div>
                )}

              </div>
            ) : (
              <div className="space-y-4 py-4 text-center">
                <p className="text-xs text-purple-200 leading-relaxed">
                  The dispute is ready for autonomous arbitration. The AI will parse the contractual acceptance criteria against submitted claims and evidence.
                </p>
                <Button
                  variant="primary"
                  icon={Sparkles}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg"
                  onClick={handleRunAI}
                  loading={runningAI}
                >
                  Trigger AI Arbitration Ruling
                </Button>
              </div>
            )}
          </Card>

          {/* College Viva Explainer Card */}
          <Card className="p-5 text-xs text-slate-600 space-y-2 bg-slate-50 border-slate-200">
            <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <ShieldCheck className="w-4 h-4 text-indigo-600" /> Viva Talking Point
            </span>
            <p className="leading-relaxed">
              In EscrowX, smart contracts hold collateral in non-custodial escrow. Rather than expensive third-party human mediators, LLMs serve as rapid, objective first-line arbitrators with verifiable reasoning logs.
            </p>
          </Card>

        </div>

      </div>

      {/* Add Evidence Modal */}
      <Modal
        isOpen={evidenceModal.isOpen}
        onClose={() => setEvidenceModal({ ...evidenceModal, isOpen: false })}
        title="Submit Dispute Evidence"
      >
        <form onSubmit={handleSubmitEvidence} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Evidence Document / File Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. vector_path_inspection.mov"
              value={evidenceModal.name}
              onChange={(e) => setEvidenceModal({ ...evidenceModal, name: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description & Evidence Context *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Explain how this file demonstrates compliance with or breach of the acceptance criteria..."
              value={evidenceModal.description}
              onChange={(e) => setEvidenceModal({ ...evidenceModal, description: e.target.value })}
              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEvidenceModal({ ...evidenceModal, isOpen: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Attach to Case
            </Button>
          </div>
        </form>
      </Modal>

      {/* Appeal Ruling Modal */}
      <Modal
        isOpen={appealModal.isOpen}
        onClose={() => setAppealModal({ ...appealModal, isOpen: false })}
        title="File Appeal Against AI Ruling"
      >
        <form onSubmit={handleConfirmAppeal} className="space-y-4">
          <p className="text-xs text-slate-600">
            If you believe the AI Arbitrator misinterpreted technical proofs or overlooked acceptance terms, specify grounds for appeal.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Appeal Grounds & Clarification *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Detail the technical or factual discrepancies in the AI ruling..."
              value={appealModal.reason}
              onChange={(e) => setAppealModal({ ...appealModal, reason: e.target.value })}
              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAppealModal({ ...appealModal, isOpen: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Submit Appeal
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
