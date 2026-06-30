import { useState } from 'react';
import api from '../api.js';

/* ── Design tokens ── */
const D = {
  bg: '#0a1628',
  panel: '#0f1e35',
  card: '#152236',
  cardDeep: '#111d30',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  green: '#2e8b57',
  greenMuted: 'rgba(46,139,87,0.15)',
  greenBorder: 'rgba(46,139,87,0.35)',
  textPrimary: '#f0f4f8',
  textSecondary: 'rgba(240,244,248,0.65)',
  textMuted: 'rgba(240,244,248,0.35)',
  blue: '#3b82f6',
  blueMuted: 'rgba(59,130,246,0.15)',
  blueBorder: 'rgba(59,130,246,0.3)',
  red: '#ef4444',
  redMuted: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b',
  yellowMuted: 'rgba(245,158,11,0.15)',
  yellowBorder: 'rgba(245,158,11,0.3)',
  purple: '#a78bfa',
  purpleMuted: 'rgba(167,139,250,0.12)',
  orange: '#fb923c',
  orangeMuted: 'rgba(251,146,60,0.15)',
};

const STATUS_STYLE = {
  ACTIVE:    { bg: D.greenMuted,  border: D.greenBorder,  color: D.green },
  DRAFT:     { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)', color: '#94a3b8' },
  EXPIRED:   { bg: D.redMuted,    border: 'rgba(239,68,68,0.3)',  color: D.red },
  APPROVED:  { bg: D.blueMuted,   border: D.blueBorder,   color: D.blue },
  CANCELLED: { bg: D.orangeMuted, border: 'rgba(251,146,60,0.3)', color: D.orange },
  PENDING:   { bg: D.yellowMuted, border: D.yellowBorder,  color: D.yellow },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.DRAFT;
  return (
    <span style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {status}
    </span>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 3, height: 16, background: D.green, borderRadius: 2 }} />
      <h4 style={{ fontSize: 12, fontWeight: 700, color: D.textSecondary, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{children}</h4>
    </div>
  );
}

function InfoGrid({ children, cols = 3 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px 24px' }}>
      {children}
    </div>
  );
}

function InfoCell({ label, children, span }) {
  return (
    <div style={span ? { gridColumn: `span ${span}` } : {}}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.textMuted, margin: '0 0 5px' }}>{label}</p>
      <div style={{ fontSize: 13, color: D.textPrimary, fontWeight: 500 }}>{children || <span style={{ color: D.textMuted }}>—</span>}</div>
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{ background: D.cardDeep, border: `1px solid ${D.border}`, borderRadius: 10, padding: '18px 20px', ...style }}>
      {children}
    </div>
  );
}

