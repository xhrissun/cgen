// FILE: cgen-main/frontend/src/components/WellnessLeaveScanApprove.jsx
//
// Landing page for the QR code printed on the Wellness Leave A5 form
// (see backend/routes/wellnessLeave.js GET .../form). An administrator
// scans the code with their phone AFTER the paper has been physically
// signed by the employee, recommended by the supervisor, and approved by
// the Assistant Regional Director for Management Services — all on the
// same paper, in one signing round. Scanning here is what logs both the
// supervisor's recommendation and the ARDMS approval in the system in a
// single action and deducts the credit.

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Leaf, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import api from '../api.js';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

function WellnessLeaveScanApprove({ user }) {
  const { id, token } = useParams();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [done, setDone] = useState(false);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchApplication = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/wellness-leave/applications/scan/${id}/${token}`, { headers: authHeaders() });
      setApplication(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load this Wellness Leave application.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApplication(); /* eslint-disable-next-line */ }, [id, token]);

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await api.post(`/api/wellness-leave/applications/${id}/scan-approve`, { token }, { headers: authHeaders() });
      setApplication(res.data);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve this application.');
    } finally {
      setApproving(false);
    }
  };

  if (!user || user.role !== 'ADMINISTRATOR') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-lg shadow border border-gray-200 p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Administrator Access Required</h2>
          <p className="text-sm text-gray-600 mb-4">Log in as an Administrator to scan and approve Wellness Leave forms.</p>
          <Link to="/login" className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">Go to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Leaf className="w-6 h-6 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900">Wellness Leave Verification</h2>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading application…</p>}

        {!loading && error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && application && (
          <div className="space-y-4">
            <div className="text-sm space-y-1">
              <p><span className="text-gray-500">Application No.:</span> <span className="font-mono">{application.applicationNumber}</span></p>
              <p><span className="text-gray-500">Employee:</span> {application.employeeSnapshot?.fullName}</p>
              <p><span className="text-gray-500">Position:</span> {application.employeeSnapshot?.position}</p>
              <p><span className="text-gray-500">Place of Assignment:</span> {application.employeeSnapshot?.placeOfAssignment}</p>
              <p><span className="text-gray-500">Inclusive Dates:</span> {formatDate(application.startDate)} – {formatDate(application.endDate)}</p>
              <p><span className="text-gray-500">Days Requested:</span> {application.daysRequested}</p>
              <p><span className="text-gray-500">Status:</span> <span className="font-medium">{application.status}</span></p>
              {application.supervisor?.action && (
                <p><span className="text-gray-500">Supervisor:</span> {application.supervisor.action} by {application.supervisor.name}</p>
              )}
            </div>

            {application.status === 'APPROVED' ? (
              <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-md p-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-700">
                  {done ? 'Approval logged successfully. The credit has been deducted.' : 'This application was already marked as approved.'}
                </p>
              </div>
            ) : !['PENDING', 'RECOMMENDED'].includes(application.status) ? (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">This application has status "{application.status}" and can no longer be approved here.</p>
              </div>
            ) : (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="w-full px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {approving ? 'Approving…' : 'Confirm Approval (Supervisor & ARDMS Signed)'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default WellnessLeaveScanApprove;