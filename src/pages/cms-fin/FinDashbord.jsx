// Dashboard.jsx (Tailwind CSS version — no react-bootstrap)
import { useState, useEffect, useRef } from 'react';
import {
  FaTachometerAlt,
  FaFileAlt,
  FaFileInvoice,
  FaGraduationCap,
  FaSearch,
  FaTimes,
  FaBars,
  FaSignOutAlt,
  FaUserCircle,
} from 'react-icons/fa';

// ------------------------------------------------------------------
// Session timeout settings
// ------------------------------------------------------------------
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_COUNTDOWN_SEC = 20; // seconds to auto-logout after popup shows

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // ✅ Default to first nav page since the dashboard home is removed
  const [activeSection, setActiveSection] = useState('/cmsFeeStructure');

  // State for user info
  const [userInfo, setUserInfo] = useState({
    name: 'Guest',
    userId: 'loading...',
    roleDescription: '...',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ----------------------------------------------------------------
  // Logout + Session Timeout
  // ----------------------------------------------------------------
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_COUNTDOWN_SEC);
  const lastActivityRef = useRef(Date.now());
  const checkerIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const logout = () => {
    try {
      localStorage.removeItem('auth');
      sessionStorage.clear();
    } finally {
      window.location.href = '/';
    }
  };

  const resetInactivityTimer = () => {
    lastActivityRef.current = Date.now();
    if (showTimeoutWarning) {
      setShowTimeoutWarning(false);
      setCountdown(WARNING_COUNTDOWN_SEC);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }
  };

  useEffect(() => {
    const bump = () => resetInactivityTimer();
    window.addEventListener('mousemove', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('click', bump);
    window.addEventListener('scroll', bump, { passive: true });
    window.addEventListener('touchstart', bump, { passive: true });

    checkerIntervalRef.current = setInterval(() => {
      const diff = Date.now() - lastActivityRef.current;
      if (diff >= SESSION_TIMEOUT_MS && !showTimeoutWarning) {
        setShowTimeoutWarning(true);
        setCountdown(WARNING_COUNTDOWN_SEC);

        countdownIntervalRef.current = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
              logout();
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('click', bump);
      window.removeEventListener('scroll', bump);
      window.removeEventListener('touchstart', bump);
      if (checkerIntervalRef.current) clearInterval(checkerIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [showTimeoutWarning]);

  // ----------------------------------------------------------------
  // Load user info only (graphs removed, no mock data needed)
  // ----------------------------------------------------------------
  useEffect(() => {
    const loadUserInfo = () => {
      try {
        const authData = JSON.parse(sessionStorage.getItem('sessionUser') || 'null');
        if (authData) {
          setUserInfo({
            name: authData.name || 'User',
            userId: authData.userId || 'Not available',
            roleDescription: authData.role_description || 'No role defined',
          });
        } else {
          logout();
        }
      } catch {
        logout();
      } finally {
        setLoading(false);
      }
    };
    loadUserInfo();
  }, []);

  // ----------------------------------------------------------------
  // Navigation (keep paths EXACT)
  // ----------------------------------------------------------------
  const navigation = [
    { name: 'Fee Structure', path: '/cmsFeeStructure', icon: <FaFileAlt /> },
    { name: 'Fee Invoices', path: '/cmsStuFeeInvoice', icon: <FaFileInvoice /> },
    // { name: 'Scholarships', path: '/cmsStuScholarship', icon: <FaGraduationCap /> },
    { name: 'Demand Letter Generator', path: '/demand-letter-generator', icon: <FaFileAlt /> },
  ];

  const handleNavigationClick = (path) => {
    setActiveSection(path);
    setSidebarOpen(false);
  };

  // ----------------------------------------------------------------
  // Loading / Error
  // ----------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-flex items-center gap-3 text-indigo-600">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-md border border-red-200 bg-red-50 text-red-700 px-4 py-3">
          {error}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Iframe Content
  // ----------------------------------------------------------------
  const renderIframeContent = () => {
    const section = navigation.find((item) => item.path === activeSection);
    if (!section) return null;
    return (
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">{section.name}</h3>
          {/* Back button kept (returns to Fee Structure default) */}
          <button
            onClick={() => setActiveSection('/cmsFeeStructure')}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
          >
            <FaTachometerAlt /> Go to Fee Structure
          </button>
        </div>
        <div className="w-full" style={{ height: 'calc(100vh - 200px)' }}>
          <iframe
            src={section.path}
            title={section.name}
            className="w-full h-full border-0"
          />
        </div>
      </div>
    );
  };

  // ----------------------------------------------------------------
  // Layout
  // ----------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r">
        <div className="px-4 py-4 border-b">
          <h2 className="text-lg font-semibold">Fee Management</h2>
        </div>
        <nav className="p-2 space-y-1">
          {navigation.map((item) => (
            <button
              key={item.name}
              onClick={() => handleNavigationClick(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
                ${activeSection === item.path
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {item.icon}
              {item.name}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          aria-modal="true"
          role="dialog"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-4 border-b">
              <h2 className="text-lg font-semibold">Fee Management</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-md hover:bg-gray-100"
              >
                <FaTimes />
              </button>
            </div>
            <nav className="p-2 space-y-1">
              {navigation.map((item) => (
                <button
                  key={item.name}
                  onClick={() => handleNavigationClick(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
                    ${activeSection === item.path
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {item.icon}
                  {item.name}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="bg-white shadow">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 rounded-md hover:bg-gray-100"
                onClick={() => setSidebarOpen(true)}
              >
                <FaBars />
              </button>
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md">
                <FaSearch className="text-gray-400" />
                <input
                  type="search"
                  placeholder="Search..."
                  className="bg-transparent outline-none text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-gray-50"
                title="Logout"
              >
                <FaSignOutAlt /> <span className="hidden sm:inline">Logout</span>
              </button>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="p-2 rounded-md hover:bg-gray-100 flex items-center gap-2"
                >
                  <FaUserCircle className="text-2xl" />
                </button>
                {userMenuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 rounded-md border bg-white shadow-lg z-10"
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    {/* Dynamic user name, id, role */}
                    <div className="px-3 py-2 border-b">
                      <div className="font-semibold truncate">{userInfo.name}</div>
                      <div className="text-xs text-gray-500 truncate">{userInfo.userId}</div>
                      <div className="text-xs text-indigo-600 truncate mt-1">{userInfo.roleDescription}</div>
                    </div>
                    <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                      Profile
                    </button>
                    <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                      Settings
                    </button>
                    <div className="my-1 border-t" />
                    <button
                      onClick={logout}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content: iframe only */}
        <main className="p-4 flex-1">
          {renderIframeContent()}
        </main>
      </div>

      {/* Inactivity / Session Timeout Modal */}
      {showTimeoutWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold">You’ve been inactive</h3>
              <button
                onClick={logout}
                className="p-2 rounded-md hover:bg-gray-100"
                title="Logout now"
              >
                <FaTimes />
              </button>
            </div>
            <p className="text-gray-600">
              For your security, you will be signed out due to inactivity.
            </p>
            <p className="mt-2">
              Auto-logout in <span className="font-semibold">{countdown}</span> seconds.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
              >
                <FaSignOutAlt /> Logout now
              </button>
              <button
                onClick={resetInactivityTimer}
                className="px-4 py-2 rounded-md border hover:bg-gray-50"
              >
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
