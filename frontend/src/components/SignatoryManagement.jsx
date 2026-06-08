import { useState, useEffect } from 'react';
import api from '../api.js';

function SignatoryManagement() {
  const [signatories, setSignatories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSignatory, setEditingSignatory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    designation: '',
    role: 'RECOMMENDING_APPROVAL',
    title: '',
    isActive: true,
    isDefault: false
  });

  const roleOptions = [
    { value: 'RECOMMENDING_APPROVAL', label: 'Recommending Approval' },
    { value: 'FUNDS_AVAILABLE_ACCOUNTANT', label: 'Funds Available (Accountant)' },
    { value: 'FUNDS_AVAILABLE_FINANCE', label: 'Funds Available (Finance Chief)' },
    { value: 'FIRST_PARTY', label: 'First Party' },
    { value: 'APPROVER', label: 'Approver' },
    { value: 'SUPERVISOR', label: 'Supervisor' }
  ];

  useEffect(() => {
    fetchSignatories();
  }, []);

  const fetchSignatories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/signatories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSignatories(response.data);
    } catch (error) {
      console.error('Error fetching signatories:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      if (editingSignatory) {
        await api.put(`/api/signatories/${editingSignatory._id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Signatory updated successfully!');
      } else {
        await api.post('/api/signatories', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Signatory created successfully!');
      }
      setShowForm(false);
      setEditingSignatory(null);
      setFormData({
        name: '',
        designation: '',
        role: 'RECOMMENDING_APPROVAL',
        title: '',
        isActive: true,
        isDefault: false
      });
      fetchSignatories();
    } catch (error) {
      alert('Error saving signatory: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEdit = (signatory) => {
    setEditingSignatory(signatory);
    setFormData({
      name: signatory.name,
      designation: signatory.designation,
      role: signatory.role,
      title: signatory.title || '',
      isActive: signatory.isActive,
      isDefault: signatory.isDefault
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this signatory?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/signatories/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSignatories();
      alert('Signatory deleted successfully!');
    } catch (error) {
      alert('Error deleting signatory: ' + (error.response?.data?.message || error.message));
    }
  };

  const getRoleLabel = (role) => {
    const option = roleOptions.find(o => o.value === role);
    return option ? option.label : role;
  };

  const groupedSignatories = signatories.reduce((acc, sig) => {
    if (!acc[sig.role]) {
      acc[sig.role] = [];
    }
    acc[sig.role].push(sig);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Signatory Management</h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingSignatory(null);
            setFormData({
              name: '',
              designation: '',
              role: 'RECOMMENDING_APPROVAL',
              title: '',
              isActive: true,
              isDefault: false
            });
          }}
          className="btn btn-primary"
        >
          {showForm ? 'Cancel' : 'Add Signatory'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h4 className="text-lg font-semibold mb-4">
            {editingSignatory ? 'Edit Signatory' : 'New Signatory'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Designation</label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData({...formData, designation: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="input"
                >
                  {roleOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Title (Optional, e.g., CESO III)
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="input"
                />
              </div>
            </div>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                  className="mr-2"
                />
                <span className="text-sm">Active</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({...formData, isDefault: e.target.checked})}
                  className="mr-2"
                />
                <span className="text-sm">Set as Default for this Role</span>
              </label>
            </div>
            <button type="submit" className="btn btn-primary">
              {editingSignatory ? 'Update Signatory' : 'Create Signatory'}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {roleOptions.map(roleOption => {
          const rolesigs = groupedSignatories[roleOption.value] || [];
          if (rolesigs.length === 0) return null;
          
          return (
            <div key={roleOption.value} className="card">
              <h4 className="text-lg font-semibold mb-3">{roleOption.label}</h4>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Designation</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Default</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rolesigs.map(sig => (
                      <tr key={sig._id}>
                        <td>{sig.name}</td>
                        <td>{sig.designation}</td>
                        <td>{sig.title || '-'}</td>
                        <td>
                          {sig.isActive ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Active</span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">Inactive</span>
                          )}
                        </td>
                        <td>
                          {sig.isDefault && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Default</span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => handleEdit(sig)}
                            className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(sig._id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SignatoryManagement;