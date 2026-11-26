import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Mail, ArrowLeft } from 'lucide-react';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import { forgotPasswordApi } from '../services/api.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !email.includes('@')) { setError('Please enter the email address of your account.'); return; }
    setLoading(true);
    try {
      const res = await forgotPasswordApi(email.trim());
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send the reset link. Check that the server is running and try again.');
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
          <span className="text-2xl font-bold tracking-tight text-slate-900">Escrow<span className="text-indigo-600">X</span></span>
        </Link>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Forgot your password?</h2>
        <p className="mt-1 text-xs text-slate-500">Enter your email and we will send you a link to choose a new one.</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="shadow-lg border-slate-200/80">
          {result ? (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium">{result.message}</div>
              {result.devResetLink && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl">
                  <p className="font-semibold mb-1">Demo mode: no email server is set up.</p>
                  <p className="mb-2">Use this link instead of an email (it only appears in development):</p>
                  <a href={result.devResetLink} className="font-semibold text-indigo-700 underline break-all">Open the password reset page</a>
                </div>
              )}
              <p className="text-[11px] text-slate-500">Nothing arrived? Check your spam folder, or try again in a few minutes.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">{error}</div>}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" loading={loading} className="w-full py-2.5">Send reset link</Button>
            </form>
          )}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <Link to="/login" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
