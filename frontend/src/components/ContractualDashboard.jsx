import { useState, useEffect } from 'react';
import { SectionLoader, EmptyState, Spinner } from './ui.jsx';
import api, { openDocument, getDocumentUrl, API_BASE } from '../api.js';
import ContractGenerator from './ContractGenerator';
import DocumentViewerModal from './DocumentViewerModal';
import EnhancedImageCropper from './EnhancedImageCropper';
import EODBGenerator from './EODBGenerator';

/* ── Design tokens (consistent with AdminDashboard / ContractDetailsModal) ── */
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
  textSecondary: 'rgba(240,244,248,0.7)',
  textMuted: 'rgba(240,244,248,0.4)',
  blue: '#3b82f6',
  blueMuted: 'rgba(59,130,246,0.15)',
  red: '#ef4444',
  redMuted: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b',
  yellowMuted: 'rgba(245,158,11,0.12)',
  yellowBorder: 'rgba(245,158,11,0.3)',
};

const getProfilePhotoUrl = (photoValue, userId, token) => getDocumentUrl(photoValue, userId, token);

const formatPhilHealth = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  if (numbers.length <= 2) return numbers;
  if (numbers.length <= 11) return numbers.slice(0, 2) + '-' + numbers.slice(2);
  return numbers.slice(0, 2) + '-' + numbers.slice(2, 11) + '-' + numbers.slice(11, 12);
};

const formatPagIbig = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  if (numbers.length <= 4) return numbers;
  if (numbers.length <= 8) return numbers.slice(0, 4) + '-' + numbers.slice(4);
  return numbers.slice(0, 4) + '-' + numbers.slice(4, 8) + '-' + numbers.slice(8, 12);
};

const formatTIN = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return numbers.slice(0, 3) + '-' + numbers.slice(3);
  if (numbers.length <= 9) return numbers.slice(0, 3) + '-' + numbers.slice(3, 6) + '-' + numbers.slice(6);
  return numbers.slice(0, 3) + '-' + numbers.slice(3, 6) + '-' + numbers.slice(6, 9) + '-' + numbers.slice(9, 12);
};

const formatPhoneNumber = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  let d = numbers.startsWith('0') ? '63' + numbers.slice(1) : numbers.startsWith('63') ? numbers : '63' + numbers;
  let f = '+';
  if (d.length <= 2) f += d;
  else if (d.length <= 5) f += d.slice(0, 2) + '-' + d.slice(2);
  else if (d.length <= 8) f += d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
  else f += d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5, 8) + '-' + d.slice(8, 12);
  return f;
};

const validateFormats = (personalInfo) => {
  const errors = [];
  if (personalInfo.philhealth) {
    const n = personalInfo.philhealth.replace(/\D/g, '');
    if (n.length > 0 && n.length !== 12) errors.push('PhilHealth must be 12 digits (XX-XXXXXXXXX-X)');
  }
  if (personalInfo.pagibig) {
    const n = personalInfo.pagibig.replace(/\D/g, '');
    if (n.length > 0 && n.length !== 12) errors.push('Pag-IBIG must be 12 digits (XXXX-XXXX-XXXX)');
  }
  if (personalInfo.tin) {
    const n = personalInfo.tin.replace(/\D/g, '');
    if (n.length > 0 && n.length !== 12) errors.push('TIN must be 12 digits (XXX-XXX-XXX-XXX)');
  }
  if (personalInfo.phoneNumber) {
    const n = personalInfo.phoneNumber.replace(/\D/g, '');
    if (n.length > 0 && n.length !== 12) errors.push('Phone Number must be 10 digits after +63 (+63-XXX-XXX-XXXX)');
  }
  return errors;
};

