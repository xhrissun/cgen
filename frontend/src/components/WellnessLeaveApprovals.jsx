// FILE: cgen-main/frontend/src/components/WellnessLeaveApprovals.jsx
//
// Wellness Leave APPLICATIONS & APPROVALS tab — the workflow queue
// (recommend, approve/ARDMS, cancel, print) plus a "Scan to Approve" panel
// for the printed CS Form No. 6 (A4) QR code.
//
// Why the scan panel lives here instead of only at /wellness-scan/:id/:token:
// that standalone route needs its own logged-in browser session on whatever
// device opens it, which works for an admin's own phone camera but NOT for
// a handheld USB/Bluetooth QR scanner — those are keyboard-wedge devices:
// they just "type" the decoded text plus Enter into whatever input has
// focus. They have no browser, no session, and no way to open a URL on
// their own. So instead of relying on navigation, this panel gives the
// already-authenticated admin dashboard an input box to scan straight
// into: click the field, scan the paper form's QR with a handheld scanner,
// and the decoded URL is parsed for the application id/token right here,
// then verified and approved using the admin's existing dashboard session.

import { useState, useEffect, useMemo, useRef } from 'react';
import { FileText, Check, X, Printer, Ban, Search, ScanLine, CheckCircle2, XCircle, AlertTriangle, Loader2, ClipboardEdit } from 'lucide-react';
import api, { API_BASE } from '../api.js';
import { EmptyState, SkeletonTable, SkeletonStatCard, LoadingButton, toast } from './ui.jsx';

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

// Backfills a Wellness Leave application that was actually filed and acted
// on entirely on paper before this module existed. Admin-only (see POST
// /applications/manual) — always created already APPROVED since it already
// happened, always flagged as a manual entry, and `note` (the paper form
// reference, or why it's being logged now) is required so the record stays
// auditable rather than looking indistinguishable from anything the online
// workflow produced.
function ManualEntryModal({ employees, headers, onSubmit, onClose, submitting }) {
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [daysRequested, setDaysRequested] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e => e.label.toLowerCase().includes(q));
  }, [employees, employeeSearch]);

  const valid = userId && startDate && endDate && parseFloat(daysRequested) > 0 && note.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-800">Log Manual Entry</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          For Wellness Leave that was already filed and approved on paper before this system existed.
          This creates the application already marked APPROVED and deducts from the employee's balance.
        </p>

        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
          <input
            value={employeeSearch}
            onChange={e => setEmployeeSearch(e.target.value)}
            placeholder="Search by name or username…"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-1.5"
          />
          <select value={userId} onChange={e => setUserId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">Select employee…</option>
            {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Days Requested</label>
          <input type="number" step="0.5" min="0.5" value={daysRequested} onChange={e => setDaysRequested(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Note (required — paper form reference, why it's being logged now, etc.)</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
          <LoadingButton
            loading={submitting}
            disabled={!valid}
            onClick={() => onSubmit({ userId, startDate, endDate, daysRequested: parseFloat(daysRequested), reason, note: note.trim() })}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Log Entry
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg, icon }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between">
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
        <div className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</div>
      </div>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: bg, color }}>
        {icon}
      </div>
    </div>
  );
}

// Pulls the application id and QR token out of whatever a scanner just
// typed. The printed QR encodes a full URL
// (`${FRONTEND_URL}/wellness-scan/:id/:token`), but we deliberately parse
// by taking the last two non-empty path segments rather than matching the
// current FRONTEND_URL exactly — that way forms printed before a domain
// change, or scans that land in a plain text box instead of a URL bar,
// still resolve correctly.
function parseScanInput(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const segments = trimmed.split(/[\/\s]+/).filter(Boolean);
  if (segments.length < 2) return null;
  const token = segments[segments.length - 1];
  const id = segments[segments.length - 2];
  if (!/^[a-fA-F0-9]{24}$/.test(id)) return null;
  return { id, token };
}

