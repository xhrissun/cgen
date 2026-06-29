import { useState, useEffect } from 'react';
import { SectionLoader, EmptyState, Spinner } from './ui.jsx';
import api, { openDocument, getDocumentUrl, API_BASE } from '../api.js';
import ContractGenerator from './ContractGenerator';
import DocumentViewerModal from './DocumentViewerModal';
import EnhancedImageCropper from './EnhancedImageCropper';
import EODBGenerator from './EODBGenerator';

const getProfilePhotoUrl = (photoValue, userId, token) => getDocumentUrl(photoValue, userId, token);

const formatPhilHealth = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  let formatted = '';
  if (numbers.length <= 2) formatted = numbers;
  else if (numbers.length <= 11) formatted = numbers.slice(0, 2) + '-' + numbers.slice(2);
  else formatted = numbers.slice(0, 2) + '-' + numbers.slice(2, 11) + '-' + numbers.slice(11, 12);
  return formatted;
};

const formatPagIbig = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  let formatted = '';
  if (numbers.length <= 4) formatted = numbers;
  else if (numbers.length <= 8) formatted = numbers.slice(0, 4) + '-' + numbers.slice(4);
  else formatted = numbers.slice(0, 4) + '-' + numbers.slice(4, 8) + '-' + numbers.slice(8, 12);
  return formatted;
};

const formatTIN = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  let formatted = '';
  if (numbers.length <= 3) formatted = numbers;
  else if (numbers.length <= 6) formatted = numbers.slice(0, 3) + '-' + numbers.slice(3);
  else if (numbers.length <= 9) formatted = numbers.slice(0, 3) + '-' + numbers.slice(3, 6) + '-' + numbers.slice(6);
  else formatted = numbers.slice(0, 3) + '-' + numbers.slice(3, 6) + '-' + numbers.slice(6, 9) + '-' + numbers.slice(9, 12);
  return formatted;
};

const formatPhoneNumber = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  let digitsToFormat = numbers;
  if (numbers.startsWith('0')) digitsToFormat = '63' + numbers.slice(1);
  else if (numbers.startsWith('63')) digitsToFormat = numbers;
  else digitsToFormat = '63' + numbers;
  let formatted = '+';
  if (digitsToFormat.length <= 2) formatted += digitsToFormat;
  else if (digitsToFormat.length <= 5) formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2);
  else if (digitsToFormat.length <= 8) formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2, 5) + '-' + digitsToFormat.slice(5);
  else formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2, 5) + '-' + digitsToFormat.slice(5, 8) + '-' + digitsToFormat.slice(8, 12);
  return formatted;
};

const validateFormats = (personalInfo) => {
  const errors = [];
  if (personalInfo.philhealth) {
    const numbers = personalInfo.philhealth.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) errors.push('PhilHealth must be 12 digits (XX-XXXXXXXXX-X)');
  }
  if (personalInfo.pagibig) {
    const numbers = personalInfo.pagibig.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) errors.push('Pag-IBIG must be 12 digits (XXXX-XXXX-XXXX)');
  }
  if (personalInfo.tin) {
    const numbers = personalInfo.tin.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) errors.push('TIN must be 12 digits (XXX-XXX-XXX-XXX)');
  }
  if (personalInfo.phoneNumber) {
    const numbers = personalInfo.phoneNumber.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) errors.push('Phone Number must be 10 digits after +63 (+63-XXX-XXX-XXXX)');
  }
  return errors;
};

/* ─── Design tokens (mirrors LoginForm / AdminDashboard palette) ─── */
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
  inputBg: 'rgba(255,255,255,0.05)',
  inputBorder: 'rgba(255,255,255,0.12)',
  inputFocus: '#2e8b57',
  red: '#ef4444',
  redMuted: 'rgba(239,68,68,0.15)',
  blue: '#3b82f6',
  blueMuted: 'rgba(59,130,246,0.15)',
  yellow: '#f59e0b',
  yellowMuted: 'rgba(245,158,11,0.15)',
};

