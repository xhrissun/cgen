import { useState } from 'react';

function PositionDetailsModal({ position, onClose }) {
  if (!position) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h3 className="text-xl font-bold">Position Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-600">Position Code</label>
                <p className="font-mono font-semibold text-lg">{position.positionCode}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Position Title</label>
                <p className="font-semibold">{position.title}</p>
              </div>
              {position.description && (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-600">Description</label>
                  <p>{position.description}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-600">Salary Grade</label>
                <p className="font-semibold">
                  {position.isSpecialSalaryGrade ? (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
                      Special: Grade {position.salaryGrade}
                    </span>
                  ) : (
                    `Grade ${position.salaryGrade}`
                  )}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Place of Assignment</label>
                <p>{position.placeOfAssignment || 'Not specified'}</p>
              </div>
              {position.charging && (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-600">Charging</label>
                  <p>{position.charging}</p>
                </div>
              )}
            </div>
          </div>

          {/* Duties and Responsibilities */}
          {position.dutiesAndResponsibilities && position.dutiesAndResponsibilities.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold mb-3 text-gray-700">Duties and Responsibilities</h4>
              <div className="bg-blue-50 p-4 rounded-lg">
                <ol className="list-decimal list-inside space-y-2">
                  {position.dutiesAndResponsibilities.map((duty, idx) => (
                    <li key={idx} className="text-sm">{duty}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* Assigned Clauses */}
          <div>
            <h4 className="text-lg font-semibold mb-3 text-gray-700">
              Assigned Clauses ({position.assignedClauses?.length || 0})
            </h4>
            {position.assignedClauses && position.assignedClauses.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {position.assignedClauses.map((clause, idx) => (
                  <div key={idx} className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          Clause {clause.clauseNumber}: {clause.title || 'Untitled'}
                        </div>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {clause.content}
                        </p>
                      </div>
                      {clause.clauseType && clause.clauseType !== 'NORMAL' && (
                        <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {clause.clauseType}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No clauses assigned</p>
            )}
          </div>

          {/* Premium Information */}
          {position.premium?.hasMonthlyPremium && (
            <div>
              <h4 className="text-lg font-semibold mb-3 text-gray-700">Premium Information</h4>
              <div className="grid grid-cols-2 gap-4 bg-green-50 p-4 rounded-lg">
                <div>
                  <label className="text-sm font-medium text-gray-600">Premium Rate</label>
                  <p className="font-semibold">{position.premium.premiumRate}%</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Premium Amount</label>
                  <p className="font-semibold">
                    ₱{position.premium.premiumAmount?.toLocaleString('en-PH', {minimumFractionDigits: 2})}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <label className="font-medium">Created By:</label>
                <p>{position.createdBy?.username || 'System'}</p>
              </div>
              <div>
                <label className="font-medium">Created At:</label>
                <p>{new Date(position.createdAt).toLocaleString()}</p>
              </div>
            </div>
          </div>
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

export default PositionDetailsModal;