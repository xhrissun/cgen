// frontend/src/components/InactivityWarningModal.jsx
// Countdown modal shown shortly before an idle session is auto-logged-out.

export default function InactivityWarningModal({ open, secondsLeft, onStay, onLogoutNow }) {
  if (!open) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
        <h2 id="inactivity-title" className="text-lg font-semibold text-gray-900 mb-2">
          Are you still there?
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          You've been inactive for a while. For your security, you'll be logged out in{' '}
          <span className="font-semibold text-gray-900">{display}</span> unless you choose to stay.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onLogoutNow}
            className="px-4 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-100"
          >
            Log out now
          </button>
          <button
            onClick={onStay}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Stay logged in
          </button>
        </div>
      </div>
    </div>
  );
}