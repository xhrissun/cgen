import { useEffect, useRef, useState, useCallback } from 'react';

// User-input events that count as "activity". Deliberately excludes plain
// window focus/blur — switching tabs shouldn't count as activity, but
// touching the page should.
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'];

/**
 * Logs the user out after a period of inactivity, showing a countdown
 * warning first so an idle-but-present user (e.g. reading a long page)
 * gets a chance to stay signed in before being kicked out.
 *
 * @param {boolean} enabled     Only runs the timers while true (i.e. while logged in).
 * @param {number}  timeoutMs   Total idle time allowed before logout.
 * @param {number}  warningMs   How long before timeoutMs the warning modal appears.
 * @param {Function} onLogout  Called when the idle period fully elapses.
 */
export function useInactivityLogout({ enabled, timeoutMs, warningMs, onLogout }) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(warningMs / 1000));

  const idleTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownRef = useRef(null);

  const clearAllTimers = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    clearInterval(countdownRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);

    if (!enabled) return;

    const activeTimeBeforeWarning = Math.max(timeoutMs - warningMs, 0);

    idleTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(Math.ceil(warningMs / 1000));

      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      logoutTimerRef.current = setTimeout(() => {
        clearInterval(countdownRef.current);
        setShowWarning(false);
        onLogout();
      }, warningMs);
    }, activeTimeBeforeWarning);
  }, [enabled, timeoutMs, warningMs, onLogout, clearAllTimers]);

  const stayLoggedIn = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      setShowWarning(false);
      return undefined;
    }

    resetTimer();

    const handleActivity = () => {
      // While the warning is up, incidental mouse movement shouldn't
      // silently dismiss it — the user must explicitly choose to stay.
      setShowWarning(current => {
        if (!current) resetTimer();
        return current;
      });
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
      clearAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeoutMs, warningMs]);

  return { showWarning, secondsLeft, stayLoggedIn };
}