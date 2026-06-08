import { useState, useEffect } from 'react';
import axios from 'axios';

function DocumentViewerModal({ userId, filename, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [fileType, setFileType] = useState(null);

  useEffect(() => {
    fetchDocument();
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, []);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/users/${userId}/documents/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const ext = filename.split('.').pop().toLowerCase();
      let mimeType = response.data.type;
      
      // Ensure correct MIME type based on extension
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'doc') mimeType = 'application/msword';
      else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const blob = new Blob([response.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      setFileUrl(url);
      setFileType(ext);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load document');
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold truncate">{filename}</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              disabled={!fileUrl}
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

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 mb-4">❌ {error}</p>
                <button onClick={onClose} className="btn btn-secondary">
                  Close
                </button>
              </div>
            </div>
          )}

          {!loading && !error && fileUrl && (
            <>
              {fileType === 'pdf' && (
                <iframe
                  src={fileUrl}
                  className="w-full h-full min-h-[600px] border-0"
                  title={filename}
                />
              )}

              {['jpg', 'jpeg', 'png', 'gif'].includes(fileType) && (
                <div className="flex items-center justify-center">
                  <img
                    src={fileUrl}
                    alt={filename}
                    className="max-w-full h-auto"
                  />
                </div>
              )}

              {['doc', 'docx'].includes(fileType) && (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">
                    📄 Word documents cannot be previewed in browser.
                  </p>
                  <button
                    onClick={handleDownload}
                    className="btn btn-primary"
                  >
                    Download to View
                  </button>
                </div>
              )}

              {!['pdf', 'jpg', 'jpeg', 'png', 'gif', 'doc', 'docx'].includes(fileType) && (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">
                    📎 This file type cannot be previewed in browser.
                  </p>
                  <button
                    onClick={handleDownload}
                    className="btn btn-primary"
                  >
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

export default DocumentViewerModal;