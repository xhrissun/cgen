import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import ContractualDashboard from './components/ContractualDashboard';
import FocalPersonDashboard from './components/FocalPersonDashboard';
import FinanceOfficerDashboard from './components/FinanceOfficerDashboard';
import { ToastProvider } from './components/ui.jsx';
import { clearCache } from './api.js';

function App() {
  const [user, setUser] = useState(() => {
    // Initialize from localStorage
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  // No async loading needed — localStorage is synchronous.
  // user is already initialised from localStorage in the useState above.

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
    clearCache();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
  <ToastProvider>
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
              ) : user.role === 'CONTRACTUAL' || user.role === 'FOCAL_PERSON' ? (
                // Contractual and Focal Person now use the same fixed-sidebar
                // layout pattern as Admin (fullWidth=true disables Layout's
                // own max-width container/padding so the dashboard's own
                // sidebar can sit flush against the nav bar).
                <Layout user={user} onLogout={handleLogout} fullWidth={true}>
                  {user.role === 'CONTRACTUAL' && <ContractualDashboard user={user} />}
                  {user.role === 'FOCAL_PERSON' && <FocalPersonDashboard user={user} />}
                </Layout>
              ) : (
                <Layout user={user} onLogout={handleLogout} fullWidth={false}>
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
  </ToastProvider>
  );
}

export default App;