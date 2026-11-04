import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderGit2,
  ListTodo,
  Scale,
  MessageSquare,
  Wallet,
  UserCheck,
  Settings,
  ShieldCheck,
  Users,
  Briefcase,
  MailCheck,
  LogOut,
  LogIn,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { shortenAddress } from '../../services/blockchain.js';

export default function Sidebar({ isOpen, onClose }) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  const isClient = role === 'client';

  const navItems = isClient
    ? [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Projects', path: '/projects', icon: FolderGit2 },
        { label: 'Freelancers', path: '/freelancers', icon: Users },
        { label: 'Milestones', path: '/milestones', icon: ListTodo },
        { label: 'Disputes', path: '/disputes', icon: Scale, badge: 'AI' },
        { label: 'Messages', path: '/messages', icon: MessageSquare },
        { label: 'Wallet', path: '/wallet', icon: Wallet },
        { label: 'Profile', path: '/profile', icon: UserCheck },
        { label: 'Settings', path: '/settings', icon: Settings },
      ]
    : [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Available Projects', path: '/available-projects', icon: Briefcase },
        { label: 'My Projects', path: '/projects', icon: FolderGit2 },
        { label: 'Invitations', path: '/invitations', icon: MailCheck },
        { label: 'Milestones', path: '/milestones', icon: ListTodo },
        { label: 'Disputes', path: '/disputes', icon: Scale, badge: 'AI' },
        { label: 'Messages', path: '/messages', icon: MessageSquare },
        { label: 'Wallet', path: '/wallet', icon: Wallet },
        { label: 'Profile', path: '/profile', icon: UserCheck },
        { label: 'Settings', path: '/settings', icon: Settings },
      ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-slate-100 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-6 h-18 border-b border-slate-100">
          <NavLink to="/dashboard" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold text-slate-900 tracking-tight">
                Escrow<span className="text-indigo-600">X</span>
              </span>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest -mt-1">
                Decentralized Escrow
              </p>
            </div>
          </NavLink>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onClose && onClose()}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-50/80 text-indigo-600 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 shrink-0 opacity-80" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-slate-100">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <img
                  src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name || 'User')}`}
                  alt={user.name}
                  className="w-9 h-9 rounded-xl object-cover shrink-0 border border-slate-200"
                />
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-900 truncate">{user.name}</p>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 uppercase">
                      {role}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 truncate">
                    {user.walletAddress ? shortenAddress(user.walletAddress) : 'No wallet connected'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <NavLink
              to="/login"
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In / Register</span>
            </NavLink>
          )}
        </div>
      </aside>
    </>
  );
}
