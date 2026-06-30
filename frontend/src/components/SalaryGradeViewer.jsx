// FILE: cgen-main/frontend/src/components/SalaryGradeViewer.jsx
//
// Strictly read-only view of the national salary grade schedule.
// No create / edit / delete actions anywhere in this component — by design,
// for roles (like Focal Person) that should be able to reference salary
// grades when reviewing or discussing contracts, but never modify them.
// Modifying salary grades remains exclusive to AdminDashboard.
//
// Salary grades are not scoped by placeOfAssignment (they're a single
// national schedule), so there is nothing to restrict server-side — every
// authenticated role already receives the same GET /api/positions/salary-grades/*
// data. This component only changes what's rendered, not what's fetched.

import { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import api from '../api.js';
import { SkeletonTable, dispatchPageLoading } from './ui.jsx';
import SalaryGradeDetailsModal from './SalaryGradeDetailsModal';

function SalaryGradeViewer() {
  const [salaryGrades, setSalaryGrades] = useState([]);
  const [salaryPeriods, setSalaryPeriods] = useState([]);
  const [activePeriodStart, setActivePeriodStart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSalaryGrade, setSelectedSalaryGrade] = useState(null);

  useEffect(() => {
    fetchSalaryGrades();
  }, []);

  const fetchSalaryGrades = async (periodStart = null) => {
    setLoading(true);
    dispatchPageLoading(true, 'Loading salary grades…');
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const periodsRes = await api.get('/api/positions/salary-grades/periods', { headers });
      setSalaryPeriods(periodsRes.data || []);

      const params = periodStart ? `?periodStart=${periodStart}` : '';
      const response = await api.get(`/api/positions/salary-grades/all${params}`, { headers });
      setSalaryGrades(response.data || []);

      if (periodStart) {
        setActivePeriodStart(periodStart);
      } else if (periodsRes.data?.length) {
        // Default view shows the most recent period — mirror that here
        setActivePeriodStart(periodsRes.data[0]?.periodStartDate || null);
      }
    } catch (error) {
      console.error('Error fetching salary grades:', error);
    } finally {
      setLoading(false);
      dispatchPageLoading(false);
    }
  };

  const filteredGrades = [...salaryGrades]
    .sort((a, b) => {
      const aNum = parseFloat(a.grade);
      const bNum = parseFloat(b.grade);
      const aIsNum = !isNaN(aNum);
      const bIsNum = !isNaN(bNum);
      if (aIsNum && bIsNum) return aNum - bNum;
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      return String(a.grade).localeCompare(String(b.grade));
    })
    .filter((sg) => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        sg.grade.toString().includes(search) ||
        sg.basicSalary.toString().includes(search) ||
        (sg.isSpecialSalaryGrade && 'special'.includes(search)) ||
        (!sg.isSpecialSalaryGrade && 'regular'.includes(search))
      );
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gray-50 -mx-6 md:-mx-8 lg:-mx-10 pt-6 pb-4 px-6 md:px-8 lg:px-10">
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <DollarSign className="w-10 h-10 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Salary Grades</h1>
              <p className="text-gray-600">Reference schedule — view only</p>
            </div>
          </div>

          {/* Period Switcher */}
          {salaryPeriods.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium text-gray-600">View period:</span>
              {salaryPeriods.map(p => {
                const startStr = new Date(p.periodStartDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
                const endStr   = p.periodEndDate
                  ? new Date(p.periodEndDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
                  : 'present';
                const isActive = activePeriodStart && new Date(p.periodStartDate).toISOString() === new Date(activePeriodStart).toISOString();
                return (
                  <button
                    key={p._id}
                    onClick={() => fetchSalaryGrades(new Date(p.periodStartDate).toISOString().split('T')[0])}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50'
                    }`}
                  >
                    {p.periodLabel || `${startStr} – ${endStr}`}
                    <span className="ml-1 text-gray-400">({p.count})</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 max-w-md">
            <input
              type="text"
              placeholder="🔍 Search by grade, salary, or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Table — read-only, "View" is the only action */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Basic Salary</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gross Premium</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Deductions</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Salary</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Daily Salary</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Premium</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <SkeletonTable rows={6} cols={9} />
              ) : filteredGrades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                    No salary grades found.
                  </td>
                </tr>
              ) : (
                filteredGrades.map((sg) => {
                  const basic = sg.basicSalary || 0;
                  const gross = sg.grossPremium || 0;
                  const ded = sg.deductions || { sss: 0, pagibig: 0, philhealth: 0 };
                  const totalDed = (ded.sss || 0) + (ded.pagibig || 0) + (ded.philhealth || 0);
                  const monthly = sg.monthlySalaryAsPerContract || 0;
                  const daily = sg.dailySalaryAsPerContract || 0;
                  const premium = sg.monthlyPremium || 0;

                  return (
                    <tr key={sg._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{sg.grade}</td>
                      <td className="px-6 py-4 whitespace-nowrap">₱{basic.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 whitespace-nowrap">₱{gross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 whitespace-nowrap">₱{totalDed.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">₱{monthly.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 whitespace-nowrap">₱{daily.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 whitespace-nowrap">₱{premium.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {sg.isSpecialSalaryGrade ? (
                          <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Special
                          </span>
                        ) : (
                          <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            Regular
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onClick={() => setSelectedSalaryGrade(sg)} className="text-green-600 hover:text-green-900">
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSalaryGrade && (
        <SalaryGradeDetailsModal
          salaryGrade={selectedSalaryGrade}
          onClose={() => setSelectedSalaryGrade(null)}
        />
      )}
    </div>
  );
}

export default SalaryGradeViewer;