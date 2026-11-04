import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Wallet, ArrowRight } from 'lucide-react';
import Button from './Button.jsx';
import { useWallet } from '../../context/WalletContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Navbar() {
  const navigate = useNavigate();
  const { connected, shortAddress, connectWallet } = useWallet();
  const { user } = useAuth();

  return (
    <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18">
          
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                Escrow<span className="text-indigo-600">X</span>
              </span>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 -mt-1">
                Decentralized Escrow
              </p>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#how-it-works" className="hover:text-indigo-600 transition-colors">How It Works</a>
            <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
            <a href="#freelancers" className="hover:text-indigo-600 transition-colors">For Freelancers</a>
            <a href="#clients" className="hover:text-indigo-600 transition-colors">For Clients</a>
          </div>

          {/* Action Area */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              icon={Wallet}
              onClick={connectWallet}
              className="hidden sm:inline-flex"
            >
              {connected ? shortAddress : 'Connect Wallet'}
            </Button>

            {user ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/dashboard')}
                icon={ArrowRight}
              >
                Go to Dashboard
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/login')}
              >
                Launch App
              </Button>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}
