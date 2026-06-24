// FILE: cgen-main/frontend/src/components/SalaryGradeDetailsModal.jsx

function SalaryGradeDetailsModal({ salaryGrade, onClose }) {
  if (!salaryGrade) return null;

  const deductions = salaryGrade.deductions || { sss: 0, pagibig: 0, philhealth: 0 };
  const totalDeductions = (deductions.sss || 0) + (deductions.pagibig || 0) + (deductions.philhealth || 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h3 className="text-xl font-bold">Salary Grade {salaryGrade.grade} Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Grade Type */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Grade Type</h4>
            <div className="bg-gray-50 p-4 rounded-lg">
              {salaryGrade.isSpecialSalaryGrade ? (
                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                    Special Salary Grade
                  </span>
                  <span className="text-sm text-gray-600">No premium calculation</span>
                </div>
              ) : (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  Regular Salary Grade
                </span>
              )}
            </div>
          </div>

          {/* Basic Salary */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">A. Basic Salary</h4>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-3xl font-bold text-blue-900">
                ₱{salaryGrade.basicSalary.toLocaleString('en-PH', {minimumFractionDigits: 2})}
              </p>
            </div>
          </div>

          {!salaryGrade.isSpecialSalaryGrade && (
            <>
              {/* Gross Premium */}
              <div>
                <h4 className="text-lg font-semibold mb-3 text-gray-700">B. Gross Premium (15% of Basic Salary)</h4>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-2xl font-bold text-green-900">
                    ₱{salaryGrade.grossPremium.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                  </p>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <h4 className="text-lg font-semibold mb-3 text-gray-700">C. Deductions</h4>
                <div className="bg-red-50 p-4 rounded-lg space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-700">SSS:</span>
                      <span className="font-semibold">
                        ₱{deductions.sss.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-700">Pag-IBIG:</span>
                      <span className="font-semibold">
                        ₱{deductions.pagibig.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-gray-700">PhilHealth:</span>
                      <span className="font-semibold">
                        ₱{deductions.philhealth.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                      </span>
                    </div>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold text-red-900">
                    <span>Total Deductions:</span>
                    <span>₱{totalDeductions.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>

              {/* Computed Fields */}
              <div>
                <h4 className="text-lg font-semibold mb-3 text-gray-700">Computed Fields</h4>
                <div className="bg-purple-50 p-4 rounded-lg space-y-4">
                  <div className="border-b pb-3">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <p className="font-medium text-gray-700">D. Monthly Salary as per Contract</p>
                        <p className="text-xs text-gray-500">Basic Salary + Deductions</p>
                      </div>
                      <p className="text-xl font-bold text-purple-900">
                        ₱{salaryGrade.monthlySalaryAsPerContract.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                      </p>
                    </div>
                  </div>
                  
                  <div className="border-b pb-3">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <p className="font-medium text-gray-700">E. Daily Salary as per Contract</p>
                        <p className="text-xs text-gray-500">Monthly Salary ÷ 22 days</p>
                      </div>
                      <p className="text-xl font-bold text-purple-900">
                        ₱{salaryGrade.dailySalaryAsPerContract.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <p className="font-medium text-gray-700">F. Monthly Premium</p>
                        <p className="text-xs text-gray-500">Gross Premium - Deductions</p>
                      </div>
                      <p className="text-xl font-bold text-purple-900">
                        ₱{salaryGrade.monthlyPremium.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Calculation Formula */}
              <div className="bg-gray-100 p-4 rounded-lg text-sm space-y-2">
                <p className="font-semibold text-gray-700">💡 Calculation Formula:</p>
                <ul className="space-y-1 text-gray-600">
                  <li>• Gross Premium = Basic Salary × 15%</li>
                  <li>• Monthly Salary = Basic Salary + Total Deductions</li>
                  <li>• Daily Salary = Monthly Salary ÷ 22 working days</li>
                  <li>• Monthly Premium = Gross Premium - Total Deductions</li>
                </ul>
              </div>
            </>
          )}

          {salaryGrade.isSpecialSalaryGrade && (
            <div className="bg-yellow-100 p-4 rounded-lg text-sm text-yellow-800">
              <p className="font-semibold mb-1">ℹ️ Special Salary Grade Notice</p>
              <p>This is a special salary grade with no premium calculation. Only the basic salary applies to contracts using this grade.</p>
            </div>
          )}

          {/* Period Info */}
          {salaryGrade.periodStartDate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800 uppercase tracking-wide mb-2">📅 Salary Grade Period</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Start Date</span>
                  <p className="font-semibold text-gray-800">
                    {new Date(salaryGrade.periodStartDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">End Date</span>
                  <p className="font-semibold text-gray-800">
                    {salaryGrade.periodEndDate
                      ? new Date(salaryGrade.periodEndDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
                      : 'Open (currently active)'}
                  </p>
                </div>
                {salaryGrade.periodLabel && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Period Label</span>
                    <p className="font-semibold text-gray-800">{salaryGrade.periodLabel}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-blue-600 mt-2">
                Contracts with a start date within this period will use these rates.
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

export default SalaryGradeDetailsModal;