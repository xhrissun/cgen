// FILE: cgen-main/frontend/src/components/WellnessLeaveMonitor.jsx
//
// Monitoring + workflow view for FOCAL_PERSON (scoped to their own office,
// enforced server-side) and ADMINISTRATOR (system-wide). Shows every
// contractual's Wellness Leave credit balance for a chosen year, and the
// applications queue with the recommend (focal/admin) and approve
// (admin — Assistant Regional Director for Management Services) actions.

import { useState, useEffect } from 'react';
import { Leaf, FileText, Check, X, Printer, RefreshCw } from 'lucide-react';
import api, { API_BASE } from '../api.js';
import { SectionLoader, EmptyState, SkeletonTable, LoadingButton, toast } from './ui.jsx';

const STATUS_STYLES = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  RECOMMENDED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  DISAPPROVED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }) : '';

function ActionModal({ title, onSubmit, onClose, submitting, requireName = true }) {
  const [name, setName] = useState('');
  const [remarks, setRemarks] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">{title}</h3>
        {requireName && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Full name" />
          </div>
        )}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Remarks (optional)</label>
          <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
          <LoadingButton loading={submitting} onClick={() => onSubmit({ name, remarks })} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700">
            Confirm
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

function WellnessLeaveMonitor({ userRole }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [credits, setCredits] = useState([]);
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [modal, setModal] = useState(null); // { type: 'recommend'|'approve', application, action }
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [credRes, appRes] = await Promise.all([
        api.get('/api/wellness-leave/credits', { headers, params: { year } }),
        api.get('/api/wellness-leave/applications', { headers, params: statusFilter ? { status: statusFilter } : {} }),
      ]);
      setCredits(credRes.data || []);
      setApplications(appRes.data || []);
    } catch (err) {
      console.error('Error loading Wellness Leave monitor data:', err);
      toast.error(err.response?.data?.message || 'Failed to load Wellness Leave data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [year, statusFilter]);

  const handleBackfill = async () => {
    if (!window.confirm('Backfill Wellness Leave credits from all existing contracts? This is safe to re-run.')) return;
    setBackfilling(true);
    try {
      const res = await api.post('/api/wellness-leave/admin/backfill-credits', {}, { headers });
      toast.success(res.data.message);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Backfill failed.');
    } finally {
      setBackfilling(false);
    }
  };

  const openForm = (id) => {
    window.open(`${API_BASE}/api/wellness-leave/applications/${id}/form?token=${token}`, '_blank', 'noopener,noreferrer');
  };

  const submitRecommend = async ({ name, remarks }, action) => {
    setSubmitting(true);
    try {
      await api.patch(`/api/wellness-leave/applications/${modal.application._id}/recommend`, { action, name, remarks }, { headers });
      toast.success(action === 'RECOMMENDED' ? 'Application recommended.' : 'Application disapproved.');
      setModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitApprove = async ({ name, remarks }, action) => {
    setSubmitting(true);
    try {
      await api.patch(`/api/wellness-leave/applications/${modal.application._id}/approve`, { action, name, remarks }, { headers });
      toast.success(action === 'APPROVED' ? 'Application approved.' : 'Application disapproved.');
      setModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      {/* Credits monitor */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Leaf className="w-4 h-4 text-green-600" /> Wellness Leave Credits</h3>
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} className="border border-gray-300 rounded-md px-2 py-1 text-xs">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {userRole === 'ADMINISTRATOR' && (
              <LoadingButton loading={backfilling} onClick={handleBackfill} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                <RefreshCw className="w-3.5 h-3.5" /> Backfill from Contracts
              </LoadingButton>
            )}
          </div>
        </div>
        {loading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : credits.length === 0 ? (
          <EmptyState icon="🌿" title="No credits on record" description={`No Wellness Leave credits found for ${year}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Employee</th>
                  <th className="text-left px-4 py-2">Place of Assignment</th>
                  <th className="text-left px-4 py-2">Granted</th>
                  <th className="text-left px-4 py-2">Used</th>
                  <th className="text-left px-4 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {credits.map(c => (
                  <tr key={c.userId} className="border-t border-gray-100">
                    <td className="px-4 py-2">{c.fullName}</td>
                    <td className="px-4 py-2">{c.placeOfAssignment}</td>
                    <td className="px-4 py-2">{c.granted}</td>
                    <td className="px-4 py-2">{c.used}</td>
                    <td className="px-4 py-2 font-medium">{c.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Applications queue */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" /> Applications</h3>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-xs">
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="RECOMMENDED">Recommended</option>
            <option value="APPROVED">Approved</option>
            <option value="DISAPPROVED">Disapproved</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        {loading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : applications.length === 0 ? (
          <EmptyState icon="📭" title="No applications" description="Nothing matches this filter yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Application No.</th>
                  <th className="text-left px-4 py-2">Employee</th>
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
                    <td className="px-4 py-2">{a.employeeSnapshot?.fullName || a.userId?.username}</td>
                    <td className="px-4 py-2">{formatDate(a.startDate)} – {formatDate(a.endDate)}</td>
                    <td className="px-4 py-2">{a.daysRequested}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap space-x-1">
                      <button onClick={() => openForm(a._id)} title="Print form (A5)" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded-md">
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {a.status === 'PENDING' && (
                        <>
                          <button onClick={() => setModal({ type: 'recommend', application: a, action: 'RECOMMENDED' })} title="Recommend" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-700 hover:bg-green-50 rounded-md">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setModal({ type: 'recommend', application: a, action: 'DISAPPROVED' })} title="Disapprove" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-700 hover:bg-red-50 rounded-md">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {a.status === 'RECOMMENDED' && userRole === 'ADMINISTRATOR' && (
                        <>
                          <button onClick={() => setModal({ type: 'approve', application: a, action: 'APPROVED' })} title="Approve (ARDMS)" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-700 hover:bg-green-50 rounded-md">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setModal({ type: 'approve', application: a, action: 'DISAPPROVED' })} title="Disapprove (ARDMS)" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-700 hover:bg-red-50 rounded-md">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ActionModal
          title={
            modal.type === 'recommend'
              ? (modal.action === 'RECOMMENDED' ? 'Recommend Application (Immediate Supervisor)' : 'Disapprove Application (Immediate Supervisor)')
              : (modal.action === 'APPROVED' ? 'Approve Application (Assistant Regional Director for Management Services)' : 'Disapprove Application (Assistant Regional Director for Management Services)')
          }
          submitting={submitting}
          onClose={() => setModal(null)}
          onSubmit={(vals) => modal.type === 'recommend' ? submitRecommend(vals, modal.action) : submitApprove(vals, modal.action)}
        />
      )}
    </div>
  );
}

export default WellnessLeaveMonitor;