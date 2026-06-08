import { useState, useEffect } from 'react';
import api from '../api.js';

function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState({ entityType: '', userId: '' });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filter.entityType) params.append('entityType', filter.entityType);
      if (filter.userId) params.append('userId', filter.userId);
      params.append('limit', '50');
      
      const response = await api.get(`/api/change-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setLogs(response.data.logs || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (actionType) => {
    switch (actionType) {
      case 'CREATE': return 'bg-green-100 text-green-800';
      case 'UPDATE': return 'bg-blue-100 text-blue-800';
      case 'DELETE': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold">Activity & Change Log</h3>
          <p className="text-sm text-gray-600 mt-1">Total activities: {total}</p>
        </div>
        <button
          onClick={fetchLogs}
          className="btn btn-secondary"
        >
          Refresh
        </button>
      </div>

      <div className="card bg-gray-50">
        <h4 className="font-semibold mb-3">Filters</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Entity Type</label>
            <select
              value={filter.entityType}
              onChange={(e) => setFilter({...filter, entityType: e.target.value})}
              className="input w-full"
            >
              <option value="">All Types</option>
              <option value="User">Users</option>
              <option value="Position">Positions</option>
              <option value="Contract">Contracts</option>
              <option value="SalaryGrade">Salary Grades</option>
              <option value="Clause">Clauses</option>
              <option value="ClauseGroup">Clause Groups</option>
              <option value="Holiday">Holidays</option>
              <option value="Signatory">Signatories</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setFilter({ entityType: '', userId: '' })}
              className="btn btn-secondary w-full"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-gray-600">Loading activity logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No activity logs found. Start by creating users, positions, or contracts.
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {logs.map(log => (
              <div key={log._id} className="border-l-4 border-blue-500 pl-4 py-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getActionColor(log.actionType)}`}>
                        {log.actionType}
                      </span>
                      <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800">
                        {log.entityType}
                      </span>
                    </div>
                    <div className="font-semibold text-gray-900">
                      {log.entityName}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      By: <span className="font-medium">{log.performedBy.username}</span> 
                      <span className="text-gray-400"> • </span>
                      <span className="text-blue-600">{log.performedBy.role}</span>
                      {log.performedBy.placeOfAssignment && (
                        <>
                          <span className="text-gray-400"> • </span>
                          <span>{log.performedBy.placeOfAssignment}</span>
                        </>
                      )}
                    </div>
                    {log.ipAddress && (
                      <div className="text-xs text-gray-500 mt-1">
                        IP: {log.ipAddress}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 text-right ml-4">
                    <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                    <div>{new Date(log.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityLog;