// frontend/src/components/ui.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives — drop-in loading states, toasts, empty states.
// Zero logic changes required in any consumer; just import and render.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';

// ─── Top Progress Bar ────────────────────────────────────────────────────────
// Mounts at the very top of the viewport (fixed). Animates from 0→85% while
// loading is true, then quickly completes to 100% and fades out.
// Usage: <TopProgressBar loading={isLoading} />
export function TopProgressBar({ loading }) {
  const [width, setWidth]     = useState(0);
  const [visible, setVisible] = useState(false);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    let growTimer, doneTimer, hideTimer;

    if (loading) {
      setDone(false);
      setVisible(true);
      setWidth(0);
      // Ramp quickly to 30%, then slowly crawl toward 85%
      growTimer = setTimeout(() => setWidth(30), 30);
      const crawl = setTimeout(() => setWidth(85), 300);
      return () => { clearTimeout(growTimer); clearTimeout(crawl); };
    } else {
      // Complete and fade out
      setWidth(100);
      doneTimer = setTimeout(() => setDone(true), 400);
      hideTimer = setTimeout(() => { setVisible(false); setWidth(0); setDone(false); }, 700);
      return () => { clearTimeout(doneTimer); clearTimeout(hideTimer); };
    }
  }, [loading]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-blue-100"
      aria-hidden="true"
    >
      <div
        style={{
          width: `${width}%`,
          transition: done
            ? 'width 0.2s ease-out, opacity 0.3s ease 0.1s'
            : width === 0
            ? 'none'
            : 'width 0.8s cubic-bezier(0.1, 0.4, 0.2, 1)',
          opacity: done ? 0 : 1,
        }}
        className="h-full bg-blue-600 rounded-r shadow-[0_0_8px_rgba(37,99,235,0.6)]"
      />
    </div>
  );
}

