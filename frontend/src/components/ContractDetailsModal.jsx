import { useState } from 'react';
import axios from 'axios';

function ContractDetailsModal({ contract, onClose }) {
  const [previewingPDF, setPreviewingPDF] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  if (!contract) return null;

  const handlePreviewPDF = async () => {
    setLoadingPreview(true);
    setPreviewingPDF(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/contracts/${contract._id}/generate`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      setPdfBlob(URL.createObjectURL(blob));
    } catch (error) {
      alert('Error generating preview: ' + (error.response?.data?.message || error.message));
      setPreviewingPDF(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const user = contract.userId?.personalInfo;
  const fullName = user && user.lastName && user.firstName
    ? `${user.lastName}, ${user.firstName}${user.middleName ? ' ' + user.middleName : ''}`
    : user?.lastName || user?.firstName || 'N/A';

  if (previewingPDF) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col z-50">
        <div className="bg-white px-6 py-4 flex justify-between items-center">
          <h3 className="text-xl font-bold">PDF Preview - {contract.contractNumber}</h3>
          <button
            onClick={() => {
              setPreviewingPDF(false);
              if (pdfBlob) URL.revokeObjectURL(pdfBlob);
              setPdfBlob(null);
            }}
            className="text-gray-600 hover:text-gray-800 text-2xl"
          >
            × Close Preview
          </button>
        </div>
        <div className="flex-1 bg-gray-100">
          {loadingPreview ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Generating PDF preview...</p>
              </div>
            </div>
          ) : pdfBlob ? (
            <iframe
              src={pdfBlob}
              className="w-full h-full"
              title="PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-red-600">Failed to load PDF preview</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold">{contract.contractNumber}</h3>
            <p className="text-sm text-gray-600">{fullName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Quick Actions */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <button
              onClick={handlePreviewPDF}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 mr-2"
            >
              📄 Preview PDF
            </button>
          </div>

          {/* Contract Information */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Contract Information</h4>
            <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-600">Contract Number</label>
                <p className="font-mono font-semibold">{contract.contractNumber}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Mode</label>
                <p>{contract.mode}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Status</label>
                <p>
                  <span className={`px-2 py-1 rounded text-xs ${
                    contract.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                    contract.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                    contract.status === 'EXPIRED' ? 'bg-red-100 text-red-800' :
                    contract.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                    contract.status === 'CANCELLED' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {contract.status}
                  </span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Year / Semester</label>
                <p>{contract.year} - {contract.semester === 1 ? 'First' : 'Second'} Semester</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Start Date</label>
                <p>{new Date(contract.startDate).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">End Date</label>
                <p>{new Date(contract.endDate).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Position Details */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Position Details</h4>
            <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-600">Position</label>
                <p className="font-semibold">{contract.position}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Place of Assignment</label>
                <p>{contract.placeOfAssignment}</p>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-600">Charging</label>
                <p>{contract.charging}</p>
              </div>
            </div>
          </div>

          {/* Salary Information */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Salary Information</h4>
            <div className="bg-green-50 p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Salary Grade</label>
                  <p className="font-semibold">
                    {contract.isSpecialSalaryGrade ? (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
                        SG {contract.salaryGrade} (Special)
                      </span>
                    ) : (
                      `SG ${contract.salaryGrade}`
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Basic Salary</label>
                  <p className="font-bold text-lg">
                    ₱{contract.basicSalary.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
              </div>

              {!contract.isSpecialSalaryGrade && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-600">Monthly Salary (Contract)</label>
                      <p className="font-semibold">
                        ₱{contract.monthlySalaryAsPerContract.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Daily Salary (Contract)</label>
                      <p className="font-semibold">
                        ₱{contract.dailySalaryAsPerContract.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Monthly Premium</label>
                      <p className="font-semibold">
                        ₱{contract.monthlyPremium.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">{contract.bonusType} Premium</label>
                      <p className="font-bold text-lg text-green-900">
                        ₱{contract.finalPremium?.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}
                      </p>
                    </div>
                  </div>

                  {contract.premiumSummary && (
                    <div className="border-t pt-3 mt-3">
                      <label className="text-sm font-medium text-gray-600 block mb-2">Premium Calculation Summary</label>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div className="bg-white p-2 rounded">
                          <p className="text-gray-600 text-xs">Total Months</p>
                          <p className="font-semibold">{contract.premiumSummary.totalMonths}</p>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <p className="text-gray-600 text-xs">Full Months</p>
                          <p className="font-semibold">{contract.premiumSummary.fullMonths}</p>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <p className="text-gray-600 text-xs">Partial Months</p>
                          <p className="font-semibold">{contract.premiumSummary.partialMonths}</p>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <p className="text-gray-600 text-xs">Working Days</p>
                          <p className="font-semibold">{contract.premiumSummary.totalWorkingDays}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Deductions */}
          {!contract.isSpecialSalaryGrade && contract.deductions && (
            <div>
              <h4 className="text-lg font-semibold mb-3 text-gray-700">Deductions</h4>
              <div className="grid grid-cols-5 gap-3 bg-red-50 p-4 rounded-lg">
                <div>
                  <label className="text-xs text-gray-600">SSS</label>
                  <p className="font-semibold">
                    ₱{contract.deductions.sss.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Pag-IBIG</label>
                  <p className="font-semibold">
                    ₱{contract.deductions.pagibig.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-600">PhilHealth</label>
                  <p className="font-semibold">
                    ₱{contract.deductions.philhealth.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
                <div className="border-l pl-3">
                  <label className="text-xs text-gray-600">Total</label>
                  <p className="font-bold text-red-900">
                    ₱{contract.deductions.total.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Duties */}
          {contract.dutiesAndResponsibilities && contract.dutiesAndResponsibilities.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold mb-3 text-gray-700">
                Duties and Responsibilities ({contract.dutiesAndResponsibilities.length})
              </h4>
              <div className="bg-purple-50 p-4 rounded-lg max-h-48 overflow-y-auto">
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  {contract.dutiesAndResponsibilities.map((duty, idx) => (
                    <li key={idx}>{duty}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* Signatories */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Signatories</h4>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg text-sm">
              <div>
                <label className="font-medium text-gray-600">First Party</label>
                <p>{contract.signatories.firstParty.name}</p>
                <p className="text-xs text-gray-500">{contract.signatories.firstParty.position}</p>
              </div>
              <div>
                <label className="font-medium text-gray-600">Approver</label>
                <p>{contract.signatories.approver.name}</p>
                <p className="text-xs text-gray-500">{contract.signatories.approver.position}</p>
              </div>
              <div>
                <label className="font-medium text-gray-600">Accountant</label>
                <p>{contract.signatories.accountant.name}</p>
                <p className="text-xs text-gray-500">{contract.signatories.accountant.position}</p>
              </div>
              <div>
                <label className="font-medium text-gray-600">Finance Chief</label>
                <p>{contract.signatories.financeChief.name}</p>
                <p className="text-xs text-gray-500">{contract.signatories.financeChief.position}</p>
              </div>
            </div>
          </div>

          {/* Signed Contract */}
          {contract.signedContractFile && (
            <div className="bg-green-100 p-4 rounded-lg">
              <label className="font-medium text-green-900 block mb-2">✓ Signed Contract Available</label>
              <p className="text-sm text-green-700">
                Uploaded: {new Date(contract.signedContractFile.uploadedAt).toLocaleString()}
              </p>
            </div>
          )}

          {/* Archive Status */}
          {contract.isArchived && (
            <div className="bg-orange-100 p-4 rounded-lg">
              <label className="font-medium text-orange-900 block">📦 Archived Contract</label>
              <p className="text-sm text-orange-700">
                Archived on: {new Date(contract.archivedAt).toLocaleString()}
              </p>
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

export default ContractDetailsModal;