import { useState, useEffect } from 'react';
import { SkeletonTable, Spinner } from './ui.jsx';
import api from '../api.js';

function FinanceOfficerDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('salaryGrades');
  const [salaryGrades, setSalaryGrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loadingSalaryGrades, setLoadingSalaryGrades] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [savingForm, setSavingForm] = useState(false);
  const [editingSalaryGrade, setEditingSalaryGrade] = useState(null);
  const [salaryGradeForm, setSalaryGradeForm] = useState({
    grade: '',
    isSpecialSalaryGrade: false,
    basicSalary: '',
    grossPremium: '',
    deductions: {
      sss: '',
      pagibig: '',
      philhealth: '',
      drugTest: ''
    },
    monthlySalaryAsPerContract: '',
    dailySalaryAsPerContract: '',
    monthlyPremium: ''
  });

  const tabs = [
    { id: 'salaryGrades', name: 'Salary Grades' },
    { id: 'premiums', name: 'Premiums & Charging' }
  ];

  useEffect(() => {
    fetchSalaryGrades();
    fetchPositions();
  }, []);

  const fetchSalaryGrades = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions/salary-grades/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSalaryGrades(response.data);
    } catch (error) {
      console.error('Error fetching salary grades:', error);
    }
  };

  const fetchPositions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/positions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPositions(response.data);
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  // Auto-calculate fields when basic salary changes
  const handleBasicSalaryChange = (value) => {
    const basicSalary = parseFloat(value) || 0;
    
    if (salaryGradeForm.isSpecialSalaryGrade) {
      setSalaryGradeForm({
        ...salaryGradeForm,
        basicSalary: value
      });
    } else {
      const grossPremium = basicSalary * 0.20;
      
      const sss = parseFloat(salaryGradeForm.deductions.sss) || 0;
      const pagibig = parseFloat(salaryGradeForm.deductions.pagibig) || 0;
      const philhealth = parseFloat(salaryGradeForm.deductions.philhealth) || 0;
      const drugTest = parseFloat(salaryGradeForm.deductions.drugTest) || 0;
      
      const totalDeductions = sss + pagibig + philhealth + drugTest;
      const monthlySalaryAsPerContract = basicSalary + totalDeductions;
      const dailySalaryAsPerContract = monthlySalaryAsPerContract / 22;
      const monthlyPremium = grossPremium - totalDeductions;
      
      setSalaryGradeForm({
        ...salaryGradeForm,
        basicSalary: value,
        grossPremium: grossPremium.toFixed(2),
        monthlySalaryAsPerContract: monthlySalaryAsPerContract.toFixed(2),
        dailySalaryAsPerContract: dailySalaryAsPerContract.toFixed(2),
        monthlyPremium: monthlyPremium.toFixed(2)
      });
    }
  };

  const handleDeductionChange = (field, value) => {
    const updatedDeductions = {
      ...salaryGradeForm.deductions,
      [field]: value
    };
    
    if (!salaryGradeForm.isSpecialSalaryGrade) {
      const basicSalary = parseFloat(salaryGradeForm.basicSalary) || 0;
      const grossPremium = basicSalary * 0.20;
      
      const sss = parseFloat(updatedDeductions.sss) || 0;
      const pagibig = parseFloat(updatedDeductions.pagibig) || 0;
      const philhealth = parseFloat(updatedDeductions.philhealth) || 0;
      const drugTest = parseFloat(updatedDeductions.drugTest) || 0;
      
      const totalDeductions = sss + pagibig + philhealth + drugTest;
      const monthlySalaryAsPerContract = basicSalary + totalDeductions;
      const dailySalaryAsPerContract = monthlySalaryAsPerContract / 22;
      const monthlyPremium = grossPremium - totalDeductions;
      
      setSalaryGradeForm({
        ...salaryGradeForm,
        deductions: updatedDeductions,
        monthlySalaryAsPerContract: monthlySalaryAsPerContract.toFixed(2),
        dailySalaryAsPerContract: dailySalaryAsPerContract.toFixed(2),
        monthlyPremium: monthlyPremium.toFixed(2)
      });
    } else {
      setSalaryGradeForm({
        ...salaryGradeForm,
        deductions: updatedDeductions
      });
    }
  };

  const handleSalaryGradeSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      
      const payload = {
        ...salaryGradeForm,
        basicSalary: parseFloat(salaryGradeForm.basicSalary),
        grossPremium: parseFloat(salaryGradeForm.grossPremium) || 0,
        deductions: {
          sss: parseFloat(salaryGradeForm.deductions.sss) || 0,
          pagibig: parseFloat(salaryGradeForm.deductions.pagibig) || 0,
          philhealth: parseFloat(salaryGradeForm.deductions.philhealth) || 0,
          drugTest: parseFloat(salaryGradeForm.deductions.drugTest) || 0
        },
        monthlySalaryAsPerContract: parseFloat(salaryGradeForm.monthlySalaryAsPerContract),
        dailySalaryAsPerContract: parseFloat(salaryGradeForm.dailySalaryAsPerContract),
        monthlyPremium: parseFloat(salaryGradeForm.monthlyPremium) || 0
      };
      
      if (editingSalaryGrade) {
        await api.put(`/api/positions/salary-grades/${editingSalaryGrade._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Salary grade updated successfully!');
      } else {
        await api.post('/api/positions/salary-grades', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Salary grade created successfully!');
      }
      
      setEditingSalaryGrade(null);
      setSalaryGradeForm({
        grade: '',
        isSpecialSalaryGrade: false,
        basicSalary: '',
        grossPremium: '',
        deductions: {
          sss: '',
          pagibig: '',
          philhealth: '',
          drugTest: ''
        },
        monthlySalaryAsPerContract: '',
        dailySalaryAsPerContract: '',
        monthlyPremium: ''
      });
      fetchSalaryGrades();
    } catch (error) {
      alert('Error: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEditSalaryGrade = (sg) => {
    setEditingSalaryGrade(sg);
    setSalaryGradeForm({
      grade: sg.grade,
      isSpecialSalaryGrade: sg.isSpecialSalaryGrade,
      basicSalary: sg.basicSalary.toString(),
      grossPremium: sg.grossPremium.toString(),
      deductions: {
        sss: sg.deductions.sss.toString(),
        pagibig: sg.deductions.pagibig.toString(),
        philhealth: sg.deductions.philhealth.toString(),
        drugTest: sg.deductions.drugTest.toString()
      },
      monthlySalaryAsPerContract: sg.monthlySalaryAsPerContract.toString(),
      dailySalaryAsPerContract: sg.dailySalaryAsPerContract.toString(),
      monthlyPremium: sg.monthlyPremium.toString()
    });
  };

  const handleUpdatePositionCharging = async (positionId, charging) => {
    try {
      const token = localStorage.getItem('token');
      await api.put(`/api/positions/${positionId}`, 
        { charging }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Position updated successfully!');
      fetchPositions();
    } catch (error) {
      alert('Error updating position: ' + (error.response?.data?.message || error.message));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-gray-900">Finance Officer Dashboard</h2>
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

      {activeTab === 'salaryGrades' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-xl font-bold mb-4">
              {editingSalaryGrade ? 'Edit Salary Grade' : 'Add Salary Grade'}
            </h3>
            <form onSubmit={handleSalaryGradeSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Salary Grade</label>
                  <input
                    type="text"
                    value={salaryGradeForm.grade}
                    onChange={(e) => setSalaryGradeForm({...salaryGradeForm, grade: e.target.value})}
                    className="input"
                    placeholder="e.g., 1, 6.5, 24"
                    required
                    disabled={editingSalaryGrade}
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={salaryGradeForm.isSpecialSalaryGrade}
                    onChange={(e) => setSalaryGradeForm({...salaryGradeForm, isSpecialSalaryGrade: e.target.checked})}
                    className="mr-2"
                  />
                  <label className="text-sm">Special Salary Grade (No Premium)</label>
                </div>
              </div>

              <div className="border-t pt-4">
                <h5 className="font-semibold mb-3">A. Basic Salary</h5>
                <input
                  type="number"
                  step="0.01"
                  value={salaryGradeForm.basicSalary}
                  onChange={(e) => handleBasicSalaryChange(e.target.value)}
                  className="input"
                  placeholder="Enter basic salary"
                  required
                />
              </div>

              {!salaryGradeForm.isSpecialSalaryGrade && (
                <>
                  <div className="border-t pt-4">
                    <h5 className="font-semibold mb-3">B. Gross Premium (20% of Basic Salary)</h5>
                    <input
                      type="number"
                      step="0.01"
                      value={salaryGradeForm.grossPremium}
                      className="input bg-gray-50"
                      readOnly
                    />
                  </div>

                  <div className="border-t pt-4">
                    <h5 className="font-semibold mb-3">C. Deductions</h5>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">SSS</label>
                        <input
                          type="number"
                          step="0.01"
                          value={salaryGradeForm.deductions.sss}
                          onChange={(e) => handleDeductionChange('sss', e.target.value)}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Pag-IBIG</label>
                        <input
                          type="number"
                          step="0.01"
                          value={salaryGradeForm.deductions.pagibig}
                          onChange={(e) => handleDeductionChange('pagibig', e.target.value)}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">PhilHealth</label>
                        <input
                          type="number"
                          step="0.01"
                          value={salaryGradeForm.deductions.philhealth}
                          onChange={(e) => handleDeductionChange('philhealth', e.target.value)}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Drug Test</label>
                        <input
                          type="number"
                          step="0.01"
                          value={salaryGradeForm.deductions.drugTest}
                          onChange={(e) => handleDeductionChange('drugTest', e.target.value)}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4 bg-blue-50 p-4 rounded">
                    <h5 className="font-semibold mb-3">Computed Fields</h5>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">D. Monthly Salary as per Contract</label>
                        <input
                          type="text"
                          value={`₱${parseFloat(salaryGradeForm.monthlySalaryAsPerContract || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}`}
                          className="input bg-white"
                          readOnly
                        />
                        <p className="text-xs text-gray-600 mt-1">Basic Salary + Deductions</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">E. Daily Salary as per Contract</label>
                        <input
                          type="text"
                          value={`₱${parseFloat(salaryGradeForm.dailySalaryAsPerContract || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}`}
                          className="input bg-white"
                          readOnly
                        />
                        <p className="text-xs text-gray-600 mt-1">Monthly Salary ÷ 22</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">F. Monthly Premium</label>
                        <input
                          type="text"
                          value={`₱${parseFloat(salaryGradeForm.monthlyPremium || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}`}
                          className="input bg-white"
                          readOnly
                        />
                        <p className="text-xs text-gray-600 mt-1">Gross Premium - Deductions</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {salaryGradeForm.isSpecialSalaryGrade && (
                <div className="bg-yellow-50 p-4 rounded">
                  <p className="text-sm text-yellow-800">
                    ℹ️ Special Salary Grade: No premium calculation. Only basic salary is required.
                  </p>
                </div>
              )}

              <div className="flex space-x-3">
                <button type="submit" className="btn btn-primary">
                  {editingSalaryGrade ? 'Update' : 'Create'} Salary Grade
                </button>
                {editingSalaryGrade && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSalaryGrade(null);
                      setSalaryGradeForm({
                        grade: '',
                        isSpecialSalaryGrade: false,
                        basicSalary: '',
                        grossPremium: '',
                        deductions: {
                          sss: '',
                          pagibig: '',
                          philhealth: '',
                          drugTest: ''
                        },
                        monthlySalaryAsPerContract: '',
                        dailySalaryAsPerContract: '',
                        monthlyPremium: ''
                      });
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h3 className="text-xl font-bold mb-4">Salary Grades List</h3>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Basic Salary</th>
                    <th>Gross Premium</th>
                    <th>Total Deductions</th>
                    <th>Monthly Salary</th>
                    <th>Daily Salary</th>
                    <th>Monthly Premium</th>
                    <th>Type</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryGrades.map(sg => {
                    const basicSalary = sg.basicSalary || 0;
                    const grossPremium = sg.grossPremium || 0;
                    const deductions = sg.deductions || { sss: 0, pagibig: 0, philhealth: 0, drugTest: 0 };
                    const totalDeductions = (deductions.sss || 0) + (deductions.pagibig || 0) + (deductions.philhealth || 0) + (deductions.drugTest || 0);
                    const monthlySalary = sg.monthlySalaryAsPerContract || 0;
                    const dailySalary = sg.dailySalaryAsPerContract || 0;
                    const monthlyPremium = sg.monthlyPremium || 0;
                    
                    return (
                      <tr key={sg._id}>
                        <td className="font-semibold">{sg.grade}</td>
                        <td>₱{basicSalary.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td>₱{grossPremium.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td>₱{totalDeductions.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td>₱{monthlySalary.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td>₱{dailySalary.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td>₱{monthlyPremium.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        <td>
                          {sg.isSpecialSalaryGrade ? (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                              Special
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                              Regular
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => handleEditSalaryGrade(sg)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'premiums' && (
        <div className="card">
          <h3 className="text-xl font-bold mb-4">Position Charging Management</h3>
          <p className="text-sm text-gray-600 mb-4">
            Note: Final premium is automatically calculated based on contract period, working days, and holidays.
          </p>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Salary Grade</th>
                  <th>Monthly Premium</th>
                  <th>Charging</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(position => {
                  const salaryGrade = salaryGrades.find(sg => sg.grade == position.salaryGrade);
                  return (
                    <tr key={position._id}>
                      <td className="font-medium">{position.title}</td>
                      <td>Grade {position.salaryGrade}</td>
                      <td>
                        {salaryGrade ? (
                          <span>₱{salaryGrade.monthlyPremium.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="text"
                          defaultValue={position.charging}
                          onBlur={(e) => {
                            if (e.target.value !== position.charging) {
                              handleUpdatePositionCharging(position._id, e.target.value);
                            }
                          }}
                          className="input text-sm"
                          placeholder="e.g., General Appropriations Act"
                        />
                      </td>
                      <td>
                        <span className="text-xs text-gray-500">Auto-save on blur</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default FinanceOfficerDashboard;