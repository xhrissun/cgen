// FILE: cgen-main/frontend/src/components/ActiveEmployeesMonitor.jsx
//
// Monitoring view for all currently-ACTIVE employees/contracts: headline
// metrics (headcount, monthly salary spend, deductions, contracts expiring
// soon), a breakdown by charging source and by place of assignment, and a
// searchable/sortable table of every active employee with their full
// salary/deduction figures — exportable to CSV.

import { useState, useEffect, useMemo } from 'react';
import api from '../api.js';
import { SkeletonStatCard, SkeletonTable, dispatchPageLoading } from './ui.jsx';

const formatCurrency = (n) =>
  `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
};

function StatCard({ label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
    </div>
  );
}

function ActiveEmployeesMonitor() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ summary: null, employees: [] });
  const [search, setSearch] = useState('');
  const [chargingFilter, setChargingFilter] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [sortField, setSortField] = useState('fullName');
  const [sortDir, setSortDir] = useState('asc');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    dispatchPageLoading(true, 'Loading active employee metrics…');
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/contracts/monitor/active-employees', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data);
    } catch (err) {
      console.error('Error fetching active employees monitor data:', err);
      setError(err.response?.data?.message || 'Failed to load active employee metrics.');
    } finally {
      setLoading(false);
      dispatchPageLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const assignments = useMemo(() => {
    const set = new Set(data.employees.map(e => e.placeOfAssignment).filter(Boolean));
    return Array.from(set).sort();
  }, [data.employees]);

  const chargings = useMemo(() => {
    const set = new Set(data.employees.map(e => e.charging).filter(Boolean));
    return Array.from(set).sort();
  }, [data.employees]);

  const filteredEmployees = useMemo(() => {
    let list = data.employees.filter(e => {
      const matchSearch = !search ||
        e.fullName.toLowerCase().includes(search.toLowerCase()) ||
        e.position.toLowerCase().includes(search.toLowerCase()) ||
        e.contractNumber.toLowerCase().includes(search.toLowerCase());
      const matchCharging = !chargingFilter || e.charging === chargingFilter;
      const matchAssignment = !assignmentFilter || e.placeOfAssignment === assignmentFilter;
      const matchExpiring = !expiringOnly || e.expiringSoon;
      return matchSearch && matchCharging && matchAssignment && matchExpiring;
    });

    list = [...list].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [data.employees, search, chargingFilter, assignmentFilter, expiringOnly, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortHeader = ({ field, children }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap"
    >
      {children} {sortField === field && (sortDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/contracts/monitor/active-employees/csv', {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `active_employees_${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error exporting CSV: ' + (err.response?.data?.message || err.message));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonStatCard key={i} />)}
        </div>
        <div className="card overflow-x-auto">
          <table className="min-w-full">
            <tbody><SkeletonTable rows={6} cols={7} /></tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 bg-red-50 border border-red-300 rounded-md text-sm text-red-700">
        {error}
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Active Employees Monitor</h3>
        <button
          onClick={exportToCSV}
          disabled={exporting}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export to CSV'}
        </button>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Employees" value={summary.totalActiveEmployees} tone="blue" />
        <StatCard label="Total Monthly Salary" value={formatCurrency(summary.totalMonthlySalarySpend)} tone="green" sub="Sum of active contracts" />
        <StatCard label="Total Monthly Premium" value={formatCurrency(summary.totalMonthlyPremiumSpend)} tone="green" />
        <StatCard
          label="Expiring Within 30 Days"
          value={summary.contractsExpiringSoon}
          tone={summary.contractsExpiringSoon > 0 ? 'amber' : 'blue'}
          sub="Needs renewal attention"
        />
      </div>

      {/* Breakdown by charging + assignment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h4 className="font-semibold mb-3">By Charging</h4>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {summary.byCharging.length === 0 && <p className="text-sm text-gray-500">No data</p>}
            {summary.byCharging.map((c) => (
              <div key={c.charging} className="flex justify-between items-center text-sm border-b border-gray-100 pb-1.5">
                <span className="text-gray-700">{c.charging}</span>
                <span className="text-gray-500">
                  {c.count} employee{c.count !== 1 ? 's' : ''} · <span className="font-medium text-gray-800">{formatCurrency(c.totalMonthlySalary)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h4 className="font-semibold mb-3">By Place of Assignment</h4>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {summary.byPlaceOfAssignment.length === 0 && <p className="text-sm text-gray-500">No data</p>}
            {summary.byPlaceOfAssignment.map((a) => (
              <div key={a.placeOfAssignment} className="flex justify-between items-center text-sm border-b border-gray-100 pb-1.5">
                <span className="text-gray-700">{a.placeOfAssignment}</span>
                <span className="text-gray-500">{a.count} employee{a.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search name, position, contract #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm flex-1 min-w-[220px]"
        />
        <select
          value={chargingFilter}
          onChange={(e) => setChargingFilter(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="">All Charging</option>
          {chargings.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={assignmentFilter}
          onChange={(e) => setAssignmentFilter(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="">All Assignments</option>
          {assignments.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={expiringOnly}
            onChange={(e) => setExpiringOnly(e.target.checked)}
            className="rounded"
          />
          <span>Expiring within 30 days only</span>
        </label>
        <span className="text-sm text-gray-500 ml-auto">
          Showing {filteredEmployees.length} of {data.employees.length} active employees
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <SortHeader field="fullName">Employee</SortHeader>
              <SortHeader field="position">Position</SortHeader>
              <SortHeader field="placeOfAssignment">Assignment</SortHeader>
              <SortHeader field="charging">Charging</SortHeader>
              <SortHeader field="basicSalary">Basic Salary</SortHeader>
              <SortHeader field="monthlySalaryAsPerContract">Monthly Salary</SortHeader>
              <SortHeader field="monthlyPremium">Monthly Premium</SortHeader>
              <SortHeader field="endDate">Contract End</SortHeader>
              <SortHeader field="daysRemaining">Days Left</SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredEmployees.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No active employees match the current filters.
                </td>
              </tr>
            )}
            {filteredEmployees.map((e) => (
              <tr key={e.contractId} className={e.expiringSoon ? 'bg-amber-50' : ''}>
                <td className="px-4 py-2 text-sm font-medium text-gray-800 whitespace-nowrap">
                  {e.fullName}
                  <div className="text-xs text-gray-400">{e.contractNumber}</div>
                </td>
                <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">{e.position}</td>
                <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">{e.placeOfAssignment}</td>
                <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">{e.charging}</td>
                <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">{formatCurrency(e.basicSalary)}</td>
                <td className="px-4 py-2 text-sm text-gray-800 font-medium whitespace-nowrap">{formatCurrency(e.monthlySalaryAsPerContract)}</td>
                <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">{formatCurrency(e.monthlyPremium)}</td>
                <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDate(e.endDate)}</td>
                <td className="px-4 py-2 text-sm whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    e.daysRemaining < 0 ? 'bg-red-100 text-red-700' :
                    e.expiringSoon ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {e.daysRemaining < 0 ? 'Overdue' : `${e.daysRemaining}d`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ActiveEmployeesMonitor;