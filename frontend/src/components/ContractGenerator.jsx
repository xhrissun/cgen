import { useState, useEffect } from 'react';
import { SkeletonTable, SectionLoader, EmptyState, Spinner } from './ui.jsx';
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

  /* ── Design tokens ── */
  const D = {
    bg: '#0a1628',
    panel: '#0f1e35',
    card: '#152236',
    cardDeep: '#111d30',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
    green: '#2e8b57',
    greenMuted: 'rgba(46,139,87,0.15)',
    greenBorder: 'rgba(46,139,87,0.35)',
    textPrimary: '#f0f4f8',
    textSecondary: 'rgba(240,244,248,0.70)',
    textMuted: 'rgba(240,244,248,0.40)',
    blue: '#3b82f6',
    blueMuted: 'rgba(59,130,246,0.15)',
    blueBorder: 'rgba(59,130,246,0.3)',
    red: '#ef4444',
    redMuted: 'rgba(239,68,68,0.15)',
    yellow: '#f59e0b',
    yellowMuted: 'rgba(245,158,11,0.12)',
    yellowBorder: 'rgba(245,158,11,0.3)',
    orange: '#fb923c',
    orangeMuted: 'rgba(251,146,60,0.15)',
    purple: '#a78bfa',
    purpleMuted: 'rgba(167,139,250,0.12)',
  };

  const iStyle = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${D.border}`,
    borderRadius: 8,
    color: D.textPrimary, fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };
  const lStyle = {
    display: 'block', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: D.textMuted, marginBottom: 6,
  };
  const focusGreen = (e) => e.target.style.borderColor = D.green;
  const blurBorder = (e) => e.target.style.borderColor = D.border;

  const STATUS_STYLE = {
    ACTIVE:    { bg: D.greenMuted,  border: D.greenBorder,  color: D.green },
    DRAFT:     { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)', color: '#94a3b8' },
    EXPIRED:   { bg: D.redMuted,    border: 'rgba(239,68,68,0.3)',  color: D.red },
    APPROVED:  { bg: D.blueMuted,   border: D.blueBorder,   color: D.blue },
    CANCELLED: { bg: D.orangeMuted, border: 'rgba(251,146,60,0.3)', color: D.orange },
    PENDING:   { bg: D.yellowMuted, border: D.yellowBorder,  color: D.yellow },
    TERMINATED:{ bg: D.redMuted,    border: 'rgba(239,68,68,0.3)',  color: D.red },
  };

  return (
    <div style={{ background: D.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* ── Header row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 20, background: D.green, borderRadius: 2 }} />
          <h3 style={{ fontSize: 20, fontWeight: 700, color: D.textPrimary, margin: 0 }}>Contract Generator</h3>
        </div>
        {(userRole === 'ADMINISTRATOR' || userRole === 'FOCAL_PERSON') && (
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ padding: '10px 22px', background: showForm ? 'rgba(255,255,255,0.07)' : D.green, border: showForm ? `1px solid ${D.borderStrong}` : 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {showForm ? (
              <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</>
            ) : (
              <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Create New Contract</>
            )}
          </button>
        )}
      </div>

      {/* ── Create Form ── */}
      {showForm && !viewOnly && (
        <div style={{ background: D.card, border: `1px solid ${D.borderStrong}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: D.panel, borderBottom: `1px solid ${D.border}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 16, background: D.green, borderRadius: 2 }} />
            <h4 style={{ fontSize: 14, fontWeight: 700, color: D.textPrimary, margin: 0 }}>New Contract</h4>
          </div>
          <div style={{ padding: '24px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {(userRole === 'ADMINISTRATOR' || userRole === 'FOCAL_PERSON') && (
                <div>
                  <label style={lStyle}>Select User</label>
                  <Select
                    value={users.find(u => u._id === formData.userId) ? {
                      value: formData.userId,
                      label: `${users.find(u => u._id === formData.userId)?.personalInfo?.firstName} ${users.find(u => u._id === formData.userId)?.personalInfo?.lastName} (${users.find(u => u._id === formData.userId)?.username})`
                    } : null}
                    onChange={(option) => setFormData({...formData, userId: option?.value || ''})}
                    options={users
                      .sort((a, b) => {
                        const aL = (a.personalInfo?.lastName || '').toUpperCase();
                        const bL = (b.personalInfo?.lastName || '').toUpperCase();
                        const aF = (a.personalInfo?.firstName || '').toUpperCase();
                        const bF = (b.personalInfo?.firstName || '').toUpperCase();
                        if (aL && bL) { if (aL !== bL) return aL.localeCompare(bL); return aF.localeCompare(bF); }
                        if (!aL && bL) return 1; if (aL && !bL) return -1;
                        return a.username.localeCompare(b.username);
                      })
                      .map(user => ({
                        value: user._id,
                        label: user.personalInfo?.lastName && user.personalInfo?.firstName
                          ? `${user.personalInfo.lastName}, ${user.personalInfo.firstName}${user.personalInfo.middleName ? ' ' + user.personalInfo.middleName : ''} (${user.username})`
                          : `${user.personalInfo?.lastName || user.personalInfo?.firstName || ''} (${user.username})`
                      }))}
                    placeholder="Select User"
                    isClearable isSearchable
                    className="react-select-dark"
                    classNamePrefix="react-select-dark"
                    required
                    styles={{
                      control: (base) => ({ ...base, background: 'rgba(255,255,255,0.05)', border: `1px solid ${D.border}`, borderRadius: 8, color: D.textPrimary, boxShadow: 'none', '&:hover': { borderColor: D.green } }),
                      menu: (base) => ({ ...base, background: D.card, border: `1px solid ${D.borderStrong}`, borderRadius: 8 }),
                      option: (base, { isFocused }) => ({ ...base, background: isFocused ? D.greenMuted : 'transparent', color: D.textPrimary, fontSize: 13 }),
                      singleValue: (base) => ({ ...base, color: D.textPrimary }),
                      input: (base) => ({ ...base, color: D.textPrimary }),
                      placeholder: (base) => ({ ...base, color: D.textMuted }),
                      indicatorSeparator: () => ({ display: 'none' }),
                      dropdownIndicator: (base) => ({ ...base, color: D.textMuted }),
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div>
                  <label style={lStyle}>Mode</label>
                  <select value={formData.mode} onChange={(e) => setFormData({...formData, mode: e.target.value})} style={iStyle} required onFocus={focusGreen} onBlur={blurBorder}>
                    <option value="NEW">New</option>
                    <option value="RENEWAL">Renewal</option>
                  </select>
                </div>
                <div>
                  <label style={lStyle}>Year</label>
                  <input type="number" value={formData.year} onChange={(e) => setFormData({...formData, year: e.target.value})} style={iStyle} required onFocus={focusGreen} onBlur={blurBorder} />
                </div>
                <div>
                  <label style={lStyle}>Semester</label>
                  <select value={formData.semester} onChange={(e) => setFormData({...formData, semester: parseInt(e.target.value)})} style={iStyle} onFocus={focusGreen} onBlur={blurBorder}>
                    <option value={1}>First Semester</option>
                    <option value={2}>Second Semester</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={lStyle}>Start Date</label>
                  <input type="date" value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} style={iStyle} required onFocus={focusGreen} onBlur={blurBorder} />
                </div>
                <div>
                  <label style={lStyle}>End Date</label>
                  <input type="date" value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} style={iStyle} required onFocus={focusGreen} onBlur={blurBorder} />
                </div>
              </div>

              <div>
                <label style={lStyle}>Position</label>
                <Select
                  value={positions.find(p => p.positionCode === formData.positionCode) ? {
                    value: formData.positionCode,
                    label: `[${formData.positionCode}] ${positions.find(p => p.positionCode === formData.positionCode)?.title} (Grade ${positions.find(p => p.positionCode === formData.positionCode)?.salaryGrade}) - ${positions.find(p => p.positionCode === formData.positionCode)?.assignedClauses?.length || 0} clauses`
                  } : null}
                  onChange={(option) => handlePositionChange(option?.value || '')}
                  options={positions.map(pos => ({ value: pos.positionCode, label: `[${pos.positionCode}] ${pos.title}${pos.description ? ` - ${pos.description}` : ''} (Grade ${pos.salaryGrade}) - ${pos.assignedClauses?.length || 0} clauses` }))}
                  placeholder="Select Position"
                  isClearable isSearchable required
                  styles={{
                    control: (base) => ({ ...base, background: 'rgba(255,255,255,0.05)', border: `1px solid ${D.border}`, borderRadius: 8, boxShadow: 'none', '&:hover': { borderColor: D.green } }),
                    menu: (base) => ({ ...base, background: D.card, border: `1px solid ${D.borderStrong}`, borderRadius: 8 }),
                    option: (base, { isFocused }) => ({ ...base, background: isFocused ? D.greenMuted : 'transparent', color: D.textPrimary, fontSize: 13 }),
                    singleValue: (base) => ({ ...base, color: D.textPrimary }),
                    input: (base) => ({ ...base, color: D.textPrimary }),
                    placeholder: (base) => ({ ...base, color: D.textMuted }),
                    indicatorSeparator: () => ({ display: 'none' }),
                    dropdownIndicator: (base) => ({ ...base, color: D.textMuted }),
                  }}
                />
              </div>

              {/* ── Premium Preview ── */}
              {previewData && (
                <div style={{ background: D.cardDeep, border: `1px solid ${D.greenBorder}`, borderRadius: 10, padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{ width: 3, height: 14, background: D.green, borderRadius: 2 }} />
                    <h5 style={{ fontSize: 12, fontWeight: 700, color: D.textSecondary, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Salary Information</h5>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px', marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 10, color: D.textMuted, margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Salary Grade</p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: D.textPrimary, margin: 0 }}>SG {formData.salaryGrade}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: D.textMuted, margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Basic Salary</p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', margin: 0 }}>₱{previewData.basicSalary.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    {!previewData.isSpecialSalaryGrade && (
                      <>
                        <div>
                          <p style={{ fontSize: 10, color: D.textMuted, margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Monthly Salary (Contract)</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: D.textPrimary, margin: 0 }}>₱{previewData.monthlySalaryAsPerContract.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, color: D.textMuted, margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Daily Salary (Contract)</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: D.textPrimary, margin: 0 }}>₱{previewData.dailySalaryAsPerContract.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, color: D.textMuted, margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Monthly Premium</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: D.textPrimary, margin: 0 }}>₱{previewData.monthlyPremium.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, color: D.textMuted, margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{previewData.bonusType} Premium</p>
                          <p style={{ fontSize: 15, fontWeight: 800, color: D.green, margin: 0 }}>₱{previewData.totalPremium.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {!previewData.isSpecialSalaryGrade && (
                    <>
                      <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 16, marginBottom: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: D.textMuted, letterSpacing: '0.09em', textTransform: 'uppercase', margin: '0 0 12px' }}>Premium Calculation Summary</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                          {[
                            { label: 'Total Months', value: previewData.premiumBreakdown.length },
                            { label: 'Full Months', value: previewData.premiumBreakdown.filter(m => m.isFullMonth).length },
                            { label: 'Partial Months', value: previewData.premiumBreakdown.filter(m => !m.isFullMonth).length },
                            { label: 'Working Days', value: previewData.workingDays, highlight: true },
                          ].map(({ label, value, highlight }) => (
                            <div key={label} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                              <p style={{ fontSize: 10, color: D.textMuted, margin: '0 0 6px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
                              <p style={{ fontSize: 22, fontWeight: 700, color: highlight ? D.blue : D.textPrimary, margin: 0 }}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 16, marginBottom: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: D.textMuted, letterSpacing: '0.09em', textTransform: 'uppercase', margin: '0 0 12px' }}>Monthly Premium Breakdown</p>
                        <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${D.border}` }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: D.bg }}>
                                {['Month', 'Type', 'Working Days', 'Daily Rate', 'Premium'].map((h, i) => (
                                  <th key={h} style={{ padding: '10px 14px', textAlign: i >= 2 ? 'center' : 'left', color: D.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${D.border}` }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.premiumBreakdown.map((m, idx) => (
                                <>
                                  <tr key={m.monthKey} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${D.border}` }}>
                                    <td style={{ padding: '10px 14px', fontWeight: 600, color: D.textPrimary }}>{m.monthName} {m.year}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                      {m.isFullMonth
                                        ? <span style={{ background: D.greenMuted, border: `1px solid ${D.greenBorder}`, color: D.green, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Full</span>
                                        : <span style={{ background: D.yellowMuted, border: `1px solid ${D.yellowBorder}`, color: D.yellow, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Partial</span>
                                      }
                                    </td>
                                    <td style={{ padding: '10px 14px', textAlign: 'center', color: D.textSecondary }}>{m.totalWorkingDaysInMonth} / {m.actualWorkingDaysInRange}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', color: D.textSecondary, fontFamily: 'monospace' }}>₱{m.dailyPremiumRate.toLocaleString('en-PH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: D.textPrimary, fontFamily: 'monospace' }}>₱{m.calculatedPremium.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  </tr>
                                  {m.holidaysInMonth.length > 0 && (
                                    <tr key={`${m.monthKey}-hols`} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${D.border}` }}>
                                      <td colSpan={5} style={{ padding: '6px 14px 10px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                          {m.holidaysInMonth.map(h => {
                                            const chipStyle = h.type === 'REGULAR'
                                              ? { bg: D.redMuted, border: 'rgba(239,68,68,0.25)', color: D.red }
                                              : h.type === 'SPECIAL_NON_WORKING'
                                              ? { bg: D.orangeMuted, border: 'rgba(251,146,60,0.3)', color: D.orange }
                                              : { bg: D.blueMuted, border: D.blueBorder, color: D.blue };
                                            const typeLabel = h.type === 'REGULAR' ? 'Regular' : h.type === 'SPECIAL_NON_WORKING' ? 'Special Non-Working' : 'Special Working';
                                            return (
                                              <span key={h.date} style={{ background: chipStyle.bg, border: `1px solid ${chipStyle.border}`, color: chipStyle.color, borderRadius: 5, padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                                🗓️ {new Date(h.date + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })} — {h.name}
                                                <span style={{ opacity: 0.6 }}>({typeLabel})</span>
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
                              <tr style={{ background: D.bg }}>
                                <td colSpan={2} style={{ padding: '11px 14px', fontWeight: 700, color: D.textPrimary, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total</td>
                                <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: D.textPrimary }}>{previewData.workingDays} days</td>
                                <td />
                                <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: D.green, fontSize: 14, fontFamily: 'monospace' }}>₱{previewData.totalPremium.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {previewData.contractHolidays.length > 0 && (
                        <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                          {[
                            { color: D.red, label: 'Regular Holiday (excluded)' },
                            { color: D.orange, label: 'Special Non-Working (excluded)' },
                            { color: D.blue, label: 'Special Working (counted)' },
                          ].map(({ color, label }) => (
                            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: D.textMuted }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                      <p style={{ fontSize: 11, color: D.textMuted, marginTop: 12, lineHeight: 1.6 }}>ℹ️ Partial-month premium = (Monthly Premium ÷ Total Working Days in Month) × Actual Working Days in Range. Excludes weekends, regular holidays, and special non-working holidays.</p>
                    </>
                  )}

                  {previewData.isSpecialSalaryGrade && (
                    <div style={{ background: D.yellowMuted, border: `1px solid ${D.yellowBorder}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16 }}>⚠️</span>
                      <p style={{ fontSize: 13, color: D.yellow, margin: 0 }}>Special Salary Grade: No premium will be calculated for this contract.</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={lStyle}>
                  Place of Assignment{currentUserRole === 'FOCAL_PERSON' && <span style={{ color: D.red }}> *</span>}
                </label>
                <select value={formData.placeOfAssignment} onChange={(e) => setFormData({...formData, placeOfAssignment: e.target.value})} style={{ ...iStyle, ...(currentUserRole === 'FOCAL_PERSON' ? { opacity: 0.6 } : {}) }} required disabled={currentUserRole === 'FOCAL_PERSON'} onFocus={focusGreen} onBlur={blurBorder}>
                  <option value="">Select Place of Assignment</option>
                  {PLACE_OF_ASSIGNMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                {currentUserRole === 'FOCAL_PERSON' && <p style={{ fontSize: 11, color: D.blue, marginTop: 6 }}>ℹ️ Locked to your assigned place: {formData.placeOfAssignment}</p>}
              </div>

              <div>
                <label style={lStyle}>Charging</label>
                <input type="text" value={formData.charging} onChange={(e) => setFormData({...formData, charging: e.target.value})} style={{ ...iStyle, ...(currentUserRole === 'FOCAL_PERSON' ? { opacity: 0.6 } : {}) }} required disabled={currentUserRole === 'FOCAL_PERSON'} readOnly={currentUserRole === 'FOCAL_PERSON'} onFocus={focusGreen} onBlur={blurBorder} />
                {currentUserRole === 'FOCAL_PERSON' && <p style={{ fontSize: 11, color: D.textMuted, marginTop: 6 }}>ℹ️ Charging can only be set by Finance Officers or Administrators</p>}
              </div>

              <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: D.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Approver Selection</p>
                <div>
                  <label style={lStyle}>Approver Branch</label>
                  <select value={formData.approverBranch} onChange={(e) => handleApproverBranchChange(e.target.value)} style={iStyle} required onFocus={focusGreen} onBlur={blurBorder}>
                    <option value="MANAGEMENT">Management Services</option>
                    <option value="TECHNICAL">Technical Services</option>
                  </select>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: D.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Signatories</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <div><label style={lStyle}>First Party Name</label><input type="text" value={formData.signatories.firstParty.name} onChange={(e) => setFormData({...formData, signatories: {...formData.signatories, firstParty: {...formData.signatories.firstParty, name: e.target.value}}})} style={iStyle} onFocus={focusGreen} onBlur={blurBorder} /></div>
                    <div><label style={lStyle}>Title</label><input type="text" value={formData.signatories.firstParty.title} onChange={(e) => setFormData({...formData, signatories: {...formData.signatories, firstParty: {...formData.signatories.firstParty, title: e.target.value}}})} style={iStyle} onFocus={focusGreen} onBlur={blurBorder} /></div>
                    <div><label style={lStyle}>Position</label><input type="text" value={formData.signatories.firstParty.position} onChange={(e) => setFormData({...formData, signatories: {...formData.signatories, firstParty: {...formData.signatories.firstParty, position: e.target.value}}})} style={iStyle} onFocus={focusGreen} onBlur={blurBorder} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div><label style={lStyle}>Approver Name</label><input type="text" value={formData.signatories.approver.name} readOnly style={{ ...iStyle, opacity: 0.55 }} /><p style={{ fontSize: 11, color: D.textMuted, marginTop: 4 }}>Auto-filled from Approver Branch</p></div>
                    <div><label style={lStyle}>Approver Position</label><input type="text" value={formData.signatories.approver.position} readOnly style={{ ...iStyle, opacity: 0.55 }} /><p style={{ fontSize: 11, color: D.textMuted, marginTop: 4 }}>Auto-filled from Approver Branch</p></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div><label style={lStyle}>Accountant Name</label><input type="text" value={formData.signatories.accountant.name} onChange={(e) => setFormData({...formData, signatories: {...formData.signatories, accountant: {...formData.signatories.accountant, name: e.target.value}}})} style={iStyle} onFocus={focusGreen} onBlur={blurBorder} /></div>
                    <div><label style={lStyle}>Accountant Position</label><input type="text" value={formData.signatories.accountant.position} onChange={(e) => setFormData({...formData, signatories: {...formData.signatories, accountant: {...formData.signatories.accountant, position: e.target.value}}})} style={iStyle} onFocus={focusGreen} onBlur={blurBorder} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div><label style={lStyle}>Finance Chief Name</label><input type="text" value={formData.signatories.financeChief.name} onChange={(e) => setFormData({...formData, signatories: {...formData.signatories, financeChief: {...formData.signatories.financeChief, name: e.target.value}}})} style={iStyle} onFocus={focusGreen} onBlur={blurBorder} /></div>
                    <div><label style={lStyle}>Finance Chief Position</label><input type="text" value={formData.signatories.financeChief.position} onChange={(e) => setFormData({...formData, signatories: {...formData.signatories, financeChief: {...formData.signatories.financeChief, position: e.target.value}}})} style={iStyle} onFocus={focusGreen} onBlur={blurBorder} /></div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}>
                <button type="button" onClick={() => { setShowForm(false); setPreviewData(null); }} style={{ padding: '10px 20px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 8, color: D.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} style={{ padding: '10px 24px', background: loading ? 'rgba(46,139,87,0.4)' : D.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {loading ? <><Spinner size="sm" color="white" />Creating…</> : 'Create Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Contracts Table ── */}
      <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{ background: D.panel, borderBottom: `1px solid ${D.border}`, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 16, background: D.green, borderRadius: 2 }} />
            <h4 style={{ fontSize: 14, fontWeight: 700, color: D.textPrimary, margin: 0 }}>Contracts</h4>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: D.textSecondary, cursor: 'pointer' }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ accentColor: D.green }} />
              Show Archived
            </label>
            <button onClick={exportToCSV} style={{ padding: '8px 16px', background: D.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ background: D.cardDeep, borderBottom: `1px solid ${D.border}`, padding: '16px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lStyle}>Search Name</label>
              <input type="text" value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Search by name..." style={{ ...iStyle, padding: '8px 12px', fontSize: 12 }} onFocus={focusGreen} onBlur={blurBorder} />
            </div>
            <div>
              <label style={lStyle}>Position</label>
              <select value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)} style={{ ...iStyle, padding: '8px 12px', fontSize: 12 }} onFocus={focusGreen} onBlur={blurBorder}>
                <option value="">All Positions</option>
                {[...new Set(contracts.map(c => c.position))].map(pos => <option key={pos} value={pos}>{pos}</option>)}
              </select>
            </div>
            <div>
              <label style={lStyle}>Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...iStyle, padding: '8px 12px', fontSize: 12 }} onFocus={focusGreen} onBlur={blurBorder}>
                <option value="">All Statuses</option>
                {['DRAFT','PENDING','APPROVED','ACTIVE','EXPIRED','TERMINATED','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lStyle}>Semester</label>
              <select value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)} style={{ ...iStyle, padding: '8px 12px', fontSize: 12 }} onFocus={focusGreen} onBlur={blurBorder}>
                <option value="">All Semesters</option>
                <option value="1">First Semester</option>
                <option value="2">Second Semester</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Assignment</label>
              <select value={filterAssignment} onChange={(e) => setFilterAssignment(e.target.value)} style={{ ...iStyle, padding: '8px 12px', fontSize: 12 }} onFocus={focusGreen} onBlur={blurBorder}>
                <option value="">All Assignments</option>
                {PLACE_OF_ASSIGNMENT_OPTIONS.map(place => <option key={place} value={place}>{place}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: D.textSecondary, cursor: 'pointer' }}>
                <input type="checkbox" checked={showDuplicatesOnly} onChange={(e) => setShowDuplicatesOnly(e.target.checked)} style={{ accentColor: D.yellow }} />
                Show Duplicates Only
              </label>
              <button onClick={() => { setFilterName(''); setFilterPosition(''); setFilterStatus(''); setFilterSemester(''); setFilterAssignment(''); setShowDuplicatesOnly(false); }} style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${D.border}`, borderRadius: 7, color: D.textMuted, fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
                Clear Filters
              </button>
            </div>
            <span style={{ fontSize: 11, color: D.textMuted }}>
              Showing {contracts.filter(c => {
                const matchArchived = showArchived || !c.isArchived;
                const matchName = !filterName || `${c.userId?.personalInfo?.firstName} ${c.userId?.personalInfo?.middleName} ${c.userId?.personalInfo?.lastName}`.toLowerCase().includes(filterName.toLowerCase());
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
                  } else { matchDuplicate = false; }
                }
                return matchArchived && matchName && matchPosition && matchStatus && matchSemester && matchAssignment && matchDuplicate;
              }).length} of {contracts.length} contracts
            </span>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: D.bg }}>
                {['Contract #', 'User', 'Position', 'Period', 'Semester', 'Salary Grade', 'Final Premium', 'Status', 'Signed', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: D.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${D.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingContracts ? (
                <SkeletonTable rows={8} cols={10} />
              ) : contracts
                .filter(c => {
                  const matchArchived = showArchived || !c.isArchived;
                  const matchName = !filterName || `${c.userId?.personalInfo?.firstName} ${c.userId?.personalInfo?.middleName} ${c.userId?.personalInfo?.lastName}`.toLowerCase().includes(filterName.toLowerCase());
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
                    } else { matchDuplicate = false; }
                  }
                  return matchArchived && matchName && matchPosition && matchStatus && matchSemester && matchAssignment && matchDuplicate;
                })
                .sort((a, b) => {
                  const aDate = new Date(a.createdAt || 0);
                  const bDate = new Date(b.createdAt || 0);
                  if (bDate - aDate !== 0) return bDate - aDate;
                  const aL = (a.userId?.personalInfo?.lastName || '').toUpperCase();
                  const bL = (b.userId?.personalInfo?.lastName || '').toUpperCase();
                  if (aL !== bL) return aL.localeCompare(bL);
                  return (a.userId?.personalInfo?.firstName || '').toUpperCase().localeCompare((b.userId?.personalInfo?.firstName || '').toUpperCase());
                })
                .map(contract => {
                  const ss = STATUS_STYLE[contract.status] || STATUS_STYLE.DRAFT;
                  const user = contract.userId?.personalInfo;
                  let isDuplicate = false;
                  if (user?.lastName && user?.firstName) {
                    const fullName = `${user.lastName}, ${user.firstName}${user.middleName ? ' ' + user.middleName : ''}`;
                    const key = `${fullName}|${contract.year}|${contract.semester}|${contract.status}`;
                    const duplicateData = duplicateNames[key];
                    isDuplicate = duplicateData && duplicateData.contracts.length > 1;
                  }
                  return (
                  <tr key={contract._id} style={{ borderBottom: `1px solid ${D.border}`, background: contract.isArchived ? 'rgba(251,146,60,0.04)' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = contract.isArchived ? 'rgba(251,146,60,0.04)' : 'transparent'}
                  >
                    <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 11, color: D.green, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {contract.contractNumber}
                      {contract.isArchived && <span style={{ marginLeft: 6, fontSize: 9, color: D.orange, background: D.orangeMuted, border: '1px solid rgba(251,146,60,0.3)', borderRadius: 4, padding: '1px 5px' }}>ARCHIVED</span>}
                    </td>
                    <td style={{ padding: '11px 14px', color: D.textPrimary, fontWeight: 500, maxWidth: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12 }}>
                          {user?.lastName && user?.firstName
                            ? `${user.lastName}, ${user.firstName}${user.middleName ? ' ' + user.middleName : ''}`
                            : user?.lastName || user?.firstName || contract.userId?.username || '-'
                          }
                        </span>
                        {!isUserProfileComplete(contract.userId) && (
                          <span title="Profile incomplete" style={{ fontSize: 11, color: D.yellow }}>⚠️</span>
                        )}
                        {isDuplicate && (() => {
                          const fullName = `${user.lastName}, ${user.firstName}${user.middleName ? ' ' + user.middleName : ''}`;
                          const key = `${fullName}|${contract.year}|${contract.semester}|${contract.status}`;
                          const duplicateData = duplicateNames[key];
                          return (
                            <span style={{ background: D.yellowMuted, border: `1px solid ${D.yellowBorder}`, color: D.yellow, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}
                              title={`${duplicateData.contracts.length} duplicate contracts`}>
                              ⚠ DUPLICATE ({duplicateData.contracts.length})
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', color: D.textSecondary, fontSize: 11, maxWidth: 140 }}>
                      <span style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>{contract.position?.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: D.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {new Date(contract.startDate).toLocaleDateString()} — {new Date(contract.endDate).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                        {contract.semester === 1 ? '1st' : '2nd'} Sem
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {contract.isSpecialSalaryGrade
                        ? <span style={{ background: D.yellowMuted, border: `1px solid ${D.yellowBorder}`, color: D.yellow, borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>SG {contract.salaryGrade} ★</span>
                        : <span style={{ color: D.textSecondary, fontSize: 12 }}>SG {contract.salaryGrade}</span>
                      }
                    </td>
                    <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700 }}>
                      {contract.isSpecialSalaryGrade
                        ? <span style={{ color: D.textMuted, fontSize: 11 }}>N/A</span>
                        : <span style={{ color: '#4ade80', fontSize: 12 }}>₱{contract.finalPremium?.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</span>
                      }
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color, borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: ss.color, display: 'inline-block' }} />
                        {contract.status}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {contract.signedContractFile
                        ? <button onClick={() => downloadSignedContract(contract._id)} style={{ background: 'none', border: 'none', color: D.green, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Download
                          </button>
                        : <span style={{ color: D.textMuted, fontSize: 11 }}>No file</span>
                      }
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <button
                          onClick={() => {
                            if (userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId)) {
                              alert(`⚠️ User profile is incomplete. Please complete the following required fields:\n\n${getMissingFields(contract.userId).join('\n')}`);
                              return;
                            }
                            handleViewContract(contract);
                          }}
                          style={{ background: 'none', border: 'none', color: D.green, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                        >View Details</button>
                        <button
                          onClick={() => {
                            if (userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId)) {
                              alert(`⚠️ User profile is incomplete.`); return;
                            }
                            generatePDF(contract._id);
                          }}
                          disabled={loading || (userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId))}
                          style={{ background: 'none', border: 'none', color: D.blue, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left', opacity: (userRole !== 'ADMINISTRATOR' && !isUserProfileComplete(contract.userId)) ? 0.4 : 1 }}
                        >Generate PDF</button>
                        {(userRole === 'ADMINISTRATOR' || userRole === 'FOCAL_PERSON') && (
                          <>
                            <button onClick={() => { setSelectedContract(contract); setNewStatus(contract.status); setShowStatusModal(true); }} style={{ background: 'none', border: 'none', color: D.purple, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>Change Status</button>
                            {(contract.status === 'APPROVED' || contract.status === 'ACTIVE') && (
                              <>
                                <button onClick={() => document.getElementById(`file-input-${contract._id}`).click()} disabled={uploadingFile} style={{ background: 'none', border: 'none', color: '#6ee7b7', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                                  {uploadingFile ? 'Uploading…' : 'Upload Signed'}
                                </button>
                                <input id={`file-input-${contract._id}`} type="file" accept="application/pdf" onChange={(e) => handleFileUpload(contract._id, e)} style={{ display: 'none' }} disabled={uploadingFile} />
                              </>
                            )}
                            {(contract.status === 'EXPIRED' || contract.status === 'TERMINATED' || contract.status === 'CANCELLED') && !contract.isArchived && (
                              <button onClick={() => archiveContract(contract._id)} style={{ background: 'none', border: 'none', color: D.orange, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>Archive</button>
                            )}
                            {contract.isArchived && (
                              <button onClick={() => unarchiveContract(contract._id)} style={{ background: 'none', border: 'none', color: '#2dd4bf', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>Unarchive</button>
                            )}
                          </>
                        )}
                        {userRole === 'CONTRACTUAL' && (
                          <button
                            onClick={() => {
                              if (!isUserProfileComplete(contract.userId)) {
                                alert(`⚠️ Your profile is incomplete. Please complete the following:\n\n${getMissingFields(contract.userId).join('\n')}`); return;
                              }
                              generatePDF(contract._id);
                            }}
                            disabled={loading || !isUserProfileComplete(contract.userId)}
                            style={{ background: 'none', border: 'none', color: D.blue, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left', opacity: !isUserProfileComplete(contract.userId) ? 0.4 : 1 }}
                          >Download PDF</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Status Change Modal ── */}
      {showStatusModal && selectedContract && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: 16 }}>
          <div style={{ background: D.card, border: `1px solid ${D.borderStrong}`, borderRadius: 14, padding: '28px 32px', maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: D.textPrimary, margin: '0 0 8px' }}>Change Contract Status</h3>
            <p style={{ fontSize: 12, color: D.textSecondary, margin: '0 0 20px' }}>Contract: <span style={{ fontFamily: 'monospace', color: D.green }}>{selectedContract.contractNumber}</span></p>
            <div style={{ marginBottom: 24 }}>
              <label style={lStyle}>New Status</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={iStyle} onFocus={focusGreen} onBlur={blurBorder}>
                {['DRAFT','PENDING','APPROVED','ACTIVE','EXPIRED','TERMINATED','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowStatusModal(false)} style={{ padding: '9px 20px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 8, color: D.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => updateContractStatus(selectedContract._id, newStatus)} style={{ padding: '9px 22px', background: D.blue, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Update Status</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contract Details Modal ── */}
      {selectedContract && !showStatusModal && (
        <ContractDetailsModal contract={selectedContract} onClose={() => setSelectedContract(null)} />
      )}

      <style>{`
        select option { background: #152236; color: #f0f4f8; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        input::placeholder { color: rgba(240,244,248,0.2); }
      `}</style>
    </div>
  );
}

export default ContractGenerator;