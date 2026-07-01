import { useState, useEffect } from 'react';
import { SkeletonTable, SectionLoader, dispatchPageLoading } from './ui.jsx';
import api from '../api.js';
import UserDetailsModal from './UserDetailsModal';

// Some staff have typed a placeholder ("-", "N/A", "NONE", etc.) into the
// Middle Name field to get past an old required-field check, since a person
// can legitimately have no middle name. Treat any placeholder-only value the
// same as an empty middle name so it never renders as a stray "-".
const NO_MIDDLE_NAME_PATTERN = /^[\s\-._]*$|^(n\/?a\.?|none|no\s*middle\s*name)$/i;
const normalizeMiddleName = (value) => {
  const trimmed = String(value || '').trim();
  return NO_MIDDLE_NAME_PATTERN.test(trimmed) ? '' : trimmed;
};

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
  'OFFICE OF THE REGIONAL EXECUTIVE DIRECTOR',
  'PENRO RIZAL'
];

const formatPhilHealth = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  
  let formatted = '';
  if (numbers.length <= 2) {
    formatted = numbers;
  } else if (numbers.length <= 11) {
    formatted = numbers.slice(0, 2) + '-' + numbers.slice(2);
  } else {
    formatted = numbers.slice(0, 2) + '-' + numbers.slice(2, 11) + '-' + numbers.slice(11, 12);
  }
  return formatted;
};

const formatPagIbig = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  
  let formatted = '';
  if (numbers.length <= 4) {
    formatted = numbers;
  } else if (numbers.length <= 8) {
    formatted = numbers.slice(0, 4) + '-' + numbers.slice(4);
  } else {
    formatted = numbers.slice(0, 4) + '-' + numbers.slice(4, 8) + '-' + numbers.slice(8, 12);
  }
  return formatted;
};

const formatTIN = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  
  let formatted = '';
  if (numbers.length <= 3) {
    formatted = numbers;
  } else if (numbers.length <= 6) {
    formatted = numbers.slice(0, 3) + '-' + numbers.slice(3);
  } else if (numbers.length <= 9) {
    formatted = numbers.slice(0, 3) + '-' + numbers.slice(3, 6) + '-' + numbers.slice(6);
  } else {
    formatted = numbers.slice(0, 3) + '-' + numbers.slice(3, 6) + '-' + numbers.slice(6, 9) + '-' + numbers.slice(9, 12);
  }
  return formatted;
};

const formatPhoneNumber = (value) => {
  // Remove all non-digits
  const numbers = value.replace(/\D/g, '');
  
  // If empty, return empty
  if (numbers.length === 0) return '';
  
  // Always start with 63 (Philippines country code)
  let digitsToFormat = numbers;
  
  // If user types 0 first (local format), convert to international
  if (numbers.startsWith('0')) {
    digitsToFormat = '63' + numbers.slice(1);
  }
  // If user already typed 63, use as is
  else if (numbers.startsWith('63')) {
    digitsToFormat = numbers;
  }
  // Otherwise, prepend 63
  else {
    digitsToFormat = '63' + numbers;
  }
  
  // Format: +63-XXX-XXX-XXXX (total 12 digits: 63 + 10 digits)
  let formatted = '+';
  if (digitsToFormat.length <= 2) {
    formatted += digitsToFormat;
  } else if (digitsToFormat.length <= 5) {
    formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2);
  } else if (digitsToFormat.length <= 8) {
    formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2, 5) + '-' + digitsToFormat.slice(5);
  } else {
    formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2, 5) + '-' + digitsToFormat.slice(5, 8) + '-' + digitsToFormat.slice(8, 12);
  }
  
  return formatted;
};


