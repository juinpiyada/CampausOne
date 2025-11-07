// SMS-ui/src/components/SessionTimer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/SessionTimer.css';

const SessionTimer = ({ userRole, userId, onLogout }) => {
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes = 900 seconds
  const [showPopup, setShowPopup] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const navigate = useNavigate();

  // Reset timer to 15 minutes
  const resetTimer = () => {
    setTimeLeft(900); // 15 minutes = 900 seconds
    setShowPopup(false);
    setIsPaused(false);
    
    // Update session storage
    const sessionData = {
      userId,
      userRole,
      lastReset: Date.now(),
      timerDuration: 900
    };
    sessionStorage.setItem('sessionTimer', JSON.stringify(sessionData));
  };

  // Handle Yes - Continue session
  const handleContinue = () => {
    console.log('✅ User chose to continue session');
    resetTimer();
  };

  // Handle No - Logout
  const handleLogout = () => {
    console.log('🚪 User chose to logout');
    
    // Clear all session and auth data
    sessionStorage.clear();
    localStorage.removeItem('auth');
    localStorage.removeItem('sessionUser');
    localStorage.removeItem('activeTab');
    
    // Call parent logout if provided
    if (onLogout) {
      onLogout();
    } else {
      // Redirect to root (login page)
      window.location.href = '/';
    }
  };

  // Timer countdown effect
  useEffect(() => {
    if (isPaused) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          // Timer expired - show popup
          setShowPopup(true);
          setIsPaused(true);
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPaused]);

  // Initialize session timer on mount
  useEffect(() => {
    isMountedRef.current = true;
    const sessionData = {
      userId,
      userRole,
      lastReset: Date.now(),
      timerDuration: 900 // 15 minutes
    };
    sessionStorage.setItem('sessionTimer', JSON.stringify(sessionData));
    
    return () => {
      isMountedRef.current = false;
    };
  }, [userId, userRole]);

  // Get role display name
  const getRoleDisplayName = () => {
    const roleMap = {
      'super_user': 'Super Admin',
      'admin': 'Administrator',
      'teacher': 'Teacher',
      'student': 'Student',
      'user': 'User',
      'SMS_SUPERADM': 'Super Admin',
      'TEACHER': 'Teacher',
      'STU_CURR': 'Current Student',
      'STU_ONBOARD': 'Onboard Student',
      'STU_PASSED': 'Passed Student',
      'GRP_ADM': 'Group Admin',
      'GRP_MGMT_USR': 'Group Manager',
      'USER': 'User'
    };
    return roleMap[userRole] || userRole || 'User';
  };

  // Get timer color based on time left
  const getTimerColor = () => {
    if (timeLeft <= 60) return '#ef4444'; // Red - last minute
    if (timeLeft <= 300) return '#f59e0b'; // Amber - last 5 minutes
    return '#10b981'; // Green
  };

  return (
    <>
      {/* Timer Display */}
      <div className="session-timer-container" style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'white',
        borderRadius: '12px',
        padding: '12px 20px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'none',
        alignItems: 'center',
        gap: '15px',
        zIndex: 1000,
        border: `2px solid ${getTimerColor()}`
      }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <span style={{
            fontSize: '11px',
            color: '#6b7280',
            marginBottom: '2px',
            fontWeight: '500'
          }}>
            SESSION
          </span>
          <span style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: getTimerColor(),
            fontFamily: 'monospace'
          }}>
            {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
        </div>
        
        <div style={{
          borderLeft: '1px solid #e5e7eb',
          height: '40px'
        }}></div>
        
        <div>
          <div style={{
            fontSize: '12px',
            color: '#6b7280',
            marginBottom: '2px'
          }}>
            Role: {getRoleDisplayName()}
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#1f2937'
          }}>
            {userId || 'User'}
          </div>
        </div>
      </div>

      {/* Popup Modal */}
      {showPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            animation: 'slideIn 0.3s ease-out'
          }}>
            {/* Warning Icon */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{
                  fontSize: '32px'
                }}>⏱️</span>
              </div>
            </div>

            {/* Title */}
            <h2 style={{
              textAlign: 'center',
              fontSize: '24px',
              fontWeight: '600',
              color: '#111827',
              margin: '0 0 12px 0'
            }}>
              Session Timeout
            </h2>

            {/* Message */}
            <p style={{
              textAlign: 'center',
              color: '#6b7280',
              fontSize: '16px',
              margin: '0 0 32px 0',
              lineHeight: '1.5'
            }}>
              Your 15-minute session has expired for security reasons.<br />
              Do you want to continue?
            </p>

            {/* User Info */}
            <div style={{
              background: '#f9fafb',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px'
            }}>
              <span style={{ color: '#6b7280' }}>User:</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>{userId}</span>
            </div>

            {/* Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  color: '#6b7280',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#f9fafb';
                  e.target.style.borderColor = '#d1d5db';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'white';
                  e.target.style.borderColor = '#e5e7eb';
                }}
              >
                No, Logout
              </button>
              
              <button
                onClick={handleContinue}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#10b981',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#059669';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#10b981';
                }}
              >
                Yes, Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
};

export default SessionTimer;
