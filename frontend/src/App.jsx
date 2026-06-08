import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import ContractualDashboard from './components/ContractualDashboard';
import FocalPersonDashboard from './components/FocalPersonDashboard';
import FinanceOfficerDashboard from './components/FinanceOfficerDashboard';

function App() {
  const [user, setUser] = useState(() => {
    // Initialize from localStorage
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  // Listen for user updates (like profile photo changes)
  useEffect(() => {
    const handleUserUpdate = () => {
      const userData = localStorage.getItem('user');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        console.log('App.jsx: User updated from localStorage', parsedUser);
        
        // Force re-render by creating new object reference
        setUser(prev => ({ ...parsedUser }));
      }
    };

    // Listen for custom event
    window.addEventListener('userUpdated', handleUserUpdate);
    
    // Listen for storage changes (from other tabs/windows)
    window.addEventListener('storage', handleUserUpdate);
    
    // Listen for profile photo updates
    window.addEventListener('profilePhotoUpdated', handleUserUpdate);

    return () => {
      window.removeEventListener('userUpdated', handleUserUpdate);
      window.removeEventListener('storage', handleUserUpdate);
      window.removeEventListener('profilePhotoUpdated', handleUserUpdate);
    };
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={
            user ? <Navigate to="/" /> : <LoginForm onLogin={handleLogin} />
          } 
        />
        
        <Route
          path="/"
          element={
            user ? (
              user.role === 'ADMINISTRATOR' ? (
                <Layout user={user} onLogout={handleLogout} fullWidth={true}>
                  <AdminDashboard user={user} />
                </Layout>
              ) : (
                <Layout user={user} onLogout={handleLogout} fullWidth={false}>
                  {user.role === 'CONTRACTUAL' && <ContractualDashboard user={user} />}
                  {user.role === 'FOCAL_PERSON' && <FocalPersonDashboard user={user} />}
                  {user.role === 'FINANCE_OFFICER' && <FinanceOfficerDashboard user={user} />}
                </Layout>
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;