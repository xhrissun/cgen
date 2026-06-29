import { useState } from 'react';
import api from '../api.js';

const C = {
  dark: '#0a1628', navy: '#0f1e35', green: '#2e8b57',
  greenLight: '#ecfdf5', greenMid: '#4ade80',
  border: '#e5e7eb', text: '#111827', muted: '#6b7280',
};

const STATUS_STYLES = {
  ACTIVE:    { bg: '#ecfdf5', color: '#059669', label: 'Active' },
  DRAFT:     { bg: '#eff6ff', color: '#2563eb', label: 'Draft' },
  EXPIRED:   { bg: '#fef2f2', color: '#dc2626', label: 'Expired' },
  PENDING:   { bg: '#fffbeb', color: '#d97706', label: 'Pending' },
  APPROVED:  { bg: '#eff6ff', color: '#2563eb', label: 'Approved' },
  CANCELLED: { bg: '#fff7ed', color: '#ea580c', label: 'Cancelled' },
};

function Badge({ status }) {
  const s = STATUS_STYLES[status] || { bg: '#f3f4f6', color: '#6b7280', label: status };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: s.bg, color: s.color, letterSpacing: '0.04em' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '14px', color: C.text, fontWeight: 500, fontFamily: mono ? 'monospace' : undefined }}>{value || '—'}</div>
    </div>
  );
}