const validateFormats = (personalInfo) => {
  const errors = [];
  
  // PhilHealth: XX-XXXXXXXXX-X (12 digits total)
  if (personalInfo.philhealth) {
    const numbers = personalInfo.philhealth.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) {
      errors.push('PhilHealth must be 12 digits (XX-XXXXXXXXX-X)');
    }
  }
  
  // Pag-IBIG: XXXX-XXXX-XXXX (12 digits total)
  if (personalInfo.pagibig) {
    const numbers = personalInfo.pagibig.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) {
      errors.push('Pag-IBIG must be 12 digits (XXXX-XXXX-XXXX)');
    }
  }
  
  // TIN: XXX-XXX-XXX-XXX (12 digits total)
  if (personalInfo.tin) {
    const numbers = personalInfo.tin.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) {
      errors.push('TIN must be 12 digits (XXX-XXX-XXX-XXX)');
    }
  }
  
  // Phone: +63-XXX-XXX-XXXX (12 digits total including 63)
  if (personalInfo.phoneNumber) {
    const numbers = personalInfo.phoneNumber.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) {
      errors.push('Phone Number must be 10 digits after +63 (+63-XXX-XXX-XXXX)');
    }
  }
  
  return errors;
};

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    role: 'CONTRACTUAL',
    placeOfAssignment: '',
    status: 'ACTIVE',
    personalInfo: {
      lastName: '',
      firstName: '',
      middleName: '',
      middleInitial: '',
      suffix: '',
      sex: 'MALE',
      placeOfBirth: '',
      birthday: '',
      phoneNumber: '',
      email: '',
      address: '',
      philhealth: '',
      pagibig: '',
      tin: '',
      highestEducation: '',
      bachelorsDegree: '',
      eligibility: ''
    }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlaceOfAssignment, setFilterPlaceOfAssignment] = useState('');

  useEffect(() => {
    fetchUsers();
    // Get current user's role and place of assignment
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUserRole(payload.role);
      
      // If focal person, lock their place of assignment
      if (payload.role === 'FOCAL_PERSON') {
        // Fetch current user details
        const fetchCurrentUser = async () => {
          try {
            const response = await api.get(`/api/users/${payload.userId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
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
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    dispatchPageLoading(true, 'Loading users…');
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
      dispatchPageLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate formats
    const errors = validateFormats(formData.personalInfo);
    if (errors.length > 0) {
      alert('Please fix the following errors:\n\n' + errors.join('\n'));
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      
      if (editingUser) {
        await api.put(`/api/users/${editingUser._id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('User updated successfully!');
      } else {
        await api.post('/api/users', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('User created successfully!');
      }
      
      setShowForm(false);
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('User deleted successfully!');
      fetchUsers();
    } catch (error) {
      alert('Error deleting user: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      role: user.role,
      placeOfAssignment: user.placeOfAssignment || '',
      status: user.status || 'ACTIVE',  // ✅ ADD this line
      personalInfo: user.personalInfo || formData.personalInfo
    });
    setShowForm(true);
  };



  const handleViewDetails = async (user) => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/api/users/${user._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedUser(response.data);
    } catch (error) {
      alert('Error loading user details: ' + (error.response?.data?.message || error.message));
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      role: 'CONTRACTUAL',
      placeOfAssignment: '',
      status: 'ACTIVE',
      personalInfo: {
        lastName: '',
        firstName: '',
        middleName: '',
        middleInitial: '',
        suffix: '',
        sex: 'MALE',
        placeOfBirth: '',
        birthday: '',
        phoneNumber: '',
        email: '',
        address: '',
        philhealth: '',
        pagibig: '',
        tin: '',
        highestEducation: '',
        bachelorsDegree: '',
        eligibility: ''
      }
    });
  };

  const updatePersonalInfo = (field, value) => {
    setFormData({
      ...formData,
      personalInfo: {
        ...formData.personalInfo,
        [field]: value
      }
    });
  };

  // Replace the existing filteredUsers constant (around line 330)
  const filteredUsers = users
    .filter(user => {
      // Search filter - searches across multiple fields
      const matchesSearch = searchTerm === '' || 
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.personalInfo?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.personalInfo?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.personalInfo?.middleName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.placeOfAssignment?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Role filter
      const matchesRole = filterRole === '' || user.role === filterRole;
      
      // Status filter
      const matchesStatus = filterStatus === '' || user.status === filterStatus;
      
      // Place of Assignment filter
      const matchesPlace = filterPlaceOfAssignment === '' || 
        user.placeOfAssignment === filterPlaceOfAssignment;
      
      return matchesSearch && matchesRole && matchesStatus && matchesPlace;
    })
  .sort((a, b) => {
    // Sort alphabetically by last name, then first name
    const aLastName = (a.personalInfo?.lastName || '').toUpperCase();
    const bLastName = (b.personalInfo?.lastName || '').toUpperCase();
    const aFirstName = (a.personalInfo?.firstName || '').toUpperCase();
    const bFirstName = (b.personalInfo?.firstName || '').toUpperCase();
    
    // If both have last names, compare them
    if (aLastName && bLastName) {
      if (aLastName !== bLastName) {
        return aLastName.localeCompare(bLastName);
      }
      // If last names are the same, compare first names
      return aFirstName.localeCompare(bFirstName);
    }
    
    // If one doesn't have a last name, put it at the end
    if (!aLastName && bLastName) return 1;
    if (aLastName && !bLastName) return -1;
    
    // If neither has a last name, sort by username
    return a.username.localeCompare(b.username);
  });


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">User Management</h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingUser(null);
            resetForm();
          }}
          className="btn btn-primary"
        >
          {showForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <h4 className="text-lg font-semibold mb-4">Search & Filters</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search Bar */}
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium mb-1">Search</label>
            <input
              type="text"
              placeholder="Search by name, username, or place..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full"
            />
          </div>

          {/* Role Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="input w-full"
            >
              <option value="">All Roles</option>
              <option value="CONTRACTUAL">Contractual</option>
              <option value="FOCAL_PERSON">Focal Person</option>
              <option value="FINANCE_OFFICER">Finance Officer</option>
              <option value="ADMINISTRATOR">Administrator</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input w-full"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Place of Assignment Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Place of Assignment</label>
            <select
              value={filterPlaceOfAssignment}
              onChange={(e) => setFilterPlaceOfAssignment(e.target.value)}
              className="input w-full"
            >
              <option value="">All Places</option>
              {PLACE_OF_ASSIGNMENT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterRole('');
              setFilterStatus('');
              setFilterPlaceOfAssignment('');
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Clear All Filters
          </button>
        </div>

        {/* Results Count */}
        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h4 className="text-lg font-semibold mb-4">
            {editingUser ? 'Edit User' : 'New User'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Username
                  {editingUser && currentUserRole !== 'ADMINISTRATOR' && (
                    <span className="text-xs text-gray-400 ml-2">(Admin only)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="input"
                  required
                  disabled={editingUser && currentUserRole !== 'ADMINISTRATOR'}
                />
              </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className="input"
                    required
                    disabled={currentUserRole === 'FOCAL_PERSON'}
                  >
                    {currentUserRole === 'FOCAL_PERSON' ? (
                      <option value="CONTRACTUAL">Contractual</option>
                    ) : (
                      <>
                        <option value="CONTRACTUAL">Contractual</option>
                        <option value="FOCAL_PERSON">Focal Person</option>
                        <option value="FINANCE_OFFICER">Finance Officer</option>
                        <option value="ADMINISTRATOR">Administrator</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Place of Assignment
                    {formData.role === 'FOCAL_PERSON' && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <select
                    value={formData.placeOfAssignment}
                    onChange={(e) => setFormData({...formData, placeOfAssignment: e.target.value})}
                    className="input"
                    required={formData.role === 'FOCAL_PERSON'}
                    disabled={currentUserRole === 'FOCAL_PERSON'}
                  >
                  <option value="">Select Place of Assignment</option>
                  {PLACE_OF_ASSIGNMENT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {formData.role === 'FOCAL_PERSON' && (
                  <p className="text-xs text-blue-600 mt-1">
                    ℹ️ Focal persons can manage contractual users assigned to this place of assignment
                  </p>
                )}
              </div>
            </div>


            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="input"
                required
              >
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>


            <div className="border-t pt-4">
              <h5 className="font-semibold mb-4">Personal Information</h5>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.personalInfo.lastName}
                    onChange={(e) => updatePersonalInfo('lastName', e.target.value.toUpperCase())}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.personalInfo.firstName}
                    onChange={(e) => updatePersonalInfo('firstName', e.target.value.toUpperCase())}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Middle Name</label>
                  <input
                    type="text"
                    value={formData.personalInfo.middleName}
                    onChange={(e) => updatePersonalInfo('middleName', e.target.value.toUpperCase())}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sex</label>
                  <select
                    value={formData.personalInfo.sex}
                    onChange={(e) => updatePersonalInfo('sex', e.target.value.toUpperCase())}
                    className="input"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Birthday</label>
                  <input
                    type="date"
                    value={formData.personalInfo.birthday}
                    onChange={(e) => updatePersonalInfo('birthday', e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Place of Birth</label>
                  <input
                    type="text"
                    value={formData.personalInfo.placeOfBirth}
                    onChange={(e) => updatePersonalInfo('placeOfBirth', e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={formData.personalInfo.phoneNumber}
                    onChange={(e) => updatePersonalInfo('phoneNumber', formatPhoneNumber(e.target.value))}
                    placeholder="+63-XXX-XXX-XXXX"
                    className="input"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.personalInfo.email}
                    onChange={(e) => updatePersonalInfo('email', e.target.value.toLowerCase())}
                    className="input"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-sm font-medium mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.personalInfo.address}
                    onChange={(e) => updatePersonalInfo('address', e.target.value.toUpperCase())}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">PhilHealth</label>
                  <input
                    type="text"
                    value={formData.personalInfo.philhealth}
                    onChange={(e) => updatePersonalInfo('philhealth', formatPhilHealth(e.target.value))}
                    placeholder="XX-XXXXXXXXX-X"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pag-IBIG</label>
                  <input
                    type="text"
                    value={formData.personalInfo.pagibig}
                    onChange={(e) => updatePersonalInfo('pagibig', formatPagIbig(e.target.value))}
                    placeholder="XXXX-XXXX-XXXX"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">TIN</label>
                  <input
                    type="text"
                    value={formData.personalInfo.tin}
                    onChange={(e) => updatePersonalInfo('tin', formatTIN(e.target.value))}
                    placeholder="XXX-XXX-XXX-XXX"
                    className="input"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingUser(null);
                  resetForm();
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {editingUser ? 'Update User' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Role</th>
              <th>Place of Assignment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingUsers ? (
              <SkeletonTable rows={8} cols={6} />
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-gray-500">
                  No users found matching your filters
                </td>
              </tr>
            ) :
              filteredUsers.map(user => (
              <tr key={user._id}>
                <td>{user.username}</td>
                <td>
                  {user.personalInfo?.lastName && user.personalInfo?.firstName
                    ? `${user.personalInfo.lastName}, ${user.personalInfo.firstName}${normalizeMiddleName(user.personalInfo.middleName) ? ' ' + normalizeMiddleName(user.personalInfo.middleName) : ''}`
                    : user.personalInfo?.lastName || user.personalInfo?.firstName || '-'}
                </td>
                <td>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                    {user.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="text-sm">{user.placeOfAssignment || '-'}</td>
                <td>
                  {user.status === 'ACTIVE' && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Active</span>
                  )}
                  {user.status === 'PENDING' && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">Pending</span>
                  )}
                  {user.status === 'INACTIVE' && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">Inactive</span>
                  )}
                </td>
                <td>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleViewDetails(user)}
                      className="text-green-600 hover:text-green-800 text-sm"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(user._id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdate={fetchUsers}
          isAdmin={currentUserRole === 'ADMINISTRATOR'}
        />
      )}
    </div>
  );
}

export default UserManagement;