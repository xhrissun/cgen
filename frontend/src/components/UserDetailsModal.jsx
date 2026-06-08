import { useState } from 'react';
import api from '../api.js';

function UserDetailsModal({ user, onClose, onUpdate, isAdmin }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match!');
      return;
    }

    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters long!');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await api.post(`/api/users/${user._id}/reset-password`, 
        { newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert('Password reset successfully!');
      setShowPasswordForm(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      alert('Error: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const pi = user.personalInfo || {};

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h3 className="text-xl font-bold">User Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Account Information */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Account Information</h4>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-600">Username</label>
                <p className="font-semibold">{user.username}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Role</label>
                <p>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                    {user.role.replace('_', ' ')}
                  </span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Status</label>
                <p>
                  <span className={`px-2 py-1 rounded text-sm ${
                    user.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                    user.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {user.status}
                  </span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Place of Assignment</label>
                <p>{user.placeOfAssignment || 'Not assigned'}</p>
              </div>
            </div>
          </div>

          {/* Password Management (Admin Only) */}
          {isAdmin && (
            <div>
              <h4 className="text-lg font-semibold mb-3 text-gray-700">Password Management</h4>
              <div className="bg-yellow-50 p-4 rounded-lg">
                {!showPasswordForm ? (
                  <button
                    onClick={() => setShowPasswordForm(true)}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                  >
                    Reset Password
                  </button>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="input w-full"
                        placeholder="Enter new password"
                        required
                        minLength={6}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="input w-full"
                        placeholder="Confirm new password"
                        required
                        minLength={6}
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
                      >
                        {loading ? 'Resetting...' : 'Reset Password'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordForm(false);
                          setNewPassword('');
                          setConfirmPassword('');
                        }}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* Personal Information */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Personal Information</h4>
            <div className="grid grid-cols-3 gap-4 bg-blue-50 p-4 rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-600">Last Name</label>
                <p>{pi.lastName || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">First Name</label>
                <p>{pi.firstName || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Middle Name</label>
                <p>{pi.middleName || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Sex</label>
                <p>{pi.sex || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Birthday</label>
                <p>{pi.birthday ? new Date(pi.birthday).toLocaleDateString() : 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Place of Birth</label>
                <p>{pi.placeOfBirth || 'N/A'}</p>
              </div>
              <div className="col-span-3">
                <label className="text-sm font-medium text-gray-600">Address</label>
                <p>{pi.address || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Phone Number</label>
                <p>{pi.phoneNumber || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-600">Email</label>
                <p>{pi.email || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Government IDs */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Government IDs</h4>
            <div className="grid grid-cols-3 gap-4 bg-green-50 p-4 rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-600">PhilHealth</label>
                <p className="font-mono text-sm">{pi.philhealth || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Pag-IBIG</label>
                <p className="font-mono text-sm">{pi.pagibig || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">TIN</label>
                <p className="font-mono text-sm">{pi.tin || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Contract History */}
          {user.contractHistory && user.contractHistory.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold mb-3 text-gray-700">
                Contract History ({user.contractHistory.length})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {user.contractHistory.map((contract, idx) => (
                  <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{contract.position}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(contract.startDate).toLocaleDateString()} - {new Date(contract.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        contract.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                        contract.status === 'EXPIRED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {contract.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default UserDetailsModal;