import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, UserCheck, Briefcase, Lock, Mail, User, Wallet, CheckCircle2 } from 'lucide-react';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const { connectWallet, address, shortAddress, connected } = useWallet();

  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState('client');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    walletAddress: '',
    bio: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleWalletConnect = async () => {
    const res = await connectWallet();
    if (res?.success && res.address) {
      setFormData(prev => ({ ...prev, walletAddress: res.address }));
    } else if (res?.error) {
      setError(res.error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!formData.name.trim() || !formData.email.trim() || !formData.password) {
          setError('Please provide your name, email, and password.');
          setLoading(false);
          return;
        }
        const effectiveWallet = formData.walletAddress || address || '';
        const res = await register({
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          role,
          walletAddress: effectiveWallet,
          bio: formData.bio ? formData.bio.trim() : (role === 'client' ? 'Client managing Web3 projects.' : 'Freelance developer.')
        });

        if (res.success) {
          navigate('/dashboard');
        } else {
          setError(res.message || 'Registration failed.');
        }
      } else {
        if (!formData.email.trim() || !formData.password) {
          setError('Please enter your email and password.');
          setLoading(false);
          return;
        }
        const res = await login(formData.email.trim(), formData.password);
        if (res.success) {
          navigate('/dashboard');
        } else {
          setError(res.message || 'Invalid email or password.');
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication error. Please check server and database status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            Escrow<span className="text-indigo-600">X</span>
          </span>
        </Link>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">
          {isRegister ? 'Create your EscrowX account' : 'Welcome back'}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Decentralized Freelance Escrow & AI Dispute Arbitration
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="shadow-lg border-slate-200/80">
          
          {/* Role Selection Tabs for registration */}
          {isRegister && (
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-700 mb-2">Select Account Role</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRole('client')}
                  className={`flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    role === 'client'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-4 h-4" /> Client
                </button>
                <button
                  type="button"
                  onClick={() => setRole('freelancer')}
                  className={`flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    role === 'freelancer'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Briefcase className="w-4 h-4" /> Freelancer
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="Your full name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Web3 Wallet Address
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="0x... (or connect MetaMask)"
                        value={formData.walletAddress || address}
                        onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleWalletConnect}
                      className="shrink-0 text-xs py-2"
                    >
                      {connected ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : 'Connect'}
                    </Button>
                  </div>
                  {connected && address && (
                    <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                      Connected: {shortAddress}
                    </p>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full py-2.5 mt-2"
            >
              {isRegister ? 'Register Account' : 'Sign In'}
            </Button>
          </form>

          {/* Toggle between Login and Register */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
            >
              {isRegister
                ? 'Already have an account? Sign in here'
                : "Don't have an account? Create a new account"}
            </button>
          </div>

        </Card>
      </div>
    </div>
  );
}