function ScanToApprovePanel({ headers, onApproved }) {
  const inputRef = useRef(null);
  const [scanValue, setScanValue] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [application, setApplication] = useState(null);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [pendingToken, setPendingToken] = useState('');

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 50);
  useEffect(() => { focusInput(); }, []);

  const reset = () => {
    setScanValue('');
    setApplication(null);
    setError('');
    setPendingToken('');
    focusInput();
  };

  const lookup = async (parsed) => {
    setLookingUp(true);
    setError('');
    setApplication(null);
    try {
      const res = await api.get(`/api/wellness-leave/applications/scan/${parsed.id}/${parsed.token}`, { headers });
      setApplication(res.data);
      setPendingToken(parsed.token);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to look up this Wellness Leave application.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const parsed = parseScanInput(scanValue);
    if (!parsed) {
      setError('That does not look like a valid Wellness Leave QR code. Scan the code printed on the signed form.');
      return;
    }
    lookup(parsed);
  };

  const handleApprove = async () => {
    if (!application) return;
    setApproving(true);
    try {
      const res = await api.post(`/api/wellness-leave/applications/${application._id}/scan-approve`, { token: pendingToken }, { headers });
      toast.success('Approval logged. The credit has been deducted.');
      onApproved?.(res.data);
      reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve this application.');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <ScanLine className="w-4 h-4 text-green-600" />
        <h3 className="text-sm font-semibold text-gray-800">Scan to Approve (ARDMS)</h3>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-gray-500">
          Click the field below, then scan the QR code printed on the signed paper form with any handheld
          USB or Bluetooth QR scanner. Works with plain keyboard-wedge scanners — no phone or separate login needed,
          since this uses your own admin session.
        </p>
        <div className="relative">
          <ScanLine className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={inputRef}
            value={scanValue}
            onChange={e => setScanValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan the form's QR code here…"
            autoComplete="off"
            className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          {lookingUp && <Loader2 className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3">
            <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {application && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
            <div className="text-sm space-y-1">
              <p><span className="text-gray-500">Application No.:</span> <span className="font-mono">{application.applicationNumber}</span></p>
              <p><span className="text-gray-500">Employee:</span> {application.employeeSnapshot?.fullName}</p>
              <p><span className="text-gray-500">Position:</span> {application.employeeSnapshot?.position}</p>
              <p><span className="text-gray-500">Inclusive Dates:</span> {formatDate(application.startDate)} – {formatDate(application.endDate)}</p>
              <p><span className="text-gray-500">Days Requested:</span> {application.daysRequested}</p>
              <p><span className="text-gray-500">Status:</span> <span className="font-medium">{application.status}</span></p>
              {application.supervisor?.action && (
                <p><span className="text-gray-500">Supervisor:</span> {application.supervisor.action} by {application.supervisor.name}</p>
              )}
            </div>

            {application.status === 'APPROVED' ? (
              <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-md p-3">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-700">This application was already marked as approved.</p>
              </div>
            ) : !['PENDING', 'RECOMMENDED'].includes(application.status) ? (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">This application has status "{application.status}" and can no longer be approved here.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <LoadingButton
                  loading={approving}
                  onClick={handleApprove}
                  className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
                >
                  Confirm Approval (Supervisor & ARDMS Signed)
                </LoadingButton>
                <button onClick={reset} className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WellnessLeaveApprovals({ userRole }) {
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { type: 'approve', application, action } — manual ARDMS approve/disapprove without a scan
  const [cancelTarget, setCancelTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [loggingManual, setLoggingManual] = useState(false);
  const [employees, setEmployees] = useState([]);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/wellness-leave/applications', { headers, params: statusFilter ? { status: statusFilter } : {} });
      setApplications(res.data || []);
    } catch (err) {
      console.error('Error loading Wellness Leave applications:', err);
      toast.error(err.response?.data?.message || 'Failed to load Wellness Leave applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [statusFilter]);

  // Employee picker for manual entries — admin only, loaded on demand.
  const fetchEmployees = async () => {
    try {
      const res = await api.get('/api/users', { headers });
      const list = (res.data || [])
        .filter(u => ['CONTRACTUAL', 'FOCAL_PERSON'].includes(u.role))
        .map(u => ({
          id: u._id,
          label: `${[u.personalInfo?.firstName, u.personalInfo?.lastName].filter(Boolean).join(' ') || u.username} (${u.username})`
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setEmployees(list);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load employee list.');
    }
  };

  const openManualEntry = () => {
    if (employees.length === 0) fetchEmployees();
    setShowManualEntry(true);
  };

  const submitManualEntry = async (payload) => {
    setLoggingManual(true);
    try {
      await api.post('/api/wellness-leave/applications/manual', payload, { headers });
      toast.success('Manual entry logged.');
      setShowManualEntry(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to log manual entry.');
    } finally {
      setLoggingManual(false);
    }
  };

  const openForm = (id) => {
    window.open(`${API_BASE}/api/wellness-leave/applications/${id}/form?token=${token}`, '_blank', 'noopener,noreferrer');
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
    const count = (s) => applications.filter(a => a.status === s).length;
    return {
      pending: count('PENDING'),
      recommended: count('RECOMMENDED'),
      approved: count('APPROVED'),
      disapproved: count('DISAPPROVED') + count('CANCELLED'),
    };
  }, [applications]);

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
            <StatCard label="Pending" value={kpis.pending} color="#a16207" bg="#fef9c3" icon={<FileText className="w-4 h-4" />} />
            <StatCard label="Recommended" value={kpis.recommended} color="#1d4ed8" bg="#dbeafe" icon={<FileText className="w-4 h-4" />} />
            <StatCard label="Approved" value={kpis.approved} color="#15803d" bg="#dcfce7" icon={<Check className="w-4 h-4" />} />
            <StatCard label="Disapproved / Cancelled" value={kpis.disapproved} color="#6b7280" bg="#f3f4f6" icon={<Ban className="w-4 h-4" />} />
          </>
        )}
      </div>

      {/* Scan to approve — admin only, since ARDMS approval acts through Administrator */}
      {userRole === 'ADMINISTRATOR' && (
        <ScanToApprovePanel headers={headers} onApproved={fetchData} />
      )}

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
            {userRole === 'ADMINISTRATOR' && (
              <button onClick={openManualEntry} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 rounded-md hover:bg-blue-100">
                <ClipboardEdit className="w-3.5 h-3.5" /> Log Manual Entry
              </button>
            )}
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
                      {a.manualEntry?.isManual && (
                        <span title={a.manualEntry?.note} className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          <ClipboardEdit className="w-3 h-3" /> Manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-1">
                      {!['APPROVED', 'CANCELLED'].includes(a.status) && (
                        <button onClick={() => openForm(a._id)} title="Print form (CS Form No. 6)" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded-md">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
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
          title={modal.action === 'APPROVED' ? 'Approve Application (Assistant Regional Director for Management Services)' : 'Disapprove Application (Assistant Regional Director for Management Services)'}
          submitting={submitting}
          onClose={() => setModal(null)}
          onSubmit={(vals) => submitApprove(vals, modal.action)}
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

      {showManualEntry && (
        <ManualEntryModal
          employees={employees}
          headers={headers}
          submitting={loggingManual}
          onClose={() => setShowManualEntry(false)}
          onSubmit={submitManualEntry}
        />
      )}
    </div>
  );
}

export default WellnessLeaveApprovals;