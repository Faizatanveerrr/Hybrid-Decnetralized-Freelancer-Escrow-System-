import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, UserCheck, Briefcase, Lock, Mail, User, Wallet, CheckCircle2, Eye, EyeOff, Check, X } from 'lucide-react';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';
import GoogleSignInButton from '../components/common/GoogleSignInButton.jsx';
import { getAuthConfigApi } from '../services/api.js';
import { getPasswordChecks, getStrength, isValidWalletAddress } from '../utils/passwordPolicy.js';

const inputCls =
  'w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register, loginWithGoogle } = useAuth();
  const { connectWallet } = useWallet();

  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState('client');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    walletAddress: '',
    bio: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [pendingGoogle, setPendingGoogle] = useState(null); // new Google user who still has to pick a role

  // Google sign-in appears only when the server has a Google client id configured.
  useEffect(() => {
    let alive = true;
    getAuthConfigApi().then((r) => { if (alive) setGoogleClientId(r.data?.googleClientId || ''); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const checks = useMemo(
    () => getPasswordChecks(formData.password, { email: formData.email, name: formData.name }),
    [formData.password, formData.email, formData.name]
  );
  const strength = useMemo(() => getStrength(formData.password), [formData.password]);
  const passwordOk = checks.every((c) => c.ok);
  const passwordsMatch = formData.password === formData.confirmPassword;

  // Wallet is OPTIONAL. Nothing is auto-filled from a previously connected wallet.
  const handleWalletConnect = async () => {
    setError('');
    const res = await connectWallet();
    if (res?.success && res.address) {
      setFormData((prev) => ({ ...prev, walletAddress: res.address }));
      setWalletConnected(true);
    } else if (res?.error) {
      setError(res.error);
    }
  };

  const clearWallet = () => {
    setFormData((prev) => ({ ...prev, walletAddress: '' }));
    setWalletConnected(false);
  };

  const finishGoogle = async (credential, chosenRole) => {
    setError('');
    setLoading(true);
    try {
      const res = await loginWithGoogle(credential, chosenRole);
      if (res.success) { navigate('/dashboard'); return; }
      if (res.needsRole) { setPendingGoogle({ credential, name: res.name, email: res.email }); return; }
      setError(res.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  // On the Register tab the chosen role is used straight away; on Sign In a new person is asked.
  const handleGoogleCredential = (credential) => finishGoogle(credential, isRegister ? role : undefined);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isRegister) {
      if (!formData.name.trim() || !formData.email.trim() || !formData.password) {
        setError('Please provide your name, email, and password.');
        return;
      }
      if (!passwordOk) {
        setError('Password does not meet all the requirements below.');
        return;
      }
      if (!passwordsMatch) {
        setError('Passwords do not match.');
        return;
      }
      const wallet = formData.walletAddress.trim();
      if (wallet && !isValidWalletAddress(wallet)) {
        setError('Wallet address is invalid. Enter a full 0x... address, or leave it blank to skip.');
        return;
      }
    } else if (!formData.email.trim() || !formData.password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        const res = await register({
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          role,
          walletAddress: formData.walletAddress.trim(),
          bio: formData.bio ? formData.bio.trim() : (role === 'client' ? 'Client managing Web3 projects.' : 'Freelance developer.')
        });

        if (res.success) {
          navigate('/dashboard');
        } else {
          setError(res.message || 'Registration failed.');
        }
      } else {
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

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Your full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength meter + live checklist (registration only) */}
              {isRegister && formData.password && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-4 gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 rounded-full ${i <= strength.score ? strength.bar : 'bg-slate-200'}`}
                        />
                      ))}
                    </div>
                    <span className={`text-[11px] font-semibold ${strength.text}`}>{strength.label}</span>
                  </div>
                  <ul className="mt-2 grid grid-cols-1 gap-0.5">
                    {checks.map((c) => (
                      <li
                        key={c.id}
                        className={`flex items-center gap-1.5 text-[11px] ${c.ok ? 'text-emerald-600' : 'text-slate-500'}`}
                      >
                        {c.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-slate-400" />}
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {!isRegister && (
              <div className="text-right -mt-2">
                <Link to="/forgot-password" className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
                  Forgot password?
                </Link>
              </div>
            )}

            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className={inputCls}
                  />
                </div>
                {formData.confirmPassword && !passwordsMatch && (
                  <p className="mt-1 text-[11px] text-rose-600 font-medium">Passwords do not match.</p>
                )}
              </div>
            )}

            {/* Wallet: optional, registration only */}
            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  MetaMask / Web3 Wallet <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="0x... (optional)"
                      value={formData.walletAddress}
                      onChange={(e) => {
                        setWalletConnected(false);
                        setFormData({ ...formData, walletAddress: e.target.value });
                      }}
                      className={`${inputCls} font-mono text-xs`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleWalletConnect}
                    className="shrink-0 text-xs py-2"
                  >
                    {walletConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : 'Connect'}
                  </Button>
                </div>
                {walletConnected && formData.walletAddress ? (
                  <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                    Connected: {formData.walletAddress.slice(0, 6)}...{formData.walletAddress.slice(-4)}{' '}
                    <button type="button" onClick={clearWallet} className="underline text-slate-500 cursor-pointer">
                      remove
                    </button>
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Skip this and we'll create a managed wallet for you. You can connect MetaMask later.
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={isRegister && (!passwordOk || !passwordsMatch)}
              className="w-full py-2.5 mt-2"
            >
              {isRegister ? 'Register Account' : 'Sign In'}
            </Button>
          </form>

          {/* Sign in with Google (only when the server is set up for it) */}
          {googleClientId && (
            <div className="mt-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              {pendingGoogle ? (
                <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl text-center">
                  <p className="text-xs font-semibold text-slate-800">Welcome{pendingGoogle.name ? `, ${pendingGoogle.name}` : ''}!</p>
                  <p className="text-[11px] text-slate-500 mb-3">How will you use EscrowX? ({pendingGoogle.email})</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" loading={loading} onClick={() => finishGoogle(pendingGoogle.credential, 'client')}>I am a Client</Button>
                    <Button type="button" variant="outline" loading={loading} onClick={() => finishGoogle(pendingGoogle.credential, 'freelancer')}>I am a Freelancer</Button>
                  </div>
                  <button type="button" onClick={() => setPendingGoogle(null)} className="mt-2 text-[11px] text-slate-500 underline cursor-pointer">Cancel</button>
                </div>
              ) : (
                <GoogleSignInButton clientId={googleClientId} onCredential={handleGoogleCredential} text={isRegister ? 'signup_with' : 'signin_with'} />
              )}
            </div>
          )}

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
