import { useState, useEffect } from 'react';
import Select from 'react-select';
import api from '../api.js';
import EODBGenerator from './EODBGenerator';

// Lets an Administrator pick a contractual employee and then reuses the
// same EODBGenerator flow the employee would use themselves — generating
// their EODB ID and uploading their ID photo — but acting on that
// employee's record instead of the admin's own. The backend enforces that
// only an admin (or a focal person for their own office) may target
// someone else's EODB data/documents; this component is just the picker.
function AdminEODBManager() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    fetchContractualUsers();
  }, []);

  const fetchContractualUsers = async () => {
    try {
      setLoadingUsers(true);
      const token = localStorage.getItem('token');
      const response = await api.get('/api/users?role=CONTRACTUAL', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data || []);
    } catch (error) {
      console.error('Error fetching contractual users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const sortedOptions = [...users]
    .sort((a, b) => {
      const aLastName = (a.personalInfo?.lastName || '').toUpperCase();
      const bLastName = (b.personalInfo?.lastName || '').toUpperCase();
      return aLastName.localeCompare(bLastName) || a.username.localeCompare(b.username);
    })
    .map(u => ({
      value: u._id,
      label: u.personalInfo?.lastName && u.personalInfo?.firstName
        ? `${u.personalInfo.lastName}, ${u.personalInfo.firstName} (${u.username})`
        : `${u.username} — profile incomplete`,
      raw: u
    }));

  if (selectedUser) {
    const fullName = selectedUser.personalInfo?.lastName
      ? `${selectedUser.personalInfo.firstName} ${selectedUser.personalInfo.lastName}`
      : selectedUser.username;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md px-4 py-3">
          <div>
            <span className="text-sm text-gray-600">Generating EODB ID for:</span>{' '}
            <span className="font-semibold text-gray-900">{fullName}</span>
          </div>
          <button
            onClick={() => setSelectedUser(null)}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50"
          >
            ← Choose a different employee
          </button>
        </div>

        <EODBGenerator
          userId={selectedUser._id}
          onDocumentUploaded={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Generate EODB ID</h3>
      <p className="text-sm text-gray-600 mb-4">
        Select a contractual employee to generate their EODB ID and upload their ID photo on their behalf.
      </p>

      <label className="block text-sm font-medium mb-1">Employee</label>
      <Select
        options={sortedOptions}
        onChange={(option) => setSelectedUser(option?.raw || null)}
        placeholder={loadingUsers ? 'Loading employees...' : 'Select an employee'}
        isLoading={loadingUsers}
        isSearchable
        isClearable
      />
    </div>
  );
}

export default AdminEODBManager;