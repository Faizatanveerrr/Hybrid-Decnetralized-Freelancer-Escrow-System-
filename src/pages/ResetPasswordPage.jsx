import React, { useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import { resetPasswordApi } from '../services/api.js';
import { getPasswordChecks, getStrength } from '../utils/passwordPolicy.js';

const inputCls = 'w-full pl-9 pr-10 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const checks = useMemo(() => getPasswordChecks(password, { email, name: '' }), [password, email]);
  const strength = useMemo(() => getStrength(password), [password]);
  const ok = checks.every((c) => c.ok);
  const match = password === confirm;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!ok) { setError('Your new password does not meet all the requirements below.'); return; }
    if (!match) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    try {
      await resetPasswordApi({ email, token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset the password. Please request a new link.');
    } finally {
      setLoading(false);
    }
  };

  const invalid = !token || !email;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">Escrow<span className="text-indigo-600">X</span></span>
        </Link>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Choose a new password</h2>
        {email && <p className="mt-1 text-xs text-slate-500">for {email}</p>}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="shadow-lg border-slate-200/80">
          {done ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium">
              Your password has been changed. Taking you to sign in...
            </div>
          ) : invalid ? (
            <div className="space-y-3">
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                This reset link is incomplete. Please open the full link from your email, or request a new one.
              </div>
              <Link to="/forgot-password" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Request a new link</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                  {error} {/expired|invalid/i.test(error) && <Link to="/forgot-password" className="underline">Request a new link</Link>}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 grid grid-cols-4 gap-1">
                        {[1, 2, 3, 4].map((i) => <div key={i} className={`h-1.5 rounded-full ${i <= strength.score ? strength.bar : 'bg-slate-200'}`} />)}
                      </div>
                      <span className={`text-[11px] font-semibold ${strength.text}`}>{strength.label}</span>
                    </div>
                    <ul className="mt-2 grid grid-cols-1 gap-0.5">
                      {checks.map((c) => (
                        <li key={c.id} className={`flex items-center gap-1.5 text-[11px] ${c.ok ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {c.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-slate-400" />}{c.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
                </div>
                {confirm && !match && <p className="mt-1 text-[11px] text-rose-600 font-medium">Passwords do not match.</p>}
              </div>
              <Button type="submit" variant="primary" loading={loading} disabled={!ok || !match} className="w-full py-2.5">Change password</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
