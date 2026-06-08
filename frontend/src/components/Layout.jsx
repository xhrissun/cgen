import { useState, useEffect } from 'react';

function Layout({ user, onLogout, children, fullWidth = false }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [showCreatorModal, setShowCreatorModal] = useState(false);

  useEffect(() => {
    updateProfilePhoto();

    // Listen for profile photo updates
    const handleProfilePhotoUpdate = (event) => {
      if (event.detail.userId !== user.id) return;

      const token = localStorage.getItem('token');
      const ts = event.detail.timestamp || Date.now();
      const newUrl = `/api/users/${user.id}/documents/${event.detail.profilePhoto}?token=${token}&t=${ts}`;

      setProfilePhotoUrl(newUrl);
      // Force another update after small delay (race condition fix)
      setTimeout(() => setProfilePhotoUrl(newUrl + '&force=' + Date.now()), 300);
    };

    window.addEventListener('profilePhotoUpdated', handleProfilePhotoUpdate);

    return () => {
      window.removeEventListener('profilePhotoUpdated', handleProfilePhotoUpdate);
    };
  }, [user.id, user._id, user.personalInfo?.profilePhoto]);

  const updateProfilePhoto = () => {
    const userId = user?.id || user?._id;
    if (user.personalInfo?.profilePhoto && userId) {
      const token = localStorage.getItem('token');
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 12);
      setProfilePhotoUrl(`/api/users/${userId}/documents/${user.personalInfo.profilePhoto}?token=${token}&t=${timestamp}&v=${randomStr}`);
    }
  };

  const getRoleName = (role) => {
    const roleMap = {
      'ADMINISTRATOR': 'Administrator',
      'CONTRACTUAL': 'Contractual',
      'FOCAL_PERSON': 'Focal Person',
      'FINANCE_OFFICER': 'Finance Officer'
    };
    return roleMap[role] || role;
  };

  const getRoleBadgeColor = (role) => {
    const colorMap = {
      'ADMINISTRATOR': 'from-purple-500 to-purple-600',
      'CONTRACTUAL': 'from-blue-500 to-blue-600',
      'FOCAL_PERSON': 'from-green-500 to-green-600',
      'FINANCE_OFFICER': 'from-yellow-500 to-yellow-600'
    };
    return colorMap[role] || 'from-gray-500 to-gray-600';
  };

  const getInitials = () => {
    const firstName = user.personalInfo?.firstName || user.username;
    const lastName = user.personalInfo?.lastName || '';
    
    if (firstName && lastName) {
      return firstName.charAt(0).toUpperCase() + lastName.charAt(0).toUpperCase();
    }
    return firstName.charAt(0).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50 flex flex-col">
      {/* Fixed Navigation Bar */}
      <nav className="bg-white/80 backdrop-blur-md shadow-lg border-b border-gray-200 fixed top-0 left-0 right-0 z-50 h-16">
        <div className={fullWidth ? "px-4 sm:px-6 lg:px-8" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"}>
          <div className="flex justify-between items-center h-16">
            {/* Logo Section */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg p-1">
                  <img 
                    src="/denr-logo.png"
                    alt="DENR Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Contract Management
                  </h1>
                  <p className="text-xs text-gray-500 font-medium">
                    DENR CALABARZON
                  </p>
                </div>
              </div>
            </div>

            {/* User Section */}
            <div className="flex items-center space-x-4">
              {/* User Info Card */}
              <div className="hidden md:flex items-center space-x-3 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg px-4 py-2 border border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {user.personalInfo?.firstName || user.username}
                  </p>
                  <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r ${getRoleBadgeColor(user.role)} text-white`}>
                    {getRoleName(user.role)}
                  </div>
                </div>
              </div>

              {/* About Button */}
              <button
                onClick={() => setShowCreatorModal(true)}
                className="hidden md:flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg font-medium text-sm"
                title="About the Developer"
              >
                <span>ℹ️</span>
                <span>About</span>
              </button>

              {/* Avatar with Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 ring-2 ring-white overflow-hidden"
                >
                  {profilePhotoUrl ? (
                    <img 
                      src={profilePhotoUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // If image fails to load, show initials
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = `<span class="text-sm font-bold">${getInitials()}</span>`;
                      }}
                    />
                  ) : (
                    <span className="text-sm">{getInitials()}</span>
                  )}
                </button>

                {/* Enhanced Dropdown Menu */}
                {showUserMenu && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => setShowUserMenu(false)}
                    />
                    
                    {/* Menu */}
                    <div className="absolute right-0 mt-3 w-64 bg-white rounded-xl shadow-2xl py-2 z-50 border border-gray-200 animate-slideDown">
                      {/* User Info in Dropdown */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold flex items-center justify-center overflow-hidden ring-2 ring-blue-100">
                            {profilePhotoUrl ? (
                              <img 
                                src={profilePhotoUrl}
                                alt="Profile"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.parentElement.innerHTML = `<span class="text-sm font-bold">${getInitials()}</span>`;
                                }}
                              />
                            ) : (
                              <span className="text-sm">{getInitials()}</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900">
                              {user.personalInfo?.firstName} {user.personalInfo?.lastName}
                            </p>
                            <p className="text-xs text-gray-500">
                              @{user.username}
                            </p>
                          </div>
                        </div>
                        <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getRoleBadgeColor(user.role)} text-white`}>
                          {getRoleName(user.role)}
                        </div>
                      </div>
                      
                      {/* Logout Button */}
                      <button
                        onClick={onLogout}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 flex items-center space-x-2 font-medium"
                      >
                        <span>🚪</span>
                        <span>Logout</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 pt-16 pb-16"> {/* Add pb-16 for footer space */}
        <div className={fullWidth ? "" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}>
          {children}
        </div>
      </main>

      {/* Fixed Footer - ONLY for non-admin users */}
      {!fullWidth && (
        <footer className="fixed bottom-0 left-0 right-0 h-12 bg-white border-t border-gray-200 shadow-lg z-40 flex items-center justify-center">
          <p className="text-sm text-gray-600">
            © {new Date().getFullYear()} DENR CALABARZON Contract Management System — All rights reserved.
          </p>
        </footer>
      )}
      
      {/* Creator Profile Modal */}
      {showCreatorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800 text-center flex-1">
                About the Developer
              </h3>
              <button
                onClick={() => setShowCreatorModal(false)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="text-center space-y-4">
              <img
                src="https://github.com/xhrissun/rhrmpsb-system/blob/main/profile.jpg?raw=true"
                alt="Creator Photo"
                className="w-24 h-24 rounded-full mx-auto object-cover border-2 border-gray-200 shadow-sm"
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjY0IiBjeT0iNDQiIHI9IjIwIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0zMiA5NkMzMiA4MC41MzYgNDQuNTM2IDY4IDYwIDY4aDhDODMuNDY0IDY4IDk2IDgwLjUzNiA5NiA5NnYzMkgzMlY5NloiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
                }}
              />
              
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  Dan Christian Bonacua Sabao, LPT, CHRM
                </h2>
                <p className="text-blue-600 font-medium text-sm">
                  Administrative Officer I | DENR IV-A
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-center items-center">
                  <span className="mr-2 text-lg">📧</span>
                  <a
                    href="mailto:dan.c.b.sabao.adm@gmail.com"
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    dan.c.b.sabao.adm@gmail.com
                  </a>
                </div>

                <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 text-sm mb-2">Support My Work</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>PayMaya:</strong> @vlax</p>
                    <p>
                      <strong>PayPal:</strong>{' '}
                      <a
                        href="https://paypal.me/tetralax"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        paypal.me/tetralax
                      </a>
                    </p>
                  </div>
                </div>

                <p className="text-gray-600 text-sm leading-relaxed">
                  Developer of the <strong>DENR CALABARZON Contract Management System</strong>, leveraging expertise in full-stack development to deliver efficient, user-friendly digital solutions.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Layout;