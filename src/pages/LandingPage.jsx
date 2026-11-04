import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Zap,
  Scale,
  Lock,
  ArrowRight,
  CheckCircle,
  Coins,
  FileCheck2,
  Users2,
  Bot
} from 'lucide-react';
import Navbar from '../components/common/Navbar.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const stats = [
    { label: 'Custodial Intermediaries', value: '0' },
    { label: 'Auto-Release Timeout', value: '72 hrs' },
    { label: 'Escrow Architecture', value: 'Non-Custodial' },
    { label: 'AI Dispute Engine', value: 'Autonomous' }
  ];

  const features = [
    {
      icon: Lock,
      title: 'Smart Escrow Lock',
      description: 'Funds are securely deposited and locked in the smart contract before any work begins, eliminating client non-payment risk.'
    },
    {
      icon: FileCheck2,
      title: 'Milestone Verification',
      description: 'Split complex projects into clear deliverables. Funds release automatically or manually as each milestone meets acceptance criteria.'
    },
    {
      icon: Scale,
      title: 'AI Dispute Resolution',
      description: 'Impartial AI Arbitrator parses acceptance criteria and submitted evidence to deliver transparent rulings within seconds.'
    },
    {
      icon: Zap,
      title: 'Auto-Release Timeout',
      description: 'If a client becomes unresponsive after deliverables are submitted, smart escrow unlocks and auto-releases funds after 72 hours.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
        {/* Subtle decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-to-tr from-indigo-200/40 to-purple-200/40 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-6">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
            <span>Decentralized Freelancer Escrow on Ethereum / Sepolia</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15] max-w-4xl mx-auto">
            Work. Trust. <span className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 bg-clip-text text-transparent">Get Paid.</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            A decentralized escrow platform for secure freelance payments, milestone-based work, and AI-assisted dispute resolution.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={handleGetStarted}
              icon={ArrowRight}
              className="w-full sm:w-auto text-base shadow-lg shadow-indigo-600/20"
            >
              Get Started Now
            </Button>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-xs"
            >
              How It Works
            </a>
          </div>

          {/* Stats Bar */}
          <div className="mt-16 pt-10 border-t border-slate-200/70 max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center">
                <p className="text-3xl font-extrabold text-indigo-600">{stat.value}</p>
                <p className="text-xs font-medium text-slate-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Simple Process</h2>
            <h3 className="text-3xl font-bold text-slate-900 mt-2">How EscrowX Works</h3>
            <p className="text-slate-600 text-sm mt-3">
              Guaranteed payment security from contract initiation to deliverable approval.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: '01',
                title: 'Create & Divide',
                desc: 'Client sets up the project with milestone descriptions, INR amounts, and acceptance criteria.'
              },
              {
                step: '02',
                title: 'Deposit in Escrow',
                desc: 'Client deposits milestone funds into the smart contract. Money is secured on-chain.'
              },
              {
                step: '03',
                title: 'Deliver & Review',
                desc: 'Freelancer submits work proof. Client reviews deliverables against predefined criteria.'
              },
              {
                step: '04',
                title: 'Release or AI Arbitrate',
                desc: 'Approved funds release instantly. In disputes, AI Arbitrator objectively rules based on proof.'
              }
            ].map((item, idx) => (
              <div key={idx} className="relative p-6 rounded-2xl bg-slate-50/70 border border-slate-100">
                <span className="text-4xl font-extrabold text-indigo-200/80 mb-3 block">{item.step}</span>
                <h4 className="text-base font-bold text-slate-900">{item.title}</h4>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Core Features</h2>
            <h3 className="text-3xl font-bold text-slate-900 mt-2">Engineered for Fair Freelance Work</h3>
            <p className="text-slate-600 text-sm mt-3">
              Eliminate chargebacks, non-payment, and endless disputes with transparent Web3 escrow.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <Card key={idx} hover className="flex flex-col">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-5">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-slate-900 mb-2">{feat.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed flex-1">{feat.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Dual Roles Section: Freelancers & Clients */}
      <section id="freelancers" className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* For Freelancers */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-indigo-500/5 to-purple-500/10 border border-indigo-100">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold mb-4">
                <CheckCircle className="w-3.5 h-3.5" /> For Freelancers
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Never Chase Another Invoice</h3>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                Know with certainty that payment is already secured before writing a line of code or crafting a design.
              </p>
              <ul className="mt-6 space-y-3 text-xs text-slate-700">
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">✓</div>
                  Guaranteed funds in smart contract escrow prior to work initiation
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">✓</div>
                  72-Hour Auto-Claim protection if client fails to respond
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">✓</div>
                  Direct INR payout to your crypto wallet with zero platform gouging
                </li>
              </ul>
            </div>

            {/* For Clients */}
            <div id="clients" className="p-8 rounded-3xl bg-gradient-to-br from-purple-500/5 to-indigo-500/10 border border-purple-100">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold mb-4">
                <Users2 className="w-3.5 h-3.5" /> For Clients
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Pay Only When Satisfied</h3>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                Protect your project budget. Funds are only released when milestones meet strict acceptance criteria.
              </p>
              <ul className="mt-6 space-y-3 text-xs text-slate-700">
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">✓</div>
                  Custom acceptance criteria defined upfront for every deliverable
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">✓</div>
                  1-click dispute lock preventing unauthorized fund release
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">✓</div>
                  AI Arbitrator checks submitted files against requirements
                </li>
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-700 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Ready for Confident Freelancing?</h2>
          <p className="mt-4 text-indigo-100 max-w-xl mx-auto text-sm sm:text-base">
            Start a project today with milestone-based escrow and instant decentralized settlement.
          </p>
          <div className="mt-8">
            <button
              onClick={handleGetStarted}
              className="px-8 py-3.5 bg-white text-indigo-700 hover:bg-slate-50 font-bold rounded-xl shadow-lg transition-all cursor-pointer text-sm"
            >
              Launch EscrowX App
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-slate-900 text-slate-400 text-xs border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-slate-200">EscrowX</span>
            <span>– Decentralized Freelancer Escrow System</span>
          </div>
          <p>Copyright &copy; 2026 SAFH. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