function ContractDetailsModal({ contract, onClose }) {
  const [previewingPDF, setPreviewingPDF] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState({});

  const toggleMonthCalendar = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

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

  /* ── PDF Full-screen Preview ── */
  if (previewingPDF) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', zIndex: 9999 }}>
        <div style={{ background: D.panel, borderBottom: `1px solid ${D.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 32, height: 32, background: D.redMuted, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" fill="none" stroke={D.red} strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: D.textPrimary, margin: 0 }}>PDF Preview</p>
              <p style={{ fontSize: 12, color: D.textSecondary, margin: '2px 0 0' }}>{contract.contractNumber}</p>
            </div>
          </div>
          <button
            onClick={() => { setPreviewingPDF(false); if (pdfBlob) URL.revokeObjectURL(pdfBlob); setPdfBlob(null); }}
            style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${D.border}`, borderRadius: 8, padding: '7px 16px', color: D.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close Preview
          </button>
        </div>
        <div style={{ flex: 1, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loadingPreview ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, border: `3px solid ${D.border}`, borderTop: `3px solid ${D.green}`, borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ color: D.textSecondary, fontSize: 14 }}>Generating PDF preview…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : pdfBlob ? (
            <iframe src={pdfBlob} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
          ) : (
            <p style={{ color: D.red, fontSize: 14 }}>Failed to load PDF preview</p>
          )}
        </div>
      </div>
    );
  }

  /* ── Main Modal ── */
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.borderStrong}`, borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sticky Header */}
        <div style={{ background: D.panel, borderBottom: `1px solid ${D.border}`, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 42, height: 42, background: D.greenMuted, border: `1px solid ${D.greenBorder}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" fill="none" stroke={D.green} strokeWidth="1.75" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: D.textPrimary, margin: 0, fontFamily: 'monospace, monospace', letterSpacing: '0.04em' }}>{contract.contractNumber}</p>
              <p style={{ fontSize: 12, color: D.textSecondary, margin: '3px 0 0' }}>{fullName}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatusBadge status={contract.status} />
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${D.border}`, borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: D.textSecondary }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Action Bar ── */}
          <div style={{ background: D.greenMuted, border: `1px solid ${D.greenBorder}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handlePreviewPDF}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: D.green, border: 'none', borderRadius: 8, padding: '9px 18px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.03em' }}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Preview PDF
            </button>
            <span style={{ fontSize: 12, color: D.textSecondary }}>Opens a full-screen preview of the generated contract PDF</span>
          </div>

          {/* ── Contract Info ── */}
          <div>
            <SectionHeader>Contract Information</SectionHeader>
            <Panel>
              <InfoGrid cols={3}>
                <InfoCell label="Contract Number">
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: D.green }}>{contract.contractNumber}</span>
                </InfoCell>
                <InfoCell label="Mode">{contract.mode}</InfoCell>
                <InfoCell label="Status"><StatusBadge status={contract.status} /></InfoCell>
                <InfoCell label="Year / Semester">
                  {contract.year} — {contract.semester === 1 ? 'First' : 'Second'} Semester
                </InfoCell>
                <InfoCell label="Start Date">{new Date(contract.startDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</InfoCell>
                <InfoCell label="End Date">{new Date(contract.endDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</InfoCell>
              </InfoGrid>
            </Panel>
          </div>

          {/* ── Position Details ── */}
          <div>
            <SectionHeader>Position Details</SectionHeader>
            <Panel>
              <InfoGrid cols={2}>
                <InfoCell label="Position">
                  <span style={{ fontWeight: 700, color: D.textPrimary }}>{contract.position}</span>
                </InfoCell>
                <InfoCell label="Place of Assignment">{contract.placeOfAssignment}</InfoCell>
                <InfoCell label="Charging" span={2}>{contract.charging}</InfoCell>
              </InfoGrid>
            </Panel>
          </div>

          {/* ── Salary ── */}
          <div>
            <SectionHeader>Salary Information</SectionHeader>
            <Panel>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px', marginBottom: contract.isSpecialSalaryGrade ? 0 : 20 }}>
                <InfoCell label="Salary Grade">
                  {contract.isSpecialSalaryGrade
                    ? <span style={{ background: D.yellowMuted, border: `1px solid ${D.yellowBorder}`, color: D.yellow, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>SG {contract.salaryGrade} (Special)</span>
                    : `SG ${contract.salaryGrade}`
                  }
                </InfoCell>
                <InfoCell label="Basic Salary">
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#4ade80' }}>
                    ₱{contract.basicSalary.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </InfoCell>

                {!contract.isSpecialSalaryGrade && (
                  <>
                    <InfoCell label="Monthly Salary (Contract)">
                      ₱{contract.monthlySalaryAsPerContract.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </InfoCell>
                    <InfoCell label="Daily Salary (Contract)">
                      ₱{contract.dailySalaryAsPerContract.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </InfoCell>
                    <InfoCell label="Monthly Premium">
                      ₱{contract.monthlyPremium.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </InfoCell>
                    <InfoCell label={`${contract.bonusType} Premium`}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: D.green }}>
                        ₱{contract.finalPremium?.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                      </span>
                    </InfoCell>
                  </>
                )}
              </div>

              {!contract.isSpecialSalaryGrade && (
                <>
                  {/* Premium Summary Counts */}
                  {contract.premiumSummary && (
                    <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 18, marginBottom: 18 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.textMuted, marginBottom: 12 }}>Premium Calculation Summary</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {[
                          { label: 'Total Months', value: contract.premiumSummary.totalMonths },
                          { label: 'Full Months', value: contract.premiumSummary.fullMonths },
                          { label: 'Partial Months', value: contract.premiumSummary.partialMonths },
                          { label: 'Working Days', value: contract.premiumSummary.totalWorkingDays, highlight: true },
                        ].map(({ label, value, highlight }) => (
                          <div key={label} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                            <p style={{ fontSize: 10, color: D.textMuted, margin: '0 0 6px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: highlight ? D.blue : D.textPrimary, margin: 0 }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monthly Breakdown Table */}
                  {contract.workingDaysBreakdown && contract.workingDaysBreakdown.length > 0 && (
                    <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 18, marginBottom: 18 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.textMuted, marginBottom: 12 }}>Monthly Premium Breakdown</p>
                      <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${D.border}` }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: D.bg }}>
                              {['Month', 'Type', 'Working Days', 'Daily Rate', 'Premium', ''].map((h, i) => (
                                <th key={h || 'cal'} style={{ padding: '10px 14px', textAlign: i >= 2 ? 'center' : 'left', color: D.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${D.border}` }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {contract.workingDaysBreakdown.map((m, idx) => (
                              <>
                                <tr key={m.monthKey} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${D.border}` }}>
                                  <td style={{ padding: '10px 14px', fontWeight: 600, color: D.textPrimary }}>{m.monthName} {m.year}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                    {m.isFullMonth
                                      ? <span style={{ background: D.greenMuted, border: `1px solid ${D.greenBorder}`, color: D.green, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Full</span>
                                      : <span style={{ background: D.yellowMuted, border: `1px solid ${D.yellowBorder}`, color: D.yellow, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Partial</span>
                                    }
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center', color: D.textSecondary }}>{m.totalWorkingDaysInMonth} / {m.actualWorkingDaysInRange}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: D.textSecondary, fontFamily: 'monospace' }}>
                                    ₱{(m.dailyPremiumRate || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: D.textPrimary, fontFamily: 'monospace' }}>
                                    ₱{(m.calculatedPremium || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                    <button
                                      onClick={() => toggleMonthCalendar(m.monthKey)}
                                      title="Toggle calendar view"
                                      style={{ background: expandedMonths[m.monthKey] ? D.blueMuted : 'transparent', border: `1px solid ${expandedMonths[m.monthKey] ? D.blueBorder : D.border}`, color: expandedMonths[m.monthKey] ? D.blue : D.textMuted, borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
                                    >
                                      📅 {expandedMonths[m.monthKey] ? 'Hide' : 'View'}
                                    </button>
                                  </td>
                                </tr>
                                {expandedMonths[m.monthKey] && (
                                  <tr key={`${m.monthKey}-cal`} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${D.border}` }}>
                                    <td colSpan={6} style={{ padding: '4px 14px 14px' }}>
                                      <MonthCalendar month={m} />
                                    </td>
                                  </tr>
                                )}
                                {m.holidaysInMonth && m.holidaysInMonth.length > 0 && (
                                  <tr key={`${m.monthKey}-hols`} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${D.border}` }}>
                                    <td colSpan={6} style={{ padding: '6px 14px 10px' }}>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {m.holidaysInMonth.map(h => {
                                          const typeLabel = h.type === 'REGULAR' ? 'Regular' : h.type === 'SPECIAL_NON_WORKING' ? 'Special Non-Working' : 'Special Working';
                                          const chipStyle = h.type === 'REGULAR'
                                            ? { bg: D.redMuted, border: 'rgba(239,68,68,0.25)', color: D.red }
                                            : h.type === 'SPECIAL_NON_WORKING'
                                            ? { bg: D.orangeMuted, border: 'rgba(251,146,60,0.3)', color: D.orange }
                                            : { bg: D.blueMuted, border: D.blueBorder, color: D.blue };
                                          return (
                                            <span key={h.date} style={{ background: chipStyle.bg, border: `1px solid ${chipStyle.border}`, color: chipStyle.color, borderRadius: 5, padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                              🗓️ {new Date(h.date + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })} — {h.name}
                                              <span style={{ opacity: 0.6 }}>({typeLabel})</span>
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
                            <tr style={{ background: D.bg }}>
                              <td colSpan={2} style={{ padding: '11px 14px', fontWeight: 700, color: D.textPrimary, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total</td>
                              <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: D.textPrimary }}>{contract.premiumSummary?.totalWorkingDays} days</td>
                              <td />
                              <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: D.green, fontSize: 14, fontFamily: 'monospace' }}>
                                ₱{contract.finalPremium?.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Holiday Legend */}
                  {contract.workingDaysBreakdown?.some(m => m.holidaysInMonth?.length > 0) && (
                    <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {[
                        { color: D.red, label: 'Regular Holiday (excluded)' },
                        { color: D.orange, label: 'Special Non-Working (excluded)' },
                        { color: D.blue, label: 'Special Working (counted)' },
                      ].map(({ color, label }) => (
                        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: D.textMuted }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  <p style={{ fontSize: 11, color: D.textMuted, marginTop: 14, lineHeight: 1.6 }}>
                    ℹ️ Partial-month premium = (Monthly Premium ÷ Total Working Days in Month) × Actual Working Days in Range. Excludes weekends, regular holidays, and special non-working holidays.
                  </p>
                </>
              )}

              {contract.isSpecialSalaryGrade && (
                <div style={{ background: D.yellowMuted, border: `1px solid ${D.yellowBorder}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <p style={{ fontSize: 13, color: D.yellow, margin: 0 }}>Special Salary Grade: No premium was calculated for this contract.</p>
                </div>
              )}
            </Panel>
          </div>

          {/* ── Deductions ── */}
          {!contract.isSpecialSalaryGrade && contract.deductions && (
            <div>
              <SectionHeader>Deductions</SectionHeader>
              <Panel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px 20px' }}>
                  {[
                    { label: 'SSS', value: contract.deductions.sss },
                    { label: 'Pag-IBIG', value: contract.deductions.pagibig },
                    { label: 'PhilHealth', value: contract.deductions.philhealth },
                  ].map(({ label, value }) => (
                    <InfoCell key={label} label={label}>
                      <span style={{ fontFamily: 'monospace' }}>₱{value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </InfoCell>
                  ))}
                  <div style={{ borderLeft: `1px solid ${D.border}`, paddingLeft: 20 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.textMuted, margin: '0 0 5px' }}>Total</p>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: D.red }}>
                      ₱{contract.deductions.total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {/* ── Duties ── */}
          {contract.dutiesAndResponsibilities && contract.dutiesAndResponsibilities.length > 0 && (
            <div>
              <SectionHeader>Duties and Responsibilities ({contract.dutiesAndResponsibilities.length})</SectionHeader>
              <Panel style={{ maxHeight: 220, overflowY: 'auto' }}>
                <ol style={{ margin: 0, padding: '0 0 0 22px', display: 'flex', flexDirection: 'column', gap: 8, listStyleType: 'lower-alpha' }}>
                  {contract.dutiesAndResponsibilities.map((duty, idx) => (
                    <li key={idx} style={{ fontSize: 13, color: D.textSecondary, lineHeight: 1.6, paddingLeft: 4 }}>{duty}</li>
                  ))}
                </ol>
              </Panel>
            </div>
          )}

          {/* ── Signatories ── */}
          <div>
            <SectionHeader>Signatories</SectionHeader>
            <Panel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px' }}>
                {[
                  { role: 'First Party', data: contract.signatories.firstParty },
                  { role: 'Approver', data: contract.signatories.approver },
                  { role: 'Accountant', data: contract.signatories.accountant },
                  { role: 'Finance Chief', data: contract.signatories.financeChief },
                ].map(({ role, data }) => (
                  <div key={role} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 8, padding: '12px 14px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.textMuted, margin: '0 0 6px' }}>{role}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: D.textPrimary, margin: '0 0 2px' }}>{data?.name || '—'}</p>
                    <p style={{ fontSize: 11, color: D.textMuted, margin: 0 }}>{data?.position || ''}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* ── Status Chips Row ── */}
          <div style={{ display: 'flex', gap: 12 }}>
            {contract.signedContractFile && (
              <div style={{ background: D.greenMuted, border: `1px solid ${D.greenBorder}`, borderRadius: 10, padding: '12px 18px', flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: D.green, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Signed Contract Available
                </p>
                <p style={{ fontSize: 11, color: D.textSecondary, margin: 0 }}>
                  Uploaded: {new Date(contract.signedContractFile.uploadedAt).toLocaleString('en-PH')}
                </p>
              </div>
            )}
            {contract.isArchived && (
              <div style={{ background: D.orangeMuted, border: `1px solid rgba(251,146,60,0.3)`, borderRadius: 10, padding: '12px 18px', flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: D.orange, margin: '0 0 4px' }}>📦 Archived Contract</p>
                <p style={{ fontSize: 11, color: D.textSecondary, margin: 0 }}>
                  Archived on: {new Date(contract.archivedAt).toLocaleString('en-PH')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer */}
        <div style={{ background: D.panel, borderTop: `1px solid ${D.border}`, padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${D.border}`, borderRadius: 8, padding: '9px 22px', color: D.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.03em' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Interactive month calendar ──
   Renders a single month grid for the working-days breakdown row it
   belongs to, color-coding each day as: weekend, regular holiday,
   special non-working holiday, special working day, an in-range working
   day, or an out-of-range day (for partial months). Hover a day to see
   its holiday name (native title tooltip) for a lightweight, dependency-
   free interactive view. */
function MonthCalendar({ month: m }) {
  const holidayByDay = {};
  (m.holidaysInMonth || []).forEach(h => {
    const day = parseInt(String(h.date).split('-')[2], 10);
    holidayByDay[day] = h;
  });

  const daysInMonth = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(m.year, m.month - 1, 1)).getUTCDay(); // 0=Sun

  const rangeStart = m.contractStartDay || 1;
  const rangeEnd = m.contractEndDay || daysInMonth;

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayStyle = (day) => {
    if (day === null) return { bg: 'transparent', border: 'transparent', color: 'transparent' };
    const dow = new Date(Date.UTC(m.year, m.month - 1, day)).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const hol = holidayByDay[day];
    const inRange = day >= rangeStart && day <= rangeEnd;

    if (hol && hol.type === 'REGULAR') return { bg: D.redMuted, border: 'rgba(239,68,68,0.4)', color: D.red, label: hol.name };
    if (hol && hol.type === 'SPECIAL_NON_WORKING') return { bg: D.orangeMuted, border: 'rgba(251,146,60,0.45)', color: D.orange, label: hol.name };
    if (hol && hol.type === 'SPECIAL_WORKING') return { bg: D.blueMuted, border: D.blueBorder, color: D.blue, label: hol.name };
    if (isWeekend) return { bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.2)', color: '#94a3b8', label: 'Weekend' };
    if (!inRange) return { bg: 'transparent', border: D.border, color: D.textMuted, label: 'Outside contract period' };
    return { bg: D.greenMuted, border: D.greenBorder, color: D.green, label: 'Working day' };
  };

  return (
    <div style={{ background: D.cardDeep, border: `1px solid ${D.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: D.textPrimary, margin: 0 }}>{m.monthName} {m.year}</p>
        <p style={{ fontSize: 11, color: D.textMuted, margin: 0 }}>
          {m.isFullMonth ? 'Full month in contract' : `In range: day ${rangeStart}–${rangeEnd}`}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: D.textMuted, letterSpacing: '0.05em' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          const s = dayStyle(day);
          return (
            <div
              key={i}
              title={day ? `${m.monthName} ${day}, ${m.year}${s.label ? ` — ${s.label}` : ''}` : undefined}
              style={{
                aspectRatio: '1 / 1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: day ? 600 : 400,
                borderRadius: 6,
                background: s.bg,
                border: `1px solid ${s.border}`,
                color: s.color,
                cursor: day ? 'default' : 'auto',
              }}
            >
              {day || ''}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${D.border}` }}>
        {[
          { color: D.green, label: 'Working day' },
          { color: '#94a3b8', label: 'Weekend' },
          { color: D.red, label: 'Regular holiday' },
          { color: D.orange, label: 'Special non-working' },
          { color: D.blue, label: 'Special working' },
          { color: D.textMuted, label: 'Outside contract period' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: D.textMuted }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default ContractDetailsModal;