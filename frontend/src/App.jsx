import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginForm from './components/LoginForm';
import Layout from './components/Layout';
import ForcePasswordChange from './components/ForcePasswordChange';
import AdminDashboard from './components/AdminDashboard';
import ContractualDashboard from './components/ContractualDashboard';
import FocalPersonDashboard from './components/FocalPersonDashboard';
import FinanceOfficerDashboard from './components/FinanceOfficerDashboard';
import { ToastProvider } from './components/ui.jsx';
import { clearCache } from './api.js';
import { useInactivityLogout } from './hooks/useInactivityLogout';
import InactivityWarningModal from './components/InactivityWarningModal';

// Auto-logout after this much inactivity. A warning modal appears
// WARNING_MS before the logout actually happens, giving the user a
// chance to stay signed in.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_MS = 60 * 1000; // 60-second warning

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

  const handlePasswordChanged = () => {
    const updated = { ...user, mustChangePassword: false };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  const { showWarning, secondsLeft, stayLoggedIn } = useInactivityLogout({
    enabled: !!user,
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: WARNING_MS,
    onLogout: handleLogout,
  });

  return (
  <ToastProvider>
    <InactivityWarningModal
      open={showWarning}
      secondsLeft={secondsLeft}
      onStay={stayLoggedIn}
      onLogoutNow={handleLogout}
    />
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
              user.mustChangePassword ? (
                <ForcePasswordChange onChanged={handlePasswordChanged} onLogout={handleLogout} />
              ) : user.role === 'ADMINISTRATOR' ? (
                <Layout user={user} onLogout={handleLogout} fullWidth={true}>
                  <AdminDashboard user={user} />
                </Layout>
              ) : user.role === 'CONTRACTUAL' || user.role === 'FOCAL_PERSON' || user.role === 'FINANCE_OFFICER' ? (
                // Contractual, Focal Person, and Finance Officer all use the
                // same fixed-sidebar layout pattern as Admin (fullWidth=true
                // disables Layout's own max-width container/padding so the
                // dashboard's own sidebar can sit flush against the nav bar).
                <Layout user={user} onLogout={handleLogout} fullWidth={true}>
                  {user.role === 'CONTRACTUAL' && <ContractualDashboard user={user} />}
                  {user.role === 'FOCAL_PERSON' && <FocalPersonDashboard user={user} />}
                  {user.role === 'FINANCE_OFFICER' && <FinanceOfficerDashboard user={user} />}
                </Layout>
              ) : (
                <Layout user={user} onLogout={handleLogout} fullWidth={false}>
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