const TAB_ICONS = {
  profile: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  contracts: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  ),
  documents: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  eodb: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  ),
  password: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
};

function ContractualDashboard({ user }) {
  if (!user || typeof user !== 'object' || (!user._id && !user.id)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}>
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: '40px 48px', textAlign: 'center', maxWidth: 420 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: D.redMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" fill="none" stroke={D.red} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 style={{ color: D.textPrimary, fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Session Error</h2>
          <p style={{ color: D.textSecondary, fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>User information is missing or corrupted. Please log in again.</p>
          <button
            onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
            style={{ background: D.green, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState('profile');
  const [personalInfo, setPersonalInfo] = useState(user.personalInfo || {});
  const [originalPersonalInfo, setOriginalPersonalInfo] = useState(user.personalInfo || {});
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ type: 'SIGNED_CONTRACT', description: '', file: null });
  const [viewingDocument, setViewingDocument] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [currentCropType, setCurrentCropType] = useState('passport');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState('');

  const tabs = [
    { id: 'profile', name: 'Personal Info' },
    { id: 'contracts', name: 'My Contracts' },
    { id: 'documents', name: 'Documents' },
    { id: 'eodb', name: 'EODB ID' },
    { id: 'password', name: 'Password' },
  ];

  useEffect(() => {
    if (!user?.id && !user?._id) return;
    const initialize = async () => {
      try { await fetchDocuments(); loadProfilePhoto(); } catch (err) { console.error('Dashboard init failed:', err); }
    };
    initialize();
  }, [user?.id, user?._id, user?.personalInfo?.profilePhoto]);

  useEffect(() => {
    const handleStorageChange = () => {
      const updatedUser = JSON.parse(localStorage.getItem('user'));
      if (updatedUser?.personalInfo?.profilePhoto) {
        const userId = updatedUser.id || updatedUser._id;
        const token = localStorage.getItem('token');
        setProfilePhotoUrl(getProfilePhotoUrl(updatedUser.personalInfo.profilePhoto, userId, token));
        setPersonalInfo(updatedUser.personalInfo);
        setOriginalPersonalInfo(updatedUser.personalInfo);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('userUpdated', handleStorageChange);
    window.addEventListener('profilePhotoUpdated', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userUpdated', handleStorageChange);
      window.removeEventListener('profilePhotoUpdated', handleStorageChange);
    };
  }, []);

  useEffect(() => { if (refreshTrigger > 0) fetchDocuments(); }, [refreshTrigger]);

  const loadProfilePhoto = () => {
    const userId = user?.id || user?._id;
    if (!userId || !user.personalInfo?.profilePhoto) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    setProfilePhotoUrl(getProfilePhotoUrl(user.personalInfo.profilePhoto, userId, token));
  };

  const handleDocumentUploaded = () => { setRefreshTrigger(prev => prev + 1); fetchDocuments(); };

  const fetchDocuments = async () => {
    const userId = user?.id || user?._id;
    if (!userId) return;
    setLoadingDocuments(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No token available');
      const response = await api.get(`/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      setDocuments(response.data.documents || []);
      if (response.data.personalInfo?.profilePhoto) {
        setProfilePhotoUrl(getProfilePhotoUrl(response.data.personalInfo.profilePhoto, userId, token));
      }
    } catch (error) { console.error('Error fetching documents:', error); }
    finally { setLoadingDocuments(false); }
  };

  const handleUpdateProfile = async (e) => {
    if (e) e.preventDefault();
    const errors = validateFormats(personalInfo);
    if (errors.length > 0) { alert('Please fix the following errors:\n\n' + errors.join('\n')); return; }
    try {
      const userId = user.id || user._id;
      const token = localStorage.getItem('token');
      await api.put(`/api/users/${userId}`, { personalInfo }, { headers: { Authorization: `Bearer ${token}` } });
      const updatedUser = { ...user, personalInfo };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setOriginalPersonalInfo(personalInfo);
      setIsEditingProfile(false);
      setSaveSuccess('Profile updated successfully!');
      setTimeout(() => setSaveSuccess(''), 3000);
      window.dispatchEvent(new Event('userUpdated'));
    } catch (error) {
      alert('Error updating profile: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) { alert('Please select a file'); return; }
    if (uploadForm.type === 'PHOTO') {
      const reader = new FileReader();
      reader.onload = (e) => { setImageToCrop(e.target.result); setShowCropModal(true); };
      reader.readAsDataURL(uploadForm.file);
      return;
    }
    await uploadDocument();
  };

  const uploadDocument = async (croppedBlob = null, cropType = 'passport') => {
    if (!user || typeof user !== 'object' || (!user.id && !user._id)) {
      setUploading(false);
      alert('Cannot upload: Your session appears to be invalid. Please log out and log in again.');
      window.location.href = '/login';
      return;
    }
    const userId = user.id || user._id;
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found. Please log in again.');
      const formData = new FormData();
      if (croppedBlob) {
        const filename = cropType === 'profile' ? 'cropped-profile-round.jpg' : 'cropped-eodb-passport.jpg';
        const description = cropType === 'profile' ? 'Profile Photo (Round)' : 'EODB ID Photo (Passport)';
        const isProfilePhoto = cropType === 'profile' ? 'true' : 'false';
        const documentType = cropType === 'profile' ? 'PHOTO' : 'PASSPORT_PHOTO';
        const file = new File([croppedBlob], filename, { type: 'image/jpeg' });
        formData.append('file', file);
        formData.append('type', documentType);
        formData.append('description', description);
        formData.append('isProfilePhoto', isProfilePhoto);
      } else {
        if (!uploadForm.file) throw new Error('No file selected');
        formData.append('file', uploadForm.file);
        formData.append('type', uploadForm.type);
        formData.append('description', uploadForm.description || '');
        formData.append('isProfilePhoto', uploadForm.type === 'PHOTO' ? 'true' : 'false');
      }
      const response = await api.post(`/api/users/${userId}/documents`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (croppedBlob && cropType === 'profile' && response.data?.personalInfo?.profilePhoto) {
        try {
          setShowCropModal(false); setImageToCrop(null); setCurrentCropType('passport');
          setUploadForm({ type: 'SIGNED_CONTRACT', description: '', file: null });
          const freshResponse = await api.get(`/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
          const freshUser = freshResponse.data;
          localStorage.setItem('user', JSON.stringify(freshUser));
          setPersonalInfo(freshUser.personalInfo);
          setOriginalPersonalInfo(freshUser.personalInfo);
          setProfilePhotoUrl(getProfilePhotoUrl(freshUser.personalInfo.profilePhoto, userId, token));
          window.dispatchEvent(new CustomEvent('profilePhotoUpdated', { detail: { userId, profilePhoto: freshUser.personalInfo.profilePhoto, timestamp: Date.now() } }));
          window.dispatchEvent(new Event('userUpdated'));
          alert('Profile photo updated successfully!');
          await fetchDocuments();
          setTimeout(() => window.location.reload(), 800);
        } catch (refreshErr) {
          console.error('Failed to refresh user after photo upload:', refreshErr);
          alert('Photo uploaded but preview might be delayed. Please refresh the page.');
        }
      } else if (croppedBlob && cropType === 'passport') {
        setShowCropModal(false); setImageToCrop(null); setCurrentCropType('passport');
        alert('EODB photo uploaded successfully! You can now generate your ID.');
        await fetchDocuments();
        window.dispatchEvent(new Event('eodbPhotoUpdated'));
      } else {
        alert('Document uploaded successfully!');
        setUploadForm({ type: 'SIGNED_CONTRACT', description: '', file: null });
        await fetchDocuments();
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error during upload';
      alert(`Error uploading document: ${errorMsg}`);
    } finally { setUploading(false); }
  };

  const handleDownloadDocument = (filename) => { openDocument(filename, user.id || user._id, localStorage.getItem('token')); };
  const handleViewDocument = (filename) => { setViewingDocument(filename); };

  const handleDeleteDocument = async (filename) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      const userId = user.id || user._id;
      const token = localStorage.getItem('token');
      const docKey = filename.startsWith('http') ? filename.split('/').pop().split('?')[0] : filename;
      await api.delete(`/api/users/${userId}/documents/${docKey}`, { headers: { Authorization: `Bearer ${token}` } });
      alert('Document deleted successfully!');
      fetchDocuments();
    } catch (error) { alert('Error deleting document: ' + (error.response?.data?.message || error.message)); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { alert('New passwords do not match'); return; }
    try {
      const token = localStorage.getItem('token');
      await api.post('/api/auth/change-password', { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }, { headers: { Authorization: `Bearer ${token}` } });
      alert('Password changed successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) { alert('Error changing password: ' + (error.response?.data?.message || error.message)); }
  };

  const updatePersonalInfo = (field, value) => { setPersonalInfo({ ...personalInfo, [field]: value }); };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📝';
    return '📎';
  };

  const displayName = personalInfo.firstName
    ? `${personalInfo.firstName} ${personalInfo.lastName || ''}`.trim()
    : user.username || 'User';

  return (
    <div style={{ minHeight: '100%', background: D.bg, color: D.textPrimary, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ── Page Header ── */}
      <div style={{ background: D.panel, borderBottom: `1px solid ${D.border}`, padding: '24px 32px', display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Avatar */}
        <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: D.greenMuted, border: `2px solid ${D.green}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: D.green }}>
          {profilePhotoUrl
            ? <img key={profilePhotoUrl} src={profilePhotoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (personalInfo.firstName?.charAt(0) || user.username?.charAt(0)?.toUpperCase() || 'U')}
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: D.textPrimary, margin: 0 }}>{displayName}</h2>
          <p style={{ fontSize: 12, color: D.green, margin: '3px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Contractual Employee</p>
        </div>
        {saveSuccess && (
          <div style={{ marginLeft: 'auto', background: D.greenMuted, border: `1px solid ${D.greenBorder}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            {saveSuccess}
          </div>
        )}
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background: D.panel, borderBottom: `1px solid ${D.border}`, paddingLeft: 32, display: 'flex', gap: 0 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 20px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? D.green : D.textSecondary,
              borderBottom: `2px solid ${activeTab === tab.id ? D.green : 'transparent'}`,
              transition: 'all 150ms ease', letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: activeTab === tab.id ? D.green : D.textMuted }}>{TAB_ICONS[tab.id]}</span>
            {tab.name}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ padding: '32px' }}>

        {/* ─── PROFILE TAB ─── */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

            {/* Photo Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Profile Photo */}
              <DarkCard title="Profile Photo" subtitle="Displayed on your account">
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', background: D.greenMuted, border: `2px solid ${D.greenBorder}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: D.green }}>
                    {profilePhotoUrl
                      ? <img key={profilePhotoUrl} src={profilePhotoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (personalInfo.firstName?.charAt(0) || user.username?.charAt(0)?.toUpperCase() || 'U')}
                  </div>
                  <div>
                    <label style={{ display: 'inline-block', cursor: 'pointer' }}>
                      <span style={{ background: D.greenMuted, border: `1px solid ${D.greenBorder}`, color: D.green, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
                        Upload Photo
                      </span>
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            setUploadForm({ type: 'PHOTO', description: 'Profile Photo', file });
                            const reader = new FileReader();
                            reader.onload = (e) => { setImageToCrop(e.target.result); setCurrentCropType('profile'); setShowCropModal(true); };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                    <p style={{ fontSize: 11, color: D.textMuted, marginTop: 8 }}>JPG, PNG or GIF · Max 5MB</p>
                  </div>
                </div>
              </DarkCard>

              {/* EODB Photo */}
              <DarkCard title="EODB ID Photo" subtitle="Passport-style for your EODB ID">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 56, height: 70, borderRadius: 8, background: D.blueMuted, border: `1px solid rgba(59,130,246,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="24" height="24" fill="none" stroke={D.blue} strokeWidth="1.5" viewBox="0 0 24 24">
                      <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: 12, color: D.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>Upload a 2:3 ratio photo for your official EODB ID.</p>
                    <label style={{ display: 'inline-block', cursor: 'pointer' }}>
                      <span style={{ background: D.blueMuted, border: `1px solid rgba(59,130,246,0.35)`, color: D.blue, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
                        Upload EODB Photo
                      </span>
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            setUploadForm({ type: 'PASSPORT_PHOTO', description: 'EODB Photo', file });
                            const reader = new FileReader();
                            reader.onload = (e) => { setImageToCrop(e.target.result); setCurrentCropType('passport'); setShowCropModal(true); };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </DarkCard>
            </div>

            {/* Personal Information */}
            <DarkCard
              title="Personal Information"
              subtitle="Manage your personal details"
              action={
                !isEditingProfile ? (
                  <DarkBtn onClick={() => setIsEditingProfile(true)} variant="secondary">Edit Profile</DarkBtn>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <DarkBtn onClick={() => { setPersonalInfo(originalPersonalInfo); setIsEditingProfile(false); }} variant="ghost">Cancel</DarkBtn>
                    <DarkBtn onClick={handleUpdateProfile} variant="primary">Save Changes</DarkBtn>
                  </div>
                )
              }
            >
              {!isEditingProfile ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px 24px' }}>
                  <InfoField label="Last Name" value={personalInfo.lastName} />
                  <InfoField label="First Name" value={personalInfo.firstName} />
                  <InfoField label="Middle Name" value={personalInfo.middleName} />
                  <InfoField label="Sex" value={personalInfo.sex} />
                  <InfoField label="Birthday" value={personalInfo.birthday ? new Date(personalInfo.birthday).toLocaleDateString() : 'N/A'} />
                  <InfoField label="Place of Birth" value={personalInfo.placeOfBirth} />
                  <InfoField label="Phone Number" value={personalInfo.phoneNumber} />
                  <InfoField label="Email" value={personalInfo.email} span={2} />
                  <InfoField label="Address" value={personalInfo.address} span={3} />
                  <InfoField label="PhilHealth" value={personalInfo.philhealth} />
                  <InfoField label="Pag-IBIG" value={personalInfo.pagibig} />
                  <InfoField label="TIN" value={personalInfo.tin} />
                  <InfoField label="Highest Education" value={personalInfo.highestEducation} />
                  <InfoField label="Bachelor's Degree" value={personalInfo.bachelorsDegree} span={2} />
                </div>
              ) : (
                <form onSubmit={handleUpdateProfile}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 20px' }}>
                    <DarkFormField label="Last Name" value={personalInfo.lastName || ''} onChange={(e) => updatePersonalInfo('lastName', e.target.value.toUpperCase())} />
                    <DarkFormField label="First Name" value={personalInfo.firstName || ''} onChange={(e) => updatePersonalInfo('firstName', e.target.value.toUpperCase())} />
                    <DarkFormField label="Middle Name" value={personalInfo.middleName || ''} onChange={(e) => updatePersonalInfo('middleName', e.target.value.toUpperCase())} />
                    <div>
                      <label style={labelStyle}>Sex</label>
                      <select value={personalInfo.sex || 'MALE'} onChange={(e) => updatePersonalInfo('sex', e.target.value)} style={inputStyle}>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                      </select>
                    </div>
                    <DarkFormField label="Birthday" type="date" value={personalInfo.birthday ? personalInfo.birthday.split('T')[0] : ''} onChange={(e) => updatePersonalInfo('birthday', e.target.value)} />
                    <DarkFormField label="Place of Birth" value={personalInfo.placeOfBirth || ''} onChange={(e) => updatePersonalInfo('placeOfBirth', e.target.value.toUpperCase())} />
                    <DarkFormField label="Phone Number" value={personalInfo.phoneNumber || ''} onChange={(e) => updatePersonalInfo('phoneNumber', formatPhoneNumber(e.target.value))} placeholder="+63-XXX-XXX-XXXX" />
                    <div style={{ gridColumn: 'span 2' }}>
                      <DarkFormField label="Email" type="email" value={personalInfo.email || ''} onChange={(e) => updatePersonalInfo('email', e.target.value.toLowerCase())} />
                    </div>
                    <div style={{ gridColumn: 'span 3' }}>
                      <DarkFormField label="Address" value={personalInfo.address || ''} onChange={(e) => updatePersonalInfo('address', e.target.value.toUpperCase())} />
                    </div>
                    <DarkFormField label="PhilHealth" value={personalInfo.philhealth || ''} onChange={(e) => updatePersonalInfo('philhealth', formatPhilHealth(e.target.value))} placeholder="XX-XXXXXXXXX-X" />
                    <DarkFormField label="Pag-IBIG" value={personalInfo.pagibig || ''} onChange={(e) => updatePersonalInfo('pagibig', formatPagIbig(e.target.value))} placeholder="XXXX-XXXX-XXXX" />
                    <DarkFormField label="TIN" value={personalInfo.tin || ''} onChange={(e) => updatePersonalInfo('tin', formatTIN(e.target.value))} placeholder="XXX-XXX-XXX-XXX" />
                    <DarkFormField label="Highest Education" value={personalInfo.highestEducation || ''} onChange={(e) => updatePersonalInfo('highestEducation', e.target.value.toUpperCase())} />
                    <div style={{ gridColumn: 'span 2' }}>
                      <DarkFormField label="Bachelor's Degree" value={personalInfo.bachelorsDegree || ''} onChange={(e) => updatePersonalInfo('bachelorsDegree', e.target.value.toUpperCase())} />
                    </div>
                  </div>
                </form>
              )}
            </DarkCard>
          </div>
        )}

        {/* ─── CONTRACTS TAB ─── */}
        {activeTab === 'contracts' && (
          <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
            <ContractGenerator userRole="CONTRACTUAL" userId={user.id || user._id} viewOnly={true} />
          </div>
        )}

        {/* ─── DOCUMENTS TAB ─── */}
        {activeTab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
            <DarkCard title="Upload Document" subtitle="Attach signed contracts or supporting files">
              <form onSubmit={handleFileUpload} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Document Type</label>
                    <select value={uploadForm.type} onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value })} style={inputStyle}>
                      <option value="SIGNED_CONTRACT">Signed Contract</option>
                      <option value="PHOTO">Photo</option>
                      <option value="OTHERS">Others</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <input type="text" value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} style={inputStyle} placeholder="Optional description" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>File</label>
                  <input type="file" onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files[0] })} style={{ ...inputStyle, padding: '10px 14px' }} required />
                </div>
                <div>
                  <DarkBtn type="submit" variant="primary" disabled={uploading}>
                    {uploading ? <><Spinner size="sm" color="white" />Uploading…</> : 'Upload Document'}
                  </DarkBtn>
                </div>
              </form>
            </DarkCard>

            <DarkCard title="My Documents" subtitle={`${documents.length} file${documents.length !== 1 ? 's' : ''} attached`}>
              {loadingDocuments ? (
                <SectionLoader message="Loading documents…" />
              ) : documents.length === 0 ? (
                <EmptyState icon="📄" title="No documents yet" description="Upload your first document above." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${D.border}` }}>
                        {['Type', 'Filename', 'Description', 'Upload Date', 'Actions'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: D.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc, index) => (
                        <tr key={index} style={{ borderBottom: `1px solid ${D.border}` }}>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ background: D.blueMuted, border: `1px solid rgba(59,130,246,0.25)`, color: D.blue, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
                              {doc.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', color: D.textPrimary }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span>{getFileIcon(doc.filename)}</span>
                              <span style={{ fontSize: 13 }}>{doc.filename?.startsWith('http') ? doc.filename.split('/').pop().split('?')[0] : doc.filename}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', color: D.textSecondary }}>{doc.description || '—'}</td>
                          <td style={{ padding: '12px 14px', color: D.textSecondary }}>{new Date(doc.uploadDate).toLocaleDateString()}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', gap: 16 }}>
                              <button onClick={() => handleViewDocument(doc.url || doc.filename || doc.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.blue, fontSize: 13, fontWeight: 600, padding: 0 }}>View</button>
                              <button onClick={() => handleDownloadDocument(doc.url || doc.filename || doc.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.green, fontSize: 13, fontWeight: 600, padding: 0 }}>Download</button>
                              <button onClick={() => handleDeleteDocument(doc.key || doc.filename)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.red, fontSize: 13, fontWeight: 600, padding: 0 }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DarkCard>
          </div>
        )}

        {/* ─── EODB TAB ─── */}
        {activeTab === 'eodb' && (
          <EODBGenerator userId={user.id || user._id} onDocumentUploaded={handleDocumentUploaded} />
        )}

        {/* ─── PASSWORD TAB ─── */}
        {activeTab === 'password' && (
          <div style={{ maxWidth: 480 }}>
            <DarkCard title="Change Password" subtitle="Update your account password">
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DarkFormField label="Current Password" type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required />
                <DarkFormField label="New Password" type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required />
                <DarkFormField label="Confirm New Password" type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} required />
                <div style={{ paddingTop: 4 }}>
                  <DarkBtn type="submit" variant="primary">Update Password</DarkBtn>
                </div>
              </form>
            </DarkCard>
          </div>
        )}
      </div>

      {/* Modals */}
      {viewingDocument && (
        <DocumentViewerModal userId={user.id || user._id} filename={viewingDocument} onClose={() => setViewingDocument(null)} />
      )}
      {showCropModal && imageToCrop && (
        <EnhancedImageCropper
          imageSrc={imageToCrop}
          onConfirm={uploadDocument}
          onCancel={() => { setShowCropModal(false); setImageToCrop(null); setCurrentCropType('passport'); setUploadForm({ type: 'SIGNED_CONTRACT', description: '', file: null }); }}
          uploading={uploading}
          cropType={currentCropType}
        />
      )}
    </div>
  );
}

/* ── Shared style constants ── */
const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'rgba(240,244,248,0.45)', marginBottom: 6,
};

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f0f4f8',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

/* ── Helper Components ── */
function DarkCard({ title, subtitle, action, children }) {
  return (
    <div style={{ background: '#152236', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f0f4f8', margin: 0 }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 12, color: 'rgba(240,244,248,0.45)', margin: '3px 0 0' }}>{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  );
}

function DarkBtn({ children, onClick, variant = 'primary', type = 'button', disabled }) {
  const styles = {
    primary: { background: '#2e8b57', color: '#fff', border: 'none' },
    secondary: { background: 'rgba(46,139,87,0.15)', color: '#2e8b57', border: '1px solid rgba(46,139,87,0.35)' },
    ghost: { background: 'rgba(255,255,255,0.05)', color: 'rgba(240,244,248,0.65)', border: '1px solid rgba(255,255,255,0.1)' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...styles[variant], borderRadius: 8, padding: '9px 18px', fontSize: 13,
      fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: '0.03em',
      display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'opacity 150ms', opacity: disabled ? 0.6 : 1,
    }}>
      {children}
    </button>
  );
}

function InfoField({ label, value, span = 1 }) {
  return (
    <div style={span > 1 ? { gridColumn: `span ${span}` } : {}}>
      <dt style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,244,248,0.4)', marginBottom: 5 }}>{label}</dt>
      <dd style={{ fontSize: 13, color: value ? '#f0f4f8' : 'rgba(240,244,248,0.3)', fontWeight: value ? 500 : 400 }}>{value || 'Not specified'}</dd>
    </div>
  );
}

function DarkFormField({ label, type = 'text', value, onChange, placeholder, required }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} style={inputStyle} />
    </div>
  );
}

export default ContractualDashboard;