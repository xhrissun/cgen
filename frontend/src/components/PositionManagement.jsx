import { useState, useEffect } from 'react';
import api from '../api.js';
import PositionDetailsModal from './PositionDetailsModal';
import { SkeletonTable, EmptyState, Spinner, dispatchPageLoading } from './ui.jsx';

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

function PositionManagement() {
  const [positions, setPositions] = useState([]);
  const [filteredPositions, setFilteredPositions] = useState([]);
  const [salaryGrades, setSalaryGrades] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [clauseGroups, setClauseGroups] = useState([]);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [savingForm, setSavingForm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [clauseSelectionMode, setClauseSelectionMode] = useState('individual');
  const [currentUserRole, setCurrentUserRole] = useState('');

  // Admin-only bulk assignment by Place of Assignment
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignSaving, setBulkAssignSaving] = useState(false);
  const [bulkAssign, setBulkAssign] = useState({
    placeOfAssignment: '',
    clauseGroups: [],
    assignedClauses: [],
    mode: 'replace'
  });
  
  // Filter states
  const [filterPosition, setFilterPosition] = useState('');
  const [filterAssignment, setFilterAssignment] = useState('');
  
  const [formData, setFormData] = useState({
    positionCode: '',
    title: '',
    description: '',
    salaryGrade: '',
    isSpecialSalaryGrade: false,
    specialSalaryAmount: '',
    dutiesAndResponsibilities: [''],
    assignedClauses: [],
    clauseGroups: [],
    placeOfAssignment: '',
    charging: '',
    premium: {
      hasMonthlyPremium: false,
      premiumRate: 20,
      premiumAmount: 0
    }
  });

  useEffect(() => {
    // Get current user's role
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUserRole(payload.role);
      
      // If focal person, lock their place of assignment
      if (payload.role === 'FOCAL_PERSON') {
        const fetchCurrentUser = async () => {
          try {
            const response = await api.get(`/api/users/${payload.userId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const userAssignment = response.data.placeOfAssignment;
            setFormData(prev => ({
              ...prev,
              placeOfAssignment: userAssignment
            }));
            setFilterAssignment(userAssignment); // Also set filter
          } catch (error) {
            console.error('Error fetching user:', error);
          }
        };
        fetchCurrentUser();
      }
    }
    
    fetchPositions();
    fetchSalaryGrades();
    fetchClauses();
    fetchClauseGroups();
  }, []);

  useEffect(() => {
    // Apply filters
    let filtered = [...positions];
    
    if (filterPosition) {
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(filterPosition.toLowerCase()) ||
        p.positionCode.toLowerCase().includes(filterPosition.toLowerCase())
      );
    }
    
    if (filterAssignment) {
      filtered = filtered.filter(p => 
        p.placeOfAssignment === filterAssignment
      );
    }
    
    setFilteredPositions(filtered);
  }, [positions, filterPosition, filterAssignment]);




  const fetchPositions = async () => {
    setLoadingPositions(true);
    dispatchPageLoading(true, 'Loading positions…');
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPositions(response.data);
      setFilteredPositions(response.data);
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setLoadingPositions(false);
      dispatchPageLoading(false);
    }
  };

  const fetchSalaryGrades = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions/salary-grades/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSalaryGrades(response.data);
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

  const fetchClauseGroups = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions/clause-groups', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClauseGroups(response.data);
    } catch (error) {
      console.error('Error fetching clause groups:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSavingForm(true);
    try {
      const token = localStorage.getItem('token');
      
      if (editingPosition) {
        await api.put(`/api/positions/${editingPosition._id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Position updated successfully!');
      } else {
        await api.post('/api/positions', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Position created successfully!');
      }
      
      setShowForm(false);
      setEditingPosition(null);
      resetForm();
      fetchPositions();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.message || error.message));
    } finally {
      setSavingForm(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this position?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/positions/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Position deleted successfully!');
      fetchPositions();
    } catch (error) {
      alert('Error deleting position: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEdit = (position) => {
    setEditingPosition(position);
    const existingGroupIds = (position.assignedClauseGroups || []).map(g => g._id || g);
    setFormData({
      //positionCode: position.positionCode || '',
      title: position.title,
      description: position.description || '',
      salaryGrade: position.salaryGrade,
      isSpecialSalaryGrade: position.isSpecialSalaryGrade,
      specialSalaryAmount: position.specialSalaryAmount || '',
      dutiesAndResponsibilities: position.dutiesAndResponsibilities.length > 0 
        ? position.dutiesAndResponsibilities 
        : [''],
      assignedClauses: (position.assignedClauses || []).map(c => c._id || c),
      clauseGroups: existingGroupIds,
      placeOfAssignment: position.placeOfAssignment || '',
      charging: position.charging || '',
      premium: position.premium || {
        hasMonthlyPremium: false,
        premiumRate: 20,
        premiumAmount: 0
      }
    });
    // Show whichever tab actually has something assigned, so existing
    // assignments aren't silently cleared by switching tabs.
    setClauseSelectionMode(existingGroupIds.length > 0 ? 'groups' : 'individual');
    setShowForm(true);
  };

  const resetForm = () => {
    // Preserve placeOfAssignment for focal persons
    const preservedAssignment = currentUserRole === 'FOCAL_PERSON' ? formData.placeOfAssignment : '';
    
    setFormData({
      title: '',
      description: '',
      salaryGrade: '',
      isSpecialSalaryGrade: false,
      specialSalaryAmount: '',
      dutiesAndResponsibilities: [''],
      assignedClauses: [],
      clauseGroups: [],
      placeOfAssignment: preservedAssignment,
      charging: '',
      premium: {
        hasMonthlyPremium: false,
        premiumRate: 20,
        premiumAmount: 0
      }
    });
    setClauseSelectionMode('individual');
  };

  const addDuty = () => {
    setFormData({
      ...formData,
      dutiesAndResponsibilities: [...formData.dutiesAndResponsibilities, '']
    });
  };

  const updateDuty = (index, value) => {
    const updated = [...formData.dutiesAndResponsibilities];
    updated[index] = value;
    setFormData({
      ...formData,
      dutiesAndResponsibilities: updated
    });
  };

  const removeDuty = (index) => {
    const updated = formData.dutiesAndResponsibilities.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      dutiesAndResponsibilities: updated.length > 0 ? updated : ['']
    });
  };

  const toggleClause = (clauseId) => {
    const isSelected = formData.assignedClauses.includes(clauseId);
    setFormData({
      ...formData,
      assignedClauses: isSelected
        ? formData.assignedClauses.filter(id => id !== clauseId)
        : [...formData.assignedClauses, clauseId]
    });
  };

  const toggleClauseGroup = (groupId) => {
    const isSelected = formData.clauseGroups.includes(groupId);
    setFormData({
      ...formData,
      clauseGroups: isSelected
        ? formData.clauseGroups.filter(id => id !== groupId)
        : [...formData.clauseGroups, groupId]
    });
  };

  const getAllSelectedClauseIds = () => {
    const individualIds = new Set(formData.assignedClauses);
    
    formData.clauseGroups.forEach(groupId => {
      const group = clauseGroups.find(g => g._id === groupId);
      if (group) {
        group.clauses.forEach(clause => {
          individualIds.add(clause._id);
        });
      }
    });
    
    return Array.from(individualIds);
  };

  const toggleBulkClauseGroup = (groupId) => {
    setBulkAssign(prev => ({
      ...prev,
      clauseGroups: prev.clauseGroups.includes(groupId)
        ? prev.clauseGroups.filter(id => id !== groupId)
        : [...prev.clauseGroups, groupId]
    }));
  };

  const toggleBulkClause = (clauseId) => {
    setBulkAssign(prev => ({
      ...prev,
      assignedClauses: prev.assignedClauses.includes(clauseId)
        ? prev.assignedClauses.filter(id => id !== clauseId)
        : [...prev.assignedClauses, clauseId]
    }));
  };

  const handleBulkAssign = async (e) => {
    e.preventDefault();
    if (!bulkAssign.placeOfAssignment) {
      alert('Please select a Place of Assignment.');
      return;
    }
    if (bulkAssign.clauseGroups.length === 0 && bulkAssign.assignedClauses.length === 0) {
      alert('Please select at least one clause group or individual clause.');
      return;
    }

    const verb = bulkAssign.mode === 'replace' ? 'REPLACE' : 'append to';
    if (!confirm(
      `This will ${verb} the clause assignment for EVERY position under ` +
      `"${bulkAssign.placeOfAssignment}". Continue?`
    )) {
      return;
    }

    setBulkAssignSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await api.post('/api/positions/bulk-assign-clauses', bulkAssign, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(response.data.message);
      setBulkAssign({ placeOfAssignment: '', clauseGroups: [], assignedClauses: [], mode: 'replace' });
      setShowBulkAssign(false);
      fetchPositions();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.message || error.message));
    } finally {
      setBulkAssignSaving(false);
    }
  };

  const handleViewDetails = async (position) => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/api/positions/${position._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedPosition(response.data);
    } catch (error) {
      alert('Error loading position details: ' + (error.response?.data?.message || error.message));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Position Management</h3>
        <div className="flex gap-2">
          {currentUserRole === 'ADMINISTRATOR' && (
            <button
              onClick={() => {
                setShowBulkAssign(!showBulkAssign);
                setShowForm(false);
              }}
              className="btn btn-secondary"
            >
              {showBulkAssign ? 'Cancel Bulk Assign' : 'Bulk Assign Clauses'}
            </button>
          )}
          <button
            onClick={() => {
              setShowForm(!showForm);
              setShowBulkAssign(false);
              setEditingPosition(null);
              resetForm();
            }}
            className="btn btn-primary"
          >
            {showForm ? 'Cancel' : 'Add Position'}
          </button>
        </div>
      </div>

      {/* Admin-only: bulk assign clause groups / clauses to every position
          under a chosen Place of Assignment in one action. */}
      {showBulkAssign && currentUserRole === 'ADMINISTRATOR' && (
        <div className="card border-2 border-blue-200 bg-blue-50">
          <h4 className="font-semibold mb-1">Bulk Assign Clauses by Place of Assignment</h4>
          <p className="text-sm text-gray-600 mb-4">
            Applies the selected clause group(s)/clause(s) to every position currently
            assigned to the chosen Place of Assignment. Useful for fixing or setting up
            many positions at once instead of editing them one by one.
          </p>
          <form onSubmit={handleBulkAssign} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Place of Assignment *</label>
              <select
                value={bulkAssign.placeOfAssignment}
                onChange={(e) => setBulkAssign({ ...bulkAssign, placeOfAssignment: e.target.value })}
                className="input w-full"
                required
              >
                <option value="">Select a Place of Assignment...</option>
                {PLACE_OF_ASSIGNMENT_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Clause Groups</label>
              <div className="border rounded-lg p-3 max-h-56 overflow-y-auto space-y-2 bg-white">
                {clauseGroups.length === 0 ? (
                  <p className="text-sm text-gray-500">No clause groups available.</p>
                ) : clauseGroups.map(group => (
                  <label key={group._id} className="flex items-start hover:bg-gray-50 p-2 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkAssign.clauseGroups.includes(group._id)}
                      onChange={() => toggleBulkClauseGroup(group._id)}
                      className="mr-2 mt-1"
                    />
                    <div>
                      <div className="font-medium text-sm">{group.name}</div>
                      <div className="text-xs text-gray-500">Contains {group.clauses?.length || 0} clause(s)</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Additional Individual Clauses (optional)</label>
              <div className="border rounded-lg p-3 max-h-56 overflow-y-auto space-y-2 bg-white">
                {clauses.map(clause => (
                  <label key={clause._id} className="flex items-start hover:bg-gray-50 p-2 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkAssign.assignedClauses.includes(clause._id)}
                      onChange={() => toggleBulkClause(clause._id)}
                      className="mr-2 mt-1"
                    />
                    <div className="text-sm">
                      Clause {clause.clauseNumber}: {clause.title || 'Untitled'}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="bulkMode"
                    checked={bulkAssign.mode === 'replace'}
                    onChange={() => setBulkAssign({ ...bulkAssign, mode: 'replace' })}
                  />
                  Replace existing assignment
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="bulkMode"
                    checked={bulkAssign.mode === 'append'}
                    onChange={() => setBulkAssign({ ...bulkAssign, mode: 'append' })}
                  />
                  Append to existing assignment
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {bulkAssign.mode === 'replace'
                  ? 'Every matching position\'s clause/group assignment will be overwritten with exactly what you selected above.'
                  : 'The selected group(s)/clause(s) will be added on top of whatever each matching position already has.'}
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBulkAssign(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={bulkAssignSaving}>
                {bulkAssignSaving ? <><Spinner size="sm" color="white" />Applying…</> : 'Apply to All Matching Positions'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      {!showForm && (
        <div className="card bg-gray-50">
          <h4 className="font-semibold mb-3">Filters</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Search Position</label>
              <input
                type="text"
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value)}
                className="input w-full"
                placeholder="Search by title or code..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Place of Assignment</label>
              <select
                value={filterAssignment}
                onChange={(e) => setFilterAssignment(e.target.value)}
                className="input"
                disabled={currentUserRole === 'FOCAL_PERSON'}
              >
                <option value="">All Assignments</option>
                {PLACE_OF_ASSIGNMENT_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {currentUserRole === 'FOCAL_PERSON' && filterAssignment && (
                <p className="text-xs text-blue-600 mt-1">
                  ℹ️ Filtered to your assigned place: {filterAssignment}
                </p>
              )}
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterPosition('');
                  setFilterAssignment(currentUserRole === 'FOCAL_PERSON' ? filterAssignment : '');
                }}
                className="btn btn-secondary w-full"
              >
                Clear Filters
              </button>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Showing {filteredPositions.length} of {positions.length} positions
          </div>
        </div>
      )}

      {showForm && (
        <div className="card">
          <h4 className="text-lg font-semibold mb-4">
            {editingPosition ? 'Edit Position' : 'New Position'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Position Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="input"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Position code will be auto-generated based on assignment and title
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description (Optional)</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="input"
                placeholder="e.g., Administrative Officer - Regional Office"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Salary Grade</label>
                <select
                  value={formData.salaryGrade}
                  onChange={(e) => {
                    const selectedGrade = e.target.value;
                    const selectedSG = salaryGrades.find(sg => sg.grade === selectedGrade);
                    
                    setFormData({
                      ...formData, 
                      salaryGrade: selectedGrade,
                      isSpecialSalaryGrade: selectedSG?.isSpecialSalaryGrade || false,
                      specialSalaryAmount: selectedSG?.isSpecialSalaryGrade ? selectedSG.basicSalary.toString() : ''
                    });
                  }}
                  className="input"
                  required
                >
                  <option value="">Select Salary Grade</option>
                  {salaryGrades.map(sg => (
                    <option key={sg._id} value={sg.grade}>
                      Grade {sg.grade} {sg.isSpecialSalaryGrade ? '(Special)' : ''} - ₱{sg.monthlySalaryAsPerContract?.toLocaleString() || sg.basicSalary.toLocaleString()}
                    </option>
                  ))}
                </select>
                {formData.isSpecialSalaryGrade && (
                  <p className="text-xs text-yellow-600 mt-1">
                    ⚠️ Special Salary Grade: ₱{parseFloat(formData.specialSalaryAmount || 0).toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Place of Assignment
                  {currentUserRole === 'FOCAL_PERSON' && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select
                  value={formData.placeOfAssignment}
                  onChange={(e) => setFormData({...formData, placeOfAssignment: e.target.value})}
                  className="input"
                  disabled={currentUserRole === 'FOCAL_PERSON'}
                  required
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
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Charging</label>
              <input
                type="text"
                value={formData.charging}
                onChange={(e) => setFormData({...formData, charging: e.target.value})}
                className="input"
                placeholder="e.g., General Appropriations Act"
                disabled={currentUserRole !== 'FINANCE_OFFICER' && currentUserRole !== 'ADMINISTRATOR'}
                readOnly={currentUserRole !== 'FINANCE_OFFICER' && currentUserRole !== 'ADMINISTRATOR'}
              />
              {(currentUserRole !== 'FINANCE_OFFICER' && currentUserRole !== 'ADMINISTRATOR') && (
                <p className="text-xs text-gray-500 mt-1">
                  ℹ️ Charging can only be set by Finance Officers or Administrators
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Duties and Responsibilities</label>
              {formData.dutiesAndResponsibilities.map((duty, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <textarea
                    value={duty}
                    onChange={(e) => updateDuty(index, e.target.value)}
                    className="input flex-1"
                    rows="2"
                    placeholder={`Duty ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeDuty(index)}
                    className="btn btn-danger"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addDuty}
                className="btn btn-secondary mt-2"
              >
                Add Duty
              </button>
            </div>

            {/* Only show clause assignment for administrators */}
            {currentUserRole === 'ADMINISTRATOR' && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-medium">Contract Clauses</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setClauseSelectionMode('individual');
                        setFormData({...formData, clauseGroups: []}); // Clear groups when switching to individual
                      }}
                      className={`px-3 py-1 text-sm rounded ${
                        clauseSelectionMode === 'individual'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Individual Clauses
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClauseSelectionMode('groups');
                        setFormData({...formData, assignedClauses: []}); // Clear individual when switching to groups
                      }}
                      className={`px-3 py-1 text-sm rounded ${
                        clauseSelectionMode === 'groups'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Clause Groups
                    </button>
                  </div>
                </div>

                {clauseSelectionMode === 'individual' ? (
                  <div className="border rounded-lg p-4 max-h-80 overflow-y-auto space-y-2">
                    {clauses.map(clause => (
                      <label key={clause._id} className="flex items-start hover:bg-gray-50 p-2 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.assignedClauses.includes(clause._id)}
                          onChange={() => toggleClause(clause._id)}
                          className="mr-2 mt-1"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            Clause {clause.clauseNumber}: {clause.title || 'Untitled'}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            {clause.content.substring(0, 100)}...
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 max-h-80 overflow-y-auto space-y-3">
                    {clauseGroups.map(group => (
                      <label key={group._id} className="block hover:bg-gray-50 p-3 rounded cursor-pointer border">
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            checked={formData.clauseGroups.includes(group._id)}
                            onChange={() => toggleClauseGroup(group._id)}
                            className="mr-3 mt-1"
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{group.name}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              Contains {group.clauses?.length || 0} clause(s)
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <div className="mt-3 p-3 bg-blue-50 rounded text-sm">
                  <div className="font-medium text-blue-900">Selection Summary:</div>
                  <div className="text-blue-800 mt-1">
                    {formData.assignedClauses.length} individual clause(s)
                    {formData.clauseGroups.length > 0 && ` + ${formData.clauseGroups.length} group(s)`}
                    <span className="font-medium ml-2">
                      = {getAllSelectedClauseIds().length} total clause(s)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {currentUserRole !== 'ADMINISTRATOR' && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm text-yellow-800">
                  ℹ️ <strong>Note:</strong> Only administrators can assign clauses to positions. 
                  This position will require clause assignment by an administrator before it can be used for contracts.
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingPosition(null);
                  resetForm();
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingForm}>
                {savingForm ? <><Spinner size="sm" color="white" />{editingPosition ? 'Updating…' : 'Creating…'}</> : (editingPosition ? 'Update Position' : 'Create Position')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Title</th>
              <th>Description</th>
              <th>SG</th>
              <th>Place of Assignment</th>
              <th>Clauses</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingPositions ? (
              <SkeletonTable rows={7} cols={7} />
            ) : filteredPositions.length === 0 ? (
              <tr><td colSpan="7"><EmptyState icon="📋" title="No positions found" description="Create a position or adjust your filters." /></td></tr>
            ) : filteredPositions.map(position => {
              const totalClauseCount = position.resolvedClauses
                ? position.resolvedClauses.length
                : (position.assignedClauses?.length || 0);
              const needsAttention = totalClauseCount === 0;
              
              return (
                <tr key={position._id} className={needsAttention ? 'bg-yellow-50' : ''}>
                  <td className="font-mono text-sm font-semibold">
                    {position.positionCode}
                    {needsAttention && (
                      <span className="ml-2 px-2 py-1 bg-yellow-200 text-yellow-900 rounded text-xs">
                        ⚠️ Needs Clauses
                      </span>
                    )}
                  </td>
                  <td className="font-medium">{position.title}</td>
                  <td className="text-sm text-gray-600">{position.description || '-'}</td>
                  <td>
                    {position.isSpecialSalaryGrade ? (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                        Special: {position.salaryGrade}
                      </span>
                    ) : (
                      `Grade ${position.salaryGrade}`
                    )}
                  </td>
                  <td className="text-sm">{position.placeOfAssignment || '-'}</td>
                  <td>
                    <div>
                      {totalClauseCount} clause{totalClauseCount === 1 ? '' : 's'}
                      {needsAttention && (
                        <span className="ml-1 text-yellow-600 font-semibold">⚠️</span>
                      )}
                    </div>
                    {position.assignedClauseGroups?.length > 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {position.assignedClauseGroups.map(g => g.name || g).join(', ')}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleViewDetails(position)}
                        className="text-green-600 hover:text-green-800 text-sm"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleEdit(position)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(position._id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
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

      {selectedPosition && (
        <PositionDetailsModal
          position={selectedPosition}
          onClose={() => setSelectedPosition(null)}
        />
      )}
    </div>
  );
}

export default PositionManagement;