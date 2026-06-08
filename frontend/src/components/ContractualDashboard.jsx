import { useState, useEffect } from 'react';
import api from '../api.js';
import ContractGenerator from './ContractGenerator';
import DocumentViewerModal from './DocumentViewerModal';
import EnhancedImageCropper from './EnhancedImageCropper';
import EODBGenerator from './EODBGenerator';


// Helper: profilePhoto may be a full R2 URL or legacy filename
const getProfilePhotoUrl = (photoValue, userId, token) => {
  if (!photoValue) return null;
  if (photoValue.startsWith('http')) return photoValue; // Already R2 URL
  // Legacy: build API proxy URL
  const t = Date.now();
  const v = Math.random().toString(36).substring(2, 12);
  return `/api/users/${userId}/documents/${photoValue}?token=${token}&t=${t}&v=${v}`;
};


const formatPhilHealth = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  
  let formatted = '';
  if (numbers.length <= 2) {
    formatted = numbers;
  } else if (numbers.length <= 11) {
    formatted = numbers.slice(0, 2) + '-' + numbers.slice(2);
  } else {
    formatted = numbers.slice(0, 2) + '-' + numbers.slice(2, 11) + '-' + numbers.slice(11, 12);
  }
  return formatted;
};

const formatPagIbig = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  
  let formatted = '';
  if (numbers.length <= 4) {
    formatted = numbers;
  } else if (numbers.length <= 8) {
    formatted = numbers.slice(0, 4) + '-' + numbers.slice(4);
  } else {
    formatted = numbers.slice(0, 4) + '-' + numbers.slice(4, 8) + '-' + numbers.slice(8, 12);
  }
  return formatted;
};

const formatTIN = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  
  let formatted = '';
  if (numbers.length <= 3) {
    formatted = numbers;
  } else if (numbers.length <= 6) {
    formatted = numbers.slice(0, 3) + '-' + numbers.slice(3);
  } else if (numbers.length <= 9) {
    formatted = numbers.slice(0, 3) + '-' + numbers.slice(3, 6) + '-' + numbers.slice(6);
  } else {
    formatted = numbers.slice(0, 3) + '-' + numbers.slice(3, 6) + '-' + numbers.slice(6, 9) + '-' + numbers.slice(9, 12);
  }
  return formatted;
};

const formatPhoneNumber = (value) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  
  let digitsToFormat = numbers;
  
  if (numbers.startsWith('0')) {
    digitsToFormat = '63' + numbers.slice(1);
  } else if (numbers.startsWith('63')) {
    digitsToFormat = numbers;
  } else {
    digitsToFormat = '63' + numbers;
  }
  
  let formatted = '+';
  if (digitsToFormat.length <= 2) {
    formatted += digitsToFormat;
  } else if (digitsToFormat.length <= 5) {
    formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2);
  } else if (digitsToFormat.length <= 8) {
    formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2, 5) + '-' + digitsToFormat.slice(5);
  } else {
    formatted += digitsToFormat.slice(0, 2) + '-' + digitsToFormat.slice(2, 5) + '-' + digitsToFormat.slice(5, 8) + '-' + digitsToFormat.slice(8, 12);
  }
  
  return formatted;
};

const validateFormats = (personalInfo) => {
  const errors = [];
  
  if (personalInfo.philhealth) {
    const numbers = personalInfo.philhealth.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) {
      errors.push('PhilHealth must be 12 digits (XX-XXXXXXXXX-X)');
    }
  }
  
  if (personalInfo.pagibig) {
    const numbers = personalInfo.pagibig.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) {
      errors.push('Pag-IBIG must be 12 digits (XXXX-XXXX-XXXX)');
    }
  }
  
  if (personalInfo.tin) {
    const numbers = personalInfo.tin.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) {
      errors.push('TIN must be 12 digits (XXX-XXX-XXX-XXX)');
    }
  }
  
  if (personalInfo.phoneNumber) {
    const numbers = personalInfo.phoneNumber.replace(/\D/g, '');
    if (numbers.length > 0 && numbers.length !== 12) {
      errors.push('Phone Number must be 10 digits after +63 (+63-XXX-XXX-XXXX)');
    }
  }
  
  return errors;
};

