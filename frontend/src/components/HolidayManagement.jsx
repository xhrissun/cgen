import { useState, useEffect } from 'react';
import api from '../api.js';

function HolidayManagement() {
  const [holidays, setHolidays] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    type: 'REGULAR',
    year: new Date().getFullYear(),
    isRecurring: false
  });

  useEffect(() => {
    fetchHolidays();
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      if (editingHoliday) {
        await api.put(`/api/holidays/${editingHoliday._id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Holiday updated successfully!');
      } else {
        await api.post('/api/holidays', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Holiday created successfully!');
      }
      setShowForm(false);
      setEditingHoliday(null);
      setFormData({
        name: '',
        date: '',
        type: 'REGULAR',
        year: new Date().getFullYear(),
        isRecurring: false
      });
      fetchHolidays();
    } catch (error) {
      alert('Error saving holiday: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEdit = (holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: new Date(holiday.date).toISOString().split('T')[0],
      type: holiday.type,
      year: holiday.year,
      isRecurring: holiday.isRecurring
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this holiday?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/holidays/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchHolidays();
      alert('Holiday deleted successfully!');
    } catch (error) {
      alert('Error deleting holiday: ' + (error.response?.data?.message || error.message));
    }
  };

  const getTypeBadge = (type) => {
    const badges = {
      REGULAR: { color: 'bg-red-100 text-red-800', label: 'Regular Holiday' },
      SPECIAL_NON_WORKING: { color: 'bg-yellow-100 text-yellow-800', label: 'Special Non-Working' },
      SPECIAL_WORKING: { color: 'bg-blue-100 text-blue-800', label: 'Special Working' }
    };
    const badge = badges[type];
    return <span className={`px-2 py-1 ${badge.color} rounded text-xs`}>{badge.label}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Holiday Management</h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingHoliday(null);
            setFormData({
              name: '',
              date: '',
              type: 'REGULAR',
              year: new Date().getFullYear(),
              isRecurring: false
            });
          }}
          className="btn btn-primary"
        >
          {showForm ? 'Cancel' : 'Add Holiday'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h4 className="text-lg font-semibold mb-4">
            {editingHoliday ? 'Edit Holiday' : 'New Holiday'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Holiday Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Year</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({...formData, year: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Holiday Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="input"
                >
                  <option value="REGULAR">Regular Holiday (200% premium)</option>
                  <option value="SPECIAL_NON_WORKING">Special Non-Working (130% premium)</option>
                  <option value="SPECIAL_WORKING">Special Working Day (no premium)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isRecurring}
                onChange={(e) => setFormData({...formData, isRecurring: e.target.checked})}
                className="mr-2"
              />
              <label className="text-sm">Recurring Annually</label>
            </div>
            <button type="submit" className="btn btn-primary">
              {editingHoliday ? 'Update Holiday' : 'Create Holiday'}
            </button>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Holiday Name</th>
              <th>Date</th>
              <th>Year</th>
              <th>Type</th>
              <th>Recurring</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map(holiday => (
              <tr key={holiday._id}>
                <td>{holiday.name}</td>
                <td>{new Date(holiday.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</td>
                <td>{holiday.year}</td>
                <td>{getTypeBadge(holiday.type)}</td>
                <td>
                  {holiday.isRecurring ? (
                    <span className="text-green-600">Yes</span>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </td>
                <td>
                  <button
                    onClick={() => handleEdit(holiday)}
                    className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(holiday._id)}
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
}

export default HolidayManagement;