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
  green: '#2e8b57',
  greenLight: '#3aab6a',
  greenMuted: 'rgba(46,139,87,0.15)',
  greenBorder: 'rgba(46,139,87,0.35)',
  textPrimary: '#f0f4f8',
  textSecondary: 'rgba(240,244,248,0.65)',
  textMuted: 'rgba(240,244,248,0.35)',
  blue: '#3b82f6',
  blueMuted: 'rgba(59,130,246,0.15)',
  yellow: '#f59e0b',
  yellowMuted: 'rgba(245,158,11,0.15)',
};

const TAB_CONFIG = [
  {
    id: 'overview', name: 'Overview',
    icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
  },
  {
    id: 'users', name: 'Create Users',
    icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
  },
  {
    id: 'positions', name: 'Positions',
    icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
  },
  {
    id: 'contracts', name: 'Contracts',
    icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  },
  {
    id: 'documents', name: 'User Documents',
    icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
  },
  {
    id: 'eodb', name: 'EODB ID',
    icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
  },
  {
    id: 'profile', name: 'My Profile',
    icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
  },
];

function FocalPersonDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const handleDocumentUploaded = () => { setRefreshTrigger(prev => prev + 1); };

  const assignment = user.placeOfAssignment || 'Not Assigned';

  return (
    <div style={{ minHeight: '100%', background: D.bg, color: D.textPrimary, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Page Header ── */}
      <div style={{ background: D.panel, borderBottom: `1px solid ${D.border}`, padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: D.textPrimary, margin: 0 }}>Focal Person Dashboard</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <svg width="13" height="13" fill="none" stroke={D.green} strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span style={{ fontSize: 13, color: D.textSecondary }}>{assignment}</span>
            </div>
          </div>
          {/* Role badge */}
          <div style={{ background: D.greenMuted, border: `1px solid ${D.greenBorder}`, borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: D.green }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: D.green, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Focal Person</span>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background: D.panel, borderBottom: `1px solid ${D.border}`, paddingLeft: 32, display: 'flex', gap: 0, overflowX: 'auto' }}>
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 18px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? D.green : D.textSecondary,
              borderBottom: `2px solid ${activeTab === tab.id ? D.green : 'transparent'}`,
              transition: 'all 150ms ease', whiteSpace: 'nowrap', letterSpacing: '0.01em',
            }}
          >
            <span style={{ color: activeTab === tab.id ? D.green : D.textMuted }}>{tab.icon}</span>
            {tab.name}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ padding: '32px' }}>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              <OverviewCard
                icon={<svg width="20" height="20" fill="none" stroke="#2e8b57" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>}
                iconBg={D.greenMuted}
                label="Place of Assignment"
                value={assignment}
                valueSize={assignment.length > 20 ? 13 : 18}
              />
              <OverviewCard
                icon={<svg width="20" height="20" fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>}
                iconBg={D.blueMuted}
                label="Role"
                value="Focal Person"
              />
              <OverviewCard
                icon={<svg width="20" height="20" fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                iconBg={D.yellowMuted}
                label="Access Level"
                value="Limited"
              />
            </div>

            {/* Quick Actions */}
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12 }}>
              <div style={{ padding: '18px 24px', borderBottom: `1px solid ${D.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: D.textPrimary, margin: 0 }}>Quick Access</h3>
              </div>
              <div style={{ padding: '8px 0' }}>
                {[
                  { id: 'users', label: 'Create Contractual Users', sub: 'Add new users for your assignment', color: D.blue },
                  { id: 'contracts', label: 'Manage Contracts', sub: 'View and generate contracts', color: D.green },
                  { id: 'positions', label: 'Position Management', sub: 'Browse and manage positions', color: '#a78bfa' },
                  { id: 'documents', label: 'User Documents', sub: 'Access user-uploaded files', color: D.yellow },
                  { id: 'eodb', label: 'EODB ID Generator', sub: 'Generate your EODB identification card', color: '#fb923c' },
                ].map(({ id, label, sub, color }) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer', transition: 'background 120ms', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: D.textPrimary, margin: 0 }}>{label}</p>
                        <p style={{ fontSize: 11, color: D.textMuted, margin: '2px 0 0' }}>{sub}</p>
                      </div>
                    </div>
                    <svg width="14" height="14" fill="none" stroke={D.textMuted} strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Info box */}
            <div style={{ background: D.greenMuted, border: `1px solid ${D.greenBorder}`, borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <svg width="18" height="18" fill="none" stroke={D.green} strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: D.green, margin: '0 0 4px' }}>Focal Person Access</p>
                <p style={{ fontSize: 12, color: D.textSecondary, margin: 0, lineHeight: 1.6 }}>
                  You can create contractual users for your place of assignment. Created users will be in <strong style={{ color: D.yellow }}>PENDING</strong> status and require administrator validation before they can access the system.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CREATE USERS */}
        {activeTab === 'users' && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: D.textPrimary, margin: '0 0 6px' }}>Create Contractual Users</h3>
              <p style={{ fontSize: 13, color: D.textSecondary, margin: 0 }}>
                New users will be assigned to <strong style={{ color: D.green }}>{assignment}</strong> and require administrator approval.
              </p>
            </div>
            <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <UserManagement />
            </div>
          </div>
        )}

        {/* POSITIONS */}
        {activeTab === 'positions' && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <PositionManagement />
          </div>
        )}

        {/* CONTRACTS */}
        {activeTab === 'contracts' && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <ContractGenerator userRole="FOCAL_PERSON" />
          </div>
        )}

        {/* USER DOCUMENTS */}
        {activeTab === 'documents' && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <DocumentViewer userRole="FOCAL_PERSON" />
          </div>
        )}

        {/* EODB */}
        {activeTab === 'eodb' && (
          <EODBGenerator userId={user.id || user._id} onDocumentUploaded={handleDocumentUploaded} />
        )}

        {/* MY PROFILE */}
        {activeTab === 'profile' && (
          <ContractualDashboard user={user} />
        )}
      </div>
    </div>
  );
}

function OverviewCard({ icon, iconBg, label, value, valueSize = 20 }) {
  return (
    <div style={{ background: '#152236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 22px' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        {icon}
      </div>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,244,248,0.4)', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: valueSize, fontWeight: 700, color: '#f0f4f8', margin: 0, lineHeight: 1.2 }}>{value}</p>
    </div>
  );
}

export default FocalPersonDashboard;