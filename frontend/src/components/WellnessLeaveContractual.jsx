// FILE: cgen-main/frontend/src/components/WellnessLeaveContractual.jsx
//
// Contractual-facing Wellness Leave view: current-year credit balance,
// an application form (blocked once balance is 0), and a history of the
// user's own applications with status and a link to the printable CS Form No. 6.

import { useState, useEffect } from 'react';
import { Leaf, Printer, XCircle } from 'lucide-react';
import api, { API_BASE } from '../api.js';
import { SectionLoader, EmptyState, LoadingButton, toast } from './ui.jsx';

const STATUS_STYLES = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  RECOMMENDED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  DISAPPROVED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }) : '';

function WellnessLeaveContractual({ user }) {
  const [balances, setBalances] = useState([]);
  const [applications, setApplications] = useState([]);
  const [hasActiveContract, setHasActiveContract] = useState(true); // optimistic default until eligibility loads, avoids a flash of "disabled"
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', daysRequested: '', reason: '' });

  const currentYear = new Date().getFullYear();
  const currentBalance = balances.find(b => b.year === currentYear) || { year: currentYear, granted: 0, used: 0, balance: 0 };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [balRes, appRes, eligRes] = await Promise.all([
        api.get('/api/wellness-leave/credits/me', { headers }),
        api.get('/api/wellness-leave/applications/me', { headers }),
        api.get('/api/wellness-leave/eligibility/me', { headers }),
      ]);
      setBalances(balRes.data || []);
      setApplications(appRes.data || []);
      setHasActiveContract(!!eligRes.data?.hasActiveContract);
    } catch (err) {
      console.error('Error loading Wellness Leave data:', err);
      toast.error(err.response?.data?.message || 'Failed to load Wellness Leave data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate || !form.daysRequested) {
      toast.error('Please fill in the inclusive dates and days requested.');
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await api.post('/api/wellness-leave/applications', {
        startDate: form.startDate,
        endDate: form.endDate,
        daysRequested: parseFloat(form.daysRequested),
        reason: form.reason
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Wellness Leave application filed. Print the form for signatures.');
      setForm({ startDate: '', endDate: '', daysRequested: '', reason: '' });
      setShowForm(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to file application.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this Wellness Leave application?')) return;
    try {
      const token = localStorage.getItem('token');
      await api.patch(`/api/wellness-leave/applications/${id}/cancel`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Application cancelled.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel application.');
    }
  };

  const openForm = (id) => {
    const token = localStorage.getItem('token');
    window.open(`${API_BASE}/api/wellness-leave/applications/${id}/form?token=${token}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <SectionLoader message="Loading Wellness Leave data…" />;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-green-200 bg-green-50 p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Leaf className="w-8 h-8 text-green-600" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-green-700">Wellness Leave Balance — {currentYear}</p>
            <p className="text-2xl font-bold text-green-800">{currentBalance.balance} day(s) available</p>
            <p className="text-xs text-green-700 mt-0.5">Granted: {currentBalance.granted} • Used: {currentBalance.used}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          disabled={currentBalance.balance <= 0 || !hasActiveContract}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {showForm ? 'Close Form' : 'Apply for Wellness Leave'}
        </button>
      </div>

      {!hasActiveContract && (
        <p className="text-xs text-gray-500">You need a current active contract to apply for Wellness Leave.</p>
      )}

      {hasActiveContract && currentBalance.balance <= 0 && currentBalance.granted === 0 && (
        <p className="text-xs text-gray-500">No Wellness Leave credits have been granted for {currentYear} yet. Credits are granted automatically based on your contract status and history.</p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input type="date" required value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input type="date" required value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Days Requested</label>
            <input type="number" step="0.5" min="0.5" required value={form.daysRequested}
              onChange={e => setForm(f => ({ ...f, daysRequested: e.target.value }))}
              className="w-full sm:w-40 border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
            <textarea rows={2} value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <LoadingButton loading={submitting} type="submit" className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700">
            File Application
          </LoadingButton>
        </form>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">My Applications</h3>
        </div>
        {applications.length === 0 ? (
          <EmptyState icon="🌿" title="No Wellness Leave applications yet" description="File an application above once you have available credits." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Application No.</th>
                  <th className="text-left px-4 py-2">Dates</th>
                  <th className="text-left px-4 py-2">Days</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map(a => (
                  <tr key={a._id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-mono text-xs">{a.applicationNumber}</td>
                    <td className="px-4 py-2">{formatDate(a.startDate)} – {formatDate(a.endDate)}</td>
                    <td className="px-4 py-2">{a.daysRequested}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => openForm(a._id)} title="Print form (CS Form No. 6)" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded-md">
                        <Printer className="w-3.5 h-3.5" /> Print
                      </button>
                      {['PENDING', 'RECOMMENDED'].includes(a.status) && (
                        <button onClick={() => handleCancel(a._id)} title="Cancel" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-700 hover:bg-red-50 rounded-md">
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default WellnessLeaveContractual;