import { useState, useEffect } from 'react';
import axios from 'axios';

function ClauseGroupManagement() {
  const [groups, setGroups] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    selectedClauses: []
  });

  useEffect(() => {
    fetchGroups();
    fetchClauses();
  }, []);

  const fetchGroups = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/positions/clause-groups', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGroups(response.data);
    } catch (error) {
      console.error('Error fetching clause groups:', error);
    }
  };

  const fetchClauses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/positions/clauses/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClauses(response.data);
    } catch (error) {
      console.error('Error fetching clauses:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: formData.name,
        description: formData.description,
        clauses: formData.selectedClauses
      };

      if (editingGroup) {
        await axios.put(`/api/positions/clause-groups/${editingGroup._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Clause group updated successfully!');
      } else {
        await axios.post('/api/positions/clause-groups', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Clause group created successfully!');
      }
      
      setShowForm(false);
      setEditingGroup(null);
      setFormData({
        name: '',
        description: '',
        selectedClauses: []
      });
      fetchGroups();
    } catch (error) {
      alert('Error saving clause group: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEdit = (group) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      selectedClauses: group.clauses.map(c => c._id)
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this clause group?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/positions/clause-groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchGroups();
      alert('Clause group deleted successfully!');
    } catch (error) {
      alert('Error deleting clause group: ' + (error.response?.data?.message || error.message));
    }
  };

  const toggleClauseSelection = (clauseId) => {
    setFormData(prev => ({
      ...prev,
      selectedClauses: prev.selectedClauses.includes(clauseId)
        ? prev.selectedClauses.filter(id => id !== clauseId)
        : [...prev.selectedClauses, clauseId]
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Clause Group Management</h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingGroup(null);
            setFormData({
              name: '',
              description: '',
              selectedClauses: []
            });
          }}
          className="btn btn-primary"
        >
          {showForm ? 'Cancel' : 'Create Group'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h4 className="text-lg font-semibold mb-4">
            {editingGroup ? 'Edit Clause Group' : 'New Clause Group'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Group Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="input h-20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Select Clauses</label>
              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto space-y-2">
                {clauses.map(clause => (
                  <label key={clause._id} className="flex items-start space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.selectedClauses.includes(clause._id)}
                      onChange={() => toggleClauseSelection(clause._id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        Clause {clause.clauseNumber}: {clause.title || 'Untitled'}
                      </div>
                      <div className="text-sm text-gray-600 truncate">
                        {clause.content}
                      </div>
                      {clause.clauseType !== 'NORMAL' && (
                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded mt-1 inline-block">
                          {clause.clauseType}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {formData.selectedClauses.length} clause(s) selected
              </p>
            </div>
            <button type="submit" className="btn btn-primary">
              {editingGroup ? 'Update Group' : 'Create Group'}
            </button>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {groups.map(group => (
          <div key={group._id} className="card">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="text-lg font-semibold">{group.name}</h4>
                {group.description && (
                  <p className="text-sm text-gray-600 mt-1">{group.description}</p>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(group)}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(group._id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Clauses ({group.clauses?.length || 0}):
              </p>
              <div className="space-y-1">
                {group.clauses?.map(clause => (
                  <div key={clause._id} className="text-sm bg-gray-50 p-2 rounded">
                    <span className="font-medium">Clause {clause.clauseNumber}:</span>{' '}
                    {clause.title || clause.content.substring(0, 100) + '...'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        
        {groups.length === 0 && (
          <div className="card text-center text-gray-500">
            <p>No clause groups created yet. Create one to group related clauses together.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClauseGroupManagement;