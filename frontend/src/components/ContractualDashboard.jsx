import { useState, useEffect } from 'react';
import { SectionLoader, EmptyState, Spinner } from './ui.jsx';
import api, { openDocument, getDocumentUrl, API_BASE } from '../api.js';
import ContractGenerator from './ContractGenerator';
import DocumentViewerModal from './DocumentViewerModal';
import EnhancedImageCropper from './EnhancedImageCropper';
import EODBGenerator from './EODBGenerator';

const getProfilePhotoUrl = (photoValue, userId, token) => getDocumentUrl(photoValue, userId, token);

const formatPhilHealth = (value) => {
  const n = value.replace(/\D/g, '');
  if (!n.length) return '';
  if (n.length <= 2) return n;
  if (n.length <= 11) return n.slice(0,2)+'-'+n.slice(2);
  return n.slice(0,2)+'-'+n.slice(2,11)+'-'+n.slice(11,12);
};
const formatPagIbig = (value) => {
  const n = value.replace(/\D/g, '');
  if (!n.length) return '';
  if (n.length <= 4) return n;
  if (n.length <= 8) return n.slice(0,4)+'-'+n.slice(4);
  return n.slice(0,4)+'-'+n.slice(4,8)+'-'+n.slice(8,12);
};
const formatTIN = (value) => {
  const n = value.replace(/\D/g, '');
  if (!n.length) return '';
  if (n.length <= 3) return n;
  if (n.length <= 6) return n.slice(0,3)+'-'+n.slice(3);
  if (n.length <= 9) return n.slice(0,3)+'-'+n.slice(3,6)+'-'+n.slice(6);
  return n.slice(0,3)+'-'+n.slice(3,6)+'-'+n.slice(6,9)+'-'+n.slice(9,12);
};
const formatPhoneNumber = (value) => {
  const n = value.replace(/\D/g, '');
  if (!n.length) return '';
  let d = n.startsWith('0') ? '63'+n.slice(1) : n.startsWith('63') ? n : '63'+n;
  let f = '+';
  if (d.length <= 2) f += d;
  else if (d.length <= 5) f += d.slice(0,2)+'-'+d.slice(2);
  else if (d.length <= 8) f += d.slice(0,2)+'-'+d.slice(2,5)+'-'+d.slice(5);
  else f += d.slice(0,2)+'-'+d.slice(2,5)+'-'+d.slice(5,8)+'-'+d.slice(8,12);
  return f;
};
const validateFormats = (personalInfo) => {
  const errors = [];
  if (personalInfo.philhealth && personalInfo.philhealth.replace(/\D/g,'').length !== 12) errors.push('PhilHealth must be 12 digits');
  if (personalInfo.pagibig && personalInfo.pagibig.replace(/\D/g,'').length !== 12) errors.push('Pag-IBIG must be 12 digits');
  if (personalInfo.tin && personalInfo.tin.replace(/\D/g,'').length !== 12) errors.push('TIN must be 12 digits');
  if (personalInfo.phoneNumber && personalInfo.phoneNumber.replace(/\D/g,'').length !== 12) errors.push('Phone Number must be 10 digits after +63');
  return errors;
};

// ── Design tokens ──────────────────────────────────────
const C = {
  bg: '#f0f4f8',
  card: '#ffffff',
  dark: '#0a1628',
  navy: '#0f1e35',
  green: '#2e8b57',
  greenLight: '#ecfdf5',
  greenMid: '#4ade80',
  border: '#e5e7eb',
  text: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
};

const inputStyle = {
  width: '100%', padding: '10px 14px',
  border: `1px solid ${C.border}`, borderRadius: '8px',
  fontSize: '14px', color: C.text,
  background: '#fff', outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
};
const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px',
};
const sectionCard = {
  background: C.card, borderRadius: '14px',
  border: `1px solid ${C.border}`, padding: '28px 32px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};
const sectionHeader = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px',
};
const sectionTitle = {
  fontSize: '16px', fontWeight: 700, color: C.text, margin: 0,
};
const sectionSub = {
  fontSize: '13px', color: C.muted, marginTop: '3px',
};
const btnPrimary = {
  padding: '10px 20px', background: C.green, color: '#fff',
  border: 'none', borderRadius: '8px', fontSize: '13px',
  fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s',
};
const btnSecondary = {
  padding: '10px 20px', background: '#fff', color: C.text,
  border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '13px',
  fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s',
};
const tabNavStyle = {
  display: 'flex', gap: '4px',
  background: 'rgba(0,0,0,0.04)', borderRadius: '10px',
  padding: '4px', marginBottom: '28px',
};

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '9px 12px',
      background: active ? '#fff' : 'transparent',
      border: 'none', borderRadius: '8px',
      color: active ? C.green : C.muted,
      fontSize: '13px', fontWeight: active ? 700 : 500,
      cursor: 'pointer', transition: 'all 0.15s',
      boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
      whiteSpace: 'nowrap',
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function InfoField({ label, value, span = 1 }) {
  return (
    <div style={{ gridColumn: span > 1 ? `span ${span}` : undefined }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: '14px', color: value ? C.text : C.faint, fontWeight: value ? 500 : 400 }}>
        {value || '—'}
      </div>
    </div>
  );
}

function FormInput({ label, type='text', value, onChange, placeholder, readOnly, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children || (
        <input type={type} value={value} onChange={onChange}
          placeholder={placeholder} readOnly={readOnly}
          style={inputStyle}
          onFocus={e => e.target.style.borderColor = C.green}
          onBlur={e => e.target.style.borderColor = C.border}
        />
      )}
    </div>
  );
}

function ContractualDashboard({ user }) {
  if (!user || typeof user !== 'object' || (!user._id && !user.id)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ ...sectionCard, textAlign: 'center', maxWidth: '380px' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Session Error</h2>
          <p style={{ fontSize: '14px', color: C.muted, marginBottom: '20px' }}>Your session appears invalid. Please log in again.</p>
          <button style={btnPrimary} onClick={() => { localStorage.clear(); window.location.href = '/login'; }}>
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
    { id: 'profile', icon: '👤', label: 'Profile' },
    { id: 'contracts', icon: '📄', label: 'My Contracts' },
    { id: 'documents', icon: '📁', label: 'Documents' },
    { id: 'eodb', icon: '🪪', label: 'EODB ID' },
    { id: 'password', icon: '🔒', label: 'Security' },
  ];

  useEffect(() => {
    if (!user?.id && !user?._id) return;
    fetchDocuments();
    loadProfilePhoto();
  }, [user?.id, user?._id, user?.personalInfo?.profilePhoto]);

  useEffect(() => {
    const handler = () => {
      const u = JSON.parse(localStorage.getItem('user'));
      if (u?.personalInfo?.profilePhoto) {
        const uid = u.id || u._id;
        const token = localStorage.getItem('token');
        setProfilePhotoUrl(getProfilePhotoUrl(u.personalInfo.profilePhoto, uid, token));
        setPersonalInfo(u.personalInfo);
        setOriginalPersonalInfo(u.personalInfo);
      }
    };
    window.addEventListener('storage', handler);
    window.addEventListener('userUpdated', handler);
    window.addEventListener('profilePhotoUpdated', handler);
    return () => { window.removeEventListener('storage', handler); window.removeEventListener('userUpdated', handler); window.removeEventListener('profilePhotoUpdated', handler); };
  }, []);

  useEffect(() => { if (refreshTrigger > 0) fetchDocuments(); }, [refreshTrigger]);

  const loadProfilePhoto = () => {
    const uid = user?.id || user?._id;
    if (!uid || !user.personalInfo?.profilePhoto) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    setProfilePhotoUrl(getProfilePhotoUrl(user.personalInfo.profilePhoto, uid, token));
  };
  const handleDocumentUploaded = () => { setRefreshTrigger(p => p+1); fetchDocuments(); };

  const fetchDocuments = async () => {
    const uid = user?.id || user?._id;
    if (!uid) return;
    setLoadingDocuments(true);
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/api/users/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
      setDocuments(res.data.documents || []);
      if (res.data.personalInfo?.profilePhoto) {
        setProfilePhotoUrl(getProfilePhotoUrl(res.data.personalInfo.profilePhoto, uid, token));
      }
    } catch (err) { console.error(err); } finally { setLoadingDocuments(false); }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    const errors = validateFormats(personalInfo);
    if (errors.length) { alert('Please fix:\n' + errors.join('\n')); return; }
    try {
      const uid = user.id || user._id;
      const token = localStorage.getItem('token');
      await api.put(`/api/users/${uid}`, { personalInfo }, { headers: { Authorization: `Bearer ${token}` } });
      alert('Profile updated successfully!');
      const updated = { ...user, personalInfo };
      localStorage.setItem('user', JSON.stringify(updated));
      setOriginalPersonalInfo(personalInfo);
      setIsEditingProfile(false);
      window.dispatchEvent(new Event('userUpdated'));
    } catch (err) { alert('Error: ' + (err.response?.data?.message || err.message)); }
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
    const uid = user.id || user._id;
    if (!uid) { alert('Session invalid. Please log in again.'); return; }
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      if (croppedBlob) {
        const fname = cropType === 'profile' ? 'cropped-profile-round.jpg' : 'cropped-eodb-passport.jpg';
        const docType = cropType === 'profile' ? 'PHOTO' : 'PASSPORT_PHOTO';
        formData.append('file', new File([croppedBlob], fname, { type: 'image/jpeg' }));
        formData.append('type', docType);
        formData.append('description', cropType === 'profile' ? 'Profile Photo' : 'EODB ID Photo');
        formData.append('isProfilePhoto', cropType === 'profile' ? 'true' : 'false');
      } else {
        formData.append('file', uploadForm.file);
        formData.append('type', uploadForm.type);
        formData.append('description', uploadForm.description || '');
        formData.append('isProfilePhoto', uploadForm.type === 'PHOTO' ? 'true' : 'false');
      }
      const res = await api.post(`/api/users/${uid}/documents`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (croppedBlob && cropType === 'profile' && res.data?.personalInfo?.profilePhoto) {
        setShowCropModal(false); setImageToCrop(null); setCurrentCropType('passport');
        setUploadForm({ type: 'SIGNED_CONTRACT', description: '', file: null });
        const fresh = await api.get(`/api/users/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
        localStorage.setItem('user', JSON.stringify(fresh.data));
        setPersonalInfo(fresh.data.personalInfo); setOriginalPersonalInfo(fresh.data.personalInfo);
        setProfilePhotoUrl(getProfilePhotoUrl(fresh.data.personalInfo.profilePhoto, uid, token));
        window.dispatchEvent(new CustomEvent('profilePhotoUpdated', { detail: { userId: uid, profilePhoto: fresh.data.personalInfo.profilePhoto } }));
        window.dispatchEvent(new Event('userUpdated'));
        alert('Profile photo updated!');
        await fetchDocuments();
        setTimeout(() => window.location.reload(), 800);
      } else if (croppedBlob && cropType === 'passport') {
        setShowCropModal(false); setImageToCrop(null); setCurrentCropType('passport');
        alert('EODB photo uploaded!'); await fetchDocuments();
        window.dispatchEvent(new Event('eodbPhotoUpdated'));
      } else {
        alert('Document uploaded!'); setUploadForm({ type: 'SIGNED_CONTRACT', description: '', file: null }); await fetchDocuments();
      }
    } catch (err) { alert('Upload error: ' + (err.response?.data?.message || err.message)); }
    finally { setUploading(false); }
  };

  const handleDeleteDocument = async (filename) => {
    if (!confirm('Delete this document?')) return;
    try {
      const uid = user.id || user._id;
      const token = localStorage.getItem('token');
      const docKey = filename.startsWith('http') ? filename.split('/').pop().split('?')[0] : filename;
      await api.delete(`/api/users/${uid}/documents/${docKey}`, { headers: { Authorization: `Bearer ${token}` } });
      alert('Deleted!'); fetchDocuments();
    } catch (err) { alert('Error: ' + (err.response?.data?.message || err.message)); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { alert('Passwords do not match'); return; }
    try {
      const token = localStorage.getItem('token');
      await api.post('/api/auth/change-password', { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }, { headers: { Authorization: `Bearer ${token}` } });
      alert('Password changed!'); setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) { alert('Error: ' + (err.response?.data?.message || err.message)); }
  };

  const getInitials = () => {
    const f = personalInfo.firstName || user.username || 'U';
    const l = personalInfo.lastName || '';
    return l ? f[0].toUpperCase() + l[0].toUpperCase() : f[0].toUpperCase();
  };

  const getFileIcon = (fn) => {
    const ext = fn.split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['jpg','jpeg','png','gif'].includes(ext)) return '🖼️';
    if (['doc','docx'].includes(ext)) return '📝';
    return '📎';
  };

  const fullName = [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName].filter(Boolean).join(' ') || user.username;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Profile Header Banner ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.dark} 0%, ${C.navy} 100%)`,
        borderRadius: '16px', padding: '28px 32px',
        marginBottom: '28px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative ring */}
        <div style={{ position: 'absolute', right: '-60px', top: '-60px', width: '240px', height: '240px', borderRadius: '50%', border: '1px solid rgba(46,139,87,0.2)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '160px', height: '160px', borderRadius: '50%', border: '1px solid rgba(46,139,87,0.12)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative' }}>
          {/* Avatar */}
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: C.green, border: '3px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', fontWeight: 700, color: '#fff',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {profilePhotoUrl
              ? <img key={profilePhotoUrl} src={profilePhotoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : getInitials()
            }
          </div>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: C.greenMid, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
              Contractual Employee
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{fullName}</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }}>
              {user.placeOfAssignment || 'Place of Assignment not set'} · @{user.username}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div style={tabNavStyle}>
        {tabs.map(t => <TabBtn key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} icon={t.icon} label={t.label} />)}
      </div>

      {/* ── PROFILE TAB ── */}
      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Photo Section */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <div>
                <div style={sectionTitle}>Profile Photo</div>
                <div style={sectionSub}>Displayed on your account and documents</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: `${C.green}22`, border: `2px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 700, color: C.green, overflow: 'hidden', flexShrink: 0 }}>
                {profilePhotoUrl ? <img key={profilePhotoUrl} src={profilePhotoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials()}
              </div>
              <div>
                <label style={{ ...btnSecondary, display: 'inline-block', cursor: 'pointer' }}>
                  Upload Photo
                  <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setUploadForm({ type: 'PHOTO', description: 'Profile Photo', file });
                      const r = new FileReader();
                      r.onload = (e) => { setImageToCrop(e.target.result); setCurrentCropType('profile'); setShowCropModal(true); };
                      r.readAsDataURL(file);
                    }
                  }} style={{ display: 'none' }} />
                </label>
                <div style={{ fontSize: '12px', color: C.faint, marginTop: '8px' }}>JPG, PNG or GIF. Max 5MB.</div>
              </div>
              <div style={{ marginLeft: '16px', paddingLeft: '16px', borderLeft: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, marginBottom: '8px' }}>EODB ID Photo</div>
                <label style={{ ...btnSecondary, display: 'inline-block', cursor: 'pointer', fontSize: '12px', padding: '8px 14px' }}>
                  Upload EODB Photo
                  <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setUploadForm({ type: 'PASSPORT_PHOTO', description: 'EODB Photo', file });
                      const r = new FileReader();
                      r.onload = (e) => { setImageToCrop(e.target.result); setCurrentCropType('passport'); setShowCropModal(true); };
                      r.readAsDataURL(file);
                    }
                  }} style={{ display: 'none' }} />
                </label>
                <div style={{ fontSize: '11px', color: C.faint, marginTop: '6px' }}>2:3 passport-style</div>
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <div>
                <div style={sectionTitle}>Personal Information</div>
                <div style={sectionSub}>Your official details used in contract generation</div>
              </div>
              {!isEditingProfile ? (
                <button style={btnSecondary} onClick={() => setIsEditingProfile(true)}>Edit Profile</button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={btnSecondary} onClick={() => { setPersonalInfo(originalPersonalInfo); setIsEditingProfile(false); }}>Cancel</button>
                  <button style={btnPrimary} onClick={handleUpdateProfile}>Save Changes</button>
                </div>
              )}
            </div>

            {!isEditingProfile ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                <InfoField label="Last Name" value={personalInfo.lastName} />
                <InfoField label="First Name" value={personalInfo.firstName} />
                <InfoField label="Middle Name" value={personalInfo.middleName} />
                <InfoField label="Sex" value={personalInfo.sex} />
                <InfoField label="Birthday" value={personalInfo.birthday ? new Date(personalInfo.birthday).toLocaleDateString('en-PH') : null} />
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <FormInput label="Last Name" value={personalInfo.lastName||''} onChange={e=>setPersonalInfo({...personalInfo,lastName:e.target.value.toUpperCase()})} />
                  <FormInput label="First Name" value={personalInfo.firstName||''} onChange={e=>setPersonalInfo({...personalInfo,firstName:e.target.value.toUpperCase()})} />
                  <FormInput label="Middle Name" value={personalInfo.middleName||''} onChange={e=>setPersonalInfo({...personalInfo,middleName:e.target.value.toUpperCase()})} />
                  <FormInput label="Sex">
                    <select value={personalInfo.sex||'MALE'} onChange={e=>setPersonalInfo({...personalInfo,sex:e.target.value})} style={inputStyle} onFocus={e=>e.target.style.borderColor=C.green} onBlur={e=>e.target.style.borderColor=C.border}>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                  </FormInput>
                  <FormInput label="Birthday" type="date" value={personalInfo.birthday?personalInfo.birthday.split('T')[0]:''} onChange={e=>setPersonalInfo({...personalInfo,birthday:e.target.value})} />
                  <FormInput label="Place of Birth" value={personalInfo.placeOfBirth||''} onChange={e=>setPersonalInfo({...personalInfo,placeOfBirth:e.target.value.toUpperCase()})} />
                  <FormInput label="Phone Number" value={personalInfo.phoneNumber||''} onChange={e=>setPersonalInfo({...personalInfo,phoneNumber:formatPhoneNumber(e.target.value)})} placeholder="+63-XXX-XXX-XXXX" />
                  <div style={{ gridColumn: 'span 2' }}>
                    <FormInput label="Email" type="email" value={personalInfo.email||''} onChange={e=>setPersonalInfo({...personalInfo,email:e.target.value.toLowerCase()})} />
                  </div>
                  <div style={{ gridColumn: 'span 3' }}>
                    <FormInput label="Address" value={personalInfo.address||''} onChange={e=>setPersonalInfo({...personalInfo,address:e.target.value.toUpperCase()})} />
                  </div>
                  <FormInput label="PhilHealth" value={personalInfo.philhealth||''} onChange={e=>setPersonalInfo({...personalInfo,philhealth:formatPhilHealth(e.target.value)})} placeholder="XX-XXXXXXXXX-X" />
                  <FormInput label="Pag-IBIG" value={personalInfo.pagibig||''} onChange={e=>setPersonalInfo({...personalInfo,pagibig:formatPagIbig(e.target.value)})} placeholder="XXXX-XXXX-XXXX" />
                  <FormInput label="TIN" value={personalInfo.tin||''} onChange={e=>setPersonalInfo({...personalInfo,tin:formatTIN(e.target.value)})} placeholder="XXX-XXX-XXX-XXX" />
                  <FormInput label="Highest Education" value={personalInfo.highestEducation||''} onChange={e=>setPersonalInfo({...personalInfo,highestEducation:e.target.value.toUpperCase()})} />
                  <div style={{ gridColumn: 'span 2' }}>
                    <FormInput label="Bachelor's Degree" value={personalInfo.bachelorsDegree||''} onChange={e=>setPersonalInfo({...personalInfo,bachelorsDegree:e.target.value.toUpperCase()})} />
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── CONTRACTS TAB ── */}
      {activeTab === 'contracts' && (
        <div style={sectionCard}>
          <ContractGenerator userRole="CONTRACTUAL" userId={user.id || user._id} viewOnly={true} />
        </div>
      )}

      {/* ── DOCUMENTS TAB ── */}
      {activeTab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Upload */}
          <div style={sectionCard}>
            <div style={sectionTitle}>Upload Document</div>
            <div style={sectionSub, { marginBottom: '20px', marginTop: '4px', fontSize: '13px', color: C.muted }}>Attach signed contracts or supporting documents to your record</div>
            <form onSubmit={handleFileUpload}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <FormInput label="Document Type">
                  <select value={uploadForm.type} onChange={e=>setUploadForm({...uploadForm,type:e.target.value})} style={inputStyle}>
                    <option value="SIGNED_CONTRACT">Signed Contract</option>
                    <option value="PHOTO">Photo</option>
                    <option value="OTHERS">Others</option>
                  </select>
                </FormInput>
                <FormInput label="Description (optional)">
                  <input style={inputStyle} value={uploadForm.description} onChange={e=>setUploadForm({...uploadForm,description:e.target.value})} placeholder="e.g. Contract for 1st Sem 2025" onFocus={e=>e.target.style.borderColor=C.green} onBlur={e=>e.target.style.borderColor=C.border} />
                </FormInput>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>File</label>
                <input type="file" onChange={e=>setUploadForm({...uploadForm,file:e.target.files[0]})} required style={{ ...inputStyle, padding: '8px 14px' }} />
              </div>
              <button type="submit" disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Uploading…' : 'Upload Document'}
              </button>
            </form>
          </div>

          {/* List */}
          <div style={sectionCard}>
            <div style={{ ...sectionHeader, marginBottom: '16px' }}>
              <div style={sectionTitle}>My Documents</div>
              <div style={{ fontSize: '13px', color: C.muted }}>{documents.length} file{documents.length !== 1 ? 's' : ''}</div>
            </div>
            {loadingDocuments ? (
              <div style={{ textAlign: 'center', padding: '40px', color: C.muted }}>Loading…</div>
            ) : documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>📄</div>
                <div style={{ fontWeight: 600, color: C.text, marginBottom: '4px' }}>No documents yet</div>
                <div style={{ fontSize: '13px', color: C.faint }}>Upload your first document above</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {documents.map((doc, i) => {
                  const fname = doc.filename?.startsWith('http') ? doc.filename.split('/').pop().split('?')[0] : doc.filename;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', background: i % 2 === 0 ? '#fafafa' : '#fff', borderRadius: '8px', border: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: '22px', flexShrink: 0 }}>{getFileIcon(doc.filename||'')}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</div>
                        <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                          {doc.type?.replace('_',' ')} · {doc.description || 'No description'} · {new Date(doc.uploadDate).toLocaleDateString('en-PH')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button onClick={() => setViewingDocument(doc.url||doc.filename||doc.key)} style={{ padding: '6px 14px', border: `1px solid ${C.border}`, borderRadius: '6px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#2563eb' }}>View</button>
                        <button onClick={() => { const uid=user.id||user._id; const token=localStorage.getItem('token'); openDocument(doc.url||doc.filename||doc.key,uid,token); }} style={{ padding: '6px 14px', border: `1px solid ${C.border}`, borderRadius: '6px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: C.green }}>Download</button>
                        <button onClick={() => handleDeleteDocument(doc.key||doc.filename)} style={{ padding: '6px 14px', border: '1px solid #fecaca', borderRadius: '6px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#dc2626' }}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EODB TAB ── */}
      {activeTab === 'eodb' && (
        <div style={sectionCard}>
          <EODBGenerator userId={user.id || user._id} onDocumentUploaded={handleDocumentUploaded} />
        </div>
      )}

      {/* ── SECURITY TAB ── */}
      {activeTab === 'password' && (
        <div style={{ maxWidth: '480px' }}>
          <div style={sectionCard}>
            <div style={{ ...sectionTitle, marginBottom: '6px' }}>Change Password</div>
            <div style={{ ...sectionSub, marginBottom: '24px' }}>Use a strong password you don't use elsewhere</div>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { label: 'Current Password', key: 'currentPassword' },
                { label: 'New Password', key: 'newPassword' },
                { label: 'Confirm New Password', key: 'confirmPassword' },
              ].map(f => (
                <FormInput key={f.key} label={f.label} type="password" value={passwordForm[f.key]} onChange={e=>setPasswordForm({...passwordForm,[f.key]:e.target.value})} />
              ))}
              <button type="submit" style={btnPrimary}>Update Password</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {viewingDocument && (
        <DocumentViewerModal userId={user.id||user._id} filename={viewingDocument} onClose={()=>setViewingDocument(null)} />
      )}
      {showCropModal && imageToCrop && (
        <EnhancedImageCropper
          imageSrc={imageToCrop} onConfirm={uploadDocument} uploading={uploading} cropType={currentCropType}
          onCancel={() => { setShowCropModal(false); setImageToCrop(null); setCurrentCropType('passport'); setUploadForm({type:'SIGNED_CONTRACT',description:'',file:null}); }}
        />
      )}
    </div>
  );
}

export default ContractualDashboard;