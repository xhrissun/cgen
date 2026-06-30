import { useState, useEffect } from 'react';
import { SkeletonTable, SectionLoader, EmptyState, Spinner, dispatchPageLoading } from './ui.jsx';
import api from '../api.js';
import ContractDetailsModal from './ContractDetailsModal';
import Select from 'react-select';

function ContractGenerator({ userRole, userId, viewOnly = false }) {
  const [contracts, setContracts] = useState([]);
  const [users, setUsers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [previewData, setPreviewData] = useState(null);
  const [formData, setFormData] = useState({
    userId: userId || '',
    mode: 'NEW',
    year: new Date().getFullYear(),
    semester: 1,
    startDate: '',
    endDate: '',
    position: '',
    positionCode: '',
    placeOfAssignment: '',
    dutiesAndResponsibilities: [],
    salaryGrade: '',
    charging: 'GENERAL APPROPRIATIONS ACT',
    approverBranch: 'MANAGEMENT',  // ADD THIS LINE
    signatories: {
      firstParty: { name: '', position: '', title: '' },
      approver: { name: '', position: '' },
      supervisor: { name: '', position: '' },
      accountant: { name: '', position: '' },
      financeChief: { name: '', position: '' }
    }
  });

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [currentUserPlaceOfAssignment, setCurrentUserPlaceOfAssignment] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [filterAssignment, setFilterAssignment] = useState('');
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const getDuplicateNames = () => {
    const nameMap = {};
    
    contracts.forEach(contract => {
      // Skip cancelled or archived contracts from duplicate detection
      if (contract.status === 'CANCELLED' || contract.isArchived) {
        return;
      }
      
      const user = contract.userId?.personalInfo;
      if (user?.lastName && user?.firstName) {
        const fullName = `${user.lastName}, ${user.firstName}${user.middleName ? ' ' + user.middleName : ''}`;
        
        // Create a key combining name, year, semester, AND status
        const key = `${fullName}|${contract.year}|${contract.semester}|${contract.status}`;
        
        if (!nameMap[key]) {
          nameMap[key] = {
            contracts: [],
            fullName: fullName,
            year: contract.year,
            semester: contract.semester,
            status: contract.status
          };
        }
        nameMap[key].contracts.push(contract._id);
      }
    });
    
    // Return only names that appear more than once in the same year/semester/status
    const duplicates = {};
    Object.keys(nameMap).forEach(key => {
      if (nameMap[key].contracts.length > 1) {
        duplicates[key] = nameMap[key];
      }
    });
    
    return duplicates;
  };

  const duplicateNames = getDuplicateNames();


  // Place of Assignment options
  const PLACE_OF_ASSIGNMENT_OPTIONS = [
    'ADMINISTRATIVE DIVISION',
    'FINANCE DIVISION',
    'LEGAL DIVISION',
    'PLANNING AND MANAGEMENT DIVISION',
    'CONSERVATION AND DEVELOPMENT DIVISION',
    'ENFORCEMENT DIVISION',
    'LICENSES, PATENTS, AND DEEDS DIVISION',
    'SURVEYS AND MAPPING DIVISION',
    'SURVEYS AND MAPPING DIVISION - RECORDS SECTION',
    'CONSERVATION AND DEVELOPMENT DIVISION - REGIONAL WILDLIFE RESCUE CENTER',
    'NATIONAL GREENING PROGRAM COORDINATING OFFICE - MODERNIZED AND MECHANIZED FOREST NURSERY',
    'MANILA BAY SITE COORDINATING MANAGEMENT OFFICE 4',
    'NATIONAL GREENING PROGRAM COORDINATING OFFICE',
    'REGIONAL STRATEGIC COMMUNICATION AND INITIATIVES GROUP',
    'OFFICE OF THE ASSISTANT REGIONAL DIRECTOR FOR MANAGEMENT SERVICES',
    'OFFICE OF THE ASSISTANT REGIONAL DIRECTOR FOR TECHNICAL SERVICES',
    'OFFICE OF THE REGIONAL EXECUTIVE DIRECTOR'
  ];

    const isUserProfileComplete = (user) => {
    if (!user?.personalInfo) return false;
    const pi = user.personalInfo;
    
    // Check Account Information
    const hasAccountInfo = !!(user.username && user.placeOfAssignment);
    
    // Check Personal Information
    const hasPersonalInfo = !!(
      pi.lastName && 
      pi.firstName && 
      pi.middleName &&
      pi.sex &&
      pi.placeOfBirth &&
      pi.birthday &&
      pi.phoneNumber &&
      pi.email &&
      pi.address &&
      pi.highestEducation &&
      pi.bachelorsDegree
    );
    
    // Check Government IDs
    const hasGovernmentIds = !!(
      pi.philhealth && 
      pi.pagibig && 
      pi.tin
    );
    
    return hasAccountInfo && hasPersonalInfo && hasGovernmentIds;
  };

  const getMissingFields = (user) => {
    const missing = [];
    
    if (!user?.personalInfo) return ['All personal information'];
    
    const pi = user.personalInfo;
    
    // Account Information
    if (!user.username) missing.push('Username');
    if (!user.placeOfAssignment) missing.push('Place of Assignment');
    
    // Personal Information
    if (!pi.lastName) missing.push('Last Name');
    if (!pi.firstName) missing.push('First Name');
    if (!pi.middleName) missing.push('Middle Name');
    if (!pi.sex) missing.push('Sex');
    if (!pi.placeOfBirth) missing.push('Place of Birth');
    if (!pi.birthday) missing.push('Birthday');
    if (!pi.phoneNumber) missing.push('Phone Number');
    if (!pi.email) missing.push('Email');
    if (!pi.address) missing.push('Address');
    if (!pi.highestEducation) missing.push('Highest Education');
    if (!pi.bachelorsDegree) missing.push("Bachelor's Degree");
    
    // Government IDs
    if (!pi.philhealth) missing.push('PhilHealth');
    if (!pi.pagibig) missing.push('Pag-IBIG');
    if (!pi.tin) missing.push('TIN');
    
    return missing;
  };
  

  useEffect(() => {
    // Get current user's role and place of assignment
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUserRole(payload.role);
      
      // If focal person, fetch and lock their place of assignment
      if (payload.role === 'FOCAL_PERSON') {
        const fetchCurrentUser = async () => {
          try {
            const response = await api.get(`/api/users/${payload.userId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            setCurrentUserPlaceOfAssignment(response.data.placeOfAssignment);
            setFormData(prev => ({
              ...prev,
              placeOfAssignment: response.data.placeOfAssignment
            }));
          } catch (error) {
            console.error('Error fetching user:', error);
          }
        };
        fetchCurrentUser();
      }
    }
    
    fetchContracts();
    fetchDefaultSignatories();
    fetchHolidays();
    if (userRole === 'ADMINISTRATOR' || userRole === 'FOCAL_PERSON') {
      fetchUsers();
    }
    fetchPositions();
  }, [userRole]);

  const fetchContracts = async () => {
    setLoadingContracts(true);
    dispatchPageLoading(true, 'Loading contracts…');
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/contracts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setContracts(response.data);
    } catch (error) {
      console.error('Error fetching contracts:', error);
    } finally {
      setLoadingContracts(false);
      dispatchPageLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch all users first
      const response = await api.get('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Filter on the frontend to include both CONTRACTUAL and FOCAL_PERSON
      const filteredUsers = response.data.filter(u => 
        u.role === 'CONTRACTUAL' || u.role === 'FOCAL_PERSON'
      );
      
      // If current user is FOCAL_PERSON, filter by place of assignment
      if (userRole === 'FOCAL_PERSON') {
        const currentUserPayload = JSON.parse(atob(token.split('.')[1]));
        const currentUserResponse = await api.get(`/api/users/${currentUserPayload.userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const currentPlace = currentUserResponse.data.placeOfAssignment;
        
        setUsers(filteredUsers.filter(u => u.placeOfAssignment === currentPlace));
      } else {
        setUsers(filteredUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchPositions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Filter positions that have clauses assigned (for non-admins)
      let availablePositions = response.data;
      if (userRole === 'FOCAL_PERSON') {
        availablePositions = response.data.filter(p => 
          p.assignedClauses && p.assignedClauses.length > 0
        );
      }
      
      setPositions(availablePositions);
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const fetchHolidays = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/holidays', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHolidays(response.data);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  };

  const fetchDefaultSignatories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/signatories/defaults/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const defaults = response.data;
      
      setFormData(prev => ({
        ...prev,
        approverBranch: 'MANAGEMENT',  // ADD THIS LINE
        signatories: {
          firstParty: defaults.FIRST_PARTY ? {
            name: defaults.FIRST_PARTY.name,
            position: defaults.FIRST_PARTY.designation,
            title: defaults.FIRST_PARTY.title || ''
          } : prev.signatories.firstParty,
          approver: {
            name: 'ATTY. LIEZL E. DE MESA',
            position: 'OIC, Assistant Regional Director for Management Services'
          },
          supervisor: defaults.SUPERVISOR ? {
            name: defaults.SUPERVISOR.name,
            position: defaults.SUPERVISOR.designation
          } : prev.signatories.supervisor,
          accountant: defaults.FUNDS_AVAILABLE_ACCOUNTANT ? {
            name: defaults.FUNDS_AVAILABLE_ACCOUNTANT.name,
            position: defaults.FUNDS_AVAILABLE_ACCOUNTANT.designation
          } : prev.signatories.accountant,
          financeChief: defaults.FUNDS_AVAILABLE_FINANCE ? {
            name: defaults.FUNDS_AVAILABLE_FINANCE.name,
            position: defaults.FUNDS_AVAILABLE_FINANCE.designation
          } : prev.signatories.financeChief
        }
      }));
    } catch (error) {
      console.error('Error fetching default signatories:', error);
    }
  };

  const handleApproverBranchChange = (branch) => {
    let approverData = {};
    
    if (branch === 'MANAGEMENT') {
      approverData = {
        name: 'ATTY. LIEZL E. DE MESA',
        position: 'OIC, Assistant Regional Director for Management Services'
      };
    } else if (branch === 'TECHNICAL') {
      approverData = {
        name: 'ERIBERTO B. SAÑOS',
        position: 'OIC, Assistant Regional Director for Technical Services'
      };
    }
    
    setFormData(prev => ({
      ...prev,
      approverBranch: branch,
      signatories: {
        ...prev.signatories,
        approver: approverData
      }
    }));
  };

  const handlePositionChange = (positionCode) => {
    const position = positions.find(p => p.positionCode === positionCode);
    if (position) {
      setFormData(prev => ({
        ...prev,
        positionCode: positionCode,
        position: position.title,
        salaryGrade: position.salaryGrade,
        dutiesAndResponsibilities: position.dutiesAndResponsibilities,
        // Only update place of assignment if not a focal person (their place is locked)
        placeOfAssignment: currentUserRole === 'FOCAL_PERSON' 
          ? prev.placeOfAssignment 
          : (position.placeOfAssignment || prev.placeOfAssignment),
        charging: position.charging || prev.charging
      }));
    }
  };

  const handleViewContract = async (contract) => {
     try {
       const token = localStorage.getItem('token');
       const response = await api.get(`/api/contracts/${contract._id}`, {
         headers: { Authorization: `Bearer ${token}` }
       });
       setSelectedContract(response.data);
     } catch (error) {
       alert('Error loading contract details: ' + (error.response?.data?.message || error.message));
     }
   };

  // ─── Premium Preview helpers (mirrors backend salaryCalculator.js) ────────────

  const buildWorkingDaysBreakdown = (startDate, endDate, holidayList) => {
    const start = new Date(startDate);
    const end   = new Date(endDate);

    // Build a map: dateStr → holiday object (for names/types)
    const holidayMap = {};
    holidayList.forEach(h => {
      const d = new Date(h.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      holidayMap[key] = h;
    });

    const breakdown = {};

    // Initialise one entry per calendar month spanning the contract
    const startMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endMonth   = new Date(Date.UTC(end.getUTCFullYear(),   end.getUTCMonth(),   1));
    let cur = new Date(startMonth);

    while (cur <= endMonth) {
      const year  = cur.getUTCFullYear();
      const month = cur.getUTCMonth();
      const key   = `${year}-${String(month+1).padStart(2,'0')}`;

      breakdown[key] = {
        year, month: month+1,
        monthName: new Date(Date.UTC(year, month, 15)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
        totalWorkingDaysInMonth: 0,
        actualWorkingDaysInRange: 0,
        contractStartDay: null,
        contractEndDay: null,
        holidaysInMonth: []   // { date, name, type }
      };

      // Count total working days for the ENTIRE month
      const firstDay = new Date(Date.UTC(year, month, 1));
      const lastDay  = new Date(Date.UTC(year, month+1, 0));
      let d = new Date(firstDay);
      while (d <= lastDay) {
        const dow     = d.getUTCDay();
        const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
        const isWknd  = dow === 0 || dow === 6;
        const hol     = holidayMap[dateStr];
        // Only REGULAR and SPECIAL_NON_WORKING remove a working day
        const isNonWorkingHol = hol && hol.type !== 'SPECIAL_WORKING';
        if (!isWknd && !isNonWorkingHol) breakdown[key].totalWorkingDaysInMonth++;
        if (hol) breakdown[key].holidaysInMonth.push({ date: dateStr, name: hol.name, type: hol.type });
        d.setUTCDate(d.getUTCDate() + 1);
      }

      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }

    // Count ACTUAL working days within the contract range
    let cd = new Date(start);
    while (cd <= end) {
      const year  = cd.getUTCFullYear();
      const month = cd.getUTCMonth();
      const key   = `${year}-${String(month+1).padStart(2,'0')}`;
      const dow     = cd.getUTCDay();
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(cd.getUTCDate()).padStart(2,'0')}`;
      const isWknd  = dow === 0 || dow === 6;
      const hol     = holidayMap[dateStr];
      const isNonWorkingHol = hol && hol.type !== 'SPECIAL_WORKING';
      if (!isWknd && !isNonWorkingHol) breakdown[key].actualWorkingDaysInRange++;
      if (cd.toISOString().split('T')[0] === start.toISOString().split('T')[0])
        breakdown[key].contractStartDay = cd.getUTCDate();
      if (cd.toISOString().split('T')[0] === end.toISOString().split('T')[0])
        breakdown[key].contractEndDay = cd.getUTCDate();
      cd.setUTCDate(cd.getUTCDate() + 1);
    }

    return breakdown;
  };

  // Calculate premium preview when dates change
  const calculatePremiumPreview = async () => {
    if (!formData.startDate || !formData.endDate || !formData.salaryGrade) {
      setPreviewData(null);
      return;
    }

    try {
      const token = localStorage.getItem('token');

      // Get salary grade data using the contract START DATE so that advance-drafted
      // contracts (e.g. drafted today for a July 2 start) correctly resolve the
      // salary grade period that is effective on the contract's start date.
      const sgResponse = await api.get(`/api/positions/salary-grades/${formData.salaryGrade}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { contractDate: formData.startDate }
      });

      const salaryGrade = sgResponse.data;

      // Filter holidays within contract period
      const contractHolidays = holidays.filter(h => {
        const hd = new Date(h.date);
        return hd >= new Date(formData.startDate) && hd <= new Date(formData.endDate);
      });

      // Build per-month working-days + holiday breakdown
      const workingDaysBreakdown = buildWorkingDaysBreakdown(
        formData.startDate, formData.endDate, contractHolidays
      );

      // Calculate premium per month (mirrors backend calculatePremiumBreakdown)
      const monthlyPremiumRate = salaryGrade.monthlyPremium;
      let totalPremium = 0;
      let totalWorkingDays = 0;

      const premiumBreakdown = Object.keys(workingDaysBreakdown).map(key => {
        const m = workingDaysBreakdown[key];
        const { totalWorkingDaysInMonth, actualWorkingDaysInRange } = m;
        const dailyRate   = totalWorkingDaysInMonth > 0 ? monthlyPremiumRate / totalWorkingDaysInMonth : 0;
        const isFullMonth = actualWorkingDaysInRange === totalWorkingDaysInMonth;
        const monthPremium = isFullMonth ? monthlyPremiumRate : dailyRate * actualWorkingDaysInRange;
        totalPremium    += monthPremium;
        totalWorkingDays += actualWorkingDaysInRange;
        return {
          ...m,
          monthKey: key,
          monthlyPremiumRate,
          dailyPremiumRate: dailyRate,
          calculatedPremium: monthPremium,
          isFullMonth
        };
      });

      setPreviewData({
        basicSalary: salaryGrade.basicSalary,
        grossPremium: salaryGrade.grossPremium,
        deductions: salaryGrade.deductions,
        monthlySalaryAsPerContract: salaryGrade.monthlySalaryAsPerContract,
        dailySalaryAsPerContract: salaryGrade.dailySalaryAsPerContract,
        monthlyPremium: monthlyPremiumRate,
        totalPremium,
        workingDays: totalWorkingDays,
        bonusType: formData.semester === 1 ? 'Mid-Year' : 'Year-End',
        isSpecialSalaryGrade: salaryGrade.isSpecialSalaryGrade,
        premiumBreakdown,
        contractHolidays
      });
    } catch (error) {
      console.error('Error calculating preview:', error);
      setPreviewData(null);
    }
  };

  useEffect(() => {
    calculatePremiumPreview();
  }, [formData.startDate, formData.endDate, formData.salaryGrade, formData.semester]);

  const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  
  // Add a safety check
  if (!formData.positionCode) {
    alert('Please select a position');
    setLoading(false);
    return;
  }

  // VALIDATE USER PROFILE COMPLETENESS
  if (formData.userId) {
    const selectedUser = users.find(u => u._id === formData.userId);
    if (selectedUser && !isUserProfileComplete(selectedUser)) {
      const missingFields = getMissingFields(selectedUser);
      alert(`⚠️ Cannot create contract. User profile is incomplete.\n\nPlease complete the following required fields:\n\n${missingFields.join('\n')}\n\nRequired sections:\n• Account Information (Username, Place of Assignment)\n• Personal Information (All fields)\n• Government IDs (PhilHealth, Pag-IBIG, TIN)`);
      setLoading(false);
      return;
    }
  }

  try {
    const token = localStorage.getItem('token');
    const response = await api.post('/api/contracts', {
      ...formData,
      // Ensure these are included even if something went wrong
      positionCode: formData.positionCode,
      position: formData.position,
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    alert('Contract created successfully!');
    setShowForm(false);
    setPreviewData(null);

        // 🔧 FIX: Preserve placeOfAssignment for focal persons
    const preservedPlaceOfAssignment = currentUserRole === 'FOCAL_PERSON' 
      ? formData.placeOfAssignment 
      : '';

    // Reset form
    setFormData({
      ...formData,
      positionCode: '',
      position: '',
      salaryGrade: '',
      placeOfAssignment: preservedPlaceOfAssignment,
      dutiesAndResponsibilities: [],
      startDate: '',
      endDate: ''
    });
    fetchContracts();
  } catch (error) {
    console.error('Contract creation error:', error.response?.data || error);
    alert('Error: ' + (error.response?.data?.message || error.message));
  } finally {
    setLoading(false);
  }
};

  const generatePDF = async (contractId) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      const response = await api.get(`/api/contracts/${contractId}/generate`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const contentDisposition = response.headers['content-disposition'];
      let filename = 'contract.pdf';

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1]
            .replace(/[.\s]+$/g, '')           // 🚨 Remove trailing dots/spaces
            .replace(/[/\\?%*:|"<>]/g, '')     // Remove illegal Windows chars
            .trim();
        }
      }

      // 🔒 Safety net: Ensure .pdf extension
      if (!filename.toLowerCase().endsWith('.pdf')) {
        filename += '.pdf';
      }

      // 🔒 Final validation
      if (filename === '.pdf' || filename === 'pdf') {
        filename = 'contract.pdf';
      }

      console.log('✓ Final download filename:', filename);

      link.setAttribute('download', filename);

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      alert('PDF generated successfully!');
    } catch (err) {
      console.error('PDF Generation Error:', err);
      alert('Error generating PDF: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const updateContractStatus = async (contractId, status) => {
  try {
    const token = localStorage.getItem('token');
    await api.patch(`/api/contracts/${contractId}/status`, 
      { status },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    alert('Contract status updated successfully!');
    fetchContracts();
    setShowStatusModal(false);
  } catch (error) {
    alert('Error: ' + (error.response?.data?.message || error.message));
  }
};

const uploadSignedContract = async (contractId, file) => {
  setUploadingFile(true);
  try {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('signedContract', file);
    
    await api.post(`/api/contracts/${contractId}/upload-signed`, formData, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    
    alert('Signed contract uploaded successfully!');
    fetchContracts();
  } catch (error) {
    alert('Error: ' + (error.response?.data?.message || error.message));
  } finally {
    setUploadingFile(false);
  }
};

const downloadSignedContract = async (contractId) => {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get(`/api/contracts/${contractId}/signed-contract`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob'
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `signed_contract_${contractId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert('Error: ' + (error.response?.data?.message || error.message));
  }
};

const archiveContract = async (contractId) => {
  if (!window.confirm('Are you sure you want to archive this contract?')) return;
  
  try {
    const token = localStorage.getItem('token');
    await api.patch(`/api/contracts/${contractId}/archive`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    alert('Contract archived successfully!');
    fetchContracts();
  } catch (error) {
    alert('Error: ' + (error.response?.data?.message || error.message));
  }
};

const unarchiveContract = async (contractId) => {
  try {
    const token = localStorage.getItem('token');
    await api.patch(`/api/contracts/${contractId}/unarchive`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    alert('Contract unarchived successfully!');
    fetchContracts();
  } catch (error) {
    alert('Error: ' + (error.response?.data?.message || error.message));
  }
};

const deleteContract = async (contractId) => {
  if (!window.confirm('⚠️ WARNING: This will permanently delete the contract and cannot be undone. Are you sure?')) return;
  
  try {
    const token = localStorage.getItem('token');
    await api.delete(`/api/contracts/${contractId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    alert('Contract deleted successfully!');
    fetchContracts();
  } catch (error) {
    alert('Error: ' + (error.response?.data?.message || error.message));
  }
};

const exportToCSV = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get(`/api/contracts/export/csv?includeArchived=${showArchived}`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob'
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `contracts_export_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    alert('CSV exported successfully!');
  } catch (error) {
    alert('Error: ' + (error.response?.data?.message || error.message));
  }
};

const handleFileUpload = (contractId, event) => {
  const file = event.target.files[0];
  if (file) {
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are allowed');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }
    uploadSignedContract(contractId, file);
  }
};

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Contract Generator</h3>
        {(userRole === 'ADMINISTRATOR' || userRole === 'FOCAL_PERSON') && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary"
          >
            {showForm ? 'Cancel' : 'Create New Contract'}
          </button>
        )}
      </div>

      {showForm && !viewOnly && (
        <div className="card bg-white shadow-lg rounded-lg p-6">
          <h4 className="text-lg font-semibold mb-4">New Contract</h4>
          <form onSubmit={handleSubmit} className="space-y-6">
            {(userRole === 'ADMINISTRATOR' || userRole === 'FOCAL_PERSON') && (
              <div>
                <label className="block text-sm font-medium mb-1">Select User</label>
                <Select
                  value={users.find(u => u._id === formData.userId) ? {
                    value: formData.userId,
                    label: `${users.find(u => u._id === formData.userId)?.personalInfo?.firstName} ${users.find(u => u._id === formData.userId)?.personalInfo?.lastName} (${users.find(u => u._id === formData.userId)?.username})`
                  } : null}
                  onChange={(option) => setFormData({...formData, userId: option?.value || ''})}
                  options={users
                    .sort((a, b) => {
                      const aLastName = (a.personalInfo?.lastName || '').toUpperCase();
                      const bLastName = (b.personalInfo?.lastName || '').toUpperCase();
                      const aFirstName = (a.personalInfo?.firstName || '').toUpperCase();
                      const bFirstName = (b.personalInfo?.firstName || '').toUpperCase();
                      
                      if (aLastName && bLastName) {
                        if (aLastName !== bLastName) {
                          return aLastName.localeCompare(bLastName);
                        }
                        return aFirstName.localeCompare(bFirstName);
                      }
                      
                      if (!aLastName && bLastName) return 1;
                      if (aLastName && !bLastName) return -1;
                      
                      return a.username.localeCompare(b.username);
                    })
                    .map(user => ({
                      value: user._id,
                      label: user.personalInfo?.lastName && user.personalInfo?.firstName
                        ? `${user.personalInfo.lastName}, ${user.personalInfo.firstName}${user.personalInfo.middleName ? ' ' + user.personalInfo.middleName : ''} (${user.username})`
                        : `${user.personalInfo?.lastName || user.personalInfo?.firstName || ''} (${user.username})`
                    }))}
                  placeholder="Select User"
                  isClearable
                  isSearchable
                  className="react-select-container"
                  classNamePrefix="react-select"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Mode</label>
                <select
                  value={formData.mode}
                  onChange={(e) => setFormData({...formData, mode: e.target.value})}
                  className="input w-full px-3 py-2 border rounded-md"
                  required
                >
                  <option value="NEW">New</option>
                  <option value="RENEWAL">Renewal</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Year</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({...formData, year: e.target.value})}
                  className="input w-full px-3 py-2 border rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Semester</label>
                <select
                  value={formData.semester}
                  onChange={(e) => setFormData({...formData, semester: parseInt(e.target.value)})}
                  className="input w-full px-3 py-2 border rounded-md"
                >
                  <option value={1}>First Semester</option>
                  <option value={2}>Second Semester</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  className="input w-full px-3 py-2 border rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  className="input w-full px-3 py-2 border rounded-md"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Position</label>
              <Select
                value={positions.find(p => p.positionCode === formData.positionCode) ? {
                  value: formData.positionCode,
                  label: `[${formData.positionCode}] ${positions.find(p => p.positionCode === formData.positionCode)?.title} (Grade ${positions.find(p => p.positionCode === formData.positionCode)?.salaryGrade}) - ${positions.find(p => p.positionCode === formData.positionCode)?.assignedClauses?.length || 0} clauses`
                } : null}
                onChange={(option) => handlePositionChange(option?.value || '')}
                options={positions.map(pos => ({
                  value: pos.positionCode,
                  label: `[${pos.positionCode}] ${pos.title}${pos.description ? ` - ${pos.description}` : ''} (Grade ${pos.salaryGrade}) - ${pos.assignedClauses?.length || 0} clauses`
                }))}
                placeholder="Select Position"
                isClearable
                isSearchable
                className="react-select-container"
                classNamePrefix="react-select"
                required
              />
            </div>

            {/* Premium Preview Section */}
            {previewData && (
              <div className="border-t pt-4">
                <h5 className="font-semibold mb-3 text-lg">Salary Information</h5>

                {/* ── Salary Summary Grid ── */}
                <div className="bg-green-50 p-4 rounded-lg mb-4">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Salary Grade</p>
                      <p className="text-base font-semibold">SG {formData.salaryGrade}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Basic Salary</p>
                      <p className="text-base font-semibold">
                        ₱{previewData.basicSalary.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>

                    {!previewData.isSpecialSalaryGrade && (
                      <>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Monthly Salary (Contract)</p>
                          <p className="text-base font-semibold">
                            ₱{previewData.monthlySalaryAsPerContract.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Daily Salary (Contract)</p>
                          <p className="text-base font-semibold">
                            ₱{previewData.dailySalaryAsPerContract.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Monthly Premium</p>
                          <p className="text-base font-semibold">
                            ₱{previewData.monthlyPremium.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">{previewData.bonusType} Premium</p>
                          <p className="text-base font-semibold text-green-700">
                            ₱{previewData.totalPremium.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {!previewData.isSpecialSalaryGrade && (
                    <>
                      {/* ── Summary Counts ── */}
                      <div className="mt-4 pt-3 border-t border-green-200">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Premium Calculation Summary</p>
                        <div className="grid grid-cols-4 gap-3 text-center">
                          {[
                            { label: 'Total Months',   value: previewData.premiumBreakdown.length },
                            { label: 'Full Months',    value: previewData.premiumBreakdown.filter(m => m.isFullMonth).length },
                            { label: 'Partial Months', value: previewData.premiumBreakdown.filter(m => !m.isFullMonth).length },
                            { label: 'Working Days',   value: previewData.workingDays, highlight: true }
                          ].map(({ label, value, highlight }) => (
                            <div key={label} className="bg-white rounded p-2 shadow-sm">
                              <p className="text-xs text-gray-500">{label}</p>
                              <p className={`text-lg font-bold ${highlight ? 'text-blue-600' : ''}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── Per-Month Breakdown Table ── */}
                      <div className="mt-4 pt-3 border-t border-green-200">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Monthly Premium Breakdown</p>
                        <div className="overflow-x-auto rounded border border-green-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-green-100 text-gray-600 text-xs uppercase tracking-wide">
                                <th className="text-left px-3 py-2">Month</th>
                                <th className="text-center px-3 py-2">Type</th>
                                <th className="text-center px-3 py-2">Working Days<br/><span className="font-normal normal-case">(in month / in range)</span></th>
                                <th className="text-right px-3 py-2">Daily Rate</th>
                                <th className="text-right px-3 py-2">Premium</th>
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.premiumBreakdown.map((m, idx) => (
                                <>
                                  <tr
                                    key={m.monthKey}
                                    className={idx % 2 === 0 ? 'bg-white' : 'bg-green-50'}
                                  >
                                    <td className="px-3 py-2 font-medium">{m.monthName} {m.year}</td>
                                    <td className="px-3 py-2 text-center">
                                      {m.isFullMonth
                                        ? <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Full</span>
                                        : <span className="inline-block px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">Partial</span>
                                      }
                                    </td>
                                    <td className="px-3 py-2 text-center text-gray-700">
                                      {m.totalWorkingDaysInMonth} / {m.actualWorkingDaysInRange}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">
                                      ₱{m.dailyPremiumRate.toLocaleString('en-PH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold">
                                      ₱{m.calculatedPremium.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                  {/* Holidays sub-row */}
                                  {m.holidaysInMonth.length > 0 && (
                                    <tr key={`${m.monthKey}-hols`} className={idx % 2 === 0 ? 'bg-white' : 'bg-green-50'}>
                                      <td colSpan={5} className="px-3 pb-2 pt-0">
                                        <div className="flex flex-wrap gap-1 pl-1">
                                          {m.holidaysInMonth.map(h => {
                                            const labelColor =
                                              h.type === 'REGULAR'
                                                ? 'bg-red-100 text-red-700'
                                                : h.type === 'SPECIAL_NON_WORKING'
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-blue-100 text-blue-700';
                                            const typeLabel =
                                              h.type === 'REGULAR' ? 'Regular'
                                              : h.type === 'SPECIAL_NON_WORKING' ? 'Special Non-Working'
                                              : 'Special Working';
                                            return (
                                              <span
                                                key={h.date}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${labelColor}`}
                                                title={typeLabel}
                                              >
                                                🗓️ {new Date(h.date + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })} — {h.name}
                                                <span className="opacity-60">({typeLabel})</span>
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-green-200 font-bold text-sm">
                                <td className="px-3 py-2" colSpan={2}>TOTAL</td>
                                <td className="px-3 py-2 text-center">{previewData.workingDays} days</td>
                                <td className="px-3 py-2"></td>
                                <td className="px-3 py-2 text-right text-green-800">
                                  ₱{previewData.totalPremium.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* ── Holidays Legend ── */}
                      {previewData.contractHolidays.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-green-200">
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                            Holidays in Contract Period ({previewData.contractHolidays.length})
                          </p>
                          <div className="flex gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span> Regular Holiday (excluded from working days)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span> Special Non-Working (excluded)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span> Special Working (counted)</span>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 pt-3 border-t border-green-200">
                        <p className="text-xs text-gray-500">
                          ℹ️ Partial-month premium = (Monthly Premium ÷ Total Working Days in Month) × Actual Working Days in Range.
                          Full-month premium = Monthly Premium Rate. Calculation excludes weekends, regular holidays, and special non-working holidays.
                        </p>
                      </div>
                    </>
                  )}

                  {previewData.isSpecialSalaryGrade && (
                    <div className="mt-3">
                      <p className="text-sm text-yellow-800 bg-yellow-100 p-2 rounded">
                        ⚠️ Special Salary Grade: No premium will be calculated for this contract.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rest of the form continues... */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Place of Assignment
                {currentUserRole === 'FOCAL_PERSON' && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                value={formData.placeOfAssignment}
                onChange={(e) => setFormData({...formData, placeOfAssignment: e.target.value})}
                className="input w-full px-3 py-2 border rounded-md"
                required
                disabled={currentUserRole === 'FOCAL_PERSON'}
              >
                <option value="">Select Place of Assignment</option>
                {PLACE_OF_ASSIGNMENT_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {currentUserRole === 'FOCAL_PERSON' && (
                <p className="text-xs text-blue-600 mt-1">
                  ℹ️ Locked to your assigned place: {formData.placeOfAssignment}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Charging</label>
              <input
                type="text"
                value={formData.charging}
                onChange={(e) => setFormData({...formData, charging: e.target.value})}
                className="input w-full px-3 py-2 border rounded-md"
                required
                disabled={currentUserRole === 'FOCAL_PERSON'}
                readOnly={currentUserRole === 'FOCAL_PERSON'}
              />
              {currentUserRole === 'FOCAL_PERSON' && (
                <p className="text-xs text-gray-500 mt-1">
                  ℹ️ Charging can only be set by Finance Officers or Administrators
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <h5 className="font-semibold mb-3">Approver Selection</h5>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Approver Branch</label>
                  <select
                    value={formData.approverBranch}
                    onChange={(e) => handleApproverBranchChange(e.target.value)}
                    className="input w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="MANAGEMENT">Management Services</option>
                    <option value="TECHNICAL">Technical Services</option>
                  </select>
                </div>
              </div>
            </div>


            <div className="border-t pt-4">
              <h5 className="font-semibold mb-3">Signatories</h5>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">First Party Name</label>
                    <input
                      type="text"
                      value={formData.signatories.firstParty.name}
                      onChange={(e) => setFormData({
                        ...formData,
                        signatories: {
                          ...formData.signatories,
                          firstParty: {...formData.signatories.firstParty, name: e.target.value}
                        }
                      })}
                      className="input w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      type="text"
                      value={formData.signatories.firstParty.title}
                      onChange={(e) => setFormData({
                        ...formData,
                        signatories: {
                          ...formData.signatories,
                          firstParty: {...formData.signatories.firstParty, title: e.target.value}
                        }
                      })}
                      className="input w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Position</label>
                    <input
                      type="text"
                      value={formData.signatories.firstParty.position}
                      onChange={(e) => setFormData({
                        ...formData,
                        signatories: {
                          ...formData.signatories,
                          firstParty: {...formData.signatories.firstParty, position: e.target.value}
                        }
                      })}
                      className="input w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Approver Name</label>
                    <input
                      type="text"
                      value={formData.signatories.approver.name}
                      className="input w-full px-3 py-2 border rounded-md bg-gray-50"
                      readOnly
                    />
                    <p className="text-xs text-gray-500 mt-1">Auto-filled based on Approver Branch</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Approver Position</label>
                    <input
                      type="text"
                      value={formData.signatories.approver.position}
                      className="input w-full px-3 py-2 border rounded-md bg-gray-50"
                      readOnly
                    />
                    <p className="text-xs text-gray-500 mt-1">Auto-filled based on Approver Branch</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Accountant Name</label>
                    <input
                      type="text"
                      value={formData.signatories.accountant.name}
                      onChange={(e) => setFormData({
                        ...formData,
                        signatories: {
                          ...formData.signatories,
                          accountant: {...formData.signatories.accountant, name: e.target.value}
                        }
                      })}
                      className="input w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Accountant Position</label>
                    <input
                      type="text"
                      value={formData.signatories.accountant.position}
                      onChange={(e) => setFormData({
                        ...formData,
                        signatories: {
                          ...formData.signatories,
                          accountant: {...formData.signatories.accountant, position: e.target.value}
                        }
                      })}
                      className="input w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Finance Chief Name</label>
                    <input
                      type="text"
                      value={formData.signatories.financeChief.name}
                      onChange={(e) => setFormData({
                        ...formData,
                        signatories: {
                          ...formData.signatories,
                          financeChief: {...formData.signatories.financeChief, name: e.target.value}
                        }
                      })}
                      className="input w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Finance Chief Position</label>
                    <input
                      type="text"
                      value={formData.signatories.financeChief.position}
                      onChange={(e) => setFormData({
                        ...formData,
                        signatories: {
                          ...formData.signatories,
                          financeChief: {...formData.signatories.financeChief, position: e.target.value}
                        }
                      })}
                      className="input w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setPreviewData(null);
                }}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? <><Spinner size="sm" color="white" />Creating…</> : 'Create Contract'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add export and filter controls above the table */}
      <div className="card bg-white shadow-lg rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-lg font-semibold">Contracts</h4>
          <div className="flex space-x-3">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Show Archived</span>
            </label>
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
            >
              Export to CSV
            </button>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="grid grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium mb-1">Search Name</label>
            <input
              type="text"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="Search by name..."
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Filter Position</label>
            <select
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">All Positions</option>
              {[...new Set(contracts.map(c => c.position))].map(pos => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Filter Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="TERMINATED">Terminated</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Filter Semester</label>
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">All Semesters</option>
              <option value="1">First Semester</option>
              <option value="2">Second Semester</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Filter Assignment</label>
            <select
              value={filterAssignment}
              onChange={(e) => setFilterAssignment(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">All Assignments</option>
              {PLACE_OF_ASSIGNMENT_OPTIONS.map(place => (
                <option key={place} value={place}>{place}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDuplicatesOnly}
                onChange={(e) => setShowDuplicatesOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium">Show Duplicates Only</span>
            </label>
          </div>

          <div className="col-span-4 flex justify-between items-center">
            <button
              onClick={() => {
                setFilterName('');
                setFilterPosition('');
                setFilterStatus('');
                setFilterSemester('');
                setFilterAssignment('');
                setShowDuplicatesOnly(false);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
            >
              Clear Filters
            </button>
            <span className="text-sm text-gray-600">
              Showing {contracts.filter(c => {
                const matchArchived = showArchived || !c.isArchived;
                const matchName = !filterName || 
                  `${c.userId?.personalInfo?.firstName} ${c.userId?.personalInfo?.middleName} ${c.userId?.personalInfo?.lastName}`
                    .toLowerCase().includes(filterName.toLowerCase());
                const matchPosition = !filterPosition || c.position === filterPosition;
                const matchStatus = !filterStatus || c.status === filterStatus;
                const matchSemester = !filterSemester || c.semester.toString() === filterSemester;
                const matchAssignment = !filterAssignment || c.placeOfAssignment === filterAssignment;
                
                let matchDuplicate = true;
                if (showDuplicatesOnly) {
                  const user = c.userId?.personalInfo;
                  if (user?.lastName && user?.firstName) {
                    const fullName = `${user.lastName}, ${user.firstName}${user.middleName ? ' ' + user.middleName : ''}`;
                    const key = `${fullName}|${c.year}|${c.semester}|${c.status}`;
                    const duplicateData = duplicateNames[key];
                    matchDuplicate = duplicateData && duplicateData.contracts.length > 1;
                  } else {
                    matchDuplicate = false;
                  }
                }
                
                return matchArchived && matchName && matchPosition && matchStatus && matchSemester && matchAssignment && matchDuplicate;
              }).length} of {contracts.length} contracts
            </span>
          </div>
        </div>


        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Contract Number</th>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-left">Position</th>
                <th className="px-4 py-2 text-left">Period</th>
                <th className="px-4 py-2 text-left">Semester</th>
                <th className="px-4 py-2 text-left">Salary Grade</th>
                <th className="px-4 py-2 text-left">Final Premium</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Signed</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingContracts ? (
                <SkeletonTable rows={8} cols={8} />
              ) : contracts
                .filter(c => {
                  const matchArchived = showArchived || !c.isArchived;
                  const matchName = !filterName || 
                    `${c.userId?.personalInfo?.firstName} ${c.userId?.personalInfo?.middleName} ${c.userId?.personalInfo?.lastName}`
                      .toLowerCase().includes(filterName.toLowerCase());
                  const matchPosition = !filterPosition || c.position === filterPosition;
                  const matchStatus = !filterStatus || c.status === filterStatus;
                  const matchSemester = !filterSemester || c.semester.toString() === filterSemester;
                  const matchAssignment = !filterAssignment || c.placeOfAssignment === filterAssignment;

                  let matchDuplicate = true;
                  if (showDuplicatesOnly) {
                    const user = c.userId?.personalInfo;
                    if (user?.lastName && user?.firstName) {
                      const fullName = `${user.lastName}, ${user.firstName}${user.middleName ? ' ' + user.middleName : ''}`;
                      const key = `${fullName}|${c.year}|${c.semester}|${c.status}`;
                      const duplicateData = duplicateNames[key];
                      matchDuplicate = duplicateData && duplicateData.contracts.length > 1;
                    } else {
                      matchDuplicate = false;
                    }
                  }
                  
                  return matchArchived && matchName && matchPosition && matchStatus && matchSemester && matchAssignment && matchDuplicate;  // ✅ ADD && matchDuplicate
                })
                .sort((a, b) => {
                  // Latest contracts first — sort by createdAt descending
                  const aDate = new Date(a.createdAt || 0);
                  const bDate = new Date(b.createdAt || 0);
                  if (bDate - aDate !== 0) return bDate - aDate;

                  // Tiebreaker: alphabetical by last name then first name
                  const aLastName = (a.userId?.personalInfo?.lastName || '').toUpperCase();
                  const bLastName = (b.userId?.personalInfo?.lastName || '').toUpperCase();
                  if (aLastName !== bLastName) return aLastName.localeCompare(bLastName);
                  const aFirstName = (a.userId?.personalInfo?.firstName || '').toUpperCase();
                  const bFirstName = (b.userId?.personalInfo?.firstName || '').toUpperCase();
                  return aFirstName.localeCompare(bFirstName);
                })
                .map(contract => (
                <tr key={contract._id} className={contract.isArchived ? 'bg-gray-100' : ''}>
                  <td className="px-4 py-2 font-medium">
                    {contract.contractNumber}
                    {contract.isArchived && (
                      <span className="ml-2 text-xs text-gray-500">(Archived)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {contract.userId?.personalInfo?.lastName && contract.userId?.personalInfo?.firstName
                      ? `${contract.userId.personalInfo.lastName}, ${contract.userId.personalInfo.firstName}${contract.userId.personalInfo.middleName ? ' ' + contract.userId.personalInfo.middleName : ''}`
                      : contract.userId?.personalInfo?.lastName || contract.userId?.personalInfo?.firstName || contract.userId?.username || '-'}
                    {!isUserProfileComplete(contract.userId) && (
                      <span className="ml-2 text-xs text-red-600" title="Profile incomplete">⚠️</span>
                    )}
                    {(() => {
                      const user = contract.userId?.personalInfo;
                      if (user?.lastName && user?.firstName) {
                        const fullName = `${user.lastName}, ${user.firstName}${user.middleName ? ' ' + user.middleName : ''}`;
                        const key = `${fullName}|${contract.year}|${contract.semester}|${contract.status}`;
                        const duplicateData = duplicateNames[key];
                        const isDuplicate = duplicateData && duplicateData.contracts.length > 1;
                        
                        if (isDuplicate) {
                          const semesterText = contract.semester === 1 ? '1st' : '2nd';
                          return (
                            <span 
                              className="ml-2 text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-semibold" 
                              title={`Warning: ${duplicateData.contracts.length} ${contract.status} contracts found with this name in ${contract.year} ${semesterText} Semester`}
                            >
                              ⚠️ DUPLICATE ({duplicateData.contracts.length})
                            </span>
                          );
                        }
                      }
                      return null;
                    })()}
                  </td>
                  <td className="px-4 py-2">{contract.position?.toUpperCase()}</td>
                  <td className="px-4 py-2 text-sm">
                    {new Date(contract.startDate).toLocaleDateString()} - {new Date(contract.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                      {contract.semester === 1 ? 'First' : 'Second'} Semester
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {contract.isSpecialSalaryGrade ? (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                        SG {contract.salaryGrade} (Special)
                      </span>
                    ) : (
                      <span>SG {contract.salaryGrade}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {contract.isSpecialSalaryGrade ? (
                      <span className="text-gray-500 text-sm">N/A</span>
                    ) : (
                      <span className="font-semibold">
                        ₱{contract.finalPremium?.toLocaleString('en-PH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2  // Add this line
                        }) || '0.00'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      contract.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                      contract.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                      contract.status === 'EXPIRED' ? 'bg-red-100 text-red-800' :
                      contract.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                      contract.status === 'CANCELLED' ? 'bg-orange-100 text-orange-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {contract.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {contract.signedContractFile ? (
                      <button
                        onClick={() => downloadSignedContract(contract._id)}
                        className="text-green-600 hover:text-green-800 text-xs"
                      >
                        📄 Download
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">No file</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col space-y-1">
                      <button
                        onClick={() => {
                          // Only validate for non-admins
                          if (userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId)) {
                            const missingFields = getMissingFields(contract.userId);
                            alert(`⚠️ User profile is incomplete. Please complete the following required fields:\n\n${missingFields.join('\n')}\n\nRequired sections:\n• Account Information (Username, Place of Assignment)\n• Personal Information (All fields)\n• Government IDs (PhilHealth, Pag-IBIG, TIN)`);
                            return;
                          }
                          handleViewContract(contract);
                        }}
                        className="text-green-600 hover:text-green-800 text-xs"
                        title={userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId) ? 'Complete user profile first' : ''}
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => {
                          // Only validate for non-admins
                          if (userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId)) {
                            const missingFields = getMissingFields(contract.userId);
                            alert(`⚠️ User profile is incomplete. Please complete the following required fields:\n\n${missingFields.join('\n')}\n\nRequired sections:\n• Account Information (Username, Place of Assignment)\n• Personal Information (All fields)\n• Government IDs (PhilHealth, Pag-IBIG, TIN)`);
                            return;
                          }
                          generatePDF(contract._id);
                        }}
                        disabled={loading || (userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId))}
                        className="text-blue-600 hover:text-blue-800 text-xs disabled:opacity-50"
                        title={userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId) ? 'Complete user profile first' : ''}
                      >
                        Generate PDF
                      </button>
                      
                      {(userRole === 'ADMINISTRATOR' || userRole === 'FOCAL_PERSON') && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedContract(contract);
                              setNewStatus(contract.status);
                              setShowStatusModal(true);
                            }}
                            className="text-purple-600 hover:text-purple-800 text-xs"
                          >
                            Change Status
                          </button>
                          
                          {(contract.status === 'APPROVED' || contract.status === 'ACTIVE') && (
                            <>
                              <button
                                onClick={() => document.getElementById(`file-input-${contract._id}`).click()}
                                className="text-indigo-600 hover:text-indigo-800 text-xs"
                                disabled={uploadingFile}
                              >
                                {uploadingFile ? 'Uploading...' : 'Upload Signed'}
                              </button>
                              <input
                                id={`file-input-${contract._id}`}
                                type="file"
                                accept="application/pdf"
                                onChange={(e) => handleFileUpload(contract._id, e)}
                                className="hidden"
                                disabled={uploadingFile}
                              />
                            </>
                          )}
                          
                          {(contract.status === 'EXPIRED' || contract.status === 'TERMINATED' || contract.status === 'CANCELLED') && !contract.isArchived && (
                            <button
                              onClick={() => archiveContract(contract._id)}
                              className="text-orange-600 hover:text-orange-800 text-xs"
                            >
                              Archive
                            </button>
                          )}
                          
                          {contract.isArchived && (
                            <button
                              onClick={() => unarchiveContract(contract._id)}
                              className="text-teal-600 hover:text-teal-800 text-xs"
                            >
                              Unarchive
                            </button>
                          )}
                        </>
                      )}
                      
                      {userRole === 'ADMINISTRATOR' && (
                        <button
                          onClick={() => deleteContract(contract._id)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
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

      {/* Status Change Modal */}
      {showStatusModal && selectedContract && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Change Contract Status</h3>
            <p className="text-sm text-gray-600 mb-4">
              Contract: {selectedContract.contractNumber}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">New Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="TERMINATED">Terminated</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => updateContractStatus(selectedContract._id, newStatus)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Contract Details Modal - NEW */}
      {selectedContract && !showStatusModal && (
        <ContractDetailsModal
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}

export default ContractGenerator;