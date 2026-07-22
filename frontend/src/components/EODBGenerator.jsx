import { useState, useEffect, useRef } from 'react';
import api, { getDocumentUrl } from '../api.js';
import JsBarcode from 'jsbarcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import CryptoJS from 'crypto-js';

function EODBGenerator({ userId, onDocumentUploaded }) {
  const [eodbData, setEodbData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [existingEODB, setExistingEODB] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);

  const idCardRef = useRef(null);
  const tinBarcodeRef = useRef(null);
  const contractBarcodeRef = useRef(null);

  useEffect(() => {
    fetchEODBData();
  }, [userId]);

  const fetchEODBData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/api/eodb/user-data', {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('EODB Data received:', response.data);
      setEodbData(response.data);

      const checkResponse = await api.get('/api/eodb/check-existing', {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Existing EODB check:', checkResponse.data);
      setExistingEODB(checkResponse.data);

      if (response.data.photoExists && response.data.photoFilename) {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 12);
        const photoUrl = getDocumentUrl(response.data.photoFilename, userId, token);
        console.log('Setting profile photo URL:', photoUrl);
        setProfilePhotoUrl(photoUrl);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching EODB data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    // IMPORTANT: this effect must also depend on `loading`.
    //
    // fetchEODBData() calls setEodbData(...) BEFORE the second await
    // resolves, and only calls setLoading(false) afterwards. Those two
    // setState calls land in separate render commits (they're on opposite
    // sides of an `await`), so:
    //   render #1: loading=true,  eodbData=<object>   → the component is
    //              still on the spinner branch, so the <svg ref=...> nodes
    //              are not mounted yet and the refs are null.
    //   render #2: loading=false, eodbData=<SAME ref>  → the <svg> nodes
    //              finally mount, but since `eodbData` didn't change
    //              reference, an effect keyed only on [eodbData] never
    //              fires again — so JsBarcode never runs against the real
    //              nodes and the barcodes never appear.
    // Depending on `loading` too guarantees we re-run once the refs are
    // actually in the DOM. The old setTimeout(100) couldn't fix this: the
    // effect body wasn't the problem, the effect never re-firing was.
    if (loading || !eodbData) return;

    const generateBarcodes = () => {
      if (eodbData?.tin && eodbData.tin.length === 9 && tinBarcodeRef.current) {
        try {
          JsBarcode(tinBarcodeRef.current, eodbData.tin, {
            format: 'CODE128',
            width: 1,
            height: 20,
            displayValue: true,
            fontSize: 12
          });
        } catch (err) {
          console.error('TIN barcode generation error:', err);
        }
      }

      if (eodbData?.contractNumber && contractBarcodeRef.current) {
        try {
          let cleanContractNumber = eodbData.contractNumber
            .replace(/^CONTRACT[-_]?/i, '')
            .replace(/^CON[-_]?/i, '')
            .trim();
          
          JsBarcode(contractBarcodeRef.current, cleanContractNumber, {
            format: 'CODE128',
            width: 0.8,
            height: 20,
            displayValue: true,
            fontSize: 10
          });
        } catch (err) {
          console.error('Contract barcode generation error:', err);
        }
      }
    };

    // A single rAF tick is enough now that we know the refs are mounted;
    // no need for an arbitrary delay.
    requestAnimationFrame(generateBarcodes);
  }, [eodbData, loading]);

  const generateHash = (data) => {
    return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex).slice(0, 7);
  };

  // html2canvas snapshots whatever is currently painted to the screen. If we
  // call it right after mutating the DOM (drawing a barcode, appending a
  // cloned node, etc.) there's no guarantee the browser has actually painted
  // that change yet — that's what produced "incomplete" barcodes. Two
  // rAFs guarantees at least one full paint has happened before we capture.
  const waitForPaint = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // The passport photo is applied as a CSS backgroundImage, which loads
  // asynchronously. If html2canvas captures before the browser has finished
  // fetching/decoding it, the photo comes out blank. Loading the same URL
  // through an Image() first (browser cache makes this effectively free on
  // the 2nd load) lets us know it's actually ready before we snapshot.
  const waitForImage = (url) =>
    new Promise((resolve) => {
      if (!url) return resolve();
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // don't block capture on a failed/expired image
      img.src = url;
      if (img.complete) resolve();
    });

  const handleGenerateID = async () => {
    if (!eodbData) {
      alert('Employee data not loaded');
      return;
    }

    if (existingEODB?.exists) {
      alert(
        `An EODB ID already exists for contract ${existingEODB.contractNumber}.\n\n` +
        `Generated on: ${new Date(existingEODB.eodbDocument.uploadDate).toLocaleString()}\n\n` +
        `You cannot generate another EODB ID for the same contract. ` +
        `Please contact your administrator if you need a replacement.`
      );
      return;
    }

    if (!eodbData.tin || eodbData.tin.length !== 9) {
      alert('Invalid TIN in your profile. Please update your profile with a valid 9-digit TIN.');
      return;
    }

    if (!eodbData.photoExists) {
      alert('No passport photo available. Please upload a passport photo first in the Personal Information tab.');
      return;
    }

    if (!eodbData.contractNumber) {
      alert('No contract number available. Please ensure you have an active contract.');
      return;
    }

    setGenerating(true);
    try {
      await waitForImage(profilePhotoUrl);
      await waitForPaint();

      const canvas = await html2canvas(idCardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      setCapturedImage(imgData);
      setShowConfirmModal(true);
    } catch (error) {
      console.error('Error capturing ID preview:', error);
      alert('Error generating preview');
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmGeneration = async () => {
    setShowConfirmModal(false);
    setGenerating(true);

    try {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const dataToHash = `${eodbData.tin}-${timestamp}-${random}`;
      const serialNumber = generateHash(dataToHash);

      const idCardClone = idCardRef.current.cloneNode(true);
      idCardClone.style.position = 'absolute';
      idCardClone.style.left = '-9999px';
      idCardClone.style.top = '0';
      document.body.appendChild(idCardClone);

      const serialBarcodeContainer = idCardClone.querySelector('#serial-barcode-container');
      
      if (serialBarcodeContainer) {
        const serialBarcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        
        JsBarcode(serialBarcodeSvg, serialNumber, {
          format: 'CODE128',
          width: 1,
          height: 20,
          displayValue: true,
          fontSize: 10,
          margin: 0
        });
        
        serialBarcodeContainer.innerHTML = '';
        serialBarcodeContainer.appendChild(serialBarcodeSvg);
      }

      await waitForImage(profilePhotoUrl);
      await waitForPaint();

      const canvas = await html2canvas(idCardClone, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      document.body.removeChild(idCardClone);

      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error('Canvas capture failed - empty canvas');
      }

      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user'));
      await api.post('/api/eodb/log-print', {
        tin: eodbData.tin,
        employeeName: `${eodbData.firstName} ${eodbData.lastName}`,
        serialNumber: serialNumber,
        printedBy: user.username,
        timestamp: new Date(timestamp).toISOString()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [210, 148]
      });

      const idWidth = 90;
      const idHeight = 125;
      const margin = 10;

      const imgData = canvas.toDataURL('image/jpeg', 1.0);

      pdf.addImage(imgData, 'JPEG', margin, margin, idWidth, idHeight);
      pdf.addImage(imgData, 'JPEG', 210 - idWidth - margin, margin, idWidth, idHeight);

      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text('PRINT SETTINGS: A5, Landscape, Fit to printable area', 105, 5, { align: 'center' });

      const pdfBlob = pdf.output('blob');

      const formData = new FormData();
      formData.append('file', pdfBlob, `EODB-ID-${serialNumber}.pdf`);
      formData.append('type', 'EODB_ID');
      formData.append('description', `EODB ID - Serial: ${serialNumber} - Generated: ${new Date().toLocaleDateString()}`);
      formData.append('isProfilePhoto', 'false');
      formData.append('contractNumber', eodbData.contractNumber);

      try {
        await api.post(`/api/users/${userId}/documents`, formData, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        
        if (onDocumentUploaded) {
          onDocumentUploaded();
        }
        
      } catch (uploadError) {
        console.error('Failed to save EODB ID PDF to documents:', uploadError);
      }

      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');

      alert('EODB ID generated successfully! The PDF has been saved to your documents and opened for printing.');

    } catch (error) {
      console.error('Error generating ID:', error);
      alert('Error generating ID: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const formatDateToMMDDYYYY = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}-${day}-${year}`;
  };

  const formatName = (firstName, middleInitial, lastName, title) => {
    const titlePrefix = title ? `${title} ` : '';
    const fullFirstName = `${titlePrefix}${firstName}`;
    const mi = middleInitial ? `${middleInitial}.` : '';
    return { fullFirstName, lastNameWithMI: `${mi} ${lastName}` };
  };

  // Validation checks
  const hasValidTIN = eodbData?.tin && eodbData.tin.length === 9;
  const hasPhoto = eodbData?.photoExists;
  const hasContract = eodbData?.contractNumber;
  const alreadyGenerated = existingEODB?.exists;

  const canGenerate = hasValidTIN && hasPhoto && hasContract && !alreadyGenerated;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading EODB data...</p>
        </div>
      </div>
    );
  }

  if (!eodbData) {
    return (
      <div className="card max-w-2xl mx-auto">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">⚠️</div>
          <p className="text-red-600 font-semibold text-lg mb-4">Failed to load employee data</p>
          <button onClick={fetchEODBData} className="btn btn-primary">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  const { fullFirstName, lastNameWithMI } = formatName(
    eodbData.firstName,
    eodbData.middleInitial,
    eodbData.lastName,
    eodbData.title
  );

  const contractDuration = eodbData.contractStart && eodbData.contractEnd
    ? `${formatDateToMMDDYYYY(eodbData.contractStart)} to ${formatDateToMMDDYYYY(eodbData.contractEnd)}`
    : 'N/A';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl shadow-xl p-8 text-white">
        <h2 className="text-4xl font-bold mb-2">🆔 EODB ID Generator</h2>
        <p className="text-blue-100 text-lg">Generate your official EODB identification card</p>
      </div>

      {/* Status Alert */}
      {alreadyGenerated && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 shadow-md animate-pulse">
          <div className="flex items-start">
            <span className="text-4xl mr-4">🚫</span>
            <div className="flex-1">
              <h3 className="font-bold text-red-900 text-xl mb-2">EODB ID Already Generated</h3>
              <p className="text-red-800 mb-1">
                An EODB ID already exists for contract <span className="font-semibold">{existingEODB.contractNumber}</span>
              </p>
              <p className="text-red-700 text-sm mb-2">
                📅 Generated on: {new Date(existingEODB.eodbDocument.uploadDate).toLocaleString()}
              </p>
              <p className="text-red-900 font-medium bg-red-100 inline-block px-3 py-1 rounded">
                ⚠️ Duplicate generation is blocked. Contact your administrator for replacement.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - ID Preview */}
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">📸 ID Preview</h3>
              <span className="px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                Live Preview
              </span>
            </div>
            
            <div className="flex justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
              <div
                ref={idCardRef}
                className="relative transform hover:scale-105 transition-transform duration-300"
                style={{
                  width: '9cm',
                  height: '12.5cm',
                  backgroundImage: 'url(/arta-template.jpg)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: '26.5px',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)'
                }}
              >
                {/* Photo Container */}
                <div
                  style={{
                    position: 'absolute',
                    top: '40%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '3cm',
                    height: '4cm',
                    border: '2px solid #003521',
                    backgroundColor: '#f8fafc',
                    overflow: 'hidden',
                    backgroundImage: profilePhotoUrl ? `url(${profilePhotoUrl})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  {!profilePhotoUrl && (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                      No Photo
                    </div>
                  )}
                </div>

                {/* Name Section */}
                <div
                  style={{
                    position: 'absolute',
                    width: '100%',
                    top: '68%',
                    transform: 'translateY(-50%)',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      fontSize: '26pt',
                      fontWeight: '900',
                      fontFamily: 'Arial Black, sans-serif',
                      color: '#000',
                      lineHeight: '1.1',
                      marginBottom: '2px'
                    }}
                  >
                    {fullFirstName.toUpperCase()}
                  </div>
                  <div
                    style={{
                      fontSize: '14pt',
                      fontWeight: '900',
                      fontFamily: 'Arial Black, sans-serif',
                      color: '#000',
                      lineHeight: '1.1',
                      marginTop: '0'
                    }}
                  >
                    {lastNameWithMI.toUpperCase()}
                  </div>
                </div>

                {/* Details Section */}
                <div
                  style={{
                    position: 'absolute',
                    width: '100%',
                    top: '11.35cm',
                    transform: 'translateY(-50%)',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      fontSize: '12pt',
                      fontFamily: 'Tahoma, sans-serif',
                      fontWeight: 'bold',
                      color: 'white',
                      lineHeight: '0.9',
                      marginBottom: '3px'
                    }}
                  >
                    {eodbData.position.toUpperCase()}
                  </div>
                  <div
                    style={{
                      fontSize: '9.8pt',
                      fontFamily: 'Tahoma, sans-serif',
                      fontWeight: 'bold',
                      color: 'white',
                      lineHeight: '1'
                    }}
                  >
                    {eodbData.assignment.toUpperCase()}
                  </div>
                </div>

                {/* TIN Barcode (right side) */}
                <div
                  style={{
                    position: 'absolute',
                    right: '.6cm',
                    top: '41%',
                    transform: 'translateY(-50%) rotate(-90deg)',
                    transformOrigin: 'center'
                  }}
                >
                  <svg ref={tinBarcodeRef}></svg>
                </div>

                {/* Contract Number Barcode (left side) */}
                <div
                  style={{
                    position: 'absolute',
                    left: '.4cm',
                    top: '41%',
                    transform: 'translateY(-50%) rotate(90deg)',
                    transformOrigin: 'center'
                  }}
                >
                  <svg ref={contractBarcodeRef}></svg>
                </div>

                {/* Contract Duration Text */}
                <div
                  style={{
                    position: 'absolute',
                    left: '1.1cm',
                    bottom: '7.2cm',
                    transform: 'rotate(90deg)',
                    fontSize: '8pt',
                    fontFamily: 'Tahoma, sans-serif',
                    color: 'black',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {contractDuration}
                </div>

                {/* Serial Barcode Container */}
                <div
                  id="serial-barcode-container"
                  style={{
                    position: 'absolute',
                    right: '-.5cm',
                    top: '41%',
                    transform: 'translateY(-50%) rotate(-90deg)',
                    transformOrigin: 'center'
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Requirements & Action */}
        <div className="space-y-6">
          {/* Requirements Checklist */}
          <div className="card">
            <h3 className="text-2xl font-bold mb-6 text-gray-900">✅ Requirements Checklist</h3>
            
            <div className="space-y-4">
              {/* TIN Check */}
              <div className={`flex items-start p-4 rounded-lg border-2 transition-all ${
                hasValidTIN 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <span className="text-3xl mr-4">
                  {hasValidTIN ? '✅' : '❌'}
                </span>
                <div className="flex-1">
                  <h4 className="font-semibold text-lg mb-1">Valid TIN (9 digits)</h4>
                  <p className="text-sm text-gray-700">
                    {eodbData.tin ? (
                      <>Current TIN: <span className="font-mono font-semibold">{eodbData.tin}</span> ({eodbData.tin.length} digits)</>
                    ) : (
                      'No TIN set in your profile'
                    )}
                  </p>
                  {!hasValidTIN && (
                    <p className="text-red-600 text-sm mt-2 font-medium">
                      ⚠️ Update your TIN in Personal Information (format: XXX-XXX-XXX)
                    </p>
                  )}
                </div>
              </div>

              {/* Photo Check */}
              <div className={`flex items-start p-4 rounded-lg border-2 transition-all ${
                hasPhoto 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <span className="text-3xl mr-4">
                  {hasPhoto ? '✅' : '❌'}
                </span>
                <div className="flex-1">
                  <h4 className="font-semibold text-lg mb-1">Passport Photo Uploaded</h4>
                  <p className="text-sm text-gray-700">
                    {hasPhoto ? (
                      <>Photo: <span className="font-mono text-xs">{eodbData.photoFilename}</span></>
                    ) : (
                      'No passport photo uploaded'
                    )}
                  </p>
                  {!hasPhoto && (
                    <p className="text-red-600 text-sm mt-2 font-medium">
                      ⚠️ Upload a passport photo in Personal Information tab
                    </p>
                  )}
                </div>
              </div>

              {/* Contract Check */}
              <div className={`flex items-start p-4 rounded-lg border-2 transition-all ${
                hasContract 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <span className="text-3xl mr-4">
                  {hasContract ? '✅' : '❌'}
                </span>
                <div className="flex-1">
                  <h4 className="font-semibold text-lg mb-1">Active Contract</h4>
                  <p className="text-sm text-gray-700">
                    {hasContract ? (
                      <>Contract: <span className="font-semibold">{eodbData.contractNumber}</span></>
                    ) : (
                      'No active contract found'
                    )}
                  </p>
                  {!hasContract && (
                    <p className="text-red-600 text-sm mt-2 font-medium">
                      ⚠️ Contact administrator to set up your contract
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Employee Information */}
          <div className="card bg-gradient-to-br from-blue-50 to-indigo-50">
            <h3 className="text-2xl font-bold mb-6 text-gray-900">👤 Your Information</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-blue-200">
                <span className="text-gray-600 font-medium">Name:</span>
                <span className="text-gray-900 font-semibold">{fullFirstName} {lastNameWithMI}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-blue-200">
                <span className="text-gray-600 font-medium">Position:</span>
                <span className="text-gray-900 font-semibold">{eodbData.position}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-blue-200">
                <span className="text-gray-600 font-medium">Assignment:</span>
                <span className="text-gray-900 font-semibold">{eodbData.assignment}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600 font-medium">Contract Period:</span>
                <span className="text-gray-900 font-semibold text-sm">{contractDuration}</span>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="card bg-white">
            <button
              onClick={handleGenerateID}
              disabled={!canGenerate || generating}
              className={`w-full py-6 rounded-xl font-bold text-xl transition-all transform ${
                canGenerate && !generating
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl hover:scale-105'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {generating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating ID...
                </span>
              ) : alreadyGenerated ? (
                '🚫 EODB ID Already Generated'
              ) : (
                '🎫 Generate My EODB ID'
              )}
            </button>

            {canGenerate && !alreadyGenerated && (
              <p className="text-center text-sm text-gray-500 mt-4">
                💡 A preview will be shown before final generation
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 animate-slideUp">
            <div className="p-8">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">📸</div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">Confirm Your Photo</h3>
                <p className="text-gray-600">Please verify this is the correct photo for your EODB ID</p>
              </div>
              
              {capturedImage && (
                <div className="bg-gray-100 p-4 rounded-xl mb-6">
                  <img
                    src={capturedImage}
                    alt="ID Preview"
                    className="max-w-full max-h-96 mx-auto rounded-lg shadow-lg"
                  />
                </div>
              )}
              
              <div className="flex gap-4">
                <button
                  onClick={handleConfirmGeneration}
                  className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-4 rounded-xl font-bold text-lg hover:from-green-700 hover:to-green-800 transform hover:scale-105 transition-all shadow-lg"
                >
                  ✅ Yes, Generate ID
                </button>
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setCapturedImage(null);
                  }}
                  className="flex-1 bg-gray-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-600 transform hover:scale-105 transition-all shadow-lg"
                >
                  ❌ No, Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}

export default EODBGenerator;