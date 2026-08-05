// FILE: cgen-main/frontend/src/components/WellnessLeaveMonitor.jsx
//
// Monitoring + workflow view for FOCAL_PERSON (scoped to their own office,
// enforced server-side) and ADMINISTRATOR (system-wide). Shows every
// active-contract contractual's Wellness Leave credit balance for a chosen
// year, and the applications queue with the recommend (focal/admin),
// approve (admin — Assistant Regional Director for Management Services),
// and cancel actions.

import { useState, useEffect, useMemo } from 'react';
import { Leaf, FileText, Check, X, Printer, RefreshCw, Ban, Search, Users, Coins, TrendingDown, Wallet } from 'lucide-react';
import api, { API_BASE } from '../api.js';
import { SectionLoader, EmptyState, SkeletonTable, SkeletonStatCard, LoadingButton, toast } from './ui.jsx';

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

function CancelModal({ application, onSubmit, onClose, submitting }) {
  const [reason, setReason] = useState('');
  const isApproved = application.status === 'APPROVED';
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Cancel Wellness Leave Application</h3>
        <p className="text-xs text-gray-500 mb-4">
          {application.applicationNumber} — {application.employeeSnapshot?.fullName}
          {isApproved && ' • This will restore the deducted credit balance.'}
        </p>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Reason {isApproved ? '(required for approved applications)' : '(optional)'}
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder={isApproved ? 'Why is this approved leave being cancelled?' : 'Optional note'}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md">Back</button>
          <LoadingButton
            loading={submitting}
            disabled={isApproved && !reason.trim()}
            onClick={() => onSubmit(reason)}
            className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel Application
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, bg, icon }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: bg, color }}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold tracking-tight" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1.5 font-medium">{sub}</div>}
    </div>
  );
}

function totalDaysLabel(n) {
  return `${Math.round(n * 100) / 100}`;
}

function WellnessLeaveMonitor({ userRole }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [credits, setCredits] = useState([]);
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [creditSearch, setCreditSearch] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [modal, setModal] = useState(null); // { type: 'recommend'|'approve', application, action }
  const [cancelTarget, setCancelTarget] = useState(null); // application being cancelled
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

  const submitCancel = async (reason) => {
    setSubmitting(true);
    try {
      await api.patch(`/api/wellness-leave/applications/${cancelTarget._id}/cancel`, { reason }, { headers });
      toast.success('Application cancelled.');
      setCancelTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel application.');
    } finally {
      setSubmitting(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const filteredCredits = useMemo(() => {
    const q = creditSearch.trim().toLowerCase();
    if (!q) return credits;
    return credits.filter(c =>
      c.fullName?.toLowerCase().includes(q) || c.placeOfAssignment?.toLowerCase().includes(q)
    );
  }, [credits, creditSearch]);

  const filteredApplications = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter(a =>
      a.applicationNumber?.toLowerCase().includes(q) ||
      a.employeeSnapshot?.fullName?.toLowerCase().includes(q) ||
      a.userId?.username?.toLowerCase().includes(q)
    );
  }, [applications, appSearch]);

  const kpis = useMemo(() => {
    const totalGranted = credits.reduce((s, c) => s + (c.granted || 0), 0);
    const totalUsed = credits.reduce((s, c) => s + (c.used || 0), 0);
    const totalBalance = credits.reduce((s, c) => s + (c.balance || 0), 0);
    const pendingCount = applications.filter(a => ['PENDING', 'RECOMMENDED'].includes(a.status)).length;
    return { totalGranted, totalUsed, totalBalance, pendingCount };
  }, [credits, applications]);

  // Who may cancel a given application, mirroring the server-side rule:
  // APPROVED -> admin only; PENDING/RECOMMENDED -> admin or focal (scoped
  // server-side to their own office; contractuals cancel their own from
  // their own dashboard, not here).
  const canCancel = (a) => {
    if (a.status === 'APPROVED') return userRole === 'ADMINISTRATOR';
    if (['PENDING', 'RECOMMENDED'].includes(a.status)) return userRole === 'ADMINISTRATOR' || userRole === 'FOCAL_PERSON';
    return false;
  };

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => <SkeletonStatCard key={i} />)
        ) : (
          <>
            <StatCard
              label="Active Employees"
              value={credits.length}
              sub={`With credits for ${year}`}
              color="#2563eb" bg="#eff6ff"
              icon={<Users className="w-5 h-5" />}
            />
            <StatCard
              label="Total Granted"
              value={totalDaysLabel(kpis.totalGranted)}
              sub={`Calendar year ${year}`}
              color="#7c3aed" bg="#f5f3ff"
              icon={<Coins className="w-5 h-5" />}
            />
            <StatCard
              label="Total Used"
              value={totalDaysLabel(kpis.totalUsed)}
              sub="Approved applications"
              color="#d97706" bg="#fffbeb"
              icon={<TrendingDown className="w-5 h-5" />}
            />
            <StatCard
              label="Remaining Balance"
              value={totalDaysLabel(kpis.totalBalance)}
              sub={kpis.pendingCount > 0 ? `${kpis.pendingCount} application(s) pending` : 'No pending applications'}
              color="#059669" bg="#ecfdf5"
              icon={<Wallet className="w-5 h-5" />}
            />
          </>
        )}
      </div>

      {/* Credits monitor */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Leaf className="w-4 h-4 text-green-600" /> Wellness Leave Credits</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={creditSearch}
                onChange={e => setCreditSearch(e.target.value)}
                placeholder="Search employee or office…"
                className="border border-gray-300 rounded-md pl-8 pr-2 py-1.5 text-xs w-52"
              />
            </div>
            <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} className="border border-gray-300 rounded-md px-2 py-1.5 text-xs">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {userRole === 'ADMINISTRATOR' && (
              <LoadingButton loading={backfilling} onClick={handleBackfill} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                <RefreshCw className="w-3.5 h-3.5" /> Backfill from Contracts
              </LoadingButton>
            )}
          </div>
        </div>
        {loading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : filteredCredits.length === 0 ? (
          <EmptyState icon="🌿" title="No credits on record" description={creditSearch ? 'No employee matches this search.' : `No employees with an active contract have credits for ${year}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Employee</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Place of Assignment</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Granted</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Used</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCredits.map(c => (
                  <tr key={c.userId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{c.fullName}</td>
                    <td className="px-4 py-2.5 text-gray-500">{c.placeOfAssignment}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.granted}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.used}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${c.balance <= 0 ? 'text-gray-400' : 'text-green-700'}`}>{c.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Applications queue */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" /> Applications</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={appSearch}
                onChange={e => setAppSearch(e.target.value)}
                placeholder="Search application or employee…"
                className="border border-gray-300 rounded-md pl-8 pr-2 py-1.5 text-xs w-56"
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-xs">
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="RECOMMENDED">Recommended</option>
              <option value="APPROVED">Approved</option>
              <option value="DISAPPROVED">Disapproved</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
        {loading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : filteredApplications.length === 0 ? (
          <EmptyState icon="📭" title="No applications" description="Nothing matches this filter yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Application No.</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Employee</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Dates</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Days</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredApplications.map(a => (
                  <tr key={a._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{a.applicationNumber}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{a.employeeSnapshot?.fullName || a.userId?.username}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(a.startDate)} – {formatDate(a.endDate)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{a.daysRequested}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-1">
                      <button onClick={() => openForm(a._id)} title="Print form (CS Form No. 6)" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded-md">
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
                      {canCancel(a) && (
                        <button onClick={() => setCancelTarget(a)} title={a.status === 'APPROVED' ? 'Cancel approved leave' : 'Cancel application'} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-700 rounded-md">
                          <Ban className="w-3.5 h-3.5" />
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

      {cancelTarget && (
        <CancelModal
          application={cancelTarget}
          submitting={submitting}
          onClose={() => setCancelTarget(null)}
          onSubmit={submitCancel}
        />
      )}
    </div>
  );
}

export default WellnessLeaveMonitor;