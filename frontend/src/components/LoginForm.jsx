import { useState, useEffect } from 'react';
import { API_BASE } from '../api.js';

// ── Auth Loading Modal ────────────────────────────────────────────────────────
// Overlays the login page during the actual fetch. Shows three discrete states:
//   'authenticating' → waiting for POST /api/auth/login
//   'success'        → 200 OK; about to redirect
//   'error'          → non-OK response or network failure
function AuthLoadingModal({ stage, message }) {
  if (!stage) return null;

  const stageConfig = {
    authenticating: {
      icon: (
        <svg
          style={{ width: 40, height: 40, animation: 'spin 0.9s linear infinite' }}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="10" stroke="rgba(46,139,87,0.25)" strokeWidth="3" />
          <path d="M4 12a8 8 0 018-8" stroke="#2e8b57" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ),
      label: 'Verifying credentials…',
      sub: 'Checking your account with the server',
      color: '#2e8b57',
    },
    success: {
      icon: (
        <svg style={{ width: 40, height: 40 }} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="rgba(46,139,87,0.15)" stroke="#2e8b57" strokeWidth="2" />
          <path d="M8 12l3 3 5-5" stroke="#2e8b57" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      label: 'Authenticated',
      sub: 'Redirecting to your dashboard…',
      color: '#2e8b57',
    },
    error: {
      icon: (
        <svg style={{ width: 40, height: 40 }} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="rgba(220,38,38,0.12)" stroke="#dc2626" strokeWidth="2" />
          <path d="M12 8v4m0 4h.01" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ),
      label: 'Authentication Failed',
      sub: message || 'Please check your credentials and try again.',
      color: '#dc2626',
    },
  };

  const cfg = stageConfig[stage];

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(10,22,40,0.72)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.18s ease',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Authentication status"
      >
        {/* Card */}
        <div
          style={{
            background: '#0f1e35',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '40px 48px',
            minWidth: 300,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.22s cubic-bezier(0.34,1.2,0.64,1)',
          }}
        >
          {cfg.icon}

          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: cfg.color, marginBottom: 6 }}>
              {cfg.label}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, maxWidth: 240 }}>
              {cfg.sub}
            </div>
          </div>

          {/* Progress track — only shown while authenticating */}
          {stage === 'authenticating' && (
            <div
              style={{
                width: '100%', height: 3, background: 'rgba(255,255,255,0.08)',
                borderRadius: 99, overflow: 'hidden', marginTop: 8,
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: '#2e8b57',
                  borderRadius: 99,
                  animation: 'indeterminate 1.4s ease-in-out infinite',
                }}
              />
            </div>
          )}

          {/* Dismiss button — only on error */}
          {stage === 'error' && (
            <button
              onClick={() => {/* parent clears modal via setAuthStage(null) – signal via custom event */
                window.dispatchEvent(new CustomEvent('authModalDismiss'));
              }}
              style={{
                marginTop: 8,
                padding: '9px 28px',
                background: 'rgba(220,38,38,0.15)',
                border: '1px solid rgba(220,38,38,0.35)',
                borderRadius: 8,
                color: '#fca5a5',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn   { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp  { from { opacity: 0; transform: translateY(16px) scale(0.97) }
                              to   { opacity: 1; transform: translateY(0)     scale(1)    } }
        @keyframes indeterminate {
          0%   { width: 0%;   margin-left: 0% }
          50%  { width: 60%;  margin-left: 20% }
          100% { width: 0%;   margin-left: 100% }
        }
      `}</style>
    </>
  );
}

// ── Login Form ────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  // authStage drives the modal: null | 'authenticating' | 'success' | 'error'
  const [authStage, setAuthStage] = useState(null);

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);

    // Listen for the modal's own "Try Again" button
    const dismiss = () => { setAuthStage(null); setError(''); };
    window.addEventListener('authModalDismiss', dismiss);
    return () => window.removeEventListener('authModalDismiss', dismiss);
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) return;

    setError('');
    setAuthStage('authenticating');   // ← open modal, show real network request

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Login failed');

      // Show brief success state so users see it resolved
      setAuthStage('success');
      setTimeout(() => onLogin(data.user, data.token), 700);
    } catch (err) {
      const msg = err.message || 'Login failed. Please try again.';
      setError(msg);
      setAuthStage('error');          // ← modal switches to error state; no auto-dismiss
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#0a1628',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* ── Auth modal (overlays everything) ── */}
      <AuthLoadingModal stage={authStage} message={error} />

      {/* ── Left Panel – Visual Identity ── */}
      <div style={{
        flex: '1 1 55%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '64px 72px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background texture rings */}
        <div style={{
          position: 'absolute', top: '-160px', left: '-160px',
          width: '640px', height: '640px', borderRadius: '50%',
          border: '1px solid rgba(46,139,87,0.12)', pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', top: '-80px', left: '-80px',
          width: '480px', height: '480px', borderRadius: '50%',
          border: '1px solid rgba(46,139,87,0.18)', pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: '-200px', right: '-200px',
          width: '700px', height: '700px', borderRadius: '50%',
          border: '1px solid rgba(59,130,246,0.08)', pointerEvents: 'none'
        }} />
        {/* Green accent line */}
        <div style={{
          position: 'absolute', left: 0, top: '15%', bottom: '15%',
          width: '3px',
          background: 'linear-gradient(180deg, transparent, #2e8b57 30%, #2e8b57 70%, transparent)',
          borderRadius: '2px'
        }} />

        <div style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}>
          {/* Logo + Agency */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '56px' }}>
            <div style={{
              width: '52px', height: '52px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '6px', flexShrink: 0
            }}>
              <img src="/denr-logo.png" alt="DENR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#2e8b57', fontWeight: 600, textTransform: 'uppercase' }}>
                DENR IV-A CALABARZON
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '2px', fontWeight: 400 }}>
                Department of Environment and Natural Resources
              </div>
            </div>
          </div>

          {/* Main headline */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{
              fontSize: '11px', letterSpacing: '0.2em', color: '#2e8b57',
              fontWeight: 700, textTransform: 'uppercase', marginBottom: '16px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <span style={{ display: 'inline-block', width: '24px', height: '1px', background: '#2e8b57', flexShrink: 0 }} />
              Special Edition v2.0
            </div>
            <h1 style={{
              fontSize: 'clamp(32px, 4vw, 54px)',
              fontWeight: 800,
              lineHeight: 1.1,
              color: '#ffffff',
              margin: 0,
              letterSpacing: '-0.02em'
            }}>
              Contract<br />
              <span style={{ color: '#2e8b57' }}>Management</span><br />
              System
            </h1>
          </div>

          {/* Feature chips */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '64px' }}>
            {[
              { icon: '⚡', label: 'Automated contract generation with dynamic clauses' },
              { icon: '🔒', label: 'Role-based access with audit trail' },
              { icon: '📊', label: 'Real-time workforce analytics dashboard' }
            ].map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateX(0)' : 'translateX(-16px)',
                transition: `opacity 0.5s ease ${0.2 + i * 0.1}s, transform 0.5s ease ${0.2 + i * 0.1}s`
              }}>
                <span style={{ fontSize: '14px' }}>{f.icon}</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{f.label}</span>
              </div>
            ))}
          </div>

          {/* Footer badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              fontSize: '10px', letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase'
            }}>
              Secure · Compliant · Philippine Government System
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Panel – Login Form ── */}
      <div style={{
        flex: '0 0 420px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '64px 48px',
        background: 'rgba(255,255,255,0.03)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s'
        }}>
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{
              fontSize: '24px', fontWeight: 700, color: '#ffffff',
              margin: '0 0 8px 0', letterSpacing: '-0.01em'
            }}>
              Sign in to continue
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.38)', margin: 0 }}>
              Use your assigned CGEN credentials
            </p>
          </div>

          {/* Username */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block', fontSize: '11px', fontWeight: 600,
              color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em',
              textTransform: 'uppercase', marginBottom: '8px'
            }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
              autoFocus
              placeholder="Enter your username"
              disabled={!!authStage}
              style={{
                width: '100%',
                padding: '13px 16px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#2e8b57'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '32px' }}>
            <label style={{
              display: 'block', fontSize: '11px', fontWeight: 600,
              color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em',
              textTransform: 'uppercase', marginBottom: '8px'
            }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
                placeholder="Enter your password"
                disabled={!!authStage}
                style={{
                  width: '100%',
                  padding: '13px 48px 13px 16px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#2e8b57'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: '14px', top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.35)', fontSize: '16px',
                  padding: '4px', lineHeight: 1
                }}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!!authStage || !username.trim() || !password}
            style={{
              width: '100%',
              padding: '14px',
              background: (authStage || !username.trim() || !password)
                ? 'rgba(46,139,87,0.4)'
                : '#2e8b57',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: (authStage || !username.trim() || !password) ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s, transform 0.1s',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => !authStage && e.target.style.setProperty('background', '#236e45')}
            onMouseLeave={(e) => !authStage && e.target.style.setProperty('background', '#2e8b57')}
          >
            Sign In
          </button>

          <p style={{
            marginTop: '32px', fontSize: '11px',
            color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.6
          }}>
            Authorized personnel only. Unauthorized access is prohibited<br />and subject to applicable Philippine laws.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.2); }
        @media (max-width: 768px) {
          .login-left { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default LoginForm;