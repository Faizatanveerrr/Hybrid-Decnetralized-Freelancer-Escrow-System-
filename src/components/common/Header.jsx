import React, { useState } from 'react';
import { Menu, Wallet, PlusCircle, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useWallet } from '../../context/WalletContext.jsx';
import { useNavigate } from 'react-router-dom';
import Toast from './Toast.jsx';

export default function Header({ onMenuClick, title = 'Dashboard' }) {
  const { user, role, switchRole, switching } = useAuth();
  const [switchError, setSwitchError] = useState('');
  const { connected, balance, shortAddress, connectWallet } = useWallet();
  const navigate = useNavigate();

  const handleSwitch = async (newRole) => {
    if (switching || newRole === role) return;
    const res = await switchRole(newRole);
    if (!res.success) setSwitchError(res.message);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-100 h-18 px-4 sm:px-8 flex items-center justify-between">
      {/* Left side: Hamburger and Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-xs text-slate-400 hidden sm:block">Decentralized Escrow System</p>
        </div>
      </div>

      {/* Right side: Role badge, Wallet chip, Quick Actions */}
      <div className="flex items-center gap-3 sm:gap-4">
        
        {/* User Role Badge */}
        {user && (
          <div
            className="inline-flex p-0.5 bg-slate-100 rounded-xl text-[11px] font-bold uppercase tracking-wider"
            title="Switch between Client and Freelancer mode"
          >
            {['client', 'freelancer'].map((r) => (
              <button
                key={r}
                type="button"
                disabled={switching}
                onClick={() => handleSwitch(r)}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
                  role === r
                    ? r === 'client'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Wallet Status Badge */}
        {connected && shortAddress ? (
          <div
            onClick={() => navigate('/wallet')}
            className="flex items-center gap-2.5 px-3 py-1.5 bg-indigo-50/70 border border-indigo-100 rounded-xl cursor-pointer hover:bg-indigo-100/70 transition-colors"
          >
            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-indigo-500 leading-none">{shortAddress}</p>
              <p className="text-xs font-bold text-slate-900 leading-tight">
                ₹{balance.toLocaleString()} <span className="text-[10px] text-indigo-600 font-semibold">INR</span>
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={connectWallet}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5 text-slate-500" />
            <span>Connect Wallet</span>
          </button>
        )}

        {/* Create Project Button (for clients) */}
        {user && role === 'client' && (
          <button
            onClick={() => navigate('/projects/create')}
            className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Project</span>
          </button>
        )}

        {/* User Avatar with Profile Link or Sign In */}
        {user ? (
          <div
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 pl-2 border-l border-slate-200 cursor-pointer"
          >
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name || 'User')}`}
              alt={user.name}
              className="w-9 h-9 rounded-xl object-cover border border-slate-200"
            />
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-xs"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}

      </div>
      {switchError && <Toast type="error" message={switchError} onClose={() => setSwitchError('')} />}
    </header>
  );
}
