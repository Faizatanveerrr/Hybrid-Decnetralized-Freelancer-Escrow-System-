import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Wallet,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  FileText,
  MessageSquare,
  ShieldCheck,
  Scale,
  Send,
  ExternalLink,
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
  getProjectByIdApi,
  fundMilestoneApi,
  submitWorkApi,
  approveMilestoneApi,
  cancelMilestoneApi,
  claimAfterTimeoutApi,
  createDisputeApi,
  uploadProjectFileApi,
  createProposalApi,
  getProjectProposalsApi,
  acceptProposalApi,
  rejectProposalApi,
  registerEscrowApi
} from '../services/api.js';
import ChatPanel from '../components/common/ChatPanel.jsx';
import { shortenAddress } from '../services/blockchain.js';
import { onchain, loadChainConfig, chainError, explorerAddress, txPrompt } from '../services/chain.js';
import { loadIpfsConfig, uploadFile, uploadText, downloadFile, shortCid } from '../services/ipfs.js';
import { roleForProject, idOf } from '../utils/roles.js';

// Prefer the server's message; otherwise a readable wallet/chain error.
const errMsg = (err, fallback) => err?.response?.data?.message || chainError(err) || fallback;

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role: modeRole } = useAuth();
  const { refreshWallet } = useWallet();

  const [project, setProject] = useState(null);
  // On this project you are its client or its freelancer; the mode switch only applies to outsiders.
  const role = roleForProject(project, user, modeRole);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('milestones'); // overview, milestones, files, messages, proposals
  const [toastMessage, setToastMessage] = useState('');
  const [chainConfig, setChainConfig] = useState({ enabled: false });
  const [deployingEscrow, setDeployingEscrow] = useState(false);
  const [ipfsConfig, setIpfsConfig] = useState({ enabled: false });
  const [submitFile, setSubmitFile] = useState(null);
  const [submittingWork, setSubmittingWork] = useState(false);

  // Proposals state
  const [proposals, setProposals] = useState([]);
  const [proposalModal, setProposalModal] = useState({
    isOpen: false,
    message: '',
    proposedAmount: ''
  });
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const [acceptingProposalId, setAcceptingProposalId] = useState(null);
  const [rejectingProposalId, setRejectingProposalId] = useState(null);

  // Modals state
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    variant: 'primary',
    onConfirm: null
  });

  const [submitWorkModal, setSubmitWorkModal] = useState({
    isOpen: false,
    milestoneId: null,
    proof: ''
  });

  const [disputeModal, setDisputeModal] = useState({
    isOpen: false,
    milestoneId: null,
    claim: ''
  });

  const [uploadFileModal, setUploadFileModal] = useState({
    isOpen: false,
    name: '',
    size: '1.8 MB'
  });

  useEffect(() => {
    loadChainConfig().then(setChainConfig);
    loadIpfsConfig().then(setIpfsConfig);
  }, []);

  useEffect(() => {
    loadProjectDetails();
    loadProposals();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'proposals') {
      loadProposals();
    }
  }, [activeTab]);

  const loadProjectDetails = async () => {
    setLoading(true);
    try {
      const res = await getProjectByIdApi(id);
      if (res.data.success) {
        setProject(res.data.project);
      } else {
        setError('Project not found');
      }
    } catch (err) {
      setError(err.message || 'Error loading project');
    } finally {
      setLoading(false);
    }
  };

  const loadProposals = async () => {
    try {
      const res = await getProjectProposalsApi(id);
      if (res.data?.success) {
        setProposals(res.data.proposals || []);
      }
    } catch (err) {
      console.error('Failed to load proposals:', err);
    }
  };

  const handleOpenProposalModal = () => {
    setProposalError('');
    setProposalModal({
      isOpen: true,
      message: '',
      proposedAmount: project?.totalAmount || ''
    });
  };

  const handleSendProposal = async (e) => {
    e.preventDefault();
    setProposalError('');
    if (!proposalModal.message.trim()) {
      setProposalError('Please provide a proposal message.');
      return;
    }
    if (!proposalModal.proposedAmount || Number(proposalModal.proposedAmount) <= 0) {
      setProposalError('Please enter a valid proposed amount.');
      return;
    }

    setSubmittingProposal(true);
    try {
      const res = await createProposalApi(id, {
        message: proposalModal.message.trim(),
        proposedAmount: Number(proposalModal.proposedAmount)
      });
      if (res.data?.success) {
        setToastMessage('Proposal submitted successfully to client!');
        setProposalModal({ isOpen: false, message: '', proposedAmount: '' });
        loadProposals();
      } else {
        setProposalError(res.data?.message || 'Failed to submit proposal');
      }
    } catch (err) {
      setProposalError(err.response?.data?.message || 'Failed to submit proposal');
    } finally {
      setSubmittingProposal(false);
    }
  };

  const handleAcceptProposal = async (proposalId) => {
    setAcceptingProposalId(proposalId);
    try {
      const res = await acceptProposalApi(proposalId);
      if (res.data?.success) {
        setToastMessage(res.data.message || 'Proposal accepted! Freelancer assigned.');
        loadProjectDetails();
        loadProposals();
      } else {
        alert(res.data?.message || 'Failed to accept proposal');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to accept proposal');
    } finally {
      setAcceptingProposalId(null);
    }
  };

  const handleRejectProposal = async (proposalId) => {
    if (!window.confirm('Are you sure you want to reject this proposal?')) return;
    setRejectingProposalId(proposalId);
    try {
      const res = await rejectProposalApi(proposalId);
      if (res.data?.success) {
        setToastMessage('Proposal has been rejected.');
        loadProposals();
      } else {
        alert(res.data?.message || 'Failed to reject proposal');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject proposal');
    } finally {
      setRejectingProposalId(null);
    }
  };

  // Client deploys the EscrowX contract from their wallet, then the server verifies it
  const handleDeployEscrow = async () => {
    if (!user?.walletAddress) {
      alert('You need a wallet first - open the Wallet page.');
      return;
    }
    setDeployingEscrow(true);
    try {
      setToastMessage(txPrompt(user, 'contract deployment'));
      const { address, txHash } = await onchain.deployEscrow(project, user);
      const res = await registerEscrowApi(id, { escrowAddress: address, txHash });
      if (res.data?.success) {
        setToastMessage('Escrow contract deployed and verified on-chain.');
        await loadProjectDetails();
      }
    } catch (err) {
      alert(errMsg(err, 'Escrow deployment failed'));
    } finally {
      setDeployingEscrow(false);
    }
  };

  // Milestone action: Client Funds
  const handleFund = (ms) => {
    setConfirmModal({
      isOpen: true,
      title: 'Fund Milestone Escrow',
      message: `Are you sure you want to lock ₹${ms.amount} into the decentralized escrow contract for "${ms.title}"?`,
      confirmText: `Deposit ₹${ms.amount}`,
      variant: 'primary',
      onConfirm: async () => {
        try {
          let txHash;
          if (project.escrowAddress) {
            setToastMessage(txPrompt(user, 'approval and deposit transactions'));
            txHash = (await onchain.fund(project, ms, user)).txHash;
          }
          const res = await fundMilestoneApi(ms._id, txHash ? { txHash } : {});
          if (res.data.success) {
            setToastMessage(`Milestone funded! Tx: ${shortenAddress(res.data.txHash, 6)}`);
            await loadProjectDetails();
            await refreshWallet();
          }
        } catch (err) {
          alert(errMsg(err, 'Funding failed'));
        } finally {
          setConfirmModal({ ...confirmModal, isOpen: false });
        }
      }
    });
  };

  // Milestone action: Client Approves
  const handleApprove = (ms) => {
    setConfirmModal({
      isOpen: true,
      title: 'Approve & Release Payment',
      message: `Are you sure you want to release ₹${ms.amount} to the freelancer? Once released, this smart contract action cannot be reversed.`,
      confirmText: `Release ₹${ms.amount}`,
      variant: 'success',
      onConfirm: async () => {
        try {
          let txHash;
          if (project.escrowAddress) {
            setToastMessage(txPrompt(user, 'release transaction'));
            txHash = (await onchain.approve(project, ms, user)).txHash;
          }
          const res = await approveMilestoneApi(ms._id, txHash ? { txHash } : {});
          if (res.data.success) {
            setToastMessage(`Payment released to freelancer! Tx: ${shortenAddress(res.data.txHash, 6)}`);
            await loadProjectDetails();
            await refreshWallet();
          }
        } catch (err) {
          alert(errMsg(err, 'Approval failed'));
        } finally {
          setConfirmModal({ ...confirmModal, isOpen: false });
        }
      }
    });
  };

  // Milestone action: Freelancer submits work
  const handleOpenSubmitWork = (ms) => {
    setSubmitWorkModal({
      isOpen: true,
      milestoneId: ms._id,
      proof: ''
    });
  };

  const handleConfirmSubmitWork = async (e) => {
    e.preventDefault();
    if (!submitWorkModal.proof.trim() && !submitFile) return;

    setSubmittingWork(true);
    try {
      // 1. Optional deliverable file -> encrypted, stored on IPFS (hash = its content fingerprint)
      let stored = null;
      if (submitFile) {
        setToastMessage('Encrypting and storing your file on IPFS...');
        stored = await uploadFile(project._id, 'deliverable', submitFile);
      }
      // 2. On-chain, the contract records the file's hash (or the note if there is no file)
      let txHash;
      if (project.escrowAddress) {
        const ms = project.milestones.find((m) => m._id === submitWorkModal.milestoneId);
        setToastMessage(txPrompt(user, 'submission transaction'));
        txHash = (await onchain.submit(project, ms, user, stored ? stored.uri : submitWorkModal.proof)).txHash;
      }
      const res = await submitWorkApi(submitWorkModal.milestoneId, {
        proof: submitWorkModal.proof,
        ...(stored ? { proofCid: stored.cid } : {}),
        ...(txHash ? { txHash } : {})
      });
      if (res.data.success) {
        setToastMessage('Deliverables submitted! Auto-release countdown started.');
        setSubmitWorkModal({ isOpen: false, milestoneId: null, proof: '' });
        setSubmitFile(null);
        await loadProjectDetails();
      }
    } catch (err) {
      alert(errMsg(err, 'Submission failed'));
    } finally {
      setSubmittingWork(false);
    }
  };

  // Milestone action: Raise Dispute
  const handleOpenDispute = (ms) => {
    setDisputeModal({
      isOpen: true,
      milestoneId: ms._id,
      claim: ''
    });
  };

  const handleConfirmDispute = async (e) => {
    e.preventDefault();
    if (!disputeModal.claim.trim()) return;

    try {
      if (project.escrowAddress) {
        const ms = project.milestones.find((m) => m._id === disputeModal.milestoneId);
        setToastMessage(txPrompt(user, 'dispute transaction'));
        // The claim is stored on IPFS and its hash goes on-chain (falls back to plain text).
        let evidenceRef = disputeModal.claim.slice(0, 500);
        if (ipfsConfig.enabled) {
          try {
            evidenceRef = (await uploadText(project._id, 'evidence', disputeModal.claim, 'dispute-claim.txt')).uri;
          } catch (e) { /* keep the plain-text reference */ }
        }
        await onchain.raiseDispute(project, ms, user, evidenceRef);
      }
      const res = await createDisputeApi({
        milestoneId: disputeModal.milestoneId,
        openedBy: user?.id || user?._id,
        openedByName: user?.name,
        openedByRole: role,
        clientClaim: role === 'client' ? disputeModal.claim : '',
        freelancerClaim: role === 'freelancer' ? disputeModal.claim : ''
      });
      if (res.data.success) {
        setToastMessage('Dispute opened. AI Arbitrator will review claims.');
        setDisputeModal({ isOpen: false, milestoneId: null, claim: '' });
        await loadProjectDetails();
        navigate(`/disputes/${res.data.dispute._id}`);
      }
    } catch (err) {
      alert(errMsg(err, 'Dispute initialization failed'));
    }
  };

  // Milestone action: Freelancer claim timeout
  const handleClaimTimeout = async (ms) => {
    try {
      let txHash;
      if (project.escrowAddress) {
        setToastMessage(txPrompt(user, 'claim transaction'));
        txHash = (await onchain.claimTimeout(project, ms, user)).txHash;
      }
      const res = await claimAfterTimeoutApi(ms._id, txHash ? { txHash } : {});
      if (res.data.success) {
        setToastMessage(`Timeout claimed! ₹${ms.amount} released.`);
        await loadProjectDetails();
        await refreshWallet();
      }
    } catch (err) {
      alert(errMsg(err, 'Claim timeout failed'));
    }
  };

  // Upload proof file
  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!uploadFileModal.name.trim()) return;

    try {
      const res = await uploadProjectFileApi(id, {
        name: uploadFileModal.name,
        size: uploadFileModal.size,
        uploadedBy: user?.name || (role === 'client' ? 'Client' : 'Freelancer')
      });
      if (res.data.success) {
        setToastMessage('File added to project vault.');
        setUploadFileModal({ isOpen: false, name: '', size: '1.8 MB' });
        await loadProjectDetails();
      }
    } catch (err) {
      alert('Upload failed');
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading Project...">
        <Loading message="Fetching escrow contract details..." />
      </DashboardLayout>
    );
  }

  if (error || !project) {
    return (
      <DashboardLayout title="Error">
        <ErrorState
          title="Project Not Found"
          message={error || 'Could not locate the requested project.'}
          onRetry={loadProjectDetails}
        />
      </DashboardLayout>
    );
  }

  const isProjectClient = Boolean(project) && idOf(project.client) === idOf(user);
  const isProjectFreelancer = Boolean(project?.freelancer) && idOf(project.freelancer) === idOf(user);
  const isClient = isProjectClient; // client actions are only for this project's client
  const myProposal = proposals.find(p => String(p.freelancerId?._id || p.freelancerId) === String(user?._id || user?.id));
  const milestonesList = project.milestones || project.milestonesList || [];
  const filesList = project.files || [];

  return (
    <DashboardLayout title={project.title}>
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}

      {/* Top Breadcrumb & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowLeft}
          onClick={() => navigate('/projects')}
        >
          Back to Projects
        </Button>

        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} size="lg" />
          <span className="text-sm font-bold text-slate-800 bg-white px-3 py-1 rounded-xl border border-slate-200">
            Total: ₹{project.totalAmount?.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Freelancer Opportunity & Proposal Banner */}
      {!project.freelancer && role === 'freelancer' && (
        <Card className="p-6 mb-6 bg-gradient-to-r from-emerald-500/10 via-indigo-500/5 to-purple-500/10 border-emerald-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full inline-block mb-1.5">
                Open Escrow Opportunity
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {myProposal ? 'You have submitted a proposal' : 'Interested in working on this project?'}
              </h3>
              <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                {myProposal
                  ? `Your pitch: "${myProposal.message}" • Proposed Amount: ₹${myProposal.proposedAmount}`
                  : `Submit your proposal with a custom pitch and proposed INR rate. Once accepted by the client, the project activates with milestone escrow.`}
              </p>
            </div>
            <div>
              {myProposal ? (
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500">Status:</span>
                  <StatusBadge status={myProposal.status} />
                </div>
              ) : (
                <Button
                  variant="primary"
                  icon={Send}
                  onClick={handleOpenProposalModal}
                >
                  Send Proposal
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Project Header Card */}
      <Card className="p-6 mb-8 border-indigo-100/60 bg-gradient-to-br from-white to-slate-50/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{project.title}</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              {project.description}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs shrink-0">
            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Client</span>
              <span className="font-bold text-slate-800">{project.clientName}</span>
              <p className="font-mono text-[10px] text-slate-400">{shortenAddress(project.clientWallet)}</p>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Freelancer</span>
              <span className="font-bold text-slate-800">{project.freelancerName || 'Unassigned'}</span>
              <p className="font-mono text-[10px] text-slate-400">{shortenAddress(project.freelancerWallet)}</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-200/60 overflow-x-auto">
          {[
            { id: 'milestones', label: 'Milestones Timeline', count: milestonesList.length },
            { id: 'overview', label: 'Contract Overview' },
            { id: 'files', label: 'Deliverables & Files', count: filesList.length },
            ...(isProjectClient || isProjectFreelancer ? [{ id: 'messages', label: 'Project Chat' }] : []),
            ...(isProjectClient || proposals.length > 0
              ? [{ id: 'proposals', label: 'Proposals', count: proposals.length }]
              : [])
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === tab.id ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Tab 1: Milestones Timeline */}
      {activeTab === 'milestones' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">Milestone Escrow Schedule</h3>
              <p className="text-xs text-slate-500">
                Current role: <strong>{role.toUpperCase()}</strong>. Action buttons adapt automatically to your view.
              </p>
            </div>
          </div>

          {chainConfig.enabled && project.freelancer && (
            project.escrowAddress ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                <span className="text-emerald-800 font-semibold">
                  On-chain escrow active: payments settle in INR tokens on the blockchain.
                </span>
                <a
                  href={explorerAddress(chainConfig, project.escrowAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline whitespace-nowrap"
                >
                  {shortenAddress(project.escrowAddress, 6)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : role === 'client' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="text-xs text-indigo-900">
                  <p className="font-bold text-sm">Settle this project on the blockchain</p>
                  <p>
                    Deploy a smart-contract escrow from your wallet. Funding, approval and dispute payouts then
                    become real INR-token transactions (Sepolia). Do this before funding any milestone.
                    {!project.freelancerWallet && ' The freelancer must connect a wallet in their profile first.'}
                  </p>
                </div>
                <Button
                  variant="primary"
                  onClick={handleDeployEscrow}
                  loading={deployingEscrow}
                  disabled={!project.freelancerWallet}
                >
                  Deploy escrow contract
                </Button>
              </div>
            )
          )}

          {milestonesList.map((ms, index) => {
            const isPending = ms.status === 'PENDING';
            const isFunded = ms.status === 'FUNDED';
            const isSubmitted = ms.status === 'SUBMITTED';
            const isDisputed = ms.status === 'DISPUTED';
            const isReleased = ms.status === 'RELEASED';

            return (
              <Card key={ms._id} className="p-6 border-slate-200/80">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  
                  {/* Left: Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                        Milestone #{index + 1}
                      </span>
                      <StatusBadge status={ms.status} />
                      {ms.dueDate && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" /> Due: {ms.dueDate}
                        </span>
                      )}
                    </div>

                    <h4 className="text-base font-bold text-slate-900">{ms.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{ms.description}</p>

                    {/* Acceptance criteria box */}
                    <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                      <span className="font-bold text-slate-700 block mb-0.5">
                        Acceptance Criteria:
                      </span>
                      <span className="text-slate-600">{ms.acceptanceCriteria}</span>
                    </div>

                    {/* Proof submission text if available */}
                    {ms.proof && (
                      <div className="mt-2 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs text-indigo-900">
                        <span className="font-bold block mb-0.5">Submitted Proof / URL:</span>
                        <p className="font-mono text-[11px] break-all">{ms.proof}</p>
                        {ms.proofCid && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => downloadFile(ms.proofCid, ms.proofName || 'deliverable').catch((e) => alert(e.message))}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700"
                            >
                              Download {ms.proofName || 'file'}
                            </button>
                            <span className="font-mono text-[10px] text-indigo-700" title={ms.proofCid}>
                              {ipfsConfig.simulated ? 'local' : 'IPFS'} · {shortCid(ms.proofCid)}
                              {project.escrowAddress ? ' · hash recorded on-chain' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Amount & Role Actions */}
                  <div className="flex flex-col items-start md:items-end justify-between gap-4 shrink-0 md:min-w-44 pt-2 md:pt-0">
                    <div className="md:text-right">
                      <span className="text-xs text-slate-400">Escrow Value</span>
                      <p className="text-xl font-extrabold text-slate-900">
                        ₹{ms.amount?.toLocaleString()} <span className="text-xs font-semibold text-indigo-600">INR</span>
                      </p>
                    </div>

                    {/* Action buttons strictly mapped to role and status */}
                    <div className="flex flex-col w-full gap-2">
                      
                      {/* CLIENT ACTIONS */}
                      {isClient && isPending && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={Coins}
                          onClick={() => handleFund(ms)}
                          className="w-full"
                        >
                          Fund Escrow (₹{ms.amount})
                        </Button>
                      )}

                      {isClient && isSubmitted && (
                        <>
                          <Button
                            variant="success"
                            size="sm"
                            icon={CheckCircle2}
                            onClick={() => handleApprove(ms)}
                            className="w-full"
                          >
                            Approve & Release
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={AlertTriangle}
                            onClick={() => handleOpenDispute(ms)}
                            className="w-full"
                          >
                            Raise Dispute
                          </Button>
                        </>
                      )}

                      {/* FREELANCER ACTIONS */}
                      {isProjectFreelancer && isPending && (
                        <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-xl text-center font-medium">
                          Waiting for client funding
                        </div>
                      )}

                      {isProjectFreelancer && isFunded && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={UploadCloud}
                          onClick={() => handleOpenSubmitWork(ms)}
                          className="w-full"
                        >
                          Submit Work & Proof
                        </Button>
                      )}

                      {isProjectFreelancer && isSubmitted && (
                        <>
                          <div className="text-[11px] text-sky-700 bg-sky-50 p-2 rounded-xl text-center font-medium">
                            Submitted • Under client review
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleClaimTimeout(ms)}
                            className="w-full text-xs"
                          >
                            Claim After Timeout
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={AlertTriangle}
                            onClick={() => handleOpenDispute(ms)}
                            className="w-full text-xs"
                          >
                            Raise Dispute
                          </Button>
                        </>
                      )}

                      {/* DISPUTED STATE */}
                      {isDisputed && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Scale}
                          onClick={() => navigate('/disputes')}
                          className="w-full"
                        >
                          View Dispute Dossier
                        </Button>
                      )}

                      {/* RELEASED STATE */}
                      {isReleased && (
                        <div className="text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl text-center font-bold flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Released to Wallet
                        </div>
                      )}

                    </div>
                  </div>

                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tab 2: Contract Overview */}
      {activeTab === 'overview' && (
        <Card className="p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Smart Escrow Parameters</h3>
            <p className="text-xs text-slate-500">
              Contract metadata stored on the Ethereum / Sepolia blockchain simulation layer.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Escrow Smart Contract</span>
              <p className="font-mono font-bold text-indigo-700">Non-Custodial Escrow Vault</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Arbitration Engine</span>
              <p className="font-bold text-purple-700">Google Gemini GenAI Arbitrator v2.5</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Auto-Release Rule</span>
              <p className="font-bold text-slate-800">
                {project.escrowAddress && chainConfig.reviewPeriod
                  ? `${Math.round(chainConfig.reviewPeriod / 60)} minutes after submission (set by the escrow contract)`
                  : '72 hours after deliverable submission'}
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Escrow Currency</span>
              <p className="font-bold text-slate-800">INR (Mock INR token – 2 decimals)</p>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 3: Files & Proofs */}
      {activeTab === 'files' && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Project Deliverables & Files</h3>
              <p className="text-xs text-slate-500">Proofs, wireframes, and design assets</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={UploadCloud}
              onClick={() => setUploadFileModal({ isOpen: true, name: '', size: '2.5 MB' })}
            >
              Upload Proof
            </Button>
          </div>

          {filesList.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center bg-slate-50 rounded-xl">
              No files uploaded yet. Click Upload Proof to add deliverable files.
            </p>
          ) : (
            <div className="space-y-3">
              {filesList.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{file.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {file.size} • Uploaded by {file.uploadedBy}
                      </p>
                    </div>
                  </div>
                  <a
                    href={file.url || '#'}
                    download={file.name}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    Download <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Tab 4: Messages (private to this project's client and hired freelancer) */}
      {activeTab === 'messages' && (isProjectClient || isProjectFreelancer) && (
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">Project Discussion</h3>
          <ChatPanel projectId={id} heightClass="h-80" />
        </Card>
      )}

      {/* Tab 5: Proposals */}
      {activeTab === 'proposals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">Project Proposals</h3>
              <p className="text-xs text-slate-500">
                {isProjectClient
                  ? "Review pitches and proposed INR rates submitted by interested freelancers"
                  : "Your submitted proposal for this project"}
              </p>
            </div>
            {!project.freelancer && role === 'freelancer' && !myProposal && (
              <Button
                variant="primary"
                size="sm"
                icon={Send}
                onClick={handleOpenProposalModal}
              >
                Submit Proposal
              </Button>
            )}
          </div>

          {proposals.length === 0 ? (
            <Card className="p-8 text-center bg-slate-50 border-slate-100">
              <p className="text-xs text-slate-500">No proposals yet. When freelancers submit proposals, they will appear here.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {proposals.map((prop) => {
                const freelancer = prop.freelancerId;
                const isPending = prop.status === 'PENDING';
                const canAccept = isPending && isProjectClient && !project.freelancer;

                return (
                  <Card key={prop._id} className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
                      <div className="flex items-start gap-4">
                        <img
                          src={
                            freelancer?.avatar ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                              freelancer?.name || 'Freelancer'
                            )}`
                          }
                          alt={freelancer?.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-100 shadow-xs shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">
                              {freelancer?.name || 'Freelancer'}
                            </h4>
                            <StatusBadge status={prop.status} />
                          </div>
                          {freelancer?.walletAddress && (
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                              {shortenAddress(freelancer.walletAddress)}
                            </p>
                          )}
                          <p className="text-xs font-extrabold text-indigo-600 mt-1">
                            Proposed Amount: ₹{prop.proposedAmount?.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/profile/${freelancer?._id || freelancer}`)}
                      >
                        View Profile
                      </Button>
                    </div>

                    <div className="py-3 text-xs text-slate-700 leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-100 mt-3">
                      <span className="font-semibold text-slate-900 block mb-1">Proposal Pitch:</span>
                      "{prop.message}"
                    </div>

                    {/* Actions if client */}
                    {isProjectClient && isPending && (
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rejectingProposalId === prop._id}
                          onClick={() => handleRejectProposal(prop._id)}
                        >
                          Reject
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={CheckCircle2}
                          loading={acceptingProposalId === prop._id}
                          disabled={!canAccept}
                          onClick={() => handleAcceptProposal(prop._id)}
                        >
                          Accept & Assign Freelancer
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        title={confirmModal.title}
      >
        <p className="text-sm text-slate-600 mb-6">{confirmModal.message}</p>
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
          >
            Cancel
          </Button>
          <Button
            variant={confirmModal.variant}
            onClick={confirmModal.onConfirm}
          >
            {confirmModal.confirmText}
          </Button>
        </div>
      </Modal>

      {/* Submit Work Modal */}
      <Modal
        isOpen={submitWorkModal.isOpen}
        onClose={() => setSubmitWorkModal({ ...submitWorkModal, isOpen: false })}
        title="Submit Deliverables for Review"
      >
        <form onSubmit={handleConfirmSubmitWork} className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Provide the GitHub PR link, preview deployment URL, or Figma link to substantiate that the milestone's acceptance criteria have been satisfied.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deliverables Proof / URL *
            </label>
            <textarea
              required={!submitFile}
              rows={3}
              placeholder="e.g. GitHub PR #14 merged: https://github.com/repo/pull/14. Production build verified at https://app.example.com"
              value={submitWorkModal.proof}
              onChange={(e) => setSubmitWorkModal({ ...submitWorkModal, proof: e.target.value })}
              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {ipfsConfig.enabled && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Or attach the deliverable file
              </label>
              <input
                type="file"
                onChange={(e) => setSubmitFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                The file is encrypted and stored on {ipfsConfig.simulated ? 'the server (demo mode, not the IPFS network)' : 'IPFS'};
                only you and the client can open it. Its fingerprint is recorded on the blockchain so it cannot be changed later.
                Maximum {ipfsConfig.maxMb} MB.
              </p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSubmitWorkModal({ ...submitWorkModal, isOpen: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submittingWork}>
              Submit to Client
            </Button>
          </div>
        </form>
      </Modal>

      {/* Raise Dispute Modal */}
      <Modal
        isOpen={disputeModal.isOpen}
        onClose={() => setDisputeModal({ ...disputeModal, isOpen: false })}
        title="Initiate Escrow Dispute"
      >
        <form onSubmit={handleConfirmDispute} className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
            <strong>Escrow Lock Notice:</strong> Opening a dispute freezes the funds in the smart contract until the AI Arbitrator and both parties reach resolution.
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Detailed Claim / Issue *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Explain why the deliverables fail to satisfy the acceptance criteria, or why payment is being unjustly withheld..."
              value={disputeModal.claim}
              onChange={(e) => setDisputeModal({ ...disputeModal, claim: e.target.value })}
              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisputeModal({ ...disputeModal, isOpen: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Lock in Dispute
            </Button>
          </div>
        </form>
      </Modal>

      {/* Upload File Modal */}
      <Modal
        isOpen={uploadFileModal.isOpen}
        onClose={() => setUploadFileModal({ ...uploadFileModal, isOpen: false })}
        title="Upload Project Deliverable"
      >
        <form onSubmit={handleUploadFile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              File Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. final_vector_logo.svg"
              value={uploadFileModal.name}
              onChange={(e) => setUploadFileModal({ ...uploadFileModal, name: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUploadFileModal({ ...uploadFileModal, isOpen: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Upload
            </Button>
          </div>
        </form>
      </Modal>

      {/* Send Proposal Modal */}
      <Modal
        isOpen={proposalModal.isOpen}
        onClose={() => setProposalModal({ ...proposalModal, isOpen: false })}
        title="Submit Project Proposal"
      >
        <form onSubmit={handleSendProposal} className="space-y-4">
          {proposalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              {proposalError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Why should the client choose you? *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Describe your relevant experience, technical approach, and how you will fulfill the milestones..."
              value={proposalModal.message}
              onChange={(e) => setProposalModal({ ...proposalModal, message: e.target.value })}
              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Proposed Total Amount (₹ INR) *
            </label>
            <input
              type="number"
              required
              min={1}
              placeholder="e.g. 500"
              value={proposalModal.proposedAmount}
              onChange={(e) => setProposalModal({ ...proposalModal, proposedAmount: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-semibold"
            />
            <p className="text-[10px] text-slate-400 mt-1">Project total budget: ₹{project.totalAmount}</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setProposalModal({ ...proposalModal, isOpen: false })}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" icon={Send} loading={submittingProposal}>
              Send Proposal
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
