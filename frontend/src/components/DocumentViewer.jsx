import { useState, useEffect } from 'react';
import api, { getDocumentUrl, openDocument } from '../api.js';
import DocumentViewerModal from './DocumentViewerModal';

function DocumentViewer({ userRole }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterAssignment, setFilterAssignment] = useState('');
  const [viewingDocument, setViewingDocument] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/users?role=CONTRACTUAL', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchUserDocuments = async (userId) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedUser(response.data);
      setDocuments(response.data.documents || []);
    } catch (error) {
      alert('Error fetching documents: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = (userId, filename) => {
    setViewingDocument({ userId, filename });
  };

  const handleDownloadDocument = (userId, filename) => {
    const token = localStorage.getItem('token');
    openDocument(filename, userId, token);
  };

  const getFileIcon = (filename, docType) => {
    if (docType === 'EODB_ID') return '🪪';
    
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '📄';
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📝';
    return '📎';
  };

  const filteredUsers = users.filter(user => {
    const fullName = `${user.personalInfo?.firstName || ''} ${user.personalInfo?.lastName || ''}`.toLowerCase();
    const matchesName = !filterName || fullName.includes(filterName.toLowerCase()) || user.username.toLowerCase().includes(filterName.toLowerCase());
    const matchesAssignment = !filterAssignment || user.placeOfAssignment === filterAssignment;
    return matchesName && matchesAssignment;
  });

  const uniqueAssignments = [...new Set(users.map(u => u.placeOfAssignment).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold mb-4">Document Viewer - Contractual Users</h3>
        <p className="text-gray-600 text-sm">View and download documents uploaded by contractual users.</p>
      </div>

      {/* Filters */}
      <div className="card bg-gray-50">
        <h4 className="font-semibold mb-3">Filters</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Search User</label>
            <input
              type="text"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              className="input w-full"
              placeholder="Name or username..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Place of Assignment</label>
            <select
              value={filterAssignment}
              onChange={(e) => setFilterAssignment(e.target.value)}
              className="input w-full"
            >
              <option value="">All Assignments</option>
              {uniqueAssignments.map(assignment => (
                <option key={assignment} value={assignment}>{assignment}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilterName('');
                setFilterAssignment('');
              }}
              className="btn btn-secondary w-full"
            >
              Clear Filters
            </button>
          </div>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Users List */}
        <div className="card">
          <h4 className="text-lg font-semibold mb-4">Contractual Users</h4>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No users found.</p>
            ) : (
              filteredUsers.map(user => (
                <div
                  key={user._id}
                  onClick={() => fetchUserDocuments(user._id)}
                  className={`p-4 border rounded-lg cursor-pointer hover:bg-blue-50 transition ${
                    selectedUser?._id === user._id ? 'bg-blue-100 border-blue-500' : 'bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">
                        {user.personalInfo?.firstName} {user.personalInfo?.lastName}
                      </p>
                      <p className="text-sm text-gray-600">@{user.username}</p>
                      {user.placeOfAssignment && (
                        <p className="text-xs text-gray-500 mt-1">{user.placeOfAssignment}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                        {user.documents?.length || 0} docs
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Documents Panel */}
        <div className="card">
          <h4 className="text-lg font-semibold mb-4">
            {selectedUser ? (
              <>
                Documents for {selectedUser.personalInfo?.firstName} {selectedUser.personalInfo?.lastName}
              </>
            ) : (
              'Select a user to view documents'
            )}
          </h4>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : selectedUser ? (
            <div className="space-y-4">
              {documents.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <p className="text-gray-500">No documents uploaded yet.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[550px] overflow-y-auto">
                  {documents.map((doc, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-white hover:shadow-md transition">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center flex-1">
                          <span className="text-2xl mr-3">{getFileIcon(doc.filename, doc.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{doc.filename?.startsWith('http') ? doc.filename.split('/').pop().split('?')[0] : doc.filename}</p>
                            <p className="text-xs text-gray-600">
                              {doc.description || 'No description'}
                            </p>
                          </div>
                        </div>
                        <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs whitespace-nowrap">
                          {doc.type.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between pt-3 border-t">
                        <span className="text-xs text-gray-500">
                          Uploaded: {new Date(doc.uploadDate).toLocaleDateString()}
                        </span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewDocument(selectedUser._id, doc.key || doc.filename)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => handleDownloadDocument(selectedUser._id, doc.key || doc.filename)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            ⬇️ Download
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">👈 Select a user from the list to view their documents</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL MOVED HERE - OUTSIDE THE GRID */}
      {viewingDocument && (
        <DocumentViewerModal
          userId={viewingDocument.userId}
          filename={viewingDocument.filename}
          onClose={() => setViewingDocument(null)}
        />
      )}
    </div>
  );
}

export default DocumentViewer;