function ContractualDashboard({ user }) {
  if (!user || typeof user !== 'object' || !user._id && !user.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md bg-white p-8 rounded-lg shadow border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Session Error</h2>
          <p className="text-gray-600 text-sm mb-6">
            User information is missing or corrupted. Please log in again.
          </p>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = '/login';
            }}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
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
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    type: 'SIGNED_CONTRACT',
    description: '',
    file: null
  });
  const [viewingDocument, setViewingDocument] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [showCropModal, setShowCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [currentCropType, setCurrentCropType] = useState('passport');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const tabs = [
    { id: 'profile', name: 'Personal Information' },
    { id: 'contracts', name: 'My Contracts' },
    { id: 'documents', name: 'Documents' },
    { id: 'eodb', name: 'EODB ID' },
    { id: 'password', name: 'Change Password' }
  ];

  useEffect(() => {
    if (!user?.id && !user?._id) return;
    const initialize = async () => {
      try {
        await fetchDocuments();
        loadProfilePhoto();
      } catch (err) {
        console.error("Dashboard initialization failed:", err);
      }
    };
    initialize();
  }, [user?.id, user?._id, user?.personalInfo?.profilePhoto]);

  useEffect(() => {
    const handleStorageChange = () => {
      const updatedUser = JSON.parse(localStorage.getItem('user'));
      if (updatedUser?.personalInfo?.profilePhoto) {
        const userId = updatedUser.id || updatedUser._id;
        const token = localStorage.getItem('token');
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 12);
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

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchDocuments();
    }
  }, [refreshTrigger]);

  const loadProfilePhoto = () => {
    const userId = user?.id || user?._id;
    if (!userId || !user.personalInfo?.profilePhoto) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 12);
    setProfilePhotoUrl(getProfilePhotoUrl(user.personalInfo.profilePhoto, userId, token));
  };

  const handleDocumentUploaded = () => {
    setRefreshTrigger(prev => prev + 1);
    fetchDocuments();
  };

  const fetchDocuments = async () => {
    const userId = user?.id || user?._id;
    if (!userId) return;

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("No token available");

      const response = await api.get(`/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setDocuments(response.data.documents || []);

      if (response.data.personalInfo?.profilePhoto) {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 12);
        setProfilePhotoUrl(getProfilePhotoUrl(response.data.personalInfo.profilePhoto, userId, token));
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };

  const handleCancelEdit = () => {
    setPersonalInfo(originalPersonalInfo);
    setIsEditingProfile(false);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    
    const errors = validateFormats(personalInfo);
    if (errors.length > 0) {
      alert('Please fix the following errors:\n\n' + errors.join('\n'));
      return;
    }
    
    try {
      const userId = user.id || user._id;
      const token = localStorage.getItem('token');
      
      await api.put(`/api/users/${userId}`, 
        { personalInfo },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert('Profile updated successfully!');
      
      const updatedUser = { ...user, personalInfo };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      setOriginalPersonalInfo(personalInfo);
      setIsEditingProfile(false);
      
      window.dispatchEvent(new Event('userUpdated'));
      
    } catch (error) {
      console.error('Profile update error:', error);
      alert('Error updating profile: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      alert('Please select a file');
      return;
    }

    if (uploadForm.type === 'PHOTO') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageToCrop(e.target.result);
        setShowCropModal(true);
      };
      reader.readAsDataURL(uploadForm.file);
      return;
    }

    await uploadDocument();
  };

  const uploadDocument = async (croppedBlob = null, cropType = 'passport') => {
    if (!user || typeof user !== 'object' || (!user.id && !user._id)) {
      setUploading(false);
      alert("Cannot upload: Your session appears to be invalid. Please log out and log in again.");
      window.location.href = '/login';
      return;
    }

    const userId = user.id || user._id;
    setUploading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("No authentication token found. Please log in again.");
      }

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
        if (!uploadForm.file) throw new Error("No file selected");
        formData.append('file', uploadForm.file);
        formData.append('type', uploadForm.type);
        formData.append('description', uploadForm.description || '');
        formData.append('isProfilePhoto', uploadForm.type === 'PHOTO' ? 'true' : 'false');
      }

      const response = await api.post(`/api/users/${userId}/documents`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (croppedBlob && cropType === 'profile' && response.data?.personalInfo?.profilePhoto) {
        try {
          setShowCropModal(false);
          setImageToCrop(null);
          setCurrentCropType('passport');
          setUploadForm({ type: 'SIGNED_CONTRACT', description: '', file: null });

          const freshResponse = await api.get(`/api/users/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          const freshUser = freshResponse.data;
          localStorage.setItem('user', JSON.stringify(freshUser));
          setPersonalInfo(freshUser.personalInfo);
          setOriginalPersonalInfo(freshUser.personalInfo);

          const ts = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 12);
          const freshUrl = getProfilePhotoUrl(freshUser.personalInfo.profilePhoto, userId, token);
          setProfilePhotoUrl(freshUrl);

          window.dispatchEvent(new CustomEvent('profilePhotoUpdated', {
            detail: {
              userId: userId,
              profilePhoto: freshUser.personalInfo.profilePhoto,
              timestamp: ts
            }
          }));

          window.dispatchEvent(new Event('userUpdated'));
          alert('Profile photo updated successfully!');
          await fetchDocuments();
          setTimeout(() => window.location.reload(), 800);

        } catch (refreshErr) {
          console.error("Failed to refresh user after photo upload:", refreshErr);
          alert("Photo uploaded but preview might be delayed. Please refresh the page.");
        }
      } else if (croppedBlob && cropType === 'passport') {
        setShowCropModal(false);
        setImageToCrop(null);
        setCurrentCropType('passport');
        alert('EODB photo uploaded successfully! You can now generate your ID.');
        await fetchDocuments();
        window.dispatchEvent(new Event('eodbPhotoUpdated'));
      } else {
        alert('Document uploaded successfully!');
        setUploadForm({ type: 'SIGNED_CONTRACT', description: '', file: null });
        await fetchDocuments();
      }
    } catch (error) {
      console.error('Upload error:', error);
      const errorMsg = error.response?.data?.message 
        || error.message 
        || "Unknown error during upload";
      alert(`Error uploading document: ${errorMsg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDocument = async (filename) => {
    try {
      const userId = user.id || user._id;
      const token = localStorage.getItem('token');
      const response = await api.get(`/api/users/${userId}/documents/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error downloading document: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleViewDocument = (filename) => {
    setViewingDocument(filename);
  };

  const handleDeleteDocument = async (filename) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const userId = user.id || user._id;
      const token = localStorage.getItem('token');
      await api.delete(`/api/users/${userId}/documents/${filename}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Document deleted successfully!');
      fetchDocuments();
    } catch (error) {
      alert('Error deleting document: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.post('/api/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert('Password changed successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      alert('Error changing password: ' + (error.response?.data?.message || error.message));
    }
  };

  const updatePersonalInfo = (field, value) => {
    setPersonalInfo({ ...personalInfo, [field]: value });
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '📄';
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📝';
    return '📎';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Contractual Dashboard</h2>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Profile Photo Section */}
          <div className="card">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Profile Photo</h3>
                <p className="text-sm text-gray-500 mt-1">This will be displayed on your profile</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center text-gray-600 text-2xl font-semibold border border-gray-300">
                  {profilePhotoUrl ? (
                    <img 
                      key={profilePhotoUrl}
                      src={profilePhotoUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{personalInfo.firstName?.charAt(0) || user.username?.charAt(0)?.toUpperCase() || 'U'}</span>
                  )}
                </div>
              </div>
              <div>
                <label className="btn btn-secondary cursor-pointer inline-block text-sm">
                  Upload New Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setUploadForm({ type: 'PHOTO', description: 'Profile Photo', file });
                        const reader = new FileReader();
                        reader.onload = (e) => {
                          setImageToCrop(e.target.result);
                          setCurrentCropType('profile');
                          setShowCropModal(true);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-2">JPG, PNG or GIF. Max 5MB</p>
              </div>
            </div>
          </div>

          {/* EODB Photo Upload */}
          <div className="card bg-blue-50 border border-blue-200">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-gray-900 mb-1">EODB ID Photo</h4>
                <p className="text-sm text-gray-600 mb-3">Upload a passport-style photo (2:3 ratio) for your EODB ID. This is separate from your profile photo.</p>
                <label className="btn btn-sm bg-blue-600 text-white hover:bg-blue-700 cursor-pointer inline-block">
                  Upload EODB Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setUploadForm({ type: 'PASSPORT_PHOTO', description: 'EODB Photo', file });
                        const reader = new FileReader();
                        reader.onload = (e) => {
                          setImageToCrop(e.target.result);
                          setCurrentCropType('passport');
                          setShowCropModal(true);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                <p className="text-sm text-gray-500 mt-1">Manage your personal details</p>
              </div>
              {!isEditingProfile ? (
                <button
                  onClick={handleEditProfile}
                  className="btn btn-secondary"
                >
                  Edit
                </button>
              ) : (
                <div className="flex space-x-2">
                  <button
                    onClick={handleCancelEdit}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateProfile}
                    className="btn btn-primary"
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>

            {!isEditingProfile ? (
              // View Mode
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              // Edit Mode
              <form onSubmit={handleUpdateProfile}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    label="Last Name"
                    value={personalInfo.lastName || ''}
                    onChange={(e) => updatePersonalInfo('lastName', e.target.value.toUpperCase())}
                  />
                  <FormField
                    label="First Name"
                    value={personalInfo.firstName || ''}
                    onChange={(e) => updatePersonalInfo('firstName', e.target.value.toUpperCase())}
                  />
                  <FormField
                    label="Middle Name"
                    value={personalInfo.middleName || ''}
                    onChange={(e) => updatePersonalInfo('middleName', e.target.value.toUpperCase())}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
                    <select
                      value={personalInfo.sex || 'MALE'}
                      onChange={(e) => updatePersonalInfo('sex', e.target.value.toUpperCase())}
                      className="input"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                  </div>
                  <FormField
                    label="Birthday"
                    type="date"
                    value={personalInfo.birthday ? personalInfo.birthday.split('T')[0] : ''}
                    onChange={(e) => updatePersonalInfo('birthday', e.target.value)}
                  />
                  <FormField
                    label="Place of Birth"
                    value={personalInfo.placeOfBirth || ''}
                    onChange={(e) => updatePersonalInfo('placeOfBirth', e.target.value.toUpperCase())}
                  />
                  <FormField
                    label="Phone Number"
                    value={personalInfo.phoneNumber || ''}
                    onChange={(e) => updatePersonalInfo('phoneNumber', formatPhoneNumber(e.target.value))}
                    placeholder="+63-XXX-XXX-XXXX"
                  />
                  <div className="md:col-span-2">
                    <FormField
                      label="Email"
                      type="email"
                      value={personalInfo.email || ''}
                      onChange={(e) => updatePersonalInfo('email', e.target.value.toLowerCase())}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <FormField
                      label="Address"
                      value={personalInfo.address || ''}
                      onChange={(e) => updatePersonalInfo('address', e.target.value.toUpperCase())}
                    />
                  </div>
                  <FormField
                    label="PhilHealth"
                    value={personalInfo.philhealth || ''}
                    onChange={(e) => updatePersonalInfo('philhealth', formatPhilHealth(e.target.value))}
                    placeholder="XX-XXXXXXXXX-X"
                  />
                  <FormField
                    label="Pag-IBIG"
                    value={personalInfo.pagibig || ''}
                    onChange={(e) => updatePersonalInfo('pagibig', formatPagIbig(e.target.value))}
                    placeholder="XXXX-XXXX-XXXX"
                  />
                  <FormField
                    label="TIN"
                    value={personalInfo.tin || ''}
                    onChange={(e) => updatePersonalInfo('tin', formatTIN(e.target.value))}
                    placeholder="XXX-XXX-XXX-XXX"
                  />
                  <FormField
                    label="Highest Education"
                    value={personalInfo.highestEducation || ''}
                    onChange={(e) => updatePersonalInfo('highestEducation', e.target.value.toUpperCase())}
                  />
                  <div className="md:col-span-2">
                    <FormField
                      label="Bachelor's Degree"
                      value={personalInfo.bachelorsDegree || ''}
                      onChange={(e) => updatePersonalInfo('bachelorsDegree', e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {activeTab === 'contracts' && (
        <ContractGenerator userRole="CONTRACTUAL" userId={user.id || user._id} viewOnly={true} />
      )}

      {activeTab === 'documents' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Document</h3>
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                  <select
                    value={uploadForm.type}
                    onChange={(e) => setUploadForm({...uploadForm, type: e.target.value})}
                    className="input"
                  >
                    <option value="SIGNED_CONTRACT">Signed Contract</option>
                    <option value="PHOTO">Photo</option>
                    <option value="OTHERS">Others</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={uploadForm.description}
                    onChange={(e) => setUploadForm({...uploadForm, description: e.target.value})}
                    className="input"
                    placeholder="Optional description"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                <input
                  type="file"
                  onChange={(e) => setUploadForm({...uploadForm, file: e.target.files[0]})}
                  className="input"
                  required
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
            </form>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">My Documents</h3>
            {documents.length === 0 ? (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">No documents uploaded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Filename</th>
                      <th>Description</th>
                      <th>Upload Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc, index) => (
                      <tr key={index}>
                        <td>
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            {doc.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center text-sm">
                            <span className="mr-2">{getFileIcon(doc.filename)}</span>
                            {doc.filename}
                          </div>
                        </td>
                        <td className="text-sm text-gray-600">{doc.description || '-'}</td>
                        <td className="text-sm text-gray-600">{new Date(doc.uploadDate).toLocaleDateString()}</td>
                        <td>
                          <div className="flex space-x-3 text-sm">
                            <button
                              onClick={() => handleViewDocument(doc.filename)}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleDownloadDocument(doc.filename)}
                              className="text-green-600 hover:text-green-800 font-medium"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => handleDeleteDocument(doc.filename)}
                              className="text-red-600 hover:text-red-800 font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'eodb' && (
        <EODBGenerator
          userId={user.id || user._id}
          onDocumentUploaded={handleDocumentUploaded}
        />
      )}

      {activeTab === 'password' && (
        <div className="max-w-xl">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                  className="input"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary">
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {viewingDocument && (
        <DocumentViewerModal
          userId={user.id || user._id}
          filename={viewingDocument}
          onClose={() => setViewingDocument(null)}
        />
      )}

      {showCropModal && imageToCrop && (
        <EnhancedImageCropper
          imageSrc={imageToCrop}
          onConfirm={uploadDocument}
          onCancel={() => {
            setShowCropModal(false);
            setImageToCrop(null);
            setCurrentCropType('passport');
            setUploadForm({ type: 'SIGNED_CONTRACT', description: '', file: null });
          }}
          uploading={uploading}
          cropType={currentCropType}
        />
      )}
    </div>
  );
}

// Helper Components
function InfoField({ label, value, span = 1 }) {
  return (
    <div className={span > 1 ? `md:col-span-${span}` : ''}>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || 'Not specified'}</dd>
    </div>
  );
}

function FormField({ label, type = 'text', value, onChange, placeholder, ...props }) {
  return (
    <div {...props}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

export default ContractualDashboard;