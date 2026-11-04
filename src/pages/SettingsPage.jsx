import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Shield, Bell, Moon, Sun, LogOut } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Toast from '../components/common/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, role, switchRole, logout } = useAuth();
  const [toastMessage, setToastMessage] = useState('');

  const [notifications, setNotifications] = useState({
    milestoneFunded: true,
    workSubmitted: true,
    aiRulingReady: true
  });

  const handleSave = () => {
    setToastMessage('Preferences saved successfully.');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <DashboardLayout title="Settings">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}

      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Account Info */}
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 mb-1">Account & Role Preferences</h3>
          <p className="text-xs text-slate-500 mb-5">Configure your active workspace role</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Active Role</label>
              <div className="grid grid-cols-2 gap-3 max-w-sm">
                <button
                  type="button"
                  onClick={() => switchRole('client')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    role === 'client'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Client Mode
                </button>
                <button
                  type="button"
                  onClick={() => switchRole('freelancer')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    role === 'freelancer'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Freelancer Mode
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="text"
                disabled
                value={user?.email || 'user@example.com'}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 mb-1">Notifications</h3>
          <p className="text-xs text-slate-500 mb-4">Select event triggers for alert banners</p>

          <div className="space-y-3 text-xs">
            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
              <span>Notify when client funds a milestone</span>
              <input
                type="checkbox"
                checked={notifications.milestoneFunded}
                onChange={(e) => setNotifications({ ...notifications, milestoneFunded: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
              <span>Notify when deliverable proof is submitted</span>
              <input
                type="checkbox"
                checked={notifications.workSubmitted}
                onChange={(e) => setNotifications({ ...notifications, workSubmitted: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
              <span>Notify when AI Arbitrator ruling is rendered</span>
              <input
                type="checkbox"
                checked={notifications.aiRulingReady}
                onChange={(e) => setNotifications({ ...notifications, aiRulingReady: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
            </label>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
            <Button size="sm" onClick={handleSave}>
              Save Preferences
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-6 border-rose-100 bg-rose-50/20">
          <h3 className="text-base font-bold text-rose-900 mb-1">Session</h3>
          <p className="text-xs text-rose-700/80 mb-4">Sign out of the EscrowX demo application</p>
          <Button variant="danger" size="sm" icon={LogOut} onClick={handleLogout}>
            Sign Out
          </Button>
        </Card>

      </div>
    </DashboardLayout>
  );
}
