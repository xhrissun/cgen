// FILE: cgen-main/frontend/src/components/WellnessCreditsMonitor.jsx
//
// Wellness Leave CREDITS tab only — balances per employee for a chosen
// calendar year, plus the admin-only backfill action. Kept separate from
// WellnessLeaveApprovals.jsx (applications/workflow) because credits and
// approvals are different concerns for the people using this screen:
// credits is a ledger/monitoring view, approvals is a queue you act on.

import { useState, useEffect, useMemo } from 'react';
import { Leaf, RefreshCw, Search, Users, Coins, TrendingDown, Wallet, SlidersHorizontal, History, X } from 'lucide-react';
import api from '../api.js';
import { EmptyState, SkeletonTable, SkeletonStatCard, LoadingButton, toast } from './ui.jsx';

const formatHistoryDate = (d) => d ? new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

// Manual credit override — additive delta (negative to deduct), reason
// mandatory. Every submission is appended to the ledger's adjustmentHistory
// server-side (backend/routes/wellnessLeave.js POST /credits/:userId/adjust)
// so the "why" behind any figure that affects real leave/pay stays
// attributable, not just the number that resulted from it.
function AdjustCreditsModal({ employee, year, onSubmit, onClose, submitting }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const parsedAmount = parseFloat(amount);
  const valid = Number.isFinite(parsedAmount) && parsedAmount !== 0 && reason.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-800">Adjust Wellness Leave Credits</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{employee.fullName} — {year} · Currently granted: <span className="font-medium">{employee.granted}</span> day(s)</p>

        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Adjustment (days)</label>
          <input
            type="number"
            step="0.5"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 2.5 to add, -1 to deduct"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason (required)</label>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is this adjustment being made?"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>

        {Number.isFinite(parsedAmount) && parsedAmount !== 0 && (
          <p className="text-xs text-gray-500 mb-4">
            New granted total: <span className="font-semibold text-gray-800">{Math.round((employee.granted + parsedAmount) * 1000) / 1000}</span> day(s)
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
          <LoadingButton
            loading={submitting}
            disabled={!valid}
            onClick={() => onSubmit({ amount: parsedAmount, reason: reason.trim() })}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Adjustment
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

// Read-only audit trail for one employee/year — automatic contract-driven
// grants (grantHistory) and manual overrides (adjustmentHistory), each
// timestamped and attributed.
function HistoryModal({ employee, year, headers, onClose }) {
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/api/wellness-leave/credits/${employee.userId}/${year}/history`, { headers });
        setLedger(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load credit history.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, [employee.userId, year]);

  const adjustedByName = (u) => {
    if (!u) return 'Unknown';
    if (typeof u === 'string') return u;
    return [u.personalInfo?.firstName, u.personalInfo?.lastName].filter(Boolean).join(' ') || u.username;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-800">Credit History — {employee.fullName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Calendar year {year}</p>

        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : (
          <div className="space-y-5">
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Automatic Grants</h4>
              {(!ledger?.grantHistory || ledger.grantHistory.length === 0) ? (
                <p className="text-xs text-gray-400">None recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {ledger.grantHistory.map((g, i) => (
                    <li key={i} className="text-xs bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                      <span className="font-medium">{g.event}</span> — {g.grantedAmount > 0 ? '+' : ''}{g.grantedAmount} day(s)
                      <div className="text-gray-400 mt-0.5">{formatHistoryDate(g.date)}{g.contractId?.contractNumber ? ` · ${g.contractId.contractNumber}` : ''}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Manual Adjustments</h4>
              {(!ledger?.adjustmentHistory || ledger.adjustmentHistory.length === 0) ? (
                <p className="text-xs text-gray-400">None recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {ledger.adjustmentHistory.map((a, i) => (
                    <li key={i} className="text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      <span className="font-medium">{a.amount > 0 ? '+' : ''}{a.amount} day(s)</span> ({a.before} → {a.after})
                      <div className="text-gray-600 mt-0.5">"{a.reason}"</div>
                      <div className="text-gray-400 mt-0.5">{adjustedByName(a.adjustedBy)} · {formatHistoryDate(a.date)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
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

function WellnessCreditsMonitor({ userRole }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [credits, setCredits] = useState([]);
  const [creditSearch, setCreditSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [adjusting, setAdjusting] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/wellness-leave/credits', { headers, params: { year } });
      setCredits(res.data || []);
    } catch (err) {
      console.error('Error loading Wellness Leave credits:', err);
      toast.error(err.response?.data?.message || 'Failed to load Wellness Leave credits.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [year]);

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

  const handleAdjust = async ({ amount, reason }) => {
    setAdjusting(true);
    try {
      await api.post(`/api/wellness-leave/credits/${adjustTarget.userId}/adjust`, { year, amount, reason }, { headers });
      toast.success('Credit adjustment applied.');
      setAdjustTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to apply adjustment.');
    } finally {
      setAdjusting(false);
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

  const kpis = useMemo(() => {
    const totalGranted = credits.reduce((s, c) => s + (c.granted || 0), 0);
    const totalUsed = credits.reduce((s, c) => s + (c.used || 0), 0);
    const totalBalance = credits.reduce((s, c) => s + (c.balance || 0), 0);
    return { totalGranted, totalUsed, totalBalance };
  }, [credits]);

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
              sub="Across all employees"
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
          <SkeletonTable rows={4} cols={6} />
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
                  <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
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
                    <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-1">
                      <button onClick={() => setHistoryTarget(c)} title="View credit history" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-md">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      {userRole === 'ADMINISTRATOR' && (
                        <button onClick={() => setAdjustTarget(c)} title="Adjust credits" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded-md">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
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

      {adjustTarget && (
        <AdjustCreditsModal
          employee={adjustTarget}
          year={year}
          submitting={adjusting}
          onClose={() => setAdjustTarget(null)}
          onSubmit={handleAdjust}
        />
      )}

      {historyTarget && (
        <HistoryModal
          employee={historyTarget}
          year={year}
          headers={headers}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}

export default WellnessCreditsMonitor;