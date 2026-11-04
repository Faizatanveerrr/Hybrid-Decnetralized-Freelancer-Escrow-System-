import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Toast from '../components/common/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createProjectApi } from '../services/api.js';

export default function CreateProjectPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [freelancerWallet, setFreelancerWallet] = useState('');
  const [freelancerName, setFreelancerName] = useState('');
  const [milestones, setMilestones] = useState([
    {
      title: '',
      description: '',
      amount: '',
      dueDate: '',
      acceptanceCriteria: ''
    }
  ]);

  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [error, setError] = useState('');

  const addMilestone = () => {
    setMilestones([
      ...milestones,
      {
        title: '',
        description: '',
        amount: '',
        dueDate: '',
        acceptanceCriteria: ''
      }
    ]);
  };

  const removeMilestone = (index) => {
    if (milestones.length <= 1) return;
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const updateMilestone = (index, field, value) => {
    const updated = [...milestones];
    updated[index][field] = value;
    setMilestones(updated);
  };

  const totalAmount = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!user) {
      setError('You must be signed in to create a project.');
      navigate('/login');
      return;
    }

    if (!title.trim() || !description.trim()) {
      setError('Please provide a project title and description.');
      return;
    }

    const invalidMilestone = milestones.find(m => !m.title.trim() || !m.amount || Number(m.amount) <= 0);
    if (invalidMilestone) {
      setError('Each milestone must have a title and a positive INR amount.');
      return;
    }

    setLoading(true);
    try {
      const res = await createProjectApi({
        title: title.trim(),
        description: description.trim(),
        client: user._id || user.id,
        freelancerName: freelancerName.trim() || undefined,
        freelancerWallet: freelancerWallet.trim() || undefined,
        milestones: milestones.map(m => ({
          title: m.title.trim(),
          description: m.description ? m.description.trim() : '',
          amount: Number(m.amount),
          dueDate: m.dueDate,
          acceptanceCriteria: m.acceptanceCriteria ? m.acceptanceCriteria.trim() : 'Deliverables approved by client.'
        }))
      });

      if (res.data?.success && res.data.project?._id) {
        setToastMessage('Project created successfully in MongoDB!');
        setTimeout(() => {
          navigate(`/projects/${res.data.project._id}`);
        }, 800);
      } else {
        setError(res.data?.message || 'Failed to create project.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error creating project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Create Project">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}

      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            onClick={() => navigate('/projects')}
          >
            Back to Projects
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Details Card */}
          <Card className="p-6">
            <h3 className="text-base font-bold text-slate-900 mb-1">Project Details</h3>
            <p className="text-xs text-slate-500 mb-5">
              Specify the contract terms, scope, and freelancer assignment.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Next.js Web Application"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the objectives, deliverables, and expectations..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Freelancer Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={freelancerName}
                    onChange={(e) => setFreelancerName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Freelancer Wallet Address (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={freelancerWallet}
                    onChange={(e) => setFreelancerWallet(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Milestones Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Milestones & Escrow Allocation</h3>
                <p className="text-xs text-slate-500">
                  Split payments into verifiable milestones protected by escrow.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-400">Total Escrow Value</span>
                <p className="text-lg font-extrabold text-indigo-600">
                  ₹{totalAmount.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {milestones.map((m, index) => (
                <div
                  key={index}
                  className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                        {index + 1}
                      </span>
                      Milestone {index + 1}
                    </span>
                    {milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMilestone(index)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Title *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Architecture & Wireframes"
                        value={m.title}
                        onChange={(e) => updateMilestone(index, 'title', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Amount (₹ INR) *
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        placeholder="e.g. 150"
                        value={m.amount}
                        onChange={(e) => updateMilestone(index, 'amount', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Deliverable Description
                    </label>
                    <input
                      type="text"
                      placeholder="Details of what must be submitted..."
                      value={m.description}
                      onChange={(e) => updateMilestone(index, 'description', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={m.dueDate}
                        onChange={(e) => updateMilestone(index, 'dueDate', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Acceptance Criteria
                      </label>
                      <input
                        type="text"
                        placeholder="Criteria required to approve payment..."
                        value={m.acceptanceCriteria}
                        onChange={(e) => updateMilestone(index, 'acceptanceCriteria', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Plus}
                onClick={addMilestone}
              >
                Add Another Milestone
              </Button>
            </div>
          </Card>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/projects')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              icon={ShieldCheck}
            >
              Create Project & Setup Escrow
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
