import { useState } from 'react';
import UserManagement from './UserManagement';
import PositionManagement from './PositionManagement';
import ContractGenerator from './ContractGenerator';
import ContractualDashboard from './ContractualDashboard';
import DocumentViewer from './DocumentViewer';
import EODBGenerator from './EODBGenerator';

/* ── Design tokens ── */
const D = {
  bg: '#0a1628',
  panel: '#0f1e35',
  card: '#152236',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  green: '#2e8b57',
  greenMuted: 'rgba(46,139,87,0.15)',
  greenBorder: 'rgba(46,139,87,0.35)',
  textPrimary: '#f0f4f8',
  textSecondary: 'rgba(240,244,248,0.7)',
  textMuted: 'rgba(240,244,248,0.4)',
  blue: '#3b82f6',
  blueMuted: 'rgba(59,130,246,0.15)',
};

function FocalPersonDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const tabs = [
    { id: 'overview',   name: 'Overview',        icon: '📊' },
    { id: 'users',      name: 'Create Users',     icon: '👥' },
    { id: 'positions',  name: 'Positions',        icon: '🏷️' },
    { id: 'contracts',  name: 'Contracts',        icon: '📄' },
    { id: 'documents',  name: 'User Documents',   icon: '📁' },
    { id: 'eodb',       name: 'EODB ID',          icon: '🪪' },
    { id: 'profile',    name: 'My Profile',       icon: '👤' },
  ];

  const handleDocumentUploaded = () => setRefreshTrigger(prev => prev + 1);

  return (
    <div style={{ background: D.bg, minHeight: '100%', padding: '0 0 40px' }}>
      {/* Page Header */}
      <div style={{ borderBottom: `1px solid ${D.border}`, marginBottom: 0 }}>
        <div style={{ paddingBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 0 }}>
            <div style={{ paddingTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <div style={{ width: 34, height: 34, background: D.greenMuted, border: `1px solid ${D.greenBorder}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                  🗂️
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: D.textPrimary, margin: 0 }}>Focal Person Dashboard</h2>
              </div>
              <p style={{ fontSize: 12, color: D.textMuted, margin: '0 0 20px', marginLeft: 46 }}>
                Place of Assignment: <span style={{ color: D.green, fontWeight: 600 }}>{user.placeOfAssignment || 'Not Assigned'}</span>
              </p>
            </div>
          </div>
          {/* Tab Nav */}
          <nav style={{ display: 'flex', gap: 2 }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? `2px solid ${D.green}` : '2px solid transparent',
                  color: activeTab === tab.id ? D.green : D.textSecondary,
                  fontSize: 12,
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'color 0.2s, border-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ paddingTop: 28 }}>

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: 'Place of Assignment', value: user.placeOfAssignment || 'Not Assigned', icon: '📍', color: D.green, colorMuted: D.greenMuted, colorBorder: D.greenBorder },
                { label: 'Role', value: 'Focal Person', icon: '🗂️', color: D.blue, colorMuted: D.blueMuted, colorBorder: 'rgba(59,130,246,0.3)' },
                { label: 'Access Level', value: 'Limited', icon: '🔑', color: '#f59e0b', colorMuted: 'rgba(245,158,11,0.12)', colorBorder: 'rgba(245,158,11,0.3)' },
              ].map(({ label, value, icon, color, colorMuted, colorBorder }) => (
                <div key={label} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, padding: '20px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 36, height: 36, background: colorMuted, border: `1px solid ${colorBorder}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      {icon}
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: D.textMuted, letterSpacing: '0.09em', textTransform: 'uppercase', margin: 0 }}>{label}</p>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0, lineHeight: 1.2 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 3, height: 16, background: D.green, borderRadius: 2 }} />
                <h4 style={{ fontSize: 11, fontWeight: 700, color: D.textSecondary, margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Quick Access</h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {[
                  { label: 'Create Contractual Users', desc: 'Register new contractual staff', tab: 'users', icon: '👥' },
                  { label: 'Manage Positions', desc: 'View and edit position catalog', tab: 'positions', icon: '🏷️' },
                  { label: 'View Contracts', desc: 'Track and manage contracts', tab: 'contracts', icon: '📄' },
                  { label: 'User Documents', desc: 'Access uploaded documents', tab: 'documents', icon: '📁' },
                ].map(({ label, desc, tab, icon }) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}`, borderRadius: 10, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'background 0.15s, border-color 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(46,139,87,0.08)'; e.currentTarget.style.borderColor = D.greenBorder; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = D.border; }}
                  >
                    <span style={{ fontSize: 22 }}>{icon}</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: D.textPrimary, margin: '0 0 3px' }}>{label}</p>
                      <p style={{ fontSize: 11, color: D.textMuted, margin: 0 }}>{desc}</p>
                    </div>
                    <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="14" height="14" fill="none" stroke={D.textMuted} strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Info note */}
            <div style={{ background: D.blueMuted, border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <svg width="16" height="16" fill="none" stroke={D.blue} strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p style={{ fontSize: 12, color: D.textSecondary, margin: 0, lineHeight: 1.6 }}>
                Users you create will be in <strong style={{ color: D.yellow }}>PENDING</strong> status and require administrator validation before they can access the system.
              </p>
            </div>
          </div>
        )}

        {/* ── OTHER TABS ── */}
        {activeTab === 'users' && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 3, height: 18, background: D.green, borderRadius: 2 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: D.textPrimary, margin: 0 }}>Create Contractual Users</h3>
            </div>
            <p style={{ fontSize: 13, color: D.textSecondary, margin: '0 0 20px', paddingLeft: 13 }}>
              Create contractual users for your place of assignment. Created users will be in PENDING status and require administrator validation.
            </p>
            <UserManagement />
          </div>
        )}

        {activeTab === 'positions' && <PositionManagement />}
        {activeTab === 'contracts' && <ContractGenerator userRole="FOCAL_PERSON" />}
        {activeTab === 'documents' && <DocumentViewer userRole="FOCAL_PERSON" />}
        {activeTab === 'eodb' && (
          <EODBGenerator userId={user.id || user._id} onDocumentUploaded={handleDocumentUploaded} />
        )}
        {activeTab === 'profile' && <ContractualDashboard user={user} />}
      </div>
    </div>
  );
}

export default FocalPersonDashboard;