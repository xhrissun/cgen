import { useState } from 'react';
import UserManagement from './UserManagement';
import PositionManagement from './PositionManagement';
import ContractGenerator from './ContractGenerator';
import ContractualDashboard from './ContractualDashboard';
import DocumentViewer from './DocumentViewer';
import EODBGenerator from './EODBGenerator';

function FocalPersonDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'users', name: 'Create Users' },
    { id: 'positions', name: 'Positions' },
    { id: 'contracts', name: 'Contracts' },
    { id: 'documents', name: 'User Documents' },
    { id: 'eodb', name: 'EODB ID' },
    { id: 'profile', name: 'My Profile' }
  ];

  const handleDocumentUploaded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Focal Person Dashboard</h2>
          <p className="text-gray-600 mt-1">Place of Assignment: {user.placeOfAssignment || 'Not Assigned'}</p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">My Place of Assignment</h3>
            <p className="text-2xl font-bold text-primary-600">{user.placeOfAssignment || 'Not Assigned'}</p>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Role</h3>
            <p className="text-2xl font-bold text-primary-600">Focal Person</p>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Access Level</h3>
            <p className="text-2xl font-bold text-primary-600">Limited</p>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="card">
          <h3 className="text-xl font-bold mb-4">Create Contractual Users</h3>
          <p className="text-gray-600 mb-6">
            You can create contractual users for your place of assignment. 
            Created users will be in PENDING status and require administrator validation.
          </p>
          <UserManagement />
        </div>
      )}

      {activeTab === 'positions' && <PositionManagement />}
      
      {activeTab === 'contracts' && <ContractGenerator userRole="FOCAL_PERSON" />}

      {activeTab === 'documents' && <DocumentViewer userRole="FOCAL_PERSON" />}

      {activeTab === 'eodb' && (
        <EODBGenerator
          userId={user.id || user._id}
          onDocumentUploaded={handleDocumentUploaded}
        />
      )}

      {activeTab === 'profile' && <ContractualDashboard user={user} />}
    </div>
  );
}

export default FocalPersonDashboard;