function SectionBlock({ title, accent = '#f8fafc', children }) {
  return (
    <div style={{ borderRadius: '12px', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: accent, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

function MoneyVal({ amount, size = 'normal', highlight = false }) {
  const formatted = (amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span style={{ fontSize: size === 'large' ? '20px' : '14px', fontWeight: size === 'large' ? 800 : 600, color: highlight ? C.green : C.text, fontFamily: 'monospace' }}>
      ₱{formatted}
    </span>
  );
}

function ContractDetailsModal({ contract, onClose }) {
  const [previewingPDF, setPreviewingPDF] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  if (!contract) return null;

  const handlePreviewPDF = async () => {
    setLoadingPreview(true);
    setPreviewingPDF(true);
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/api/contracts/${contract._id}/generate`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      setPdfBlob(URL.createObjectURL(blob));
    } catch (err) {
      alert('Error generating preview: ' + (err.response?.data?.message || err.message));
      setPreviewingPDF(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const userPInfo = contract.userId?.personalInfo;
  const fullName = userPInfo?.lastName && userPInfo?.firstName
    ? `${userPInfo.lastName}, ${userPInfo.firstName}${userPInfo.middleName ? ' ' + userPInfo.middleName : ''}`
    : userPInfo?.lastName || userPInfo?.firstName || 'N/A';

  // PDF Preview Mode
  if (previewingPDF) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', zIndex: 9999 }}>
        <div style={{ background: C.dark, borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '18px' }}>📄</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{contract.contractNumber}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>PDF Preview</div>
            </div>
          </div>
          <button onClick={() => { setPreviewingPDF(false); if (pdfBlob) URL.revokeObjectURL(pdfBlob); setPdfBlob(null); }}
            style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            ✕ Close Preview
          </button>
        </div>
        <div style={{ flex: 1, background: '#1a1a2e' }}>
          {loadingPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', border: `3px solid rgba(255,255,255,0.1)`, borderTopColor: C.green, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Generating PDF…</div>
            </div>
          ) : pdfBlob ? (
            <iframe src={pdfBlob} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#f87171', fontSize: '14px' }}>Failed to load PDF</div>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998, padding: '16px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: '#f8fafc', borderRadius: '18px', width: '100%', maxWidth: '860px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${C.dark} 0%, ${C.navy} 100%)`, padding: '22px 28px', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-40px', top: '-40px', width: '180px', height: '180px', borderRadius: '50%', border: '1px solid rgba(46,139,87,0.2)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: C.greenMid, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Contract Record</span>
                <Badge status={contract.status} />
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em', fontFamily: 'monospace' }}>{contract.contractNumber}</div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', marginTop: '4px' }}>{fullName}</div>
            </div>
            <button onClick={onClose} style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
          </div>

          {/* Preview PDF button in header */}
          <button onClick={handlePreviewPDF} style={{ marginTop: '16px', padding: '9px 20px', background: C.green, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span>📄</span> Preview Contract PDF
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Contract Info */}
          <SectionBlock title="Contract Details" accent="#f0f4f8">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
              <DetailRow label="Contract Number" value={contract.contractNumber} mono />
              <DetailRow label="Mode" value={contract.mode} />
              <DetailRow label="Period" value={`${contract.year} · ${contract.semester === 1 ? '1st' : '2nd'} Semester`} />
              <DetailRow label="Start Date" value={new Date(contract.startDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} />
              <DetailRow label="End Date" value={new Date(contract.endDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} />
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>Status</div>
                <Badge status={contract.status} />
              </div>
            </div>
          </SectionBlock>

          {/* Position */}
          <SectionBlock title="Position & Assignment" accent="#eff6ff">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <DetailRow label="Position Title" value={contract.position} />
              <DetailRow label="Place of Assignment" value={contract.placeOfAssignment} />
              <DetailRow label="Charging" value={contract.charging} span={2} />
            </div>
          </SectionBlock>

          {/* Salary */}
          <SectionBlock title="Salary & Compensation" accent="#ecfdf5">
            {/* Top summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: contract.isSpecialSalaryGrade ? 0 : '20px' }}>
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Salary Grade</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: C.text }}>SG {contract.salaryGrade}</span>
                  {contract.isSpecialSalaryGrade && <span style={{ padding: '2px 8px', background: '#fef9c3', color: '#854d0e', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>Special</span>}
                </div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Basic Salary</div>
                <MoneyVal amount={contract.basicSalary} size="large" />
              </div>
              {!contract.isSpecialSalaryGrade && (
                <div style={{ background: `${C.green}0f`, borderRadius: '10px', padding: '16px', border: `1px solid ${C.green}30` }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: C.green, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Final Premium</div>
                  <MoneyVal amount={contract.finalPremium} size="large" highlight />
                </div>
              )}
            </div>

            {!contract.isSpecialSalaryGrade && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <DetailRow label="Monthly Salary (Contract)" value={<MoneyVal amount={contract.monthlySalaryAsPerContract} />} />
                  <DetailRow label="Daily Salary (Contract)" value={<MoneyVal amount={contract.dailySalaryAsPerContract} />} />
                  <DetailRow label="Monthly Premium" value={<MoneyVal amount={contract.monthlyPremium} />} />
                </div>

                {/* Premium summary boxes */}
                {contract.premiumSummary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
                    {[
                      { label: 'Total Months', value: contract.premiumSummary.totalMonths },
                      { label: 'Full Months', value: contract.premiumSummary.fullMonths },
                      { label: 'Partial Months', value: contract.premiumSummary.partialMonths },
                      { label: 'Working Days', value: contract.premiumSummary.totalWorkingDays, accent: true },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.accent ? `${C.green}0f` : '#f8fafc', borderRadius: '10px', padding: '14px', border: `1px solid ${s.accent ? C.green+'30' : C.border}`, textAlign: 'center' }}>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: s.accent ? C.green : C.text }}>{s.value}</div>
                        <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Per-month breakdown */}
                {contract.workingDaysBreakdown?.length > 0 && (
                  <div style={{ borderRadius: '10px', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Monthly Premium Breakdown</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9' }}>
                            {['Month', 'Type', 'Working Days', 'Daily Rate', 'Premium'].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Month' || h === 'Type' ? 'left' : 'right', fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contract.workingDaysBreakdown.map((m, idx) => (
                            <>
                              <tr key={m.monthKey} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderTop: `1px solid ${C.border}` }}>
                                <td style={{ padding: '11px 14px', fontWeight: 600, color: C.text }}>{m.monthName} {m.year}</td>
                                <td style={{ padding: '11px 14px' }}>
                                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: m.isFullMonth ? '#ecfdf5' : '#fffbeb', color: m.isFullMonth ? '#059669' : '#d97706' }}>
                                    {m.isFullMonth ? 'Full' : 'Partial'}
                                  </span>
                                </td>
                                <td style={{ padding: '11px 14px', textAlign: 'right', color: C.text }}>{m.totalWorkingDaysInMonth} / {m.actualWorkingDaysInRange}</td>
                                <td style={{ padding: '11px 14px', textAlign: 'right', color: C.muted, fontFamily: 'monospace', fontSize: '12px' }}>₱{(m.dailyPremiumRate||0).toLocaleString('en-PH',{minimumFractionDigits:4,maximumFractionDigits:4})}</td>
                                <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>₱{(m.calculatedPremium||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                              </tr>
                              {m.holidaysInMonth?.length > 0 && (
                                <tr key={`${m.monthKey}-h`} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                  <td colSpan={5} style={{ padding: '0 14px 10px 14px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {m.holidaysInMonth.map(h => {
                                        const colors = { REGULAR: ['#fef2f2','#dc2626'], SPECIAL_NON_WORKING: ['#fff7ed','#ea580c'], SPECIAL_WORKING: ['#eff6ff','#2563eb'] };
                                        const [bg, fg] = colors[h.type] || colors.REGULAR;
                                        return (
                                          <span key={h.date} style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: bg, color: fg }}>
                                            🗓️ {new Date(h.date+'T00:00:00Z').toLocaleDateString('en-PH',{month:'short',day:'numeric',timeZone:'UTC'})} — {h.name}
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
                          <tr style={{ background: `${C.green}0f`, borderTop: `2px solid ${C.green}30` }}>
                            <td colSpan={2} style={{ padding: '12px 14px', fontWeight: 800, color: C.green, fontSize: '13px' }}>TOTAL</td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: C.text }}>{contract.premiumSummary?.totalWorkingDays} days</td>
                            <td />
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: C.green, fontFamily: 'monospace', fontSize: '15px' }}>₱{(contract.finalPremium||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {/* Legend */}
                    {contract.workingDaysBreakdown.some(m => m.holidaysInMonth?.length > 0) && (
                      <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                        {[['#dc2626','Regular Holiday (excluded)'],['#ea580c','Special Non-Working (excluded)'],['#2563eb','Special Working (counted)']].map(([c,l])=>(
                          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: C.muted }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c, display: 'inline-block' }} />{l}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: '12px', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', color: C.muted }}>
                  ℹ️ Partial-month premium = (Monthly Premium ÷ Working Days in Month) × Actual Days in Range. Excludes weekends and non-working holidays.
                </div>
              </>
            )}

            {contract.isSpecialSalaryGrade && (
              <div style={{ padding: '14px 18px', background: '#fef9c3', borderRadius: '10px', border: '1px solid #fef08a', fontSize: '13px', color: '#713f12', fontWeight: 500 }}>
                ⚠️ Special Salary Grade — no premium is applicable to this contract.
              </div>
            )}
          </SectionBlock>

          {/* Deductions */}
          {!contract.isSpecialSalaryGrade && contract.deductions && (
            <SectionBlock title="Deductions" accent="#fef2f2">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[
                  { label: 'SSS', val: contract.deductions.sss },
                  { label: 'Pag-IBIG', val: contract.deductions.pagibig },
                  { label: 'PhilHealth', val: contract.deductions.philhealth },
                  { label: 'Total', val: contract.deductions.total, bold: true },
                ].map(d => (
                  <div key={d.label}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: d.bold ? '#dc2626' : C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>{d.label}</div>
                    <div style={{ fontSize: d.bold ? '18px' : '15px', fontWeight: d.bold ? 800 : 600, color: d.bold ? '#dc2626' : C.text, fontFamily: 'monospace' }}>
                      ₱{(d.val||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </div>
                  </div>
                ))}
              </div>
            </SectionBlock>
          )}

          {/* Duties */}
          {contract.dutiesAndResponsibilities?.length > 0 && (
            <SectionBlock title={`Duties & Responsibilities (${contract.dutiesAndResponsibilities.length})`} accent="#faf5ff">
              <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {contract.dutiesAndResponsibilities.map((d, i) => (
                  <li key={i} style={{ fontSize: '13px', color: C.text, lineHeight: 1.5 }}>{d}</li>
                ))}
              </ol>
            </SectionBlock>
          )}

          {/* Signatories */}
          <SectionBlock title="Signatories" accent="#f8fafc">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {[
                { label: 'First Party', data: contract.signatories?.firstParty },
                { label: 'Approver', data: contract.signatories?.approver },
                { label: 'Accountant', data: contract.signatories?.accountant },
                { label: 'Finance Chief', data: contract.signatories?.financeChief },
              ].map(s => (
                <div key={s.label} style={{ padding: '14px 16px', background: '#fff', borderRadius: '10px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{s.data?.name || '—'}</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{s.data?.position || ''}</div>
                </div>
              ))}
            </div>
          </SectionBlock>

          {/* Signed Contract Banner */}
          {contract.signedContractFile && (
            <div style={{ padding: '16px 20px', background: '#ecfdf5', borderRadius: '10px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>✅</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#059669' }}>Signed Contract Uploaded</div>
                <div style={{ fontSize: '12px', color: '#065f46', marginTop: '2px' }}>Uploaded: {new Date(contract.signedContractFile.uploadedAt).toLocaleString('en-PH')}</div>
              </div>
            </div>
          )}

          {/* Archived */}
          {contract.isArchived && (
            <div style={{ padding: '16px 20px', background: '#fff7ed', borderRadius: '10px', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>📦</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#c2410c' }}>Archived Contract</div>
                <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '2px' }}>Archived: {new Date(contract.archivedAt).toLocaleString('en-PH')}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', background: '#fff', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '10px 28px', background: C.dark, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContractDetailsModal;