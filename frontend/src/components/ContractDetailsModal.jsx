import { useState } from 'react';
import api from '../api.js';

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
      const response = await api.get(`/api/contracts/${contract._id}/generate`, {
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
            <div className="bg-green-50 p-4 rounded-lg space-y-4">

              {/* ── Salary Summary Grid ── */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">Salary Grade</label>
                  <p className="font-semibold">
                    {contract.isSpecialSalaryGrade
                      ? <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-sm">SG {contract.salaryGrade} (Special)</span>
                      : `SG ${contract.salaryGrade}`
                    }
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">Basic Salary</label>
                  <p className="font-bold text-base">
                    ₱{contract.basicSalary.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                {!contract.isSpecialSalaryGrade && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Monthly Salary (Contract)</label>
                      <p className="font-semibold">
                        ₱{contract.monthlySalaryAsPerContract.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Daily Salary (Contract)</label>
                      <p className="font-semibold">
                        ₱{contract.dailySalaryAsPerContract.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">Monthly Premium</label>
                      <p className="font-semibold">
                        ₱{contract.monthlyPremium.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide">{contract.bonusType} Premium</label>
                      <p className="font-bold text-base text-green-700">
                        ₱{contract.finalPremium?.toLocaleString('en-PH', { minimumFractionDigits: 2 }) || '0.00'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {!contract.isSpecialSalaryGrade && (
                <>
                  {/* ── Summary Counts ── */}
                  {contract.premiumSummary && (
                    <div className="pt-3 border-t border-green-200">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Premium Calculation Summary</p>
                      <div className="grid grid-cols-4 gap-3 text-center">
                        {[
                          { label: 'Total Months',   value: contract.premiumSummary.totalMonths },
                          { label: 'Full Months',    value: contract.premiumSummary.fullMonths },
                          { label: 'Partial Months', value: contract.premiumSummary.partialMonths },
                          { label: 'Working Days',   value: contract.premiumSummary.totalWorkingDays, highlight: true }
                        ].map(({ label, value, highlight }) => (
                          <div key={label} className="bg-white rounded p-2 shadow-sm">
                            <p className="text-xs text-gray-500">{label}</p>
                            <p className={`text-lg font-bold ${highlight ? 'text-blue-600' : ''}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Per-Month Breakdown Table ── */}
                  {contract.workingDaysBreakdown && contract.workingDaysBreakdown.length > 0 && (
                    <div className="pt-3 border-t border-green-200">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Monthly Premium Breakdown</p>
                      <div className="overflow-x-auto rounded border border-green-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-green-100 text-gray-600 text-xs uppercase tracking-wide">
                              <th className="text-left px-3 py-2">Month</th>
                              <th className="text-center px-3 py-2">Type</th>
                              <th className="text-center px-3 py-2">Working Days<br/><span className="font-normal normal-case">(in month / in range)</span></th>
                              <th className="text-right px-3 py-2">Daily Rate</th>
                              <th className="text-right px-3 py-2">Premium</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contract.workingDaysBreakdown.map((m, idx) => (
                              <>
                                <tr key={m.monthKey} className={idx % 2 === 0 ? 'bg-white' : 'bg-green-50'}>
                                  <td className="px-3 py-2 font-medium">{m.monthName} {m.year}</td>
                                  <td className="px-3 py-2 text-center">
                                    {m.isFullMonth
                                      ? <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Full</span>
                                      : <span className="inline-block px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">Partial</span>
                                    }
                                  </td>
                                  <td className="px-3 py-2 text-center text-gray-700">
                                    {m.totalWorkingDaysInMonth} / {m.actualWorkingDaysInRange}
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-700">
                                    ₱{(m.dailyPremiumRate || 0).toLocaleString('en-PH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold">
                                    ₱{(m.calculatedPremium || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>

                                {/* Holiday sub-row */}
                                {m.holidaysInMonth && m.holidaysInMonth.length > 0 && (
                                  <tr key={`${m.monthKey}-hols`} className={idx % 2 === 0 ? 'bg-white' : 'bg-green-50'}>
                                    <td colSpan={5} className="px-3 pb-2 pt-0">
                                      <div className="flex flex-wrap gap-1 pl-1">
                                        {m.holidaysInMonth.map(h => {
                                          const labelColor =
                                            h.type === 'REGULAR'
                                              ? 'bg-red-100 text-red-700'
                                              : h.type === 'SPECIAL_NON_WORKING'
                                              ? 'bg-orange-100 text-orange-700'
                                              : 'bg-blue-100 text-blue-700';
                                          const typeLabel =
                                            h.type === 'REGULAR' ? 'Regular'
                                            : h.type === 'SPECIAL_NON_WORKING' ? 'Special Non-Working'
                                            : 'Special Working';
                                          return (
                                            <span
                                              key={h.date}
                                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${labelColor}`}
                                            >
                                              🗓️ {new Date(h.date + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })} — {h.name}
                                              <span className="opacity-60">({typeLabel})</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-green-200 font-bold text-sm">
                              <td className="px-3 py-2" colSpan={2}>TOTAL</td>
                              <td className="px-3 py-2 text-center">{contract.premiumSummary?.totalWorkingDays} days</td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2 text-right text-green-800">
                                ₱{contract.finalPremium?.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ── Holiday Legend ── */}
                  {contract.workingDaysBreakdown?.some(m => m.holidaysInMonth?.length > 0) && (
                    <div className="pt-3 border-t border-green-200">
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span> Regular Holiday (excluded from working days)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span> Special Non-Working (excluded)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span> Special Working (counted)</span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-green-200">
                    <p className="text-xs text-gray-500">
                      ℹ️ Partial-month premium = (Monthly Premium ÷ Total Working Days in Month) × Actual Working Days in Range.
                      Full-month premium = Monthly Premium Rate. Excludes weekends, regular holidays, and special non-working holidays.
                    </p>
                  </div>
                </>
              )}

              {contract.isSpecialSalaryGrade && (
                <div className="mt-2">
                  <p className="text-sm text-yellow-800 bg-yellow-100 p-2 rounded">
                    ⚠️ Special Salary Grade: No premium was calculated for this contract.
                  </p>
                </div>
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