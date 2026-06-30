// FILE: cgen-main/frontend/src/components/salaryGradeTrend.jsx
//
// Shared comparison logic for the Salary Grades table views (both the
// read-only SalaryGradeViewer and the editable AdminDashboard table).
// Given the currently-viewed period's grades and the immediately-preceding
// period's grades (matched by `grade` label), renders a small ▲/▼/— badge
// next to each peso amount showing whether that figure increased,
// decreased, or stayed the same compared to the previous salary set.

/**
 * From the full, descending-by-date periods list and the currently active
 * period's start date, find the period that comes immediately BEFORE it
 * (i.e. the previous salary set), or null if the active period is the
 * oldest one on record.
 */
export function findPreviousPeriod(periods, activePeriodStart) {
  if (!periods?.length || !activePeriodStart) return null;
  const activeISO = new Date(activePeriodStart).toISOString();
  const idx = periods.findIndex(p => new Date(p.periodStartDate).toISOString() === activeISO);
  if (idx === -1 || idx === periods.length - 1) return null; // not found, or already the oldest
  return periods[idx + 1];
}

/**
 * Build a Map of grade label -> previous-period salary grade doc, for O(1)
 * lookup while rendering table rows.
 */
export function buildPreviousGradeMap(previousPeriodGrades) {
  const map = new Map();
  (previousPeriodGrades || []).forEach(sg => {
    map.set(String(sg.grade), sg);
  });
  return map;
}

const fmt = (n) => Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Small inline badge: ▲ green for increase, ▼ red for decrease, — gray for
 * no change. Renders nothing if there's no previous-period figure to
 * compare against (e.g. the oldest period on record, or a brand-new grade
 * that didn't exist in the previous set).
 */
export function TrendBadge({ current, previous }) {
  if (previous === undefined || previous === null || isNaN(previous)) return null;
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const diff = cur - prev;

  if (Math.abs(diff) < 0.005) {
    return (
      <span
        title="No change from the previous salary set"
        style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap' }}
      >
        — no change
      </span>
    );
  }

  const up = diff > 0;
  const pct = prev !== 0 ? (diff / prev) * 100 : null;

  return (
    <span
      title={`${up ? 'Increased' : 'Decreased'} by ₱${fmt(diff)} vs. previous salary set (₱${prev.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
      style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: up ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}
    >
      {up ? '▲' : '▼'} ₱{fmt(diff)}{pct !== null ? ` (${up ? '+' : '-'}${Math.abs(pct).toFixed(1)}%)` : ''}
    </span>
  );
}

/**
 * New-grade badge: shown instead of a TrendBadge when this grade simply
 * didn't exist in the previous salary set (e.g. a newly added special
 * grade), so the absence of a comparison doesn't read as a bug.
 */
export function NewGradeBadge() {
  return (
    <span
      title="This grade did not exist in the previous salary set"
      style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: '#2563eb', whiteSpace: 'nowrap' }}
    >
      ★ new
    </span>
  );
}