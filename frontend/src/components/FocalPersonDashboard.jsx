// FILE: cgen-main/frontend/src/components/FocalPersonDashboard.jsx

import { useState, useEffect, useRef } from 'react';
import api from '../api.js';
import {
  LayoutDashboard, Users, Briefcase, FileText, FolderOpen,
  IdCard, UserCircle
} from 'lucide-react';
import { SkeletonStatCard, dispatchPageLoading } from './ui.jsx';
import UserManagement from './UserManagement';
import PositionManagement from './PositionManagement';
import ContractGenerator from './ContractGenerator';
import ContractualDashboard from './ContractualDashboard';
import DocumentViewer from './DocumentViewer';
import EODBGenerator from './EODBGenerator';

// All data fetched here is already scoped server-side to the Focal Person's
// own placeOfAssignment (see backend/routes/users.js, positions.js,
// contracts.js — each checks req.user.role === 'FOCAL_PERSON' and filters
// by placeOfAssignment before returning anything). This dashboard never
// needs to re-filter client-side; it just reflects what the backend already
// scoped, and only adds presentation on top.

function FocalPersonDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedGroup, setExpandedGroup] = useState('main');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingUsers: 0,
    activeUsers: 0,
    totalContracts: 0,
    activeContracts: 0,
    expiredContracts: 0,
    totalPositions: 0,
  });
  const [recentContracts, setRecentContracts] = useState([]);
  const [dashLoading, setDashLoading] = useState(true);

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
      description: `Stats for ${user.placeOfAssignment || 'your assignment'}`
    },
    {
      id: 'users',
      name: 'Create Users',
      icon: Users,
      group: 'management',
      description: 'Contractual users in your assignment'
    },
    {
      id: 'positions',
      name: 'Positions',
      icon: Briefcase,
      group: 'management',
      description: 'Position definitions for your assignment'
    },
    {
      id: 'contracts',
      name: 'Contracts',
      icon: FileText,
      group: 'management',
      description: 'Contracts for your assignment'
    },
    {
      id: 'documents',
      name: 'User Documents',
      icon: FolderOpen,
      group: 'management',
      description: 'Document repository'
    },
    {
      id: 'eodb',
      name: 'EODB ID',
      icon: IdCard,
      group: 'settings',
      description: 'Generate EODB identification'
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
    fetchStats();
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

  const handleDocumentUploaded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Pulls from the same already-scoped endpoints UserManagement / ContractGenerator /
  // PositionManagement use, so a Focal Person only ever sees counts for their own
  // placeOfAssignment — the backend enforces this, this just aggregates it into KPIs.
  const fetchStats = async () => {
    setDashLoading(true);
    dispatchPageLoading(true, 'Loading your assignment overview…');
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, contractsRes, positionsRes] = await Promise.all([
        api.get('/api/users', { headers }),
        api.get('/api/contracts', { headers }),
        api.get('/api/positions', { headers }),
      ]);

      const users = usersRes.data || [];
      const contracts = contractsRes.data || [];
      const positions = positionsRes.data || [];

      setStats({
        totalUsers: users.length,
        pendingUsers: users.filter(u => u.status === 'PENDING').length,
        activeUsers: users.filter(u => u.status === 'ACTIVE').length,
        totalContracts: contracts.length,
        activeContracts: contracts.filter(c => c.status === 'ACTIVE' || !c.archivedBy).length,
        expiredContracts: contracts.filter(c => c.status === 'EXPIRED').length,
        totalPositions: positions.length,
      });

      setRecentContracts(
        [...contracts]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5)
      );
    } catch (error) {
      console.error('Error fetching focal person stats:', error);
    } finally {
      setDashLoading(false);
      dispatchPageLoading(false);
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

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f0f4f8" }}>
      {/* FIXED SIDEBAR — same pattern as AdminDashboard, scoped subtitle to assignment */}
      <div className="w-72 flex-shrink-0 flex flex-col fixed left-0 top-16 bottom-12 z-30" style={{ background: "#0f1e35", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="p-6 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <h2 className="text-lg font-bold text-white tracking-tight">Focal Person Panel</h2>
          <p className="text-xs text-green-400 mt-1 tracking-widest uppercase font-medium truncate" title={user.placeOfAssignment}>
            {user.placeOfAssignment || 'Not Assigned'}
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
                          if (notif.type === 'POSITION_NEEDS_CLAUSES') {
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
                    <p className="text-sm text-gray-500 mt-1">
                      Scoped to <span className="font-medium text-gray-700">{user.placeOfAssignment || 'your assignment'}</span> only
                    </p>
                  </div>
                </div>

                {/* KPI Strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {dashLoading ? (
                    [...Array(4)].map((_, i) => <SkeletonStatCard key={i} />)
                  ) : (
                    <>
                      <StatCard label="Users" value={stats.totalUsers} sub={`${stats.pendingUsers} pending`} color="blue" icon={Users} />
                      <StatCard label="Contracts" value={stats.totalContracts} sub={`${stats.activeContracts} active`} color="green" icon={FileText} />
                      <StatCard label="Positions" value={stats.totalPositions} sub="Defined for your assignment" color="purple" icon={Briefcase} />
                      <StatCard label="Pending Users" value={stats.pendingUsers} sub="Awaiting admin validation" color="amber" icon={Users} />
                    </>
                  )}
                </div>

                {/* Recent Contracts */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Recent Contracts</h3>
                    <button onClick={() => setActiveTab('contracts')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                      View all →
                    </button>
                  </div>
                  {dashLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
                    </div>
                  ) : recentContracts.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">No contracts generated yet for your assignment.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table w-full">
                        <thead>
                          <tr>
                            <th>Contract #</th>
                            <th>Employee</th>
                            <th>Position</th>
                            <th>Period</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentContracts.map((c) => (
                            <tr key={c._id}>
                              <td className="text-sm font-medium">{c.contractNumber}</td>
                              <td className="text-sm">
                                {c.userId?.personalInfo?.firstName} {c.userId?.personalInfo?.lastName}
                              </td>
                              <td className="text-sm text-gray-600">{c.position}</td>
                              <td className="text-sm text-gray-600">
                                {new Date(c.startDate).toLocaleDateString()} – {new Date(c.endDate).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Create User', tab: 'users', icon: '👥', desc: 'Add a contractual employee' },
                    { label: 'Generate Contract', tab: 'contracts', icon: '📄', desc: 'Create new contract' },
                    { label: 'View Documents', tab: 'documents', icon: '📁', desc: 'Browse document repository' },
                  ].map((item) => (
                    <button
                      key={item.tab}
                      onClick={() => setActiveTab(item.tab)}
                      className="card text-left hover:shadow-md transition-shadow flex items-start gap-3"
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <div>
                        <div className="font-medium text-gray-900">{item.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* USERS */}
            {activeTab === 'users' && (
              <div className="card">
                <h3 className="text-xl font-bold mb-4">Create Contractual Users</h3>
                <p className="text-gray-600 mb-6">
                  You can create contractual users for your place of assignment.
                  Created users will be in PENDING status and require administrator validation.
                </p>
                <UserManagement />
              </div>
            )}

            {/* POSITIONS */}
            {activeTab === 'positions' && <PositionManagement />}

            {/* CONTRACTS */}
            {activeTab === 'contracts' && <ContractGenerator userRole="FOCAL_PERSON" />}

            {/* DOCUMENTS */}
            {activeTab === 'documents' && <DocumentViewer userRole="FOCAL_PERSON" />}

            {/* EODB */}
            {activeTab === 'eodb' && (
              <EODBGenerator
                userId={user.id || user._id}
                onDocumentUploaded={handleDocumentUploaded}
              />
            )}

            {/* PROFILE */}
            {activeTab === 'profile' && <ContractualDashboard user={user} embedded={true} />}
          </div>
        </div>
      </div>
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

export default FocalPersonDashboard;