/* ── Shared dark input style ── */
const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${D.border}`,
  borderRadius: 8,
  color: D.textPrimary,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const labelStyle = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: D.textMuted,
  marginBottom: 6,
};

function DarkInput({ label, type = 'text', value, onChange, placeholder, readOnly, required, disabled }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        disabled={disabled}
        style={{ ...inputStyle, ...(readOnly || disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
        onFocus={(e) => e.target.style.borderColor = D.green}
        onBlur={(e) => e.target.style.borderColor = D.border}
      />
    </div>
  );
}

function DarkSelect({ label, value, onChange, children, disabled }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
        onFocus={(e) => e.target.style.borderColor = D.green}
        onBlur={(e) => e.target.style.borderColor = D.border}
      >
        {children}
      </select>
    </div>
  );
}

function InfoCell({ label, value, span }) {
  return (
    <div style={span ? { gridColumn: `span ${span}` } : {}}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.textMuted, margin: '0 0 5px' }}>{label}</p>
      <p style={{ fontSize: 13, color: D.textPrimary, fontWeight: 500, margin: 0 }}>{value || <span style={{ color: D.textMuted }}>Not specified</span>}</p>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 3, height: 16, background: D.green, borderRadius: 2 }} />
      <h4 style={{ fontSize: 11, fontWeight: 700, color: D.textSecondary, margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{children}</h4>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 12, padding: '20px 24px', ...style }}>
      {children}
    </div>
  );
}

function ContractualDashboard({ user }) {
  if (!user || typeof user !== 'object' || (!user._id && !user.id)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.bg }}>
        <div style={{ background: D.card, border: `1px solid ${D.borderStrong}`, borderRadius: 16, padding: '40px 48px', textAlign: 'center', maxWidth: 400 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: D.textPrimary, marginBottom: 12 }}>Session Error</h2>
          <p style={{ fontSize: 13, color: D.textSecondary, marginBottom: 24 }}>
            User information is missing or corrupted. Please log in again.
          </p>
          <button
            onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
            style={{ padding: '10px 24px', background: D.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
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

  const tabs = [
    { id: 'profile', name: 'Personal Information', icon: '👤' },
    { id: 'contracts', name: 'My Contracts', icon: '📄' },
    { id: 'documents', name: 'Documents', icon: '📁' },
    { id: 'eodb', name: 'EODB ID', icon: '🪪' },
    { id: 'password', name: 'Change Password', icon: '🔒' },
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
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoadingDocuments(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    const errors = validateFormats(personalInfo);
    if (errors.length > 0) { alert('Please fix the following errors:\n\n' + errors.join('\n')); return; }
    try {
      const userId = user.id || user._id;
      const token = localStorage.getItem('token');
      await api.put(`/api/users/${userId}`, { personalInfo }, { headers: { Authorization: `Bearer ${token}` } });
      alert('Profile updated successfully!');
      const updatedUser = { ...user, personalInfo };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setOriginalPersonalInfo(personalInfo);
      setIsEditingProfile(false);
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
        const documentType = cropType === 'profile' ? 'PHOTO' : 'PASSPORT_PHOTO';
        const file = new File([croppedBlob], filename, { type: 'image/jpeg' });
        formData.append('file', file);
        formData.append('type', documentType);
        formData.append('description', description);
        formData.append('isProfilePhoto', cropType === 'profile' ? 'true' : 'false');
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
      alert(`Error uploading document: ${error.response?.data?.message || error.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDocument = (filename) => {
    const userId = user.id || user._id;
    const token = localStorage.getItem('token');
    openDocument(filename, userId, token);
  };

  const handleViewDocument = (filename) => setViewingDocument(filename);

  const handleDeleteDocument = async (filename) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      const userId = user.id || user._id;
      const token = localStorage.getItem('token');
      const docKey = filename.startsWith('http') ? filename.split('/').pop().split('?')[0] : filename;
      await api.delete(`/api/users/${userId}/documents/${docKey}`, { headers: { Authorization: `Bearer ${token}` } });
      alert('Document deleted successfully!');
      fetchDocuments();
    } catch (error) {
      alert('Error deleting document: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { alert('New passwords do not match'); return; }
    try {
      const token = localStorage.getItem('token');
      await api.post('/api/auth/change-password', { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }, { headers: { Authorization: `Bearer ${token}` } });
      alert('Password changed successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      alert('Error changing password: ' + (error.response?.data?.message || error.message));
    }
  };

  const updatePersonalInfo = (field, value) => setPersonalInfo({ ...personalInfo, [field]: value });

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '📄';
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📝';
    return '📎';
  };

  const getBadgeStyle = (type) => {
    const map = {
      SIGNED_CONTRACT: { bg: D.greenMuted, border: D.greenBorder, color: D.green },
      PHOTO: { bg: D.blueMuted, border: 'rgba(59,130,246,0.3)', color: D.blue },
      PASSPORT_PHOTO: { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', color: '#a78bfa' },
      OTHERS: { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)', color: '#94a3b8' },
    };
    return map[type] || map.OTHERS;
  };

  return (
    <div style={{ background: D.bg, minHeight: '100%', padding: '0 0 40px' }}>
      {/* Page Header */}
      <div style={{ borderBottom: `1px solid ${D.border}`, padding: '24px 0 0', marginBottom: 0 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: D.textPrimary, margin: '0 0 20px' }}>Contractual Dashboard</h2>
        {/* Tab Nav */}
        <nav style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? `2px solid ${D.green}` : '2px solid transparent',
                color: activeTab === tab.id ? D.green : D.textSecondary,
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 700 : 500,
                cursor: 'pointer',
                transition: 'color 0.2s, border-color 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                whiteSpace: 'nowrap',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div style={{ paddingTop: 28 }}>

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Profile Photo */}
            <Card>
              <SectionHeader>Profile Photo</SectionHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.08)', border: `2px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 24, fontWeight: 700, color: D.textSecondary }}>
                  {profilePhotoUrl
                    ? <img key={profilePhotoUrl} src={profilePhotoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span>{personalInfo.firstName?.charAt(0) || user.username?.charAt(0)?.toUpperCase() || 'U'}</span>
                  }
                </div>
                <div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: 'rgba(255,255,255,0.07)', border: `1px solid ${D.borderStrong}`, borderRadius: 8, color: D.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.03em' }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload New Photo
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setUploadForm({ type: 'PHOTO', description: 'Profile Photo', file });
                        const reader = new FileReader();
                        reader.onload = (e) => { setImageToCrop(e.target.result); setCurrentCropType('profile'); setShowCropModal(true); };
                        reader.readAsDataURL(file);
                      }
                    }} style={{ display: 'none' }} />
                  </label>
                  <p style={{ fontSize: 11, color: D.textMuted, marginTop: 8 }}>JPG, PNG or GIF — max 5MB</p>
                </div>
              </div>
            </Card>

            {/* EODB Photo Upload */}
            <Card style={{ background: D.cardDeep, border: `1px solid rgba(59,130,246,0.2)` }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, background: D.blueMuted, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" fill="none" stroke={D.blue} strokeWidth="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: D.textPrimary, margin: '0 0 4px' }}>EODB ID Photo</h4>
                  <p style={{ fontSize: 12, color: D.textSecondary, margin: '0 0 12px', lineHeight: 1.5 }}>
                    Upload a passport-style photo (2:3 ratio) for your EODB ID. This is separate from your profile photo.
                  </p>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: D.blue, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
                    Upload EODB Photo
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setUploadForm({ type: 'PASSPORT_PHOTO', description: 'EODB Photo', file });
                        const reader = new FileReader();
                        reader.onload = (e) => { setImageToCrop(e.target.result); setCurrentCropType('passport'); setShowCropModal(true); };
                        reader.readAsDataURL(file);
                      }
                    }} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </Card>

            {/* Personal Information */}
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <SectionHeader>Personal Information</SectionHeader>
                {!isEditingProfile ? (
                  <button onClick={() => setIsEditingProfile(true)} style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.07)', border: `1px solid ${D.borderStrong}`, borderRadius: 8, color: D.textSecondary, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => { setPersonalInfo(originalPersonalInfo); setIsEditingProfile(false); }} style={{ padding: '8px 16px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 8, color: D.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={handleUpdateProfile} style={{ padding: '8px 18px', background: D.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
                      Save Changes
                    </button>
                  </div>
                )}
              </div>

              {!isEditingProfile ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px 28px' }}>
                  <InfoCell label="Last Name" value={personalInfo.lastName} />
                  <InfoCell label="First Name" value={personalInfo.firstName} />
                  <InfoCell label="Middle Name" value={personalInfo.middleName} />
                  <InfoCell label="Sex" value={personalInfo.sex} />
                  <InfoCell label="Birthday" value={personalInfo.birthday ? new Date(personalInfo.birthday).toLocaleDateString() : null} />
                  <InfoCell label="Place of Birth" value={personalInfo.placeOfBirth} />
                  <InfoCell label="Phone Number" value={personalInfo.phoneNumber} />
                  <InfoCell label="Email" value={personalInfo.email} span={2} />
                  <InfoCell label="Address" value={personalInfo.address} span={3} />
                  <InfoCell label="PhilHealth" value={personalInfo.philhealth} />
                  <InfoCell label="Pag-IBIG" value={personalInfo.pagibig} />
                  <InfoCell label="TIN" value={personalInfo.tin} />
                  <InfoCell label="Highest Education" value={personalInfo.highestEducation} />
                  <InfoCell label="Bachelor's Degree" value={personalInfo.bachelorsDegree} span={2} />
                </div>
              ) : (
                <form onSubmit={handleUpdateProfile}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 20px' }}>
                    <DarkInput label="Last Name" value={personalInfo.lastName || ''} onChange={(e) => updatePersonalInfo('lastName', e.target.value.toUpperCase())} />
                    <DarkInput label="First Name" value={personalInfo.firstName || ''} onChange={(e) => updatePersonalInfo('firstName', e.target.value.toUpperCase())} />
                    <DarkInput label="Middle Name" value={personalInfo.middleName || ''} onChange={(e) => updatePersonalInfo('middleName', e.target.value.toUpperCase())} />
                    <DarkSelect label="Sex" value={personalInfo.sex || 'MALE'} onChange={(e) => updatePersonalInfo('sex', e.target.value)}>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </DarkSelect>
                    <DarkInput label="Birthday" type="date" value={personalInfo.birthday ? personalInfo.birthday.split('T')[0] : ''} onChange={(e) => updatePersonalInfo('birthday', e.target.value)} />
                    <DarkInput label="Place of Birth" value={personalInfo.placeOfBirth || ''} onChange={(e) => updatePersonalInfo('placeOfBirth', e.target.value.toUpperCase())} />
                    <DarkInput label="Phone Number" value={personalInfo.phoneNumber || ''} onChange={(e) => updatePersonalInfo('phoneNumber', formatPhoneNumber(e.target.value))} placeholder="+63-XXX-XXX-XXXX" />
                    <div style={{ gridColumn: 'span 2' }}>
                      <DarkInput label="Email" type="email" value={personalInfo.email || ''} onChange={(e) => updatePersonalInfo('email', e.target.value.toLowerCase())} />
                    </div>
                    <div style={{ gridColumn: 'span 3' }}>
                      <DarkInput label="Address" value={personalInfo.address || ''} onChange={(e) => updatePersonalInfo('address', e.target.value.toUpperCase())} />
                    </div>
                    <DarkInput label="PhilHealth (XX-XXXXXXXXX-X)" value={personalInfo.philhealth || ''} onChange={(e) => updatePersonalInfo('philhealth', formatPhilHealth(e.target.value))} placeholder="XX-XXXXXXXXX-X" />
                    <DarkInput label="Pag-IBIG (XXXX-XXXX-XXXX)" value={personalInfo.pagibig || ''} onChange={(e) => updatePersonalInfo('pagibig', formatPagIbig(e.target.value))} placeholder="XXXX-XXXX-XXXX" />
                    <DarkInput label="TIN (XXX-XXX-XXX-XXX)" value={personalInfo.tin || ''} onChange={(e) => updatePersonalInfo('tin', formatTIN(e.target.value))} placeholder="XXX-XXX-XXX-XXX" />
                    <DarkInput label="Highest Education" value={personalInfo.highestEducation || ''} onChange={(e) => updatePersonalInfo('highestEducation', e.target.value.toUpperCase())} />
                    <div style={{ gridColumn: 'span 2' }}>
                      <DarkInput label="Bachelor's Degree" value={personalInfo.bachelorsDegree || ''} onChange={(e) => updatePersonalInfo('bachelorsDegree', e.target.value.toUpperCase())} />
                    </div>
                  </div>
                </form>
              )}
            </Card>
          </div>
        )}

        {/* ── CONTRACTS TAB ── */}
        {activeTab === 'contracts' && (
          <ContractGenerator userRole="CONTRACTUAL" userId={user.id || user._id} viewOnly={true} />
        )}

        {/* ── DOCUMENTS TAB ── */}
        {activeTab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Upload */}
            <Card>
              <SectionHeader>Upload Document</SectionHeader>
              <form onSubmit={handleFileUpload} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <DarkSelect label="Document Type" value={uploadForm.type} onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value })}>
                    <option value="SIGNED_CONTRACT">Signed Contract</option>
                    <option value="PHOTO">Photo</option>
                    <option value="OTHERS">Others</option>
                  </DarkSelect>
                  <DarkInput label="Description (Optional)" value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} placeholder="Optional description" />
                </div>
                <div>
                  <label style={labelStyle}>File</label>
                  <input
                    type="file"
                    onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files[0] })}
                    required
                    style={{ ...inputStyle, padding: '8px 14px' }}
                  />
                </div>
                <div>
                  <button type="submit" disabled={uploading} style={{ padding: '10px 24px', background: uploading ? 'rgba(46,139,87,0.4)' : D.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {uploading ? <><Spinner size="sm" color="white" />Uploading…</> : 'Upload Document'}
                  </button>
                </div>
              </form>
            </Card>

            {/* Documents table */}
            <Card>
              <SectionHeader>My Documents</SectionHeader>
              {loadingDocuments ? (
                <SectionLoader message="Loading documents…" />
              ) : documents.length === 0 ? (
                <EmptyState icon="📄" title="No documents yet" description="Upload your first document above." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: D.cardDeep }}>
                        {['Type', 'Filename', 'Description', 'Upload Date', 'Actions'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: D.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', borderBottom: `1px solid ${D.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc, index) => {
                        const bs = getBadgeStyle(doc.type);
                        return (
                          <tr key={index} style={{ borderBottom: `1px solid ${D.border}` }}>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ background: bs.bg, border: `1px solid ${bs.border}`, color: bs.color, borderRadius: 5, padding: '2px 9px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                {doc.type?.replace('_', ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: D.textSecondary }}>
                              <span style={{ marginRight: 6 }}>{getFileIcon(doc.filename)}</span>
                              {doc.filename?.startsWith('http') ? doc.filename.split('/').pop().split('?')[0] : doc.filename}
                            </td>
                            <td style={{ padding: '10px 14px', color: D.textMuted }}>{doc.description || '—'}</td>
                            <td style={{ padding: '10px 14px', color: D.textMuted }}>{new Date(doc.uploadDate).toLocaleDateString()}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: 14 }}>
                                <button onClick={() => handleViewDocument(doc.url || doc.filename || doc.key)} style={{ background: 'none', border: 'none', color: D.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>View</button>
                                <button onClick={() => handleDownloadDocument(doc.url || doc.filename || doc.key)} style={{ background: 'none', border: 'none', color: D.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Download</button>
                                <button onClick={() => handleDeleteDocument(doc.key || doc.filename)} style={{ background: 'none', border: 'none', color: D.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── EODB TAB ── */}
        {activeTab === 'eodb' && (
          <EODBGenerator userId={user.id || user._id} onDocumentUploaded={handleDocumentUploaded} />
        )}

        {/* ── PASSWORD TAB ── */}
        {activeTab === 'password' && (
          <div style={{ maxWidth: 520 }}>
            <Card>
              <SectionHeader>Change Password</SectionHeader>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DarkInput label="Current Password" type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required />
                <DarkInput label="New Password" type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required />
                <DarkInput label="Confirm New Password" type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} required />
                <div>
                  <button type="submit" style={{ padding: '10px 24px', background: D.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
                    Update Password
                  </button>
                </div>
              </form>
            </Card>
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

      <style>{`
        input[type="file"]::-webkit-file-upload-button {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 6px;
          color: rgba(240,244,248,0.7);
          padding: 4px 12px;
          font-size: 11px;
          cursor: pointer;
        }
        input::placeholder { color: rgba(240,244,248,0.2); }
        select option { background: #152236; color: #f0f4f8; }
      `}</style>
    </div>
  );
}

export default ContractualDashboard;