// ─── App Boot Skeleton ────────────────────────────────────────────────────────
// Full-page skeleton shown immediately after login while the dashboard fetches
// its first payload. Matches the general layout (sidebar + content area).
export function AppBootSkeleton() {
  return (
    <div className="flex min-h-screen bg-gray-50" aria-busy="true" aria-label="Loading dashboard">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex flex-col w-56 bg-gray-900 p-4 gap-4 shrink-0">
        <div className="h-8 w-32 bg-gray-700 rounded animate-pulse mb-4" />
        {[80, 64, 72, 60, 68].map((w, i) => (
          <div key={i} className={`h-8 bg-gray-700/60 rounded-lg animate-pulse`} style={{ width: `${w}%`, animationDelay: `${i * 60}ms` }} />
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-6 space-y-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-36 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-9 w-9 bg-gray-200 rounded-full animate-pulse" />
        </div>

        {/* KPI cards row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3 shadow-sm" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex justify-between items-start">
                <div className="h-10 w-10 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-4 w-16 bg-gray-100 rounded-full animate-pulse" />
              </div>
              <div className="h-7 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-28 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Two-column content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 shadow-sm">
              <div className="h-5 w-36 bg-gray-200 rounded animate-pulse" />
              {[...Array(5)].map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-4 w-4 bg-gray-100 rounded animate-pulse shrink-0" />
                  <div className="h-4 bg-gray-100 rounded animate-pulse flex-1" style={{ width: `${60 + j * 7}%` }} />
                  <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
// Usage: <Spinner /> <Spinner size="sm" /> <Spinner size="lg" color="white" />
export function Spinner({ size = 'md', color = 'blue', className = '' }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-9 h-9 border-[3px]', xl: 'w-12 h-12 border-4' };
  const colors = { blue: 'border-blue-200 border-t-blue-600', white: 'border-white/30 border-t-white', gray: 'border-gray-200 border-t-gray-500', green: 'border-green-200 border-t-green-600' };
  return (
    <div
      className={`${sizes[size]} ${colors[color]} rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

// ─── Button with built-in loading state ──────────────────────────────────────
// Usage: <LoadingButton loading={saving} onClick={handleSave}>Save</LoadingButton>
export function LoadingButton({ loading, children, disabled, className = '', spinnerColor = 'white', ...props }) {
  return (
    <button
      disabled={loading || disabled}
      className={`relative inline-flex items-center justify-center gap-2 ${className}`}
      {...props}
    >
      {loading && <Spinner size="sm" color={spinnerColor} />}
      <span className={loading ? 'opacity-80' : ''}>{children}</span>
    </button>
  );
}

// ─── Skeleton primitives ──────────────────────────────────────────────────────
export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-gray-200 rounded animate-pulse`} />;
}

// One full table row of skeleton cells
export function SkeletonRow({ cols = 5 }) {
  const widths = ['w-8', 'w-32', 'w-24', 'w-20', 'w-16', 'w-24', 'w-20'];
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className={`h-4 ${widths[i % widths.length]} bg-gray-200 rounded animate-pulse`} />
        </td>
      ))}
    </tr>
  );
}

// Multiple skeleton rows for table loading
export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </>
  );
}

// Stat card skeleton for dashboard overview
export function SkeletonStatCard() {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-gray-200 rounded-xl animate-pulse" />
        <div className="w-16 h-5 bg-gray-200 rounded-full animate-pulse" />
      </div>
      <div className="w-16 h-8 bg-gray-200 rounded animate-pulse mb-2" />
      <div className="w-24 h-3 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}

// Generic content card skeleton
export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card space-y-3">
      <div className="w-1/3 h-5 bg-gray-200 rounded animate-pulse" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-4 bg-gray-200 rounded animate-pulse ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

// ─── Full-page loader (tab/section switching) ─────────────────────────────────
// Usage: if (loading) return <PageLoader />
export function PageLoader({ message = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-blue-100 animate-pulse" />
        <Spinner size="xl" color="blue" className="absolute inset-0" />
      </div>
      <p className="text-sm text-gray-500 font-medium animate-pulse">{message}</p>
    </div>
  );
}

// ─── Inline section loader (inside a card/panel) ─────────────────────────────
export function SectionLoader({ message = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-gray-400">
      <Spinner size="md" color="gray" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
// Usage: <EmptyState icon="📄" title="No contracts yet" description="Create your first contract to get started." />
export function EmptyState({ icon = '📭', title = 'Nothing here yet', description = '', action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <p className="text-gray-700 font-semibold text-lg mb-1">{title}</p>
      {description && <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Toast notification system ────────────────────────────────────────────────
// 1. Wrap your app (or a section) with <ToastProvider>
// 2. Call useToast() to get { toast } and fire toasts anywhere
//
// toast.success('Saved!') | toast.error('Something went wrong') | toast.info('Note')

const TOAST_DURATION = 4000;

let _addToast = null;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = TOAST_DURATION) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    return id;
  }, []);

  // Expose globally so non-hook consumers can call it
  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const styles = {
    success: 'bg-white border-l-4 border-emerald-500 text-gray-800 shadow-lg shadow-emerald-100/50',
    error:   'bg-white border-l-4 border-red-500   text-gray-800 shadow-lg shadow-red-100/50',
    warning: 'bg-white border-l-4 border-amber-500 text-gray-800 shadow-lg shadow-amber-100/50',
    info:    'bg-white border-l-4 border-blue-500  text-gray-800 shadow-lg shadow-blue-100/50',
  };

  return (
    <>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg min-w-[260px] max-w-[360px] animate-slideUp ${styles[t.type]}`}
          >
            <span className="text-base mt-0.5 flex-shrink-0">{icons[t.type]}</span>
            <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors leading-none text-lg font-bold mt-0.5"
              aria-label="Dismiss"
            >×</button>
          </div>
        ))}
      </div>
    </>
  );
}

// Hook — use inside components wrapped by ToastProvider
export function useToast() {
  const add = useCallback((message, type, duration) => {
    if (_addToast) _addToast(message, type, duration);
    else console.warn('useToast: ToastProvider not mounted');
  }, []);

  return {
    toast: {
      success: (msg, dur) => add(msg, 'success', dur),
      error:   (msg, dur) => add(msg, 'error',   dur),
      warning: (msg, dur) => add(msg, 'warning',  dur),
      info:    (msg, dur) => add(msg, 'info',     dur),
    }
  };
}

// ─── Convenience: replace alert() calls with this ────────────────────────────
// Direct call without hook: toast.success('Done') from anywhere after ToastProvider mounts
export const toast = {
  success: (msg, dur) => _addToast?.(msg, 'success', dur),
  error:   (msg, dur) => _addToast?.(msg, 'error',   dur),
  warning: (msg, dur) => _addToast?.(msg, 'warning',  dur),
  info:    (msg, dur) => _addToast?.(msg, 'info',     dur),
};