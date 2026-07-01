// FILE: cgen-main/frontend/src/components/FinanceOfficerDashboard.jsx
//
// Finance Officer role scope:
//   - Salary Grades: STRICTLY VIEW-ONLY (uses the same SalaryGradeViewer
//     component as Focal Person — no create/edit/delete UI anywhere).
//     The backend also enforces this: POST/PUT/DELETE on
//     /api/positions/salary-grades/* is requireRole('ADMINISTRATOR') only.
//   - Positions: VIEW details + ASSIGN CHARGING only. No creation, editing
//     of duties/clauses, or deletion. The backend's PUT /api/positions/:id
//     route only allows FINANCE_OFFICER to touch the `charging` field —
//     everything else they send is ignored server-side.
//
// Layout intentionally mirrors FocalPersonDashboard: fixed dark sidebar,
// grouped nav with icons, notifications bell, KPI overview, sticky-header
// content panels with search + filters.

import { useState, useEffect, useRef } from 'react';
import api from '../api.js';
import {
  LayoutDashboard, Briefcase, DollarSign, UserCircle, Search, Filter, Eye, Activity
} from 'lucide-react';
import { SkeletonTable, SkeletonStatCard, dispatchPageLoading } from './ui.jsx';
import SalaryGradeViewer from './SalaryGradeViewer';
import PositionDetailsModal from './PositionDetailsModal';
import ContractualDashboard from './ContractualDashboard';
import ActiveEmployeesMonitor from './ActiveEmployeesMonitor';

function FinanceOfficerDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedGroup, setExpandedGroup] = useState('main');

  const [salaryGrades, setSalaryGrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loadingSalaryGrades, setLoadingSalaryGrades] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(true);

  // Search + filter state for the Positions/Charging tab
  const [searchTerm, setSearchTerm] = useState('');
  const [chargingFilter, setChargingFilter] = useState('ALL'); // ALL | ASSIGNED | UNASSIGNED
  const [gradeFilter, setGradeFilter] = useState('ALL');

  const [selectedPosition, setSelectedPosition] = useState(null);
  const [savingChargingId, setSavingChargingId] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef(null);

  const tabs = [
    {
      id: 'overview',
      name: 'Overview',
      icon: LayoutDashboard,
      group: 'main',
      description: 'Charging & salary grade summary'
    },
    {
      id: 'positions',
      name: 'Positions & Charging',
      icon: Briefcase,
      group: 'management',
      description: 'View positions, assign charging'
    },
    {
      id: 'salaryGrades',
      name: 'Salary Grades',
      icon: DollarSign,
      group: 'management',
      description: 'Reference schedule — view only'
    },
    {
      id: 'activeEmployees',
      name: 'Active Employees',
      icon: Activity,
      group: 'management',
      description: 'Monitor active employees, salary and charging metrics'
    },
    {
      id: 'profile',
      name: 'My Profile',
      icon: UserCircle,
      group: 'settings',
      description: 'Your personal information'
    }
  ];

  const tabGroups = [
    { id: 'main', name: 'Dashboard' },
    { id: 'management', name: 'Management' },
    { id: 'settings', name: 'Settings' },
  ];

  useEffect(() => {
    fetchSalaryGrades();
    fetchPositions();
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  const fetchSalaryGrades = async () => {
    setLoadingSalaryGrades(true);
    dispatchPageLoading(true, 'Loading salary grades…');
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions/salary-grades/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSalaryGrades(response.data || []);
    } catch (error) {
      console.error('Error fetching salary grades:', error);
    } finally {
      setLoadingSalaryGrades(false);
      dispatchPageLoading(false);
    }
  };

  const fetchPositions = async () => {
    setLoadingPositions(true);
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPositions(response.data || []);
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setLoadingPositions(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(response.data);
      setUnreadCount(response.data.filter(n => !n.isRead).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const markAsRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await api.patch(`/api/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await api.patch('/api/notifications/read-all', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all notifications read:', error);
    }
  };

  // Finance Officers may ONLY update the `charging` field. The backend
  // enforces this too (positions.js PUT /:id whitelists `charging` for
  // FINANCE_OFFICER), but we keep the payload minimal here as well.
  const handleUpdatePositionCharging = async (positionId, charging) => {
    setSavingChargingId(positionId);
    try {
      const token = localStorage.getItem('token');
      await api.put(`/api/positions/${positionId}`,
        { charging },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPositions();
    } catch (error) {
      alert('Error updating charging: ' + (error.response?.data?.message || error.message));
    } finally {
      setSavingChargingId(null);
    }
  };

  // Available salary grades for the filter dropdown
  const availableGrades = [...new Set(positions.map(p => p.salaryGrade))]
    .sort((a, b) => {
      const aNum = parseFloat(a), bNum = parseFloat(b);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return String(a).localeCompare(String(b));
    });

  const filteredPositions = positions.filter(p => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matches =
        p.title?.toLowerCase().includes(search) ||
        p.positionCode?.toLowerCase().includes(search) ||
        p.placeOfAssignment?.toLowerCase().includes(search) ||
        (p.charging || '').toLowerCase().includes(search) ||
        String(p.salaryGrade).toLowerCase().includes(search);
      if (!matches) return false;
    }
    if (chargingFilter === 'ASSIGNED' && !p.charging) return false;
    if (chargingFilter === 'UNASSIGNED' && p.charging) return false;
    if (gradeFilter !== 'ALL' && String(p.salaryGrade) !== String(gradeFilter)) return false;
    return true;
  });

  const unassignedCount = positions.filter(p => !p.charging).length;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f0f4f8" }}>
      {/* FIXED SIDEBAR — same pattern as FocalPersonDashboard / AdminDashboard */}
      <div className="w-72 flex-shrink-0 flex flex-col fixed left-0 top-16 bottom-12 z-30" style={{ background: "#0f1e35", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="p-6 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <h2 className="text-lg font-bold text-white tracking-tight">Finance Officer Panel</h2>
          <p className="text-xs text-green-400 mt-1 tracking-widest uppercase font-medium">
            Charging &amp; Salary Reference
          </p>
        </div>

        {/* Notifications */}
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-full flex items-center justify-between p-3 rounded-lg transition-colors"
              style={{ background: "rgba(255,255,255,0.05)" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.09)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
            >
              <span className="flex items-center gap-3 text-white/80">
                <span className="text-2xl">🔔</span>
                <span className="font-medium">Notifications</span>
              </span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-medium">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div
                ref={notificationsRef}
                className="absolute left-0 right-0 mt-2 rounded-xl shadow-2xl z-50 max-h-[80vh] overflow-y-auto border"
                style={{ background: "#162236", borderColor: "rgba(255,255,255,0.1)" }}
              >
                <div className="p-4 flex justify-between items-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                  <h3 className="font-semibold text-white text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead} className="text-sm text-blue-400 hover:text-blue-300 font-medium">
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="divide-y divide-white/5">
                  {notifications.length === 0 ? (
                    <p className="p-8 text-white/40 text-center py-12 text-sm">No notifications yet</p>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif._id}
                        className={`p-4 hover:bg-white/5 cursor-pointer transition-colors ${!notif.isRead ? 'bg-blue-500/10' : ''}`}
                        onClick={() => {
                          markAsRead(notif._id);
                          if (notif.type?.startsWith('POSITION')) {
                            setActiveTab('positions');
                            setShowNotifications(false);
                          }
                        }}
                      >
                        <div className="flex justify-between items-start gap-3 mb-1">
                          <h4 className="font-medium text-sm text-white flex-1">{notif.title}</h4>
                          {!notif.isRead && <span className="w-2.5 h-2.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />}
                        </div>
                        <p className="text-sm text-white/60 line-clamp-2">{notif.message}</p>
                        <p className="text-xs text-white/30 mt-2">{new Date(notif.createdAt).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Navigation */}
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {tabGroups.map((group) => {
            const groupTabs = tabs.filter((t) => t.group === group.id);
            const isActiveGroup = groupTabs.some((t) => t.id === activeTab);
            const isExpanded = expandedGroup === group.id || isActiveGroup;

            return (
              <div key={group.id}>
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors rounded-lg"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  <span className="uppercase tracking-wider">{group.name}</span>
                  <span className="text-xl font-bold text-gray-400">{isExpanded ? '−' : '+'}</span>
                </button>

                {isExpanded && (
                  <div className="mt-1 space-y-0.5 pl-1">
                    {groupTabs.map((tab) => {
                      const isActive = activeTab === tab.id;
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-left ${
                            isActive
                              ? 'bg-gradient-to-r from-blue-500/20 to-blue-500/10 text-blue-300 shadow-sm border-l-4 border-blue-500 font-medium'
                              : 'text-white/70 hover:bg-white/5 border-l-4 border-transparent hover:border-white/20'
                          }`}
                        >
                          {Icon && <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-white/40'}`} />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{tab.name}</div>
                            {isActive && tab.description && (
                              <div className="text-xs text-blue-300/80 mt-0.5 truncate">{tab.description}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 ml-72 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto pb-14">
          <div className="p-6 md:p-8 lg:p-10" style={{ minHeight: "100%" }}>

            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-gray-200">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
                    <p className="text-sm text-gray-500 mt-1">Salary grade reference and position charging status</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {(loadingPositions || loadingSalaryGrades) ? (
                    [...Array(4)].map((_, i) => <SkeletonStatCard key={i} />)
                  ) : (
                    <>
                      <StatCard label="Total Positions" value={positions.length} sub="All positions in the system" color="blue" icon={Briefcase} />
                      <StatCard label="Charging Assigned" value={positions.length - unassignedCount} sub={`${unassignedCount} pending`} color="green" icon={Filter} />
                      <StatCard label="Pending Charging" value={unassignedCount} sub="Awaiting assignment" color="amber" icon={Filter} />
                      <StatCard label="Salary Grades" value={salaryGrades.length} sub="Reference schedule" color="purple" icon={DollarSign} />
                    </>
                  )}
                </div>

                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Positions Needing Charging</h3>
                    <button onClick={() => { setChargingFilter('UNASSIGNED'); setActiveTab('positions'); }} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                      View all →
                    </button>
                  </div>
                  {loadingPositions ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
                    </div>
                  ) : unassignedCount === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">All positions have charging assigned. 🎉</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table w-full">
                        <thead>
                          <tr>
                            <th>Position</th>
                            <th>Grade</th>
                            <th>Place of Assignment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.filter(p => !p.charging).slice(0, 5).map((p) => (
                            <tr key={p._id}>
                              <td className="text-sm font-medium">{p.title}</td>
                              <td className="text-sm text-gray-600">Grade {p.salaryGrade}</td>
                              <td className="text-sm text-gray-600">{p.placeOfAssignment || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* POSITIONS & CHARGING — view + charging assignment only */}
            {activeTab === 'positions' && (
              <div className="space-y-6">
                {/* Sticky header w/ search + filters */}
                <div className="sticky top-0 z-20 bg-gray-50 -mx-6 md:-mx-8 lg:-mx-10 pt-6 pb-4 px-6 md:px-8 lg:px-10">
                  <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
                    <div className="flex items-center gap-4">
                      <Briefcase className="w-10 h-10 text-blue-600" />
                      <div>
                        <h1 className="text-3xl font-bold text-gray-900">Positions &amp; Charging</h1>
                        <p className="text-gray-600">View position details and assign charging. Final premium is auto-calculated from contract period, working days, and holidays.</p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3 items-center">
                      <div className="relative flex-1 min-w-[260px] max-w-md">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search by position, code, place, or charging..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select
                          value={chargingFilter}
                          onChange={(e) => setChargingFilter(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="ALL">All Charging Status</option>
                          <option value="ASSIGNED">Assigned</option>
                          <option value="UNASSIGNED">Unassigned</option>
                        </select>
                      </div>

                      <select
                        value={gradeFilter}
                        onChange={(e) => setGradeFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="ALL">All Salary Grades</option>
                        {availableGrades.map(g => (
                          <option key={g} value={g}>Grade {g}</option>
                        ))}
                      </select>

                      {(searchTerm || chargingFilter !== 'ALL' || gradeFilter !== 'ALL') && (
                        <button
                          onClick={() => { setSearchTerm(''); setChargingFilter('ALL'); setGradeFilter('ALL'); }}
                          className="text-sm text-gray-500 hover:text-gray-700 underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary Grade</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Premium</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Charging</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {loadingPositions ? (
                          <SkeletonTable rows={6} cols={5} />
                        ) : filteredPositions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                              No positions match your search/filters.
                            </td>
                          </tr>
                        ) : (
                          filteredPositions.map(position => {
                            const salaryGrade = salaryGrades.find(sg => sg.grade == position.salaryGrade);
                            return (
                              <tr key={position._id} className="hover:bg-gray-50">
                                <td className="px-6 py-4">
                                  <div className="font-medium text-gray-900">{position.title}</div>
                                  <div className="text-xs text-gray-400 font-mono">{position.positionCode}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">Grade {position.salaryGrade}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {salaryGrade ? (
                                    <span>₱{(salaryGrade.monthlyPremium || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  ) : (
                                    <span className="text-gray-400">N/A</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <input
                                    type="text"
                                    defaultValue={position.charging}
                                    onBlur={(e) => {
                                      if (e.target.value !== position.charging) {
                                        handleUpdatePositionCharging(position._id, e.target.value);
                                      }
                                    }}
                                    className="input text-sm w-56"
                                    placeholder="e.g., General Appropriations Act"
                                  />
                                  <div className="text-xs text-gray-400 mt-1">
                                    {savingChargingId === position._id ? 'Saving…' : 'Auto-save on blur'}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                  <button
                                    onClick={() => setSelectedPosition(position)}
                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900"
                                  >
                                    <Eye className="w-4 h-4" /> View
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
              </div>
            )}

            {/* SALARY GRADES — strictly view-only, no admin controls */}
            {activeTab === 'salaryGrades' && <SalaryGradeViewer />}

            {/* ACTIVE EMPLOYEES MONITOR */}
            {activeTab === 'activeEmployees' && <ActiveEmployeesMonitor />}

            {/* PROFILE */}
            {activeTab === 'profile' && <ContractualDashboard user={user} embedded={true} />}
          </div>
        </div>
      </div>

      {selectedPosition && (
        <PositionDetailsModal
          position={selectedPosition}
          onClose={() => setSelectedPosition(null)}
        />
      )}

      {/* FIXED FOOTER — matches FocalPersonDashboard / AdminDashboard */}
      <footer className="fixed bottom-0 left-0 right-0 h-12 z-40 flex items-center justify-center" style={{ background: "#0a1628", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-xs text-white/25 tracking-wide">
          © {new Date().getFullYear()} DENR CALABARZON Contract Management System — All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon: Icon }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   ring: 'ring-blue-100' },
    green:  { bg: 'bg-green-50',  text: 'text-green-600',  ring: 'ring-green-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', ring: 'ring-purple-100' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-600',  ring: 'ring-amber-100' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="card flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      {Icon && (
        <div className={`w-10 h-10 rounded-lg ${c.bg} ${c.ring} ring-1 flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
      )}
    </div>
  );
}

export default FinanceOfficerDashboard;