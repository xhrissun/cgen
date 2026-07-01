// FILE: cgen-main/frontend/src/components/AdminDashboard.jsx

import { useState, useEffect, useRef } from 'react';
import api from '../api.js';
import { 
  LayoutDashboard, Users, Briefcase, FileText, FolderOpen,
  DollarSign, FileCheck, Layers, Calendar, PenTool, ScrollText, Activity
} from 'lucide-react';
import { SkeletonStatCard, SkeletonTable, SectionLoader, dispatchPageLoading } from './ui.jsx';
import UserManagement from './UserManagement';
import PositionManagement from './PositionManagement';
import ContractGenerator from './ContractGenerator';
import HolidayManagement from './HolidayManagement';
import SignatoryManagement from './SignatoryManagement';
import ClauseGroupManagement from './ClauseGroupManagement';
import SalaryGradeDetailsModal from './SalaryGradeDetailsModal';
import { findPreviousPeriod, buildPreviousGradeMap, TrendBadge, NewGradeBadge } from './salaryGradeTrend.jsx';
import DocumentViewer from './DocumentViewer';
import ActivityLog from './ActivityLog';
import ActiveEmployeesMonitor from './ActiveEmployeesMonitor';

function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedGroup, setExpandedGroup] = useState('main');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalContracts: 0,
    activeContracts: 0,
    pendingUsers: 0,
    expiredContracts: 0,
    draftContracts: 0,
    pendingContracts: 0,
    totalPositions: 0,
    totalSalaryGrades: 0,
    totalClauses: 0,
  });
  const [recentContracts, setRecentContracts] = useState([]);
  const [expiringContracts, setExpiringContracts] = useState([]);
  const [dashLoading, setDashLoading] = useState(true);
  const [salaryGrades, setSalaryGrades] = useState([]);
  const [salaryPeriods, setSalaryPeriods] = useState([]); // list of distinct periods
  const [activePeriodStart, setActivePeriodStart] = useState(null); // currently viewed period
  const [previousGradeMap, setPreviousGradeMap] = useState(new Map()); // grade -> previous-period doc, for ▲/▼ comparison
  const [clauses, setClauses] = useState([]);
  const [clauseDragIdx, setClauseDragIdx] = useState(null);
  const [clauseReordering, setClauseReordering] = useState(false);
  const [showSalaryGradeForm, setShowSalaryGradeForm] = useState(false);
  const [showClauseForm, setShowClauseForm] = useState(false);
  const [editingSalaryGrade, setEditingSalaryGrade] = useState(null);
  const [editingClause, setEditingClause] = useState(null);

  // Period-level fields (shared by all grades in a set)
  const [isNewSet, setIsNewSet] = useState(true);
  const [periodFields, setPeriodFields] = useState({
    periodStartDate: '',
    periodEndDate: '',
    periodLabel: ''
  });

  const [newSalaryGrade, setNewSalaryGrade] = useState({
    grade: '',
    isSpecialSalaryGrade: false,
    basicSalary: '',
    grossPremium: '0.00',
    deductions: {
      sss: '475.00',
      pagibig: '400.00',
      philhealth: '0.00'
    },
    monthlySalaryAsPerContract: '0.00',
    dailySalaryAsPerContract: '0.00',
    monthlyPremium: '0.00',
    note: ''
  });
  const [newClause, setNewClause] = useState({
    clauseNumber: '',
    sortOrder: '',
    title: '',
    content: '',
    isBeforeWitnesseth: false,
    isFixed: false,
    clauseType: 'NORMAL',
    groups: []
  });
  const [availableGroups, setAvailableGroups] = useState([]);
  const [selectedSalaryGrade, setSelectedSalaryGrade] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleViewSalaryGrade = (salaryGrade) => {
    setSelectedSalaryGrade(salaryGrade);
  };

  const salaryGradeFormRef = useRef(null);
  const clauseFormRef = useRef(null);
  const notificationsRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [clauseSearchTerm, setClauseSearchTerm] = useState('');

  const tabs = [
    { 
      id: 'overview', 
      name: 'Overview', 
      icon: LayoutDashboard, 
      group: 'main',
      description: 'Dashboard statistics and insights'
    },
    { 
      id: 'users', 
      name: 'Users', 
      icon: Users, 
      group: 'management',
      description: 'Manage system users'
    },
    { 
      id: 'positions', 
      name: 'Positions', 
      icon: Briefcase, 
      group: 'management',
      description: 'Position definitions'
    },
    { 
      id: 'contracts', 
      name: 'Contracts', 
      icon: FileText, 
      group: 'management',
      description: 'Contract management'
    },
    { 
      id: 'documents', 
      name: 'Documents', 
      icon: FolderOpen, 
      group: 'management',
      description: 'Document repository'
    },
    { 
      id: 'salaryGrades', 
      name: 'Salary Grades', 
      icon: DollarSign, 
      group: 'settings',
      description: 'Salary grade configuration'
    },
    { 
      id: 'clauses', 
      name: 'Clauses', 
      icon: FileCheck, 
      group: 'settings',
      description: 'Contract clauses'
    },
    { 
      id: 'clauseGroups', 
      name: 'Clause Groups', 
      icon: Layers, 
      group: 'settings',
      description: 'Clause group management'
    },
    { 
      id: 'holidays', 
      name: 'Holidays', 
      icon: Calendar, 
      group: 'settings',
      description: 'Holiday calendar'
    },
    { 
      id: 'signatories', 
      name: 'Signatories', 
      icon: PenTool, 
      group: 'settings',
      description: 'Signatory management'
    },
    { 
      id: 'activityLog', 
      name: 'Activity Log', 
      icon: ScrollText, 
      group: 'monitoring',
      description: 'System activity tracking'
    },
    { 
      id: 'activeEmployees', 
      name: 'Active Employees', 
      icon: Activity, 
      group: 'monitoring',
      description: 'Monitor active employees, salary and charging metrics'
    }
  ];

  const tabGroups = [
    { 
      id: 'main', 
      name: 'Dashboard',
      description: 'Main dashboard and overview'
    },
    { 
      id: 'management', 
      name: 'Management',
      description: 'Core management functions'
    },
    { 
      id: 'settings', 
      name: 'Configuration',
      description: 'System configuration and settings'
    },
    { 
      id: 'monitoring', 
      name: 'Monitoring',
      description: 'System monitoring and logs'
    }
  ];

  useEffect(() => {
    fetchStats();
    fetchSalaryGrades();
    fetchClauses();
    fetchClauseGroups();
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Click outside handler for notifications
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  // Auto-scroll to form when editing salary grade
  useEffect(() => {
    if (showSalaryGradeForm && salaryGradeFormRef.current) {
      setTimeout(() => {
        salaryGradeFormRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }, 100);
    }
  }, [showSalaryGradeForm, editingSalaryGrade]);

  // Auto-scroll to form when editing clause
  useEffect(() => {
    if (showClauseForm && clauseFormRef.current) {
      setTimeout(() => {
        clauseFormRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }, 100);
    }
  }, [showClauseForm, editingClause]);

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
      console.error('Error marking notification as read:', error);
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
      console.error('Error marking all as read:', error);
    }
  };

  const fetchStats = async () => {
    setDashLoading(true);
    dispatchPageLoading(true, 'Loading dashboard data…');
    try {
      const token = localStorage.getItem('token');
      const [usersRes, contractsRes, positionsRes] = await Promise.all([
        api.get('/api/users', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/contracts', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/positions', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const contracts = contractsRes.data;
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const expiring = contracts
        .filter(c => c.status === 'ACTIVE' && c.endDate && new Date(c.endDate) <= thirtyDaysFromNow && new Date(c.endDate) >= now)
        .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))
        .slice(0, 5);

      const recent = contracts
        .sort((a, b) => new Date(b.createdAt || b._id) - new Date(a.createdAt || a._id))
        .slice(0, 6);

      setStats({
        totalUsers: usersRes.data.length,
        totalContracts: contracts.length,
        activeContracts: contracts.filter(c => c.status === 'ACTIVE').length,
        pendingUsers: usersRes.data.filter(u => u.status === 'PENDING').length,
        expiredContracts: contracts.filter(c => c.status === 'EXPIRED').length,
        draftContracts: contracts.filter(c => c.status === 'DRAFT').length,
        pendingContracts: contracts.filter(c => c.status === 'PENDING').length,
        totalPositions: positionsRes.data.length,
      });
      setRecentContracts(recent);
      setExpiringContracts(expiring);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setDashLoading(false);
      dispatchPageLoading(false);
    }
  };

  const fetchSalaryGrades = async (periodStart = null) => {
    try {
      const token = localStorage.getItem('token');

      // Fetch all distinct periods for the period switcher
      const periodsRes = await api.get('/api/positions/salary-grades/periods', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSalaryPeriods(periodsRes.data);

      // Fetch grades for the selected period (or active period if none selected)
      const params = periodStart ? `?periodStart=${periodStart}` : '';
      const response = await api.get(`/api/positions/salary-grades/all${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const sortByGrade = (arr) => [...arr].sort((a, b) => {
        const aNum = parseFloat(a.grade);
        const bNum = parseFloat(b.grade);
        const aIsNum = !isNaN(aNum);
        const bIsNum = !isNaN(bNum);
        if (aIsNum && bIsNum) return aNum - bNum;
        if (aIsNum) return -1;
        if (bIsNum) return 1;
        return String(a.grade).localeCompare(String(b.grade));
      });

      const sorted = sortByGrade(response.data);
      setSalaryGrades(sorted);

      // Set activePeriodStart to the most recent period in the fetched set
      const resolvedActiveStart = periodStart || sorted[0]?.periodStartDate || null;
      if (resolvedActiveStart) {
        setActivePeriodStart(resolvedActiveStart);
      }

      // Fetch the immediately-preceding salary set (if one exists) so the
      // table can show ▲/▼/no-change badges against each figure.
      const previousPeriod = findPreviousPeriod(periodsRes.data || [], resolvedActiveStart);
      if (previousPeriod) {
        const prevParams = `?periodStart=${new Date(previousPeriod.periodStartDate).toISOString().split('T')[0]}`;
        const prevRes = await api.get(`/api/positions/salary-grades/all${prevParams}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPreviousGradeMap(buildPreviousGradeMap(prevRes.data));
      } else {
        setPreviousGradeMap(new Map());
      }
    } catch (error) {
      console.error('Error fetching salary grades:', error);
    }
  };

  const fetchClauses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions/clauses/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClauses(response.data);
    } catch (error) {
      console.error('Error fetching clauses:', error);
    }
  };

  // ── Clause drag-to-reorder ─────────────────────────────────────────────────
  const handleClauseDragStart = (index) => setClauseDragIdx(index);
  const handleClauseDragOver = (e, index) => {
    e.preventDefault();
    if (clauseDragIdx === null || clauseDragIdx === index) return;
    const reordered = [...clauses];
    const [moved] = reordered.splice(clauseDragIdx, 1);
    reordered.splice(index, 0, moved);
    setClauses(reordered);
    setClauseDragIdx(index);
  };
  const handleClauseDrop = async () => {
    setClauseDragIdx(null);
    setClauseReordering(true);
    try {
      const token = localStorage.getItem('token');
      await api.put('/api/positions/clauses/reorder',
        { orderedIds: clauses.map(c => c._id) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Error saving clause order:', error);
      fetchClauses(); // revert on failure
    } finally {
      setClauseReordering(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  const fetchClauseGroups = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions/clause-groups', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableGroups(response.data);
    } catch (error) {
      console.error('Error fetching clause groups:', error);
    }
  };

  // Auto-calculate fields when basic salary changes
  const handleBasicSalaryChange = (value) => {
    const basicSalary = parseFloat(value) || 0;
    
    if (newSalaryGrade.isSpecialSalaryGrade) {
      // Special salary grade — no premium/bonus, and Monthly/Daily Salary
      // stay pinned to Basic Salary exactly. SSS and Pag-IBIG are editable
      // and get saved with the record, but — unlike a regular grade —
      // they are NOT added on top to inflate the contract's monthly salary
      // figure. Only PhilHealth (5% of basic) is auto-computed.
      const philhealth = basicSalary * 0.05;
      
      setNewSalaryGrade({
        ...newSalaryGrade,
        basicSalary: value,
        grossPremium: '0.00',
        deductions: {
          ...newSalaryGrade.deductions,
          philhealth: philhealth.toFixed(2)
        },
        monthlySalaryAsPerContract: basicSalary.toFixed(2),
        dailySalaryAsPerContract: (basicSalary / 22).toFixed(2),
        monthlyPremium: '0.00'
      });
    } else {
      // Regular salary grade - Monthly Salary = Basic + Deductions
      const grossPremium = basicSalary * 0.15;
      const philhealth = basicSalary * 0.05;
      const sss = parseFloat(newSalaryGrade.deductions.sss) || 475.00;
      const pagibig = parseFloat(newSalaryGrade.deductions.pagibig) || 400.00;
      
      const totalDeductions = sss + pagibig + philhealth;  // Removed drugTest
      const monthlySalaryAsPerContract = basicSalary + totalDeductions;
      const dailySalaryAsPerContract = monthlySalaryAsPerContract / 22;
      const monthlyPremium = grossPremium - totalDeductions;
      
      setNewSalaryGrade({
        ...newSalaryGrade,
        basicSalary: value,
        grossPremium: grossPremium.toFixed(2),
        deductions: {
          ...newSalaryGrade.deductions,
          philhealth: philhealth.toFixed(2)
        },
        monthlySalaryAsPerContract: monthlySalaryAsPerContract.toFixed(2),
        dailySalaryAsPerContract: dailySalaryAsPerContract.toFixed(2),
        monthlyPremium: monthlyPremium.toFixed(2)
      });
    }
  };

    // Recalculate when deductions change
    const handleDeductionChange = (field, value) => {
    const updatedDeductions = {
      ...newSalaryGrade.deductions,
      [field]: value
    };
    
    const basicSalary = parseFloat(newSalaryGrade.basicSalary) || 0;
    const philhealth = basicSalary * 0.05;
    const sss = parseFloat(updatedDeductions.sss) || 475.00;
    const pagibig = parseFloat(updatedDeductions.pagibig) || 400.00;
    const totalDeductions = sss + pagibig + philhealth;  // Removed drugTest
    const monthlySalaryAsPerContract = basicSalary + totalDeductions;
    const dailySalaryAsPerContract = monthlySalaryAsPerContract / 22;

    if (newSalaryGrade.isSpecialSalaryGrade) {
      // Special Salary Grade = no premium/bonus, and Monthly/Daily Salary
      // always equal Basic Salary. SSS/Pag-IBIG are still saved with the
      // record (editable here) but never added on top of the basic salary
      // the way they are for a regular grade.
      setNewSalaryGrade({
        ...newSalaryGrade,
        deductions: {
          ...updatedDeductions,
          philhealth: philhealth.toFixed(2)
        },
        grossPremium: '0.00',
        monthlySalaryAsPerContract: basicSalary.toFixed(2),
        dailySalaryAsPerContract: (basicSalary / 22).toFixed(2),
        monthlyPremium: '0.00'
      });
      return;
    }

    const grossPremium = basicSalary * 0.15;  // Changed from 0.20 to 0.15
    const monthlyPremium = grossPremium - totalDeductions;
    
    setNewSalaryGrade({
      ...newSalaryGrade,
      deductions: {
        ...updatedDeductions,
        philhealth: philhealth.toFixed(2)
      },
      grossPremium: grossPremium.toFixed(2),
      monthlySalaryAsPerContract: monthlySalaryAsPerContract.toFixed(2),
      dailySalaryAsPerContract: dailySalaryAsPerContract.toFixed(2),
      monthlyPremium: monthlyPremium.toFixed(2)
    });
  };

  const handleCreateSalaryGrade = async (e) => {
    e.preventDefault();

    if (!periodFields.periodStartDate) {
      alert('Please enter a Period Start Date for this salary grade set.');
      return;
    }

    try {
      const token = localStorage.getItem('token');

      const payload = {
        ...newSalaryGrade,
        basicSalary: parseFloat(newSalaryGrade.basicSalary),
        grossPremium: parseFloat(newSalaryGrade.grossPremium) || 0,
        deductions: {
          sss: parseFloat(newSalaryGrade.deductions.sss) || 0,
          pagibig: parseFloat(newSalaryGrade.deductions.pagibig) || 0,
          philhealth: parseFloat(newSalaryGrade.deductions.philhealth) || 0
        },
        monthlySalaryAsPerContract: parseFloat(newSalaryGrade.monthlySalaryAsPerContract),
        dailySalaryAsPerContract: parseFloat(newSalaryGrade.dailySalaryAsPerContract),
        monthlyPremium: parseFloat(newSalaryGrade.monthlyPremium) || 0,
        periodStartDate: periodFields.periodStartDate,
        periodEndDate: periodFields.periodEndDate || null,
        periodLabel: periodFields.periodLabel || ''
      };

      if (editingSalaryGrade) {
        await api.put(`/api/positions/salary-grades/${editingSalaryGrade._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Salary grade updated successfully!');
      } else {
        await api.post('/api/positions/salary-grades', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Salary grade created successfully!');
      }

      setShowSalaryGradeForm(false);
      setEditingSalaryGrade(null);
      setNewSalaryGrade({
        grade: '',
        isSpecialSalaryGrade: false,
        basicSalary: '',
        grossPremium: '0.00',
        deductions: { sss: '475.00', pagibig: '400.00', philhealth: '0.00' },
        monthlySalaryAsPerContract: '0.00',
        dailySalaryAsPerContract: '0.00',
        monthlyPremium: '0.00',
        note: ''
      });
      fetchSalaryGrades();
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      const status = error.response?.status;
      if (status === 409) {
        alert('Duplicate Entry: ' + msg);
      } else {
        alert('Error saving salary grade: ' + msg);
      }
    }
  };

  const handleEditSalaryGrade = (sg) => {
    setEditingSalaryGrade(sg);

    const deductions = sg.deductions || { sss: 0, pagibig: 0, philhealth: 0 };

    setNewSalaryGrade({
      grade: sg.grade || '',
      isSpecialSalaryGrade: sg.isSpecialSalaryGrade || false,
      basicSalary: (sg.basicSalary || 0).toString(),
      grossPremium: (sg.grossPremium || 0).toString(),
      deductions: {
        sss: (deductions.sss || 0).toString(),
        pagibig: (deductions.pagibig || 0).toString(),
        philhealth: (deductions.philhealth || 0).toString()
      },
      monthlySalaryAsPerContract: (sg.monthlySalaryAsPerContract || 0).toString(),
      dailySalaryAsPerContract: (sg.dailySalaryAsPerContract || 0).toString(),
      monthlyPremium: (sg.monthlyPremium || 0).toString(),
      note: sg.note || ''
    });

    // Pre-fill period fields from the existing document
    setPeriodFields({
      periodStartDate: sg.periodStartDate ? sg.periodStartDate.split('T')[0] : '',
      periodEndDate:   sg.periodEndDate   ? sg.periodEndDate.split('T')[0]   : '',
      periodLabel:     sg.periodLabel     || ''
    });

    setShowSalaryGradeForm(true);
    setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 100);
  };

  const handleDeleteSalaryGrade = async (id) => {
    if (!confirm('Are you sure you want to delete this salary grade? This action cannot be undone.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/positions/salary-grades/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Salary grade deleted successfully!');
      fetchSalaryGrades();
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      alert('Error deleting salary grade: ' + errorMsg);
      
      // Show which positions are using this grade if applicable
      if (error.response?.data?.positions) {
        alert('Positions using this grade:\n' + error.response.data.positions.join('\n'));
      }
    }
  };

  // Update the handleCreateClause function to handle both create and update:
  const handleCreateClause = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      
      if (editingClause) {
        // Update existing clause
        await api.put(`/api/positions/clauses/${editingClause._id}`, newClause, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Clause updated successfully!');
      } else {
        // Create new clause
        await api.post('/api/positions/clauses', newClause, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Clause created successfully!');
      }
      
      setShowClauseForm(false);
      setEditingClause(null);
      setNewClause({
        clauseNumber: '',
        sortOrder: '',
        title: '',
        content: '',
        isBeforeWitnesseth: false,
        isFixed: false,
        clauseType: 'NORMAL',
        groups: []
      });
      fetchClauses();
    } catch (error) {
      alert('Error saving clause: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEditClause = (clause) => {
    setEditingClause(clause);
    setNewClause({
      clauseNumber: clause.clauseNumber.toString(),
      title: clause.title || '',
      content: clause.content,
      isBeforeWitnesseth: clause.isBeforeWitnesseth || false,
      isFixed: clause.isFixed || false,
      clauseType: clause.clauseType || 'NORMAL',
      groups: clause.groups || [],
      sortOrder: clause.sortOrder !== null && clause.sortOrder !== undefined ? clause.sortOrder.toString() : ''
    });
    setShowClauseForm(true);

    // Smooth scroll to top of page
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };


  const handleDeleteClause = async (id) => {
    if (!confirm('Are you sure you want to delete this clause?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/positions/clauses/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchClauses();
      alert('Clause deleted successfully!');
    } catch (error) {
      alert('Error deleting clause: ' + (error.response?.data?.message || error.message));
    }
  };

  const getClauseTypeBadge = (type) => {
    const badges = {
      PRIMARY: { color: 'bg-blue-100 text-blue-800', label: 'Primary' },
      SECONDARY: { color: 'bg-green-100 text-green-800', label: 'Secondary' },
      TERTIARY: { color: 'bg-purple-100 text-purple-800', label: 'Tertiary' },
      NORMAL: { color: 'bg-gray-100 text-gray-800', label: 'Normal' }
    };
    const badge = badges[type] || badges.NORMAL;
    return <span className={`px-2 py-1 ${badge.color} rounded text-xs`}>{badge.label}</span>;
  };

  return (
  <div className="flex h-screen overflow-hidden" style={{ background: "#f0f4f8" }}>
    {/* FIXED SIDEBAR - stops before footer */}
    <div className="w-72 flex-shrink-0 flex flex-col fixed left-0 top-16 bottom-12 z-30" style={{ background: "#0f1e35", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Header */}
      <div className="p-6 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <h2 className="text-lg font-bold text-white tracking-tight">Admin Panel</h2>
        <p className="text-xs text-green-400 mt-1 tracking-widest uppercase font-medium">System Management</p>
      </div>

      {/* Notifications */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-full flex items-center justify-between p-3 rounded-lg transition-colors" style={{ background: "rgba(255,255,255,0.05)" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.09)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
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
              className="absolute left-0 right-0 mt-2 rounded-xl shadow-2xl z-50 max-h-[80vh] overflow-y-auto border" style={{ background: "#162236", borderColor: "rgba(255,255,255,0.1)" }}
            >
              <div className="p-4 flex justify-between items-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                <h3 className="font-semibold text-white text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {notifications.length === 0 ? (
                  <p className="p-8 text-gray-500 text-center py-12">No notifications yet</p>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif._id}
                      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                        !notif.isRead ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        markAsRead(notif._id);
                        if (notif.type === 'POSITION_NEEDS_CLAUSES') {
                          setActiveTab('positions');
                          setShowNotifications(false);
                        }
                      }}
                    >
                      <div className="flex justify-between items-start gap-3 mb-1">
                        <h4 className="font-medium text-sm flex-1">{notif.title}</h4>
                        {!notif.isRead && (
                          <span className="w-2.5 h-2.5 bg-blue-600 rounded-full mt-1.5 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(notif.createdAt).toLocaleString()}
                      </p>
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
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors rounded-lg" style={{ color: "rgba(255,255,255,0.35)" }}
              >
                <span className="uppercase tracking-wider">{group.name}</span>
                <span className="text-xl font-bold text-gray-400">
                  {isExpanded ? '−' : '+'}
                </span>
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
                            ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm border-l-4 border-blue-600 font-medium'
                            : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent hover:border-gray-300'
                        }`}
                      >
                        {Icon && (
                          <Icon
                            className={`w-5 h-5 flex-shrink-0 ${
                              isActive ? 'text-blue-600' : 'text-gray-500'
                            }`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{tab.name}</div>
                          {isActive && tab.description && (
                            <div className="text-xs text-blue-600 mt-0.5 truncate">
                              {tab.description}
                            </div>
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

    {/* MAIN CONTENT - with bottom padding for footer */}
    <div className="flex-1 ml-72 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-14">
        <div className="p-6 md:p-8 lg:p-10" style={{ minHeight: "100%" }}>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Page Header */}
              <div className="flex items-center justify-between pb-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center shadow-md">
                    <LayoutDashboard className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Administrator Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                {dashLoading && (
                  <span className="text-xs text-blue-500 font-medium animate-pulse">Fetching data…</span>
                )}
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {dashLoading ? (
                  [...Array(4)].map((_, i) => <SkeletonStatCard key={i} />)
                ) : [
                  {
                    label: 'Total Contracts',
                    value: stats.totalContracts,
                    sub: `${stats.activeContracts} active`,
                    color: '#2563eb',
                    bg: '#eff6ff',
                    icon: (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/>
                      </svg>
                    )
                  },
                  {
                    label: 'System Users',
                    value: stats.totalUsers,
                    sub: stats.pendingUsers > 0 ? `${stats.pendingUsers} pending approval` : 'All approved',
                    color: '#7c3aed',
                    bg: '#f5f3ff',
                    icon: (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    )
                  },
                  {
                    label: 'Active Contracts',
                    value: stats.activeContracts,
                    sub: `${stats.totalContracts > 0 ? Math.round((stats.activeContracts / stats.totalContracts) * 100) : 0}% of total`,
                    color: '#059669',
                    bg: '#ecfdf5',
                    icon: (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                    )
                  },
                  {
                    label: 'Expiring in 30 Days',
                    value: expiringContracts.length,
                    sub: expiringContracts.length > 0 ? 'Requires attention' : 'All clear',
                    color: expiringContracts.length > 0 ? '#d97706' : '#059669',
                    bg: expiringContracts.length > 0 ? '#fffbeb' : '#ecfdf5',
                    icon: (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                    )
                  }
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{kpi.label}</span>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: kpi.bg, color: kpi.color }}>
                        {kpi.icon}
                      </div>
                    </div>
                    <div className="text-3xl font-bold tracking-tight" style={{ color: kpi.color }}>{kpi.value}</div>
                    <div className="text-xs text-gray-400 mt-1.5 font-medium">{kpi.sub}</div>
                  </div>
                ))}
              </div>

              {/* Middle Row: Contract Status Breakdown + Quick Nav */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Contract Status Breakdown */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Contract Status Breakdown</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Active', count: stats.activeContracts, color: '#059669', bg: '#ecfdf5', barColor: '#059669' },
                      { label: 'Draft', count: stats.draftContracts, color: '#2563eb', bg: '#eff6ff', barColor: '#3b82f6' },
                      { label: 'Pending', count: stats.pendingContracts, color: '#d97706', bg: '#fffbeb', barColor: '#f59e0b' },
                      { label: 'Expired', count: stats.expiredContracts, color: '#dc2626', bg: '#fef2f2', barColor: '#ef4444' },
                    ].map((item) => {
                      const pct = stats.totalContracts > 0 ? (item.count / stats.totalContracts) * 100 : 0;
                      return (
                        <div key={item.label}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: item.barColor }} />
                              <span className="text-sm font-medium text-gray-700">{item.label}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
                              <span className="text-sm font-bold" style={{ color: item.color, minWidth: '2ch', textAlign: 'right' }}>{item.count}</span>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: item.barColor }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary row */}
                  <div className="mt-6 pt-5 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
                    {[
                      { label: 'Positions Defined', value: stats.totalPositions },
                      { label: 'Total Records', value: stats.totalContracts },
                      { label: 'Pending Users', value: stats.pendingUsers },
                    ].map((s, i) => (
                      <div key={i}>
                        <div className="text-xl font-bold text-gray-800">{s.value}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Navigation */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Quick Access</h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Manage Users', tab: 'users', icon: '👥', desc: 'Approve & configure accounts' },
                      { label: 'Generate Contract', tab: 'contracts', icon: '📄', desc: 'Create new contract' },
                      { label: 'View Documents', tab: 'documents', icon: '📁', desc: 'Browse document repository' },
                      { label: 'Salary Grades', tab: 'salaryGrades', icon: '💰', desc: 'Update grade schedule' },
                      { label: 'Activity Log', tab: 'activityLog', icon: '📋', desc: 'Review system activity' },
                    ].map((item) => (
                      <button
                        key={item.tab}
                        onClick={() => setActiveTab(item.tab)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-50 transition-colors group text-left border border-transparent hover:border-gray-200"
                      >
                        <span className="text-lg flex-shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 group-hover:text-green-700 transition-colors truncate">{item.label}</div>
                          <div className="text-xs text-gray-400 truncate">{item.desc}</div>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-green-600 transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Row: Expiring Contracts + Recent Contracts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Expiring Soon */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-500">⏰</span>
                      <h3 className="text-sm font-semibold text-gray-700">Expiring Within 30 Days</h3>
                    </div>
                    {expiringContracts.length > 0 && (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                        {expiringContracts.length} contract{expiringContracts.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {expiringContracts.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <div className="text-3xl mb-2">✅</div>
                        <div className="text-sm font-medium text-gray-600">No contracts expiring soon</div>
                        <div className="text-xs text-gray-400 mt-1">All active contracts are within safe date range</div>
                      </div>
                    ) : (
                      expiringContracts.map((c) => {
                        const daysLeft = Math.ceil((new Date(c.endDate) - new Date()) / (1000 * 60 * 60 * 24));
                        const urgent = daysLeft <= 7;
                        return (
                          <div key={c._id} className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="text-sm font-medium text-gray-800 truncate">
                                {c.contractualInfo?.firstName} {c.contractualInfo?.lastName}
                              </div>
                              <div className="text-xs text-gray-400 truncate mt-0.5">{c.position || 'N/A'}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                {daysLeft}d left
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                {new Date(c.endDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Recent Contracts */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>🕐</span>
                      <h3 className="text-sm font-semibold text-gray-700">Recently Added Contracts</h3>
                    </div>
                    <button
                      onClick={() => setActiveTab('contracts')}
                      className="text-xs text-green-600 hover:text-green-800 font-medium transition-colors"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {recentContracts.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <div className="text-3xl mb-2">📋</div>
                        <div className="text-sm font-medium text-gray-600">No contracts yet</div>
                        <div className="text-xs text-gray-400 mt-1">Generated contracts will appear here</div>
                      </div>
                    ) : (
                      recentContracts.map((c) => {
                        const statusColors = {
                          ACTIVE: 'bg-green-100 text-green-700',
                          DRAFT: 'bg-blue-100 text-blue-700',
                          PENDING: 'bg-amber-100 text-amber-700',
                          EXPIRED: 'bg-red-100 text-red-700',
                        };
                        return (
                          <div key={c._id} className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="text-sm font-medium text-gray-800 truncate">
                                {c.contractualInfo?.firstName} {c.contractualInfo?.lastName}
                              </div>
                              <div className="text-xs text-gray-400 truncate mt-0.5">{c.position || c.positionTitle || 'N/A'}</div>
                            </div>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${statusColors[c.status] || 'bg-gray-100 text-gray-600'}`}>
                              {c.status}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* System Health Footer */}
              <div className="bg-gradient-to-r from-green-900 to-green-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-green-300 uppercase tracking-widest mb-1">System Status</div>
                  <div className="text-white font-semibold text-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full inline-block animate-pulse" />
                    CGEN is operational — all services running normally
                  </div>
                </div>
                <div className="text-xs text-green-400 font-medium flex-shrink-0">
                  DENR IV-A CALABARZON · v2.0 Special Edition
                </div>
              </div>
            </div>
          )}

          {/* SALARY GRADES */}          {/* SALARY GRADES */}
          {activeTab === 'salaryGrades' && (
            <div className="space-y-6">
              {/* Sticky Header */}
              <div className="sticky top-0 z-20 bg-gray-50 -mx-6 md:-mx-8 lg:-mx-10 pt-6 pb-4 px-6 md:px-8 lg:px-10">
                <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <DollarSign className="w-10 h-10 text-blue-600" />
                      <div>
                        <h1 className="text-3xl font-bold text-gray-900">Salary Grades</h1>
                        <p className="text-gray-600">Manage salary grade structure and computations</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const opening = !showSalaryGradeForm;
                        setShowSalaryGradeForm(opening);
                        setEditingSalaryGrade(null);
                        setIsNewSet(true);
                        setNewSalaryGrade({
                          grade: '',
                          isSpecialSalaryGrade: false,
                          basicSalary: '',
                          grossPremium: '0.00',
                          deductions: {
                            sss: '475.00',
                            pagibig: '400.00',
                            philhealth: '0.00',
                          },
                          monthlySalaryAsPerContract: '0.00',
                          dailySalaryAsPerContract: '0.00',
                          monthlyPremium: '0.00',
                          note: ''
                        });
                        // When opening for a new grade in the CURRENT set, pre-fill the active period date
                        if (opening && activePeriodStart) {
                          const currentPeriod = salaryPeriods.find(p =>
                            new Date(p.periodStartDate).toISOString() === new Date(activePeriodStart).toISOString()
                          );
                          setPeriodFields({
                            periodStartDate: new Date(activePeriodStart).toISOString().split('T')[0],
                            periodEndDate: currentPeriod?.periodEndDate ? new Date(currentPeriod.periodEndDate).toISOString().split('T')[0] : '',
                            periodLabel: currentPeriod?.periodLabel || ''
                          });
                          setIsNewSet(false);
                        } else {
                          setPeriodFields({ periodStartDate: '', periodEndDate: '', periodLabel: '' });
                        }
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm whitespace-nowrap"
                    >
                      {showSalaryGradeForm ? 'Cancel' : 'Add Salary Grade'}
                    </button>
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

              {/* Form */}
              {showSalaryGradeForm && (
                <div ref={salaryGradeFormRef} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:p-8 scroll-mt-6">
                  <h3 className="text-xl font-bold mb-2">
                    {editingSalaryGrade ? 'Edit Salary Grade' : isNewSet ? 'New Salary Grade — New Set' : 'Add Salary Grade to Current Set'}
                  </h3>

                  {!editingSalaryGrade && (
                    <div className="flex gap-2 mb-6">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewSet(false);
                          if (activePeriodStart) {
                            const currentPeriod = salaryPeriods.find(p =>
                              new Date(p.periodStartDate).toISOString() === new Date(activePeriodStart).toISOString()
                            );
                            setPeriodFields({
                              periodStartDate: new Date(activePeriodStart).toISOString().split('T')[0],
                              periodEndDate: currentPeriod?.periodEndDate ? new Date(currentPeriod.periodEndDate).toISOString().split('T')[0] : '',
                              periodLabel: currentPeriod?.periodLabel || ''
                            });
                          }
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${!isNewSet ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50'}`}
                      >
                        Add to Current Set
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewSet(true);
                          setPeriodFields({ periodStartDate: '', periodEndDate: '', periodLabel: '' });
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${isNewSet ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-green-50'}`}
                      >
                        + New Set
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleCreateSalaryGrade} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium mb-1">Salary Grade</label>
                        <input
                          type="text"
                          value={newSalaryGrade.grade}
                          onChange={(e) =>
                            setNewSalaryGrade({ ...newSalaryGrade, grade: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="e.g., 1, 6.5, 24"
                          required
                          disabled={editingSalaryGrade}
                        />
                      </div>

                      <div className="flex items-center pt-6">
                        <input
                          type="checkbox"
                          checked={newSalaryGrade.isSpecialSalaryGrade}
                          onChange={(e) => {
                            const isSpecial = e.target.checked;
                            const basic = parseFloat(newSalaryGrade.basicSalary) || 0;

                            if (isSpecial) {
                              // Special = no premium/bonus, and Monthly/Daily
                              // Salary equal Basic Salary exactly. SSS and
                              // Pag-IBIG are left as-is (still editable,
                              // still saved) but not added on top.
                              const philhealth = basic * 0.05;

                              setNewSalaryGrade({
                                ...newSalaryGrade,
                                isSpecialSalaryGrade: true,
                                grossPremium: '0.00',
                                deductions: {
                                  ...newSalaryGrade.deductions,
                                  philhealth: philhealth.toFixed(2),
                                },
                                monthlySalaryAsPerContract: basic.toFixed(2),
                                dailySalaryAsPerContract: (basic / 22).toFixed(2),
                                monthlyPremium: '0.00',
                              });
                            } else {
                              const grossPremium = basic * 0.15;
                              const philhealth = basic * 0.05;
                              const sss = 475;
                              const pagibig = 400;
                              const totalDed = sss + pagibig + philhealth;
                              const monthlyContract = basic + totalDed;
                              const dailyContract = monthlyContract / 22;
                              const premium = grossPremium - totalDed;

                              setNewSalaryGrade({
                                ...newSalaryGrade,
                                isSpecialSalaryGrade: false,
                                grossPremium: grossPremium.toFixed(2),
                                deductions: {
                                  sss: sss.toFixed(2),
                                  pagibig: pagibig.toFixed(2),
                                  philhealth: philhealth.toFixed(2),
                                },
                                monthlySalaryAsPerContract: monthlyContract.toFixed(2),
                                dailySalaryAsPerContract: dailyContract.toFixed(2),
                                monthlyPremium: premium.toFixed(2),
                              });
                            }
                          }}
                          className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          Special Salary Grade (No Premium)
                        </label>
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <h5 className="font-semibold text-lg mb-3">Basic Salary</h5>
                      <input
                        type="number"
                        step="0.01"
                        value={newSalaryGrade.basicSalary}
                        onChange={(e) => handleBasicSalaryChange(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter basic salary"
                        required
                      />
                    </div>

                    <div className="pt-4 border-t">
                      <h5 className="font-semibold text-lg mb-3">
                        Deductions {newSalaryGrade.isSpecialSalaryGrade && '(Premium N/A for Special Grade)'}
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-sm font-medium mb-1">SSS</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newSalaryGrade.deductions.sss}
                            onChange={(e) => handleDeductionChange('sss', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Pag-IBIG</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newSalaryGrade.deductions.pagibig}
                            onChange={(e) => handleDeductionChange('pagibig', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">PhilHealth (5%)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newSalaryGrade.deductions.philhealth}
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg cursor-not-allowed"
                            readOnly
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 bg-blue-50 p-6 rounded-xl border border-blue-100">
                      <h5 className="font-semibold text-lg mb-4">Computed Values</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-sm font-medium mb-1">Monthly Salary (Contract)</label>
                          <div className="text-2xl font-bold text-gray-800">
                            ₱{parseFloat(newSalaryGrade.monthlySalaryAsPerContract || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Daily Salary (Contract)</label>
                          <div className="text-2xl font-bold text-gray-800">
                            ₱{parseFloat(newSalaryGrade.dailySalaryAsPerContract || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Monthly Premium {newSalaryGrade.isSpecialSalaryGrade && '(N/A)'}
                          </label>
                          <div className="text-2xl font-bold text-gray-800">
                            ₱{parseFloat(newSalaryGrade.monthlyPremium || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── PERIOD / SET DATES ── */}
                    <div className="border border-blue-300 bg-blue-50 rounded-lg p-4 space-y-4">
                      <h4 className="text-sm font-semibold text-blue-800 uppercase tracking-wide">
                        📅 Salary Grade Period
                      </h4>
                      <p className="text-xs text-blue-700">
                        All grades saved with the same Period Start Date belong to one set.
                        Contracts use the set whose period covers the contract start date.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-blue-800 mb-1">
                            Period Start Date <span className="text-red-600">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={periodFields.periodStartDate}
                            onChange={e => setPeriodFields({ ...periodFields, periodStartDate: e.target.value })}
                            readOnly={!isNewSet && !editingSalaryGrade}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-medium ${!isNewSet && !editingSalaryGrade ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed' : 'border-blue-400 bg-white text-gray-900'}`}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-blue-800 mb-1">
                            Period End Date <span className="text-gray-500 font-normal">(leave blank if open)</span>
                          </label>
                          <input
                            type="date"
                            value={periodFields.periodEndDate}
                            onChange={e => setPeriodFields({ ...periodFields, periodEndDate: e.target.value })}
                            className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-blue-800 mb-1">
                          Period Label <span className="text-gray-500 font-normal">(optional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. FY 2026 Salary Schedule"
                          value={periodFields.periodLabel}
                          onChange={e => setPeriodFields({ ...periodFields, periodLabel: e.target.value })}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
                        />
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        type="submit"
                        className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                      >
                        {editingSalaryGrade ? 'Update Salary Grade' : 'Create Salary Grade'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Table */}
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
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {[...salaryGrades]
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
                        })
                        .map((sg) => {
                          const basic = sg.basicSalary || 0;
                          const gross = sg.grossPremium || 0;
                          const ded = sg.deductions || { sss: 0, pagibig: 0, philhealth: 0 };
                          const totalDed = (ded.sss || 0) + (ded.pagibig || 0) + (ded.philhealth || 0);
                          const monthly = sg.monthlySalaryAsPerContract || 0;
                          const daily = sg.dailySalaryAsPerContract || 0;
                          const premium = sg.monthlyPremium || 0;

                          const prev = previousGradeMap.get(String(sg.grade));
                          const isNewGrade = previousGradeMap.size > 0 && !prev;
                          const prevDed = prev?.deductions
                            ? (prev.deductions.sss || 0) + (prev.deductions.pagibig || 0) + (prev.deductions.philhealth || 0)
                            : undefined;

                          return (
                            <tr key={sg._id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                {sg.grade}
                                {isNewGrade && <NewGradeBadge />}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                ₱{basic.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {!isNewGrade && <TrendBadge current={basic} previous={prev?.basicSalary} />}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                ₱{gross.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {!isNewGrade && <TrendBadge current={gross} previous={prev?.grossPremium} />}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                ₱{totalDed.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {!isNewGrade && <TrendBadge current={totalDed} previous={prevDed} />}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap font-medium">
                                ₱{monthly.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {!isNewGrade && <TrendBadge current={monthly} previous={prev?.monthlySalaryAsPerContract} />}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                ₱{daily.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {!isNewGrade && <TrendBadge current={daily} previous={prev?.dailySalaryAsPerContract} />}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                ₱{premium.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {!isNewGrade && <TrendBadge current={premium} previous={prev?.monthlyPremium} />}
                              </td>
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
                                <div className="flex space-x-4">
                                  <button onClick={() => handleViewSalaryGrade(sg)} className="text-green-600 hover:text-green-900">
                                    View
                                  </button>
                                  <button onClick={() => handleEditSalaryGrade(sg)} className="text-blue-600 hover:text-blue-900">
                                    Edit
                                  </button>
                                  <button onClick={() => handleDeleteSalaryGrade(sg._id)} className="text-red-600 hover:text-red-900">
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* CLAUSES */}
          {activeTab === 'clauses' && (
            <div className="space-y-6">
              {/* Sticky Header */}
              <div className="sticky top-0 z-20 bg-gray-50 -mx-6 md:-mx-8 lg:-mx-10 pt-6 pb-4 px-6 md:px-8 lg:px-10">
                <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <FileText className="w-10 h-10 text-blue-600" />
                      <div>
                        <h1 className="text-3xl font-bold text-gray-900">Contract Clauses</h1>
                        <p className="text-gray-600">Manage contract clause templates</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowClauseForm(!showClauseForm);
                        if (showClauseForm) {
                          setEditingClause(null);
                          setNewClause({
                            clauseNumber: '',
                            title: '',
                            content: '',
                            isBeforeWitnesseth: false,
                            isFixed: false,
                            clauseType: 'NORMAL',
                            groups: [],
                          });
                        }
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm whitespace-nowrap"
                    >
                      {showClauseForm ? 'Cancel' : 'Add Clause'}
                    </button>
                  </div>

                  <div className="mt-6 max-w-md">
                    <input
                      type="text"
                      placeholder="🔍 Search by number, title, type, or content..."
                      value={clauseSearchTerm}
                      onChange={(e) => setClauseSearchTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Form */}
              {showClauseForm && (
                <div ref={clauseFormRef} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:p-8 scroll-mt-6">
                  <h3 className="text-xl font-bold mb-6">
                    {editingClause ? 'Edit Clause' : 'New Clause'}
                  </h3>

                  <form onSubmit={handleCreateClause} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div>
                        <label className="block text-sm font-medium mb-1">Clause Number <span className="text-gray-400 font-normal">(label)</span></label>
                        <input
                          type="number"
                          value={newClause.clauseNumber}
                          onChange={(e) => setNewClause({ ...newClause, clauseNumber: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                          disabled={editingClause !== null}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Sort Order
                          <span className="ml-1 text-xs text-gray-400 font-normal">— controls render sequence</span>
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. 25 (between 20 and 30)"
                          value={newClause.sortOrder}
                          onChange={(e) => setNewClause({ ...newClause, sortOrder: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-400 mt-1">Leave blank to append at end. Use steps of 10 (10, 20, 30…) for future flexibility.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Clause Type</label>
                        <select
                          value={newClause.clauseType}
                          onChange={(e) => setNewClause({ ...newClause, clauseType: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          <option value="NORMAL">Normal</option>
                          <option value="PRIMARY">Primary (Dynamic)</option>
                          <option value="SECONDARY">Secondary (Dynamic)</option>
                          <option value="TERTIARY">Tertiary (Dynamic)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Title (Optional)</label>
                        <input
                          type="text"
                          value={newClause.title}
                          onChange={(e) => setNewClause({ ...newClause, title: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Content
                        <span className="block text-xs text-gray-500 mt-1">
                          Available placeholders: {'{'}position{'}'} • {'{'}placeOfAssignment{'}'} • {'{'}startDate{'}'} • {'{'}endDate{'}'} • {'{'}basicSalary{'}'} • {'{'}monthlySalaryAsPerContract{'}'} • {'{'}dailySalaryAsPerContract{'}'} • {'{'}monthlyPremium{'}'} • {'{'}finalPremium{'}'} etc.
                        </span>
                      </label>
                      <textarea
                        value={newClause.content}
                        onChange={(e) => setNewClause({ ...newClause, content: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-40 resize-y font-mono text-sm"
                        required
                      />
                    </div>

                    <div className="flex flex-wrap gap-6">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={newClause.isBeforeWitnesseth}
                          onChange={(e) => setNewClause({ ...newClause, isBeforeWitnesseth: e.target.checked })}
                          className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Before WITNESSETH</span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={newClause.isFixed}
                          onChange={(e) => setNewClause({ ...newClause, isFixed: e.target.checked })}
                          className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Fixed Clause</span>
                      </label>
                    </div>

                    <div>
                      <button
                        type="submit"
                        className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                      >
                        {editingClause ? 'Update Clause' : 'Create Clause'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {clauseReordering && (
                  <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs font-medium">
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                    Saving order…
                  </div>
                )}
                {!clauseReordering && clauses.length > 0 && (
                  <div className="flex items-center gap-2 px-5 py-2 bg-blue-50 border-b border-blue-100 text-blue-600 text-xs font-medium">
                    ☰ Drag rows to reorder — saved automatically
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-4 w-8"></th>
                        <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clause #</th>
                        <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sort Order</th>
                        <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                        <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content Preview</th>
                        <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flags</th>
                        <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {clauses
                        .filter((clause) => {
                          if (!clauseSearchTerm) return true;
                          const search = clauseSearchTerm.toLowerCase();
                          return (
                            clause.clauseNumber.toString().includes(search) ||
                            (clause.title && clause.title.toLowerCase().includes(search)) ||
                            clause.content.toLowerCase().includes(search) ||
                            clause.clauseType.toLowerCase().includes(search)
                          );
                        })
                        .map((clause, index) => (
                          <tr
                            key={clause._id}
                            draggable={!clauseSearchTerm} // disable drag while searching
                            onDragStart={() => handleClauseDragStart(index)}
                            onDragOver={(e) => handleClauseDragOver(e, index)}
                            onDrop={handleClauseDrop}
                            onDragEnd={handleClauseDrop}
                            className={`hover:bg-gray-50 transition-colors ${clauseDragIdx === index ? 'opacity-50 bg-blue-50' : ''} ${!clauseSearchTerm ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          >
                            <td className="px-3 py-4 text-gray-300 select-none">
                              {!clauseSearchTerm && (
                                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                                  <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
                                  <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
                                  <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                                </svg>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                              {clause.clauseNumber}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {clause.sortOrder ?? <span className="italic text-gray-400">= {clause.clauseNumber}</span>}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">{getClauseTypeBadge(clause.clauseType)}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                              {clause.title || '-'}
                            </td>
                            <td className="px-4 py-4 max-w-md">
                              <div className="text-sm text-gray-600 line-clamp-2">{clause.content}</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex flex-wrap gap-2">
                                {clause.isBeforeWitnesseth && (
                                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                    Before WITNESSETH
                                  </span>
                                )}
                                {clause.isFixed && (
                                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-800">
                                    Fixed
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-4">
                                <button onClick={() => handleEditClause(clause)} className="text-blue-600 hover:text-blue-900">
                                  Edit
                                </button>
                                {!clause.isFixed && (
                                  <button onClick={() => handleDeleteClause(clause._id)} className="text-red-600 hover:text-red-900">
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Other tabs */}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'positions' && <PositionManagement />}
          {activeTab === 'clauseGroups' && <ClauseGroupManagement />}
          {activeTab === 'holidays' && <HolidayManagement />}
          {activeTab === 'signatories' && <SignatoryManagement />}
          {activeTab === 'documents' && <DocumentViewer userRole="ADMINISTRATOR" />}
          {activeTab === 'contracts' && <ContractGenerator userRole="ADMINISTRATOR" />}
          {activeTab === 'activityLog' && <ActivityLog />}
          {activeTab === 'activeEmployees' && <ActiveEmployeesMonitor />}

          {/* Modal */}
          {selectedSalaryGrade && (
            <SalaryGradeDetailsModal
              salaryGrade={selectedSalaryGrade}
              onClose={() => setSelectedSalaryGrade(null)}
            />
          )}
        </div>
      </div>
    </div>

    {/* FIXED FOOTER */}
    <footer className="fixed bottom-0 left-0 right-0 h-12 z-40 flex items-center justify-center" style={{ background: "#0a1628", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs text-white/25 tracking-wide">
        © {new Date().getFullYear()} DENR CALABARZON Contract Management System — All rights reserved.
      </p>
    </footer>
  </div>
);
}

export default AdminDashboard;