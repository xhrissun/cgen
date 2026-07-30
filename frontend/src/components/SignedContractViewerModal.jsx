import { useState, useEffect, useRef } from 'react';
import api from '../api.js';

// Shows the signed contract file (PDF or image) in a modal within the same
// window, instead of a new tab. Fetches the file as a blob with the
// Authorization header (same secure path as the Download button) rather
// than embedding the auth token in the iframe/img URL.
export default function SignedContractViewerModal({ contractId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [mimeType, setMimeType] = useState(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const fetchFile = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');
        const response = await api.get(`/api/contracts/${contractId}/signed-contract`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        });

        if (cancelled) return;

        const type = response.data.type || 'application/octet-stream';
        const url = window.URL.createObjectURL(response.data);
        blobUrlRef.current = url;
        setMimeType(type);
        setBlobUrl(url);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Failed to load the signed contract.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchFile();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        window.URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [contractId]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', `signed_contract_${contractId}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const isImage = mimeType?.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Signed Contract</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              disabled={!blobUrl}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
            >
              ⬇️ Download
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
            >
              ✕ Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {loading && (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <div className="text-center">
                <p className="text-red-600 mb-4">❌ {error}</p>
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm">
                  Close
                </button>
              </div>
            </div>
          )}

          {!loading && !error && blobUrl && (
            <>
              {isPdf && (
                <iframe
                  src={blobUrl}
                  className="w-full h-full min-h-[600px] border-0"
                  title="Signed Contract"
                />
              )}

              {isImage && (
                <div className="flex items-center justify-center">
                  <img src={blobUrl} alt="Signed Contract" className="max-w-full h-auto" />
                </div>
              )}

              {!isPdf && !isImage && (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">
                    📎 This file type cannot be previewed in browser.
                  </p>
                  <button onClick={handleDownload} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">
                    Download File
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}