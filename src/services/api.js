import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Attach the signed login token to every request
api.interceptors.request.use((config) => {
  const storedUser = localStorage.getItem('escrowx_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      if (user?.token) config.headers.Authorization = `Bearer ${user.token}`;
    } catch (e) {
      // Ignore parse errors
    }
  }
  return config;
});

// An expired or missing token means the session is over: send the user to log in again.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !/\/auth\/(login|register)/.test(url)) {
      localStorage.removeItem('escrowx_user');
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const loginApi = (email, password) => api.post('/auth/login', { email, password });
export const registerApi = (data) => api.post('/auth/register', data);
export const getMeApi = (userId) => api.get('/auth/me', { params: { userId } });

// User APIs
export const getUserByIdApi = (id) => api.get(`/users/${id}`);
export const updateUserApi = (id, data) => api.put(`/users/${id}`, data);

// Project APIs
export const getProjectsApi = (params) => api.get('/projects', { params });
export const getProjectByIdApi = (id) => api.get(`/projects/${id}`);
export const createProjectApi = (data) => api.post('/projects', data);
export const updateProjectApi = (id, data) => api.put(`/projects/${id}`, data);
export const deleteProjectApi = (id) => api.delete(`/projects/${id}`);
export const uploadProjectFileApi = (id, data) => api.post(`/projects/${id}/files`, data);

// Milestone APIs
export const getMilestonesApi = (params) => api.get('/milestones', { params });
export const getMilestoneByIdApi = (id) => api.get(`/milestones/${id}`);
export const fundMilestoneApi = (id, data = {}) => api.post(`/milestones/${id}/fund`, data);
export const submitWorkApi = (id, data) => api.post(`/milestones/${id}/submit`, data);
export const approveMilestoneApi = (id, data = {}) => api.post(`/milestones/${id}/approve`, data);
export const cancelMilestoneApi = (id, data = {}) => api.post(`/milestones/${id}/cancel`, data);
export const claimAfterTimeoutApi = (id, data = {}) => api.post(`/milestones/${id}/claim-timeout`, data);

// Dispute APIs
export const getDisputesApi = (params) => api.get('/disputes', { params });
export const getDisputeByIdApi = (id) => api.get(`/disputes/${id}`);
export const createDisputeApi = (data) => api.post('/disputes', data);
export const addEvidenceApi = (id, data) => api.post(`/disputes/${id}/evidence`, data);
export const runAIRulingApi = (id) => api.post(`/disputes/${id}/ai-ruling`);
export const appealRulingApi = (id, data) => api.post(`/disputes/${id}/appeal`, data);
export const finalizeRulingApi = (id, data = {}) => api.post(`/disputes/${id}/finalize`, data);

// Platform-managed wallets
export const chainTxApi = (data) => api.post('/chain/tx', data);
export const useManagedWalletApi = () => api.post('/wallet/use-managed');

// Withdrawals: INR tokens -> rupees to a UPI ID
export const getPayoutConfigApi = () => api.get('/payouts/config');
export const validatePayoutApi = (data) => api.post('/payouts/validate', data);
export const createPayoutApi = (data) => api.post('/payouts', data);
export const getMyPayoutsApi = () => api.get('/payouts/mine');

// Fiat top-ups (UPI / Paytm / cards via Razorpay) converted 1:1 to INR tokens
export const getPaymentConfigApi = () => api.get('/payments/config');
export const createPaymentOrderApi = (data) => api.post('/payments/order', data);
export const verifyPaymentApi = (data) => api.post('/payments/verify', data);
export const getMyPaymentsApi = () => api.get('/payments/mine');

// On-chain (Sepolia) settlement
export const getChainConfigApi = () => api.get('/chain/config');
export const registerEscrowApi = (projectId, data) => api.post(`/projects/${projectId}/escrow`, data);

// Message APIs
export const getMessagesApi = (projectId) => api.get(`/messages/${projectId}`);
export const sendMessageApi = (projectId, data) => api.post(`/messages/${projectId}`, data);

// Wallet APIs
export const getWalletInfoApi = (userId) => api.get(`/wallet/${userId}`);
export const getTransactionsApi = (userId) => api.get(`/wallet/transactions/${userId}`);

// Marketplace APIs
export const getAvailableProjectsApi = () => api.get('/projects/available');
export const getFreelancersApi = (params) => api.get('/freelancers', { params });
export const getFreelancerByIdApi = (id) => api.get(`/freelancers/${id}`);

// Proposal APIs
export const createProposalApi = (projectId, data) => api.post(`/projects/${projectId}/proposals`, data);
export const getProjectProposalsApi = (projectId) => api.get(`/projects/${projectId}/proposals`);
export const acceptProposalApi = (proposalId) => api.put(`/proposals/${proposalId}/accept`);
export const rejectProposalApi = (proposalId) => api.put(`/proposals/${proposalId}/reject`);
export const getMyProposalsApi = () => api.get('/proposals/my');

// Invitation APIs
export const createInvitationApi = (projectId, data) => api.post(`/projects/${projectId}/invitations`, data);
export const getInvitationsApi = () => api.get('/invitations');
export const acceptInvitationApi = (invitationId) => api.put(`/invitations/${invitationId}/accept`);
export const rejectInvitationApi = (invitationId) => api.put(`/invitations/${invitationId}/reject`);

export default api;
