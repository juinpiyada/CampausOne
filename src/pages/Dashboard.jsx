// SMS-ui/src/pages/Dashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,  
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import config from '../config/middleware_config';
import '../index.css';

import UserRole from './User/UserRole.jsx';
import AddCollege from '../components/AddCollege.jsx';
import AddCourse from '../components/AddCourse.jsx';
import MasterSubject from './Subject/MasterSubject.jsx';
import MasterStudent from './Student/MasterStudent.jsx';
import MasterTeacher from './Teacher/MasterTeacher.jsx';
import CollegeAcadYear from './college/collegeacadyear.jsx';
import SubjectCourse from './Subject/SubjectCourse.jsx';
import SubjectElec from './Subject/SubjectElec.jsx';
import SubjectTeacher from './Subject/SubjectTeacher.jsx';
import SubjectDepartement from './Department/MasterDepts.jsx';
import CollegeGroupManager from './CollageGroup/CollegeGroupManager.jsx';
import Manageuser from './User/Manageuser.jsx';
import TeacherAvailabilityManager from './TeacherAvailabilityManager/TeacherAvailabilityManager.jsx';
import ExamRoutineManager from './ExamRoutineManager/ExamRoutineManager.jsx';
import CourseRegistrationManager from './CourseRegistrationManager/CourseRegistrationManager.jsx';
import CourseOfferingManager from './CourseOfferingManager/CourseOfferingManager.jsx';
import DailyRoutine from './routine/DailyRoutine.jsx';
import ClassroomManager from './classroom/ClassroomManager.jsx';
import MenuManager from './menu/MenuManager.jsx';
import MasterRole from './User/MasterRole.jsx';
import CollegeAttendenceManager from './attendance/AttendanceManager.jsx';
import EmployeeAttendanceManager from './attendance/EmployeeAttendance.jsx';
import ExamResult from './result/ExamResult.jsx';
import SmsDeviceManager from './device/SmsDeviceManager.jsx';
import WhiteboardManager from './themes/White_bord.jsx';

// ✅ bulk upload managers
import StudentMasterManager from "./StudentBulk/StudentMasterManager";
import TeacherMasterBulkUp from "./TeacherBulk/TeacherMasterBulkUp";
import ExamResultBulkManager from './result/ExamResultBulkManager.jsx';

// ✅ Leave Application Manager (new)
import LeaveApplicationManager from './Leave/LeaveApplicationManager.jsx';

// ✅ Session Timer
import SessionTimer from '../components/SessionTimer'; 

// --- Issue launcher assets ---
import issueGif from '../assets/image/icon/issue.gif';
const ISSUE_FORM_URL = 'https://juin-raima-sayoni-ynmh.vercel.app/issue-form';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend
);

// ------- Helpers -------
function getLoggedInUser() {
  try { return JSON.parse(localStorage.getItem('auth') || '{}'); }
  catch { return {}; }
}
function hasValidSession() {
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || 'null');
    const sess = JSON.parse(sessionStorage.getItem('sessionUser') || 'null');
    if (!auth || !auth.userId || auth.isAuthenticated !== true) return false;
    if (!sess) return false;
    const aUID = String(auth.userId || auth.userid || auth.username || '');
    const sUID = String(sess.userId || sess.userid || sess.username || '');
    if (!aUID || !sUID || aUID !== sUID) return false;
    const ts = new Date(auth.login_time || 0).getTime();
    if (!ts || Number.isNaN(ts)) return true;
    const ageHours = (Date.now() - ts) / 36e5;
    return ageHours < 24;
  } catch { return false; }
}
function isBareApiUrl(url) {
  if (!url) return true;
  try {
    const trimmed = String(url).trim();
    if (!trimmed || trimmed === '/' || trimmed === '/api' || trimmed === '/api/') return true;
    const u = new URL(trimmed, window.location.origin);
    const path = u.pathname.replace(/\/+$/, '');
    return path === '' || path === '/api';
  } catch { return false; }
}
async function safeGet(url, fallback) {
  if (isBareApiUrl(url)) return { data: fallback, _skipped: true };
  try { return await axios.get(url); }
  catch (err) {
    console.warn(`GET failed: ${url}`, err?.message || err);
    return { data: fallback, _error: err };
  }
}
function readJSON(key, storage = window.localStorage) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}
function getCurrentSessionToken() {
  const ss = readJSON('sessionUser', window.sessionStorage) || {};
  const lsSess = readJSON('sessionUser', window.localStorage) || {};
  const auth = readJSON('auth', window.localStorage) || {};
  const uid = ss.userid || ss.userId || ss.username ||
              lsSess.userid || lsSess.userId || lsSess.username ||
              auth.userId || auth.userid || auth.username || '';
  const ts = ss.login_time || lsSess.login_time || auth.login_time || '';
  return `${uid || 'anon'}|${ts || ''}`;
}

// ---------- Role helpers ----------
function normalizeRoles(user) {
  const pool = [];
  if (user?.user_role) pool.push(String(user.user_role));
  if (user?.role) pool.push(String(user.role));
  if (user?.userroledesc) pool.push(String(user.userroledesc));
  if (user?.userrolesid) pool.push(String(user.userrolesid));
  if (user?.userroles) {
    if (Array.isArray(user.userroles)) pool.push(...user.userroles.map(String));
    else pool.push(String(user.userroles));
  }
  if (Array.isArray(user?.roles)) pool.push(...user.roles.map(String));
  return new Set(
    pool.flatMap(r => String(r).split(/[,\s]+/))
        .map(t => t.trim().toLowerCase())
        .filter(Boolean)
  );
}
const hasAny = (set, ...keys) => keys.some(k => set.has(k.toLowerCase()));
function friendlyRoleLabel(set, user) {
  const userEmail = user?.email || user?.username || user?.userId || '';
  if (hasAny(set, 'sms_superadm', 'super_user', 'superadmin', 'super_admin')) {
    if (userEmail.toLowerCase() === 'super_user@gmail.com' || userEmail.toLowerCase() === 'super_user') {
      return 'admin';
    }
    return 'super_user';
  }
  if (hasAny(set, 'admin', 'grp_adm', 'group_admin')) return 'admin';
  if (hasAny(set, 'teacher', 'usr_tchr', 'instructor', 'professor')) return 'teacher';
  if (hasAny(set, 'student', 'stu_curr', 'stu_onboard', 'stu_passed')) return 'student';
  if (hasAny(set, 'client', 'usr_client', 'user_client', 'customer')) return 'client';
  if (hasAny(set, 'fin_act_adm', 'finance_admin')) return 'finance_admin';
  if (hasAny(set, 'fin-act', 'finance')) return 'finance';
  if (hasAny(set, 'grp_ad_officer', 'group_officer')) return 'group_officer';
  return Array.from(set)[0] || 'user';
}

/* ========================= ICONS ========================= */
const Icon = ({ name, size = 18, style = {} }) => (
  <span className="material-symbols-outlined" aria-hidden="true"
        style={{ fontSize: size, lineHeight: 1, verticalAlign: 'middle', ...style }}>
    {name}
  </span>
);
const MATERIAL_ICONS = {
  home: 'home', menu: 'folder_open', manageUser: 'person', userRole: 'admin_panel_settings',
  MasterRole: 'badge', addCollege: 'school', addGroup: 'groups', department: 'apartment',
  subjects: 'menu_book', addCourse: 'library_add', masterStudent: 'face', masterTeacher: 'person_outline',
  collegeAcadYear: 'event', subjectCourse: 'sync_alt', subjectElec: 'bolt', subjectTeacher: 'handshake',
  dailyRoutine: 'calendar_month', classroomManager: 'meeting_room', teacherAvailability: 'schedule',
  examRoutine: 'assignment', CollegeAttendenceManager: 'how_to_reg', EmployeeAttendanceManager: 'badge',
  courseRegistration: 'edit_note', courseOffering: 'workspace_premium', examResult: 'military_tech',
  deviceManager: 'devices', logout: 'logout', settings: 'settings',
  // bulk
  bulkStudents: 'database', bulkTeachers: 'cloud_upload', bulkUpload: 'upload', examResultBulk: 'cloud_upload',
  // ✅ Leave Manager icon
  leaveManager: 'beach_access',
};
const GROUP_ICONS = {
  'User Management': 'group', 'Academic Structure': 'domain', 'Curriculum': 'library_books',
  'People': 'diversity_3', 'Operations': 'tune', 'Routines': 'calendar_month', 'Reports': 'insights',
  'Bulk Upload': 'upload'
};

const styles = {
  layout: { display: 'flex', height: '100vh', fontFamily: 'var(--app-font, Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)' },
  sidebar: {
    width: 280, background: 'var(--side-bg, #0f172a)', color: 'var(--side-fg, #e2e8f0)', padding: 16,
    overflowY: 'auto', boxShadow: '2px 0 12px rgba(15,23,42,.35)', fontSize: 'var(--app-font-size, 14px)'
  },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sidebarTitle: { fontSize: 20, fontWeight: 800, letterSpacing: .4 },
  rolePill: {
    fontSize: 11, background: '#1e293b', border: '1px solid #334155', padding: '4px 8px',
    borderRadius: 999, color: 'var(--side-fg-soft, #93c5fd)'
  },
  searchWrap: { margin: '10px 0 14px', position: 'relative' },
  searchInput: {
    width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10, border: '1px solid #334155',
    background: '#0b1220', color: 'var(--side-fg, #e2e8f0)', outline: 'none', fontSize: 14
  },
  searchIcon: { position: 'absolute', left: 10, top: 9, opacity: .7 },
  menuList: { listStyle: 'none', padding: 0, margin: 0 },
  homeItem: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    background: 'linear-gradient(90deg, #1f2937 0%, #111827 100%)', color: 'var(--side-fg, #e5e7eb)',
    padding: '12px 14px', border: '1px solid #334155', borderRadius: 10, cursor: 'pointer', fontSize: 15, marginBottom: 10
  },
  group: { marginBottom: 10, border: '1px solid #233046', borderRadius: 12, background: 'rgba(17,24,39,.55)' },
  groupHeader: (open) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
    padding: '12px 14px', cursor: 'pointer', borderRadius: 12,
    background: open ? 'linear-gradient(90deg, rgba(2,132,199,.18), rgba(30,64,175,.16))' : 'transparent',
    borderBottomLeftRadius: open ? 0 : 12, borderBottomRightRadius: open ? 0 : 12
  }),
  groupHeaderLeft: { display: 'flex', alignItems: 'center', gap: 10, color: 'var(--side-fg-soft, #cbd5e1)', fontWeight: 700, fontSize: 14.5 },
  caret: (open) => ({ transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform .15s ease', opacity: .8 }),
  groupBody: { padding: '8px 10px 10px' },
  leafBtn: (active) => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    background: active ? '#1f2937' : 'transparent',
    color: active ? 'var(--side-fg, #93c5fd)' : 'var(--side-fg-soft, #cbd5e1)',
    padding: '9px 10px', border: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontSize: 14, marginTop: 6
  }),
  issueLauncherWrap: { position: 'fixed', right: 18, bottom: 18, zIndex: 9999 },
  issueLauncherBtn: {
    width: 70, height: 70, borderRadius: 14, border: '1px solid transparent', background: 'transparent',
    boxShadow: 'none', overflow: 'hidden', cursor: 'pointer',
    transition: 'transform .2s ease, filter .2s ease, border-color .2s ease',
    display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none',
  },
  issueLauncherBtnHover: { transform: 'scale(1.06)', filter: 'drop-shadow(0 8px 18px rgba(37, 99, 235, .35))', borderColor: 'rgba(59,130,246,.55)' },
  issueLauncherGif: { width: '100%', height: '100%', objectFit: 'contain', opacity: 0.8, transition: 'opacity .2s ease, transform .2s ease', pointerEvents: 'none' },
  issueLauncherLabel: {
    position: 'absolute', bottom: -6, right: 80, background: 'rgba(15,23,42,.85)', color: '#e2e8f0',
    border: '1px solid #334155', borderRadius: 8, padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap',
    boxShadow: '0 8px 24px rgba(2,6,23,.35)',
  },
};

// --- chart payload normalizer ---
function normalizeChartPayload(payload, fallbackCounts) {
  try {
    if (Array.isArray(payload?.labels) && Array.isArray(payload?.values)) {
      return { labels: payload.labels, values: payload.values.map(v => Number(v) || 0) };
    }
    const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : null);
    if (Array.isArray(items)) {
      const labels = [], values = [];
      for (const it of items) {
        const label = it?.label ?? it?.name ?? it?.title ?? it?.key ?? it?.category;
        const value = it?.value ?? it?.count ?? it?.total ?? it?.y ?? it?.n;
        if (label != null && value != null) { labels.push(String(label)); values.push(Number(value) || 0); }
      }
      if (labels.length) return { labels, values };
    }
    if (payload && typeof payload === 'object') {
      const entries = Object.entries(payload).filter(([, v]) => typeof v === 'number' || !isNaN(Number(v)));
      if (entries.length) {
        const labels = entries.map(([k]) => k.toString());
        const values = entries.map(([, v]) => Number(v) || 0);
        return { labels, values };
      }
    }
  } catch {}
  const labels = Object.keys(fallbackCounts);
  const values = labels.map(k => Number(fallbackCounts[k]) || 0);
  return { labels, values };
}
function titleizeSnake(s) {
  return String(s).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
}

// ===== Attendance helpers =====
function toISODateOnly(d) { const dt = new Date(d); if (Number.isNaN(dt.getTime())) return ''; return dt.toISOString().slice(0, 10); }
function todayISO() { return toISODateOnly(new Date()); }
function addDaysISO(dateISO, days) { const d = new Date(`${dateISO}T00:00:00`); d.setDate(d.getDate() + days); return toISODateOnly(d); }
function sum(arr, key) { return (arr || []).reduce((acc, r) => acc + Number(r?.[key] ?? 0), 0); }

// ---- chart visibility flag ----
function readHideChartsFlag() {
  try {
    const sess = sessionStorage.getItem('dashboard_hide_charts');
    if (sess !== null) return sess === 'true';
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    if (typeof auth?.hide_charts === 'boolean') return auth.hide_charts;
  } catch {}
  return false;
}

/* ===== name helpers ===== */
function bestName(o = {}) {
  const candidates = [
    o.name, o.fullName, o.fullname, o.displayName,
    o.studentname, o.student_name, o.stuname, o.stu_name,
    (o.first_name && o.last_name) ? `${o.first_name} ${o.last_name}` : null,
    (o.firstname && o.lastname) ? `${o.firstname} ${o.lastname}` : null,
    (o.fname && o.lname) ? `${o.fname} ${o.lname}` : null
  ].map(v => (v && String(v).trim()) || '');
  const picked = candidates.find(Boolean);
  return picked || String(o.username || o.userId || o.userid || o.id || '').trim();
}
function idCandidates(o = {}) {
  return [
    o.stuuserid, o.student_userid, o.stuid, o.studentid,
    o.userid, o.userId, o.username, o.id, o.rollno, o.roll_no
  ].filter(v => v !== undefined && v !== null).map(v => String(v));
}
const eqi = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/* ======== Student routine-matching (section/semester aware) ======== */
function pickSection(rec = {}) {
  return rec.stu_section ?? rec.section ?? rec.classid ?? rec.attclassid ?? rec.drclassroomid ?? rec.class_id ?? rec.section_id ?? '';
}
function pickSemester(rec = {}) {
  return rec.stu_curr_semester ?? rec.stu_semester ?? rec.semester ?? rec.sem ?? rec.semester_id ?? '';
}
function pickUid(rec = {}) {
  return rec.attuserid ?? rec.stuid ?? rec.userid ?? rec.studentid ?? rec.userId ?? rec.uid ?? '';
}

/* ======== Day-of-week helpers ======== */
const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function dayMetaFromISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00`);
  const js = d.getDay();
  const name = DOW_NAMES[js];
  const short = DOW_SHORT[js];
  const monday1 = ((js + 6) % 7) + 1; // Mon=1..Sun=7
  const sunday1 = js + 1;             // Sun=1..Sat=7
  return { js, name, short, monday1, sunday1 };
}
function coerceNumber(x) {
  if (x === null || x === undefined) return null;
  const n = Number(String(x).trim());
  return Number.isFinite(n) ? n : null;
}
function dayMatchesRec(rec, meta) {
  const raw = rec.drdayofweek ?? rec.day_of_week ?? rec.dayofweek ?? rec.dow ?? rec.day ?? rec.weekday ?? null;
  if (raw === null || raw === undefined) return true;
  const num = coerceNumber(raw);
  if (num !== null) {
    if (num === meta.js) return true;
    if (num === meta.monday1) return true;
    if (num === meta.sunday1) return true;
  }
  const s = String(raw).toLowerCase();
  if (s.includes(meta.name.toLowerCase())) return true;
  if (s.includes(meta.short.toLowerCase())) return true;
  if (s.startsWith(meta.short.toLowerCase())) return true;
  return false;
}

/* ======= Theme helpers (header image) ======= */
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}
function applyThemeVars(theme = {}) {
  try {
    const root = document.documentElement;
    const set = (k, v) => v != null && String(v).trim() !== "" && root.style.setProperty(k, String(v));
    if (theme.bg)    set("--side-bg", theme.bg);
    if (theme.color) { set("--side-fg", theme.color); set("--side-fg-soft", theme.color); }
    if (theme.font_style) set("--app-font", theme.font_style);
    if (theme.font_size) {
      const size = String(theme.font_size);
      set("--app-font-size", size.endsWith("px") ? size : `${size}px`);
    }
  } catch (_) {}
}

export default function Dashboard({ initialTab }) {
  const location = useLocation();

  // Persist activeTab in localStorage — but reset to Home on a fresh login
  const initialActiveTab = (() => {
    if (initialTab) return initialTab;
    const stored = localStorage.getItem('activeTab') || 'home';
    const token = getCurrentSessionToken();
    const lastToken = sessionStorage.getItem('dashboard_session_token') || '';
    if (!lastToken || token !== lastToken) {
      sessionStorage.setItem('dashboard_session_token', token);
      localStorage.setItem('activeTab', 'home');
      return 'home';
    }
    return stored;
  })();

  function IssueLauncher() {
    const [hover, setHover] = React.useState(false);
    return (
      <div style={styles.issueLauncherWrap}>
        <a
          href={ISSUE_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Report an issue"
          title="Report an issue"
          style={{ ...styles.issueLauncherBtn, ...(hover ? styles.issueLauncherBtnHover : {}) }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
        >
          <img
            src={issueGif}
            alt="Open issue form"
            style={{ ...styles.issueLauncherGif, opacity: hover ? 1 : 0.8, transform: hover ? 'scale(1.02)' : 'scale(1.0)' }}
          />
        </a>
        {hover && <div style={styles.issueLauncherLabel}>Open Issue Form</div>}
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [users, setUsers] = useState([]);
  const [userRoles, setUserRoles] = useState([]);
  const [user, setUser] = useState(getLoggedInUser());
  const [query, setQuery] = useState('');
  const [chartData, setChartData] = useState(null);
  const [chartError, setChartError] = useState('');
  const [pieData, setPieData] = useState(null);
  const [hideCharts, setHideCharts] = useState(readHideChartsFlag());
  const [todayRoutines, setTodayRoutines] = useState([]);
  const [todayDate, setTodayDate] = useState('');
  const [todayRtLoading, setTodayRtLoading] = useState(false);
  const [todayRtError, setTodayRtError] = useState('');
  const [todayCounts, setTodayCounts] = useState({ total: null, updated: null });
  const defaultEnd = todayISO();
  const defaultStart = addDaysISO(defaultEnd, -14);
  const [attStart, setAttStart] = useState(defaultStart);
  const [attEnd, setAttEnd] = useState(defaultEnd);
  const [attLoading, setAttLoading] = useState(false);
  const [attError, setAttError] = useState('');
  const [latestEvents, setLatestEvents] = useState([]);
  const [studentSummary, setStudentSummary] = useState([]);
  const [employeeSummary, setEmployeeSummary] = useState([]);
  const [teacherSummary, setTeacherSummary] = useState([]);
  const [themeHeaderUrl, setThemeHeaderUrl] = useState('');

  const DEFAULT_OPEN_GROUPS = {
    'User Management': false, 'Academic Structure(One Time)': false, 'Curriculum': false,
    'People': false, 'Operations': false, 'Routines': false, 'Reports': false,
    'Bulk Upload': false
  };
  const [openGroups, setOpenGroups] = useState(DEFAULT_OPEN_GROUPS);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);

  const navigate = useNavigate();

  useEffect(() => {
    if (!hasValidSession()) {
      try { localStorage.removeItem('activeTab'); } catch {}
      navigate('/', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const path = String(location.pathname || '').replace(/\/+$/, '');
    if (path === '/students' && activeTab !== 'bulkStudents') setActiveTab('bulkStudents');
    else if (path === '/teachers' && activeTab !== 'bulkTeachers') setActiveTab('bulkTeachers');
    else if ((path === '/exam-result-bulk' || path === '/exam-results-bulk') && activeTab !== 'examResultBulk') {
      setActiveTab('examResultBulk');
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    const checkSessionChange = () => {
      if (!hasValidSession()) { navigate('/', { replace: true }); return; }
      const token = getCurrentSessionToken();
      const lastToken = sessionStorage.getItem('dashboard_session_token') || '';
      if (!lastToken || token !== lastToken) {
        sessionStorage.setItem('dashboard_session_token', token);
        setUser(getLoggedInUser());
        setActiveTab(initialTab || 'home');
        localStorage.setItem('activeTab', initialTab || 'home');
        setHideCharts(readHideChartsFlag());
      }
    };
    const onStorage = (e) => {
      if (e.key === 'auth' || e.key === 'sessionUser' || e.key === 'dashboard_hide_charts') checkSessionChange();
    };
    const onFocus = () => checkSessionChange();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    const t = setTimeout(checkSessionChange, 0);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', onFocus); clearTimeout(t); };
  }, [navigate, initialTab]);

  // Role flags
  const roleSet = normalizeRoles(user);
  const isAdmin = hasAny(
    roleSet,
    'admin','super_user','sms_superadm','grp_adm','superadmin','super_admin',
    'fin_act_adm','finance_admin'
  );
  const isTeacher = hasAny(roleSet, 'teacher', 'usr_tchr', 'instructor', 'professor');
  const isStudent = hasAny(roleSet, 'student', 'stu_curr', 'stu_onboard', 'stu_passed');
  const isGroupOfficer = hasAny(roleSet, 'grp_ad_officer', 'group_officer');
  const isHR = hasAny(roleSet, 'role_hr', 'hr', 'hr_leave');
  const isClient = hasAny(roleSet, 'client', 'usr_client', 'user_client', 'customer');
  // >>> ADD: Student Council role flag
const isStuCouncil = hasAny(
  roleSet,
  'stu_council',        // from backend normalizer STU_COUNCIL
  'student_council',    // user_role from backend block
  'stu-council',        // just in case a hyphen variant slips in
  'stu council'         // space variant (normalizeRoles splits on spaces too)
);

  const isPureTeacher = isTeacher && !isAdmin;
  const userName = user.name || user.userId || 'User';
  const displayRole = friendlyRoleLabel(roleSet, user).toUpperCase();

  // College labels
  const pickFirst = (...vals) => vals.find(v => v !== undefined && v !== null && String(v).trim() !== '') ?? null;
  const studentCollegeId = useMemo(() => (
    pickFirst(user?.student_college_id, user?.college_id, user?.collegeid)
  ), [user]);
  const teacherCollegeId = useMemo(() => (
    pickFirst(user?.teacher_college_id, user?.college_id, user?.collegeid)
  ), [user]);
  const activeCollegeName = useMemo(() => (pickFirst(user?.college_name, user?.collegename)), [user]);
  const activeCollegeCode = useMemo(() => (pickFirst(user?.collegecode, user?.college_code)), [user]);
  const formatCollegeLabel = (id) => {
    if (activeCollegeName && activeCollegeCode) return `${activeCollegeName} (${activeCollegeCode}) • ID ${id ?? ''}`;
    if (activeCollegeName) return `${activeCollegeName} • ID ${id ?? ''}`;
    return id ? `ID ${id}` : '—';
  };

  // Student identity
  const studentId = useMemo(() => (user?.stuuserid || user?.student_userid || user?.userId || user?.userid || user?.username || null), [user]);
  const studentSection = useMemo(() => (user?.stu_section || user?.student_section || user?.section || null), [user]);
  const studentSemester = useMemo(() => (user?.stu_curr_semester || user?.student_semester || user?.stu_semester || user?.semester || null), [user]);
  const studentName = useMemo(() => (user?.stuname || user?.stu_name || user?.studentname || bestName(user)), [user]);

  // Teacher identity
  const teacherId = useMemo(() => (user?.teacher_id || user?.teacherid || user?.teacherID || null), [user]);
  const teacherUserId = useMemo(() => (user?.teacher_userid || user?.teacherUserid || user?.teacherUserId || null), [user]);
  const teacherName = useMemo(() => (user?.name || user?.username || bestName(user)), [user]);

  // Theme header
  useEffect(() => {
    const loadThemeHeader = async () => {
      try {
        const API = config?.WHITEBOARD_CMS_ROUTE || '';
        if (!API || isBareApiUrl(API)) { setThemeHeaderUrl(''); return; }
        const res = await axios.get(API);
        const themes = Array.isArray(res?.data?.themes) ? res.data.themes : (Array.isArray(res?.data) ? res.data : []);
        if (!themes.length) { setThemeHeaderUrl(''); return; }
        const userInstId =
          user?.inst_id || user?.collegeid || user?.college_id || user?.collegeId || user?.institute_id || null;
        const byInst = userInstId
          ? themes.find(t => (t?.header && String(t?.inst_id ?? '') === String(userInstId)))
          : null;
        const roleSet = normalizeRoles(user);
        const isAdmin = hasAny(roleSet, 'admin', 'super_user', 'sms_superadm', 'grp_adm', 'superadmin', 'super_admin');
        const chosen = isAdmin
          ? (byInst || themes.find(t => t?.header) || themes[0] || null)
          : (byInst || null);
        if (chosen) applyThemeVars(chosen);
        if (!chosen?.header) { setThemeHeaderUrl(''); return; }
        const base = config?.BASE_URL || '';
        const abs = joinUrl(base, String(chosen.header));
        setThemeHeaderUrl(abs);
      } catch (e) {
        console.warn('Theme header fetch failed:', e?.message || e);
        setThemeHeaderUrl('');
      }
    };
    loadThemeHeader();
  }, [user, activeTab]);
   useEffect(() => {
    if (isStuCouncil && !['home', 'masterStudent', 'logout'].includes(activeTab)) {
      setActiveTab('masterStudent');
    }
  }, [isStuCouncil, activeTab]);

  // matcher for student records
  const studentSemSectionMatch = useMemo(() => {
    return (rec = {}) => {
      if (!isStudent) return true;
      const r = {
        stu_section: rec.stu_section ?? rec.section ?? rec.classid ?? rec.attclassid ?? rec.drclassroomid ?? rec.class_id ?? rec.section_id ?? '',
        stu_curr_semester: rec.stu_curr_semester ?? rec.stu_semester ?? rec.semester ?? rec.sem ?? '',
        uid: rec.attuserid ?? rec.stuid ?? rec.userid ?? rec.studentid ?? rec.userId ?? rec.uid ?? ''
      };
      const hasSec = !!String(r.stu_section).trim();
      const hasSem = !!String(r.stu_curr_semester).trim();
      const hasUid = !!String(r.uid).trim();
      const secOk = hasSec && studentSection ? eqi(r.stu_section, studentSection) : true;
      const semOk = hasSem && studentSemester ? eqi(r.stu_curr_semester, studentSemester) : true;
      if (hasSec && hasSem) return secOk && semOk;
      if (hasSec && !hasSem) return secOk;
      if (!hasSec && hasSem) return semOk;
      if (!hasSec && !hasSem && hasUid && studentId) return eqi(r.uid, studentId);
      return false;
    };
  }, [isStudent, studentId, studentSection, studentSemester]);

  // teacher routine ownership matcher
  const teacherOwnMatch = useMemo(() => {
    if (!isPureTeacher) return () => true;
    const myTid  = String(teacherId || '').trim().toLowerCase();
    const myTuid = String(teacherUserId || '').trim().toLowerCase();
    return (rec = {}) => {
      const cand = [
        rec.drclassteacherid, rec.teacherid, rec.tchrid, rec.teacher_id, rec.teachid,
        rec?.extendedProps?.teacherid
      ].map(v => String(v ?? '').trim().toLowerCase());
      if (myTid && cand.some(v => v && v === myTid)) return true;
      const candUser = [
        rec.teacher_userid, rec.t_uid, rec.tuserid, rec.userid, rec.userId,
        rec?.extendedProps?.teacher_userid
      ].map(v => String(v ?? '').trim().toLowerCase());
      if (myTuid && candUser.some(v => v && v === myTuid)) return true;
      return false;
    };
  }, [isPureTeacher, teacherId, teacherUserId]);

  // Fetch core dashboard data
  useEffect(() => {
    const fetchAll = async () => {
      const DASHBOARD_FETCH_URL =
        config?.VITE_DASHBOARD_FETCHING_ID ??
        import.meta.env?.VITE_DASHBOARD_FETCHING_ID ??
        config?.DASHBOARD_FETCHING_ID ?? '';
      const [stuRes, teachRes, userRes, roleRes] = await Promise.all([
        safeGet(DASHBOARD_FETCH_URL, { students: [] }),
        safeGet(config?.TEACHER_ROUTE, []),
        safeGet(config?.MASTER_USER_ROUTE, { users: [] }),
        safeGet(config?.USER_ROLE_ROUTE, { roles: [] })
      ]);
      const normStudents =
        Array.isArray(stuRes.data?.students) ? stuRes.data.students
        : Array.isArray(stuRes.data) ? stuRes.data
        : [];
      const normTeachers =
        Array.isArray(teachRes.data?.teachers) ? teachRes.data.teachers
        : Array.isArray(teachRes.data) ? teachRes.data
        : [];
      const normUsers =
        Array.isArray(userRes.data?.users) ? userRes.data.users
        : Array.isArray(userRes.data) ? userRes.data
        : [];
      const normRoles =
        Array.isArray(roleRes.data?.roles) ? roleRes.data.roles
        : Array.isArray(roleRes.data) ? roleRes.data
        : [];
      setStudents(normStudents);
      setTeachers(normTeachers);
      setUsers(normUsers);
      setUserRoles(normRoles);
      if (isBareApiUrl(DASHBOARD_FETCH_URL)) {
        console.warn('VITE_DASHBOARD_FETCHING_ID / DASHBOARD_FETCHING_ID points to a bare /api; students defaulted to [].');
      }
    };
    fetchAll();
  }, []);

  // charts (hidden for teacher view)
  useEffect(() => {
    const CHART_API = import.meta.env?.VITE_CHART_DATA_ROUTE || config?.CHART_DATA_ROUTE || '';
    const fallbackCounts = { Students: students.length, Teachers: teachers.length, Users: users.length, Roles: userRoles.length };
    const buildChart = (labels, values) => ({ labels, datasets: [{ label: 'Counts', data: values, backgroundColor: '#4B9AFF', borderColor: '#007BFF', borderWidth: 1 }] });
    const buildPie = (studentsCount, teachersCount) => ({ labels: ['Students', 'Teachers'], datasets: [{ data: [studentsCount, teachersCount], backgroundColor: ['#4B9AFF', '#F59E42'], borderColor: ['#007BFF', '#F59E42'], borderWidth: 1 }] });
    const loadChart = async () => {
      setChartError('');
      if (hideCharts || isPureTeacher) { setChartData(null); setPieData(null); return; }
      try {
        if (!CHART_API || isBareApiUrl(CHART_API)) {
          const { labels, values } = normalizeChartPayload(null, fallbackCounts);
          setChartData(buildChart(labels, values));
          setPieData(buildPie(fallbackCounts.Students, fallbackCounts.Teachers));
          setTodayCounts({ total: null, updated: null });
          return;
        }
        const res = await axios.get(CHART_API);
        const apiData = res?.data?.data ?? res?.data;
        if (!apiData || typeof apiData !== 'object') throw new Error('Unexpected chart API payload');
        const entries = Object.entries(apiData).filter(([, v]) => typeof v === 'number' || !isNaN(Number(v)));
        if (!entries.length) throw new Error('Empty chart dataset');
        const labels = entries.map(([k]) => titleizeSnake(k));
        const values = entries.map(([, v]) => Number(v) || 0);
        setChartData(buildChart(labels, values));
        setPieData(buildPie(apiData.students ?? fallbackCounts.Students, apiData.teachers ?? fallbackCounts.Teachers));
        setTodayCounts({ total: apiData.today_daily_routine_total ?? null, updated: apiData.today_daily_routine_updated ?? null });
      } catch (e) {
        console.error('❌ Chart API error:', e?.message || e);
        setChartError('Could not load chart from CHART_DATA_ROUTE. Showing local counts.');
        const { labels, values } = normalizeChartPayload(null, fallbackCounts);
        setChartData(buildChart(labels, values));
        setPieData(buildPie(fallbackCounts.Students, fallbackCounts.Teachers));
        setTodayCounts({ total: null, updated: null });
      }
    };
    loadChart();
  }, [students.length, teachers.length, users.length, userRoles.length, hideCharts, isPureTeacher]);

  // ===== Load Attendance =====
  useEffect(() => {
    const base = config?.CALENDAR_ATTENDANCE_ROUTE || '/api/calendar-attendance';
    const buildQS = (obj) => {
      const params = new URLSearchParams();
      Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') params.append(k, v); });
      return params.toString();
    };
    const tallyFromEvents = (events = []) => {
      const byDay = new Map();
      const ensure = (d) => { if (!byDay.has(d)) byDay.set(d, { day: d, present: 0, absent: 0, total: 0 }); return byDay.get(d); };
      for (const e of events) {
        const day = String(e?.start || '').slice(0, 10);
        if (!day) continue;
        const xp = e?.extendedProps || {};
        const raw =
          (xp.status ?? xp.attstatus ?? xp.att_status ?? xp.presence ?? xp.attendance ?? e?.status ?? '').toString().toLowerCase();
        const markPresent = raw.includes('present') || raw === 'p' || raw === '1' || xp.present === true;
        const markAbsent  = raw.includes('absent')  || raw === 'a' || raw === '0' || xp.absent === true;
        const row = ensure(day);
        if (markPresent) row.present += 1;
        else if (markAbsent) row.absent += 1;
        row.total = row.present + row.absent;
      }
      return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
    };
    const load = async () => {
      setAttLoading(true); setAttError('');
      try {
        const commonBase = { start: attStart, end: attEnd };
        if (isStudent) {
          const commonEvents = { ...commonBase };
          if (studentId) commonEvents.stuid = String(studentId);
          if (studentSection) commonEvents.section = String(studentSection);
          if (studentSemester) commonEvents.semester = String(studentSemester);
          const commonSummary = { ...commonBase };
          if (studentId) commonSummary.stuid = String(studentId);
          const eventsRes = await safeGet(`${base}/combined-events?${buildQS(commonEvents)}`, { events: [], range: {} });
          const allEvents = Array.isArray(eventsRes.data?.events) ? eventsRes.data.events : [];
          const filteredEvents = allEvents.filter((e) => {
            const xp = e?.extendedProps || {};
            return studentSemSectionMatch({
              attuserid: xp.attuserid, stuid: xp.stuid, userid: xp.userid, studentid: xp.studentid, userId: e?.userId,
              stu_section: xp.stu_section ?? xp.section, section: xp.section, classid: xp.attclassid, attclassid: xp.attclassid, drclassroomid: xp.drclassroomid,
              stu_curr_semester: xp.stu_curr_semester ?? xp.semester, semester: xp.semester
            });
          });
          setLatestEvents(filteredEvents.slice(0, 30));
          const stuRes = await safeGet(`${base}/student-summary?${buildQS({ ...commonBase, ...(studentId ? { stuid: String(studentId) } : {}) })}`, { days: [] });
          const stuDays = Array.isArray(stuRes.data?.days) ? stuRes.data.days : [];
          setStudentSummary(stuDays);
          setEmployeeSummary([]);
          setTeacherSummary([]);
        } else if (isPureTeacher) {
          const q = { ...commonBase };
          if (teacherId) q.teacherid = String(teacherId);
          if (teacherUserId) q.teacher_userid = String(teacherUserId);
          let tDays = [];
          const tryUrls = [
            `${base}/teacher-summary?${buildQS(q)}`,
            `${base}/employee-summary?${buildQS(q)}`
          ];
          for (const url of tryUrls) {
            const res = await safeGet(url, { days: [] });
            if (Array.isArray(res?.data?.days) && res.data.days.length) { tDays = res.data.days; break; }
          }
          if (!tDays.length) {
            const evRes = await safeGet(`${base}/combined-events?${buildQS(q)}`, { events: [] });
            const evs = Array.isArray(evRes?.data?.events) ? evRes.data.events : [];
            const myEvents = evs.filter(e => {
              const xp = e?.extendedProps || {};
              const tid  = String(xp.teacherid ?? '').toLowerCase();
              const tuid = String(xp.teacher_userid ?? '').toLowerCase();
              const matchTid  = teacherId    ? tid  === String(teacherId).toLowerCase()    : false;
              const matchTuid = teacherUserId? tuid === String(teacherUserId).toLowerCase(): false;
              return matchTid || matchTuid;
            });
            tDays = tallyFromEvents(myEvents);
          }
          setTeacherSummary(tDays);
          setStudentSummary([]);
          setEmployeeSummary([]);
        } else {
          const [stuRes, empRes] = await Promise.all([
            safeGet(`${base}/student-summary?${buildQS({ start: attStart, end: attEnd })}`, { days: [] }),
            safeGet(`${base}/employee-summary?${buildQS({ start: attStart, end: attEnd })}`, { days: [] })
          ]);
          const stuDays = Array.isArray(stuRes.data?.days) ? stuRes.data.days : [];
          const empDays = Array.isArray(empRes.data?.days) ? empRes.data.days : [];
          setStudentSummary(stuDays);
          setEmployeeSummary(empDays);
          setTeacherSummary([]);
        }
      } catch (e) {
        console.error('Attendance load error:', e?.message || e);
        setAttError('Could not load attendance data.');
      } finally { setAttLoading(false); }
    };
    load();
  }, [attStart, attEnd, isStudent, isPureTeacher, studentId, studentSection, studentSemester, teacherId, teacherUserId, studentSemSectionMatch]);

  /* ============== Today's Updated Routine ============== */
  useEffect(() => {
    const baseDaily = config?.DAILY_ROUTINE_ROUTE || '/api/daily-routine';
    const baseCal   = config?.CALENDAR_ATTENDANCE_ROUTE || '/api/calendar-attendance';
    if (activeTab !== 'home') return;
    const today = todayISO();
    const meta = dayMetaFromISO(today);
    const buildParams = () => {
      const p = {};
      if (isStudent) {
        const userId = user?.userId || user?.userid || user?.username || user?.email || '';
        if (userId)      { p.stuid = userId; p.attuserid = userId; }
        if (studentSection)  { p.section = String(studentSection); p.classid = String(studentSection); }
        if (studentSemester) { p.semester = String(studentSemester); }
      }
      if (isPureTeacher) {
        if (teacherId) p.teacherid = String(teacherId);
        if (teacherUserId) p.teacher_userid = String(teacherUserId);
      }
      return p;
    };
    const normalizeFromDaily = (arr = []) => {
      const rows = Array.isArray(arr) ? arr : [];
      return rows
        .filter((r) => (isStudent ? studentSemSectionMatch(r) : (isPureTeacher ? teacherOwnMatch(r) : true)))
        .filter((r) => dayMatchesRec(r, meta))
        .map((r) => ({
          ...r,
          _from: r.drfrom ?? r.from ?? '',
          _to:   r.drto   ?? r.to   ?? '',
          _subject: r.drsubjid ?? r.subject ?? r.attsubjectid ?? '—',
          _room:    r.drclassroomid ?? r.attclassid ?? r.classid ?? r.stu_section ?? '—',
          _semester: r.stu_curr_semester ?? r.semester ?? r.sem ?? '—',
          _section:  r.stu_section ?? r.section ?? r.classid ?? '—',
          _teacher:  r.drclassteacherid ?? r.teacherid ?? '—',
          _updated:  r.updatedat ?? r.updatedAt ?? null
        }));
    };
    const normalizeFromCal = (events = []) => {
      return events
        .filter((e) => String(e?.start || '').slice(0,10) === today)
        .filter((e) => {
          if (isStudent) {
            const xp = e.extendedProps || {};
            return studentSemSectionMatch({
              attuserid: xp.attuserid, stuid: xp.stuid, userid: xp.userid, studentid: xp.studentid, userId: e?.userId,
              stu_section: xp.stu_section ?? xp.section, section: xp.section, classid: xp.attclassid, attclassid: xp.attclassid, drclassroomid: xp.drclassroomid,
              stu_curr_semester: xp.stu_curr_semester ?? xp.semester, semester: xp.semester
            });
          }
          if (isPureTeacher) {
            const xp = e.extendedProps || {};
            const tid  = String(xp.teacherid ?? '').toLowerCase();
            const tuid = String(xp.teacher_userid ?? '').toLowerCase();
            const matchTid  = teacherId    ? tid  === String(teacherId).toLowerCase()    : false;
            const matchTuid = teacherUserId? tuid === String(teacherUserId).toLowerCase(): false;
            return matchTid || matchTuid;
          }
          return true;
        })
        .reduce((acc, e) => {
          const xp = e?.extendedProps || {};
          const rec = {
            drfrom: xp.drfrom, drto: xp.drto,
            drsubjid: xp.drsubjid,
            drclassroomid: xp.drclassroomid,
            stu_curr_semester: xp.stu_curr_semester ?? xp.semester,
            stu_section: xp.stu_section ?? xp.section,
            drclassteacherid: xp.teacherid,
            teacherid: xp.teacherid,
            teacher_userid: xp.teacher_userid,
            attuserid: xp.attuserid,
            attclassid: xp.attclassid,
            updatedat: null,
            semester: xp.semester, section: xp.section, classid: xp.attclassid,
            drdayofweek: xp.drdayofweek ?? xp.day ?? xp.dow ?? null
          };
          if (isStudent && !studentSemSectionMatch(rec)) return acc;
          if (isPureTeacher && !teacherOwnMatch(rec)) return acc;
          const key = `${rec.drfrom || ''}|${rec.drto || ''}|${rec.drsubjid || ''}|${rec.drclassroomid || rec.attclassid || ''}`;
          if (!acc._seen.has(key)) { acc._seen.add(key); acc.list.push(rec); }
          return acc;
        }, { _seen: new Set(), list: [] }).list
        .map((r) => ({
          ...r,
          _from: r.drfrom ?? '',
          _to: r.drto ?? '',
          _subject: r.drsubjid ?? '—',
          _room: r.drclassroomid ?? r.attclassid ?? r.stu_section ?? '—',
          _semester: r.stu_curr_semester ?? r.semester ?? '—',
          _section: r.stu_section ?? r.section ?? '—',
          _teacher: r.drclassteacherid ?? '—',
          _updated: r.updatedat ?? null
        }));
    };
    const fallbackFromBaseSchedule = async () => {
      const res = await safeGet(`${baseDaily}`, { routines: [], data: [], rows: [] });
      const rawArr =
        Array.isArray(res?.data?.routines) ? res.data.routines :
        Array.isArray(res?.data?.data) ? res.data.data :
        Array.isArray(res?.data?.rows) ? res.data.rows :
        Array.isArray(res?.data) ? res.data :
        [];
      const filtered = rawArr.filter(r => {
        if (isStudent && !studentSemSectionMatch(r)) return false;
        if (isPureTeacher && !teacherOwnMatch(r)) return false;
        return dayMatchesRec(r, meta);
      });
      return normalizeFromDaily(filtered);
    };
    const fetchToday = async () => {
      setTodayRtLoading(true); setTodayRtError('');
      try {
        const params = buildParams();
        const res = await axios.get(`${baseDaily}/today/updated`, { params });
        const raw = Array.isArray(res?.data?.routines) ? res.data.routines : [];
        let rows = normalizeFromDaily(raw);
        if (rows.length === 0) {
          const baseRows = await fallbackFromBaseSchedule();
          if (baseRows.length > 0) rows = baseRows;
        }
        if (rows.length === 0) {
          const q = new URLSearchParams({
            start: today, end: today,
            ...(isStudent && studentId ? { stuid: String(studentId) } : {}),
            ...(isStudent && studentSection ? { section: String(studentSection), classid: String(studentSection) } : {}),
            ...(isStudent && studentSemester ? { semester: String(studentSemester) } : {}),
            ...(isPureTeacher && teacherId ? { teacherid: String(teacherId) } : {}),
            ...(isPureTeacher && teacherUserId ? { teacher_userid: String(teacherUserId) } : {})
          }).toString();
          const cal = await safeGet(`${baseCal}/combined-events?${q}`, { events: [] });
          const events = Array.isArray(cal?.data?.events) ? cal.data.events : [];
          rows = normalizeFromCal(events);
        }
        rows.sort((a, b) => String(a._from || '').localeCompare(String(b._from || '')));
        setTodayRoutines(rows);
        setTodayDate(today);
      } catch (e) {
        console.error('today/updated fetch error', e?.message || e);
        setTodayRtError("Could not load today's routine.");
        setTodayRoutines([]);
        setTodayDate(today);
      } finally { setTodayRtLoading(false); }
    };
    fetchToday();
  }, [isStudent, isTeacher, isPureTeacher, user, activeTab, studentId, studentSection, studentSemester, teacherId, teacherUserId, studentSemSectionMatch, teacherOwnMatch]);

  const handleLogout = () => {
    localStorage.removeItem('auth');
    localStorage.removeItem('activeTab');
    sessionStorage.removeItem('dashboard_session_token');
    sessionStorage.removeItem('dashboard_hide_charts');
    navigate('/');
  };

  // ---------- Grouped Menu Definition (with Bulk Upload + Leave) ----------
  const ALL_GROUPS = useMemo(() => {
    const vis = (key) => {
      // --- Admins can see everything (including Leave Applications) ---
    if (isAdmin) return true;
      if (isGroupOfficer && !isAdmin) {
        const allowed = new Set([
          'home','masterStudent','CollegeAttendenceManager','dailyRoutine','examRoutine','logout'
        ]);
        return allowed.has(key);
      }
      if (isStuCouncil && !isAdmin) {
    const allowed = new Set(['home', 'masterStudent', 'logout']);
    return allowed.has(key);
  }
      if (isHR && !isAdmin) {
        const allowed = new Set([
          'home','masterTeacher','EmployeeAttendanceManager','teacherAvailability','leaveManager','logout'
        ]);
        return allowed.has(key);
      }
      if (isTeacher && !isAdmin) {
        const teacherAllowed = new Set(['home','dailyRoutine','CollegeAttendenceManager','leaveManager','masterTeacher',          // ✅ Teachers / Employee
    'teacherAvailability','logout']);
        return teacherAllowed.has(key);
      }
      if (key === 'EmployeeAttendanceManager') return isAdmin;
      const adminPreferred = new Set([
        'menu','manageUser','userRole','MasterRole','addCollege','addGroup','department','collegeAcadYear',
        'subjects','addCourse','subjectCourse','subjectElec','masterStudent','masterTeacher','subjectTeacher',
        'teacherAvailability','courseRegistration','courseOffering','classroomManager','deviceManager','settings',
        'bulkStudents','bulkTeachers','examResultBulk','leaveManager'
      ]);
      if (adminPreferred.has(key)) return isAdmin;
      if (key === 'CollegeAttendenceManager') return isAdmin;
      const studentAllowed = new Set(['dailyRoutine','examRoutine','classroomManager']);
      if (studentAllowed.has(key)) return isStudent || isAdmin;
      const openToAll = new Set(['home','examResult','logout']);
      if (openToAll.has(key)) return true;
      return false;
    };
    const groups = [
      { group: 'User Management', items: [
        { key: 'MasterRole', label: 'Master Role' },
        { key: 'userRole', label: 'User Roll Number' },
        { key: 'manageUser', label: 'Users' }
      ]},
      { group: 'Academic Structure(Single Entry)', items: [
        { key: 'addGroup', label: 'Group Of Institute' },
        { key: 'addCollege', label: 'Institute' },
        { key: 'collegeAcadYear', label: 'Academic Year' },
        { key: 'department', label: 'Department / Program' },

      ]},
      { group: 'Curriculum(Single Entry)', items: [
        { key: 'addCourse', label: 'Program / Department Setup' },
        { key: 'subjects', label: 'Course / Subject' },
      ]},
      { group: 'People', items: [
        { key: 'masterStudent', label: 'Students' },
        { key: 'masterTeacher', label: 'Teachers / Employee' },
        { key: 'teacherAvailability', label: 'Teacher Availability' }
      ]},
      { group: 'Operations', items: [
        { key: 'classroomManager', label: 'Rooms' },
        { key: 'courseOffering', label: 'Course/Subject Enrollment' },
        { key: 'deviceManager', label: 'Devices' },
        // ✅ Leave Applications under Operations
        { key: 'leaveManager', label: 'Leave Applications' },
      ]},
      { group: 'Routines', items: [
        { key: 'dailyRoutine', label: 'Class Schedule' },
        { key: 'examRoutine', label: 'Exam' }
      ]},
      { group: 'Reports', items: [
        ...(isAdmin ? [{ key: 'CollegeAttendenceManager', label: 'Student Attendance' }] : []),
        ...(isAdmin ? [{ key: 'EmployeeAttendanceManager', label: 'Employee Attendance' }] : []),
      ]},
      { group: 'Bulk Upload', items: [
        { key: 'bulkStudents', label: 'Students (Bulk Upload)' },
        { key: 'bulkTeachers', label: 'Teachers (Bulk Upload)' },
        //{ key: 'examResultBulk', label: 'Exam Result (Bulk Upload)' }
      ]},
      { group: 'Settings', items: [
        { key: 'settings', label: 'Themes' }
      ]}
    ];
    const home = { key: 'home', label: 'Home' };
    const menu = { key: 'menu', label: 'Menus' };
    const logout = { key: 'logout', label: 'Logout' };
    const q = query.trim().toLowerCase();
    const match = (txt) => (!q || String(txt).toLowerCase().includes(q));
    const filterLeaf = (item) => vis(item.key) && match(`${item.label} ${item.key}`);
    const filteredGroups = groups.map(g => ({ ...g, items: g.items.filter(filterLeaf) })).filter(g => g.items.length > 0);
    const filteredHome = vis(home.key) && match('home');
    const filteredMenu = vis(menu.key) && match(`${menu.label} ${menu.key}`);
    const filteredLogout = vis(logout.key) && match('logout');
    return { filteredGroups, filteredHome, filteredMenu, filteredLogout, home, menu, logout };
  }, [isAdmin, isStudent, isTeacher, query]);

  const toggleGroup = (name) => setOpenGroups(prev => ({ ...prev, [name]: !prev[name] }));

  const Leaf = ({ item }) => (
    <button
      style={styles.leafBtn(activeTab === item.key)}
      onClick={() => {
        if (item.key === 'logout') { 
          handleLogout(); 
          return; 
        }
        setActiveTab(item.key);
      }}
      title={item.label}
    >
      <Icon name={MATERIAL_ICONS[item.key] || MATERIAL_ICONS.bulkUpload || 'circle'} />
      <span>{item.label}</span>
    </button>
  );

  // KPI computations
  const kpiStudentPresent  = useMemo(() => sum(studentSummary, 'present'), [studentSummary]);
  const kpiStudentAbsent   = useMemo(() => sum(studentSummary, 'absent'),  [studentSummary]);
  const kpiEmployeePresent = useMemo(() => sum(employeeSummary, 'present'), [employeeSummary]);
  const kpiTeacherPresent  = useMemo(() => sum(teacherSummary, 'present'), [teacherSummary]);
  const kpiTeacherAbsent   = useMemo(() => sum(teacherSummary, 'absent'),  [teacherSummary]);

  // Monthly pies
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthRowsStudent = useMemo(() => studentSummary.filter(r => String(r?.day || '').startsWith(monthKey)), [studentSummary, monthKey]);
  const monthRowsTeacher = useMemo(() => teacherSummary.filter(r => String(r?.day || '').startsWith(monthKey)), [teacherSummary, monthKey]);
  const monthPresentStu = useMemo(() => sum(monthRowsStudent, 'present'), [monthRowsStudent]);
  const monthAbsentStu  = useMemo(() => sum(monthRowsStudent, 'absent'),  [monthRowsStudent]);
  const monthTotalStu   = monthPresentStu + monthAbsentStu;
  const monthPresentT   = useMemo(() => sum(monthRowsTeacher, 'present'), [monthRowsTeacher]);
  const monthAbsentT    = useMemo(() => sum(monthRowsTeacher, 'absent'),  [monthRowsTeacher]);
  const monthTotalT     = monthPresentT + monthAbsentT;

  const attPieDataStudent = useMemo(() => ({
    labels: ['Present', 'Absent'],
    datasets: [{ data: [monthPresentStu, monthAbsentStu], backgroundColor: ['#2563eb', '#ef4444'], borderColor: ['#1d4ed8', '#b91c1c'], borderWidth: 1 }]
  }), [monthPresentStu, monthAbsentStu]);
  const attPieDataTeacher = useMemo(() => ({
    labels: ['Present', 'Absent'],
    datasets: [{ data: [monthPresentT, monthAbsentT], backgroundColor: ['#2563eb', '#ef4444'], borderColor: ['#1d4ed8', '#b91c1c'], borderWidth: 1 }]
  }), [monthPresentT, monthAbsentT]);
  const attPieOptionsStu = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' },
      tooltip: { callbacks: { label: (ctx) => {
        const val = ctx.parsed || 0;
        const pct = monthTotalStu ? ((val * 100) / monthTotalStu).toFixed(1) : '0.0';
        return `${ctx.label}: ${pct}% (${val})`;
      }}},
      title: { display: false }
    }
  }), [monthTotalStu]);
  const attPieOptionsT = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' },
      tooltip: { callbacks: { label: (ctx) => {
        const val = ctx.parsed || 0;
        const pct = monthTotalT ? ((val * 100) / monthTotalT).toFixed(1) : '0.0';
        return `${ctx.label}: ${pct}% (${val})`;
      }}},
      title: { display: false }
    }
  }), [monthTotalT]);

  return (
    <div style={styles.layout}>
      {/* Session Timer */}
      <SessionTimer userRole={displayRole} userId={user?.userId || user?.username || 'Unknown'} />
      {/* Floating Issue Launcher */}
      <IssueLauncher />
      
      {/* ======= SIDEBAR ======= */}
      <nav style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarTitle}>Dashboard</div>
          <div style={styles.rolePill}>{displayRole}</div>
        </div>

        <div className="searchWrap" style={styles.searchWrap}>
          <span style={styles.searchIcon}><Icon name="search" /></span>
          <input
            style={styles.searchInput}
            placeholder="Search menu..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <ul style={styles.menuList}>
          {ALL_GROUPS.filteredHome && (
            <li>
              <button
                style={{ ...styles.homeItem, outline: activeTab === 'home' ? '2px solid #2563eb' : 'none' }}
                onClick={() => setActiveTab('home')}
              >
                <Icon name={MATERIAL_ICONS.home} />
                <span>Home</span>
              </button>
            </li>
          )}

          {false && ALL_GROUPS.filteredMenu && (
            <li>
              <button
                style={styles.leafBtn(activeTab === 'menu')}
                onClick={() => setActiveTab('menu')}
                title="Menus"
              >
                <Icon name={MATERIAL_ICONS.menu} />
                <span>Menus</span>
              </button>
            </li>
          )}

          {ALL_GROUPS.filteredGroups.map(g => (
            <li key={g.group}><Group group={g.group} items={g.items} /></li>
          ))}

          {ALL_GROUPS.filteredLogout && (
            <li><Leaf item={ALL_GROUPS.logout} /></li>
          )}
        </ul>
      </nav>

      {/* ======= MAIN ======= */}
      <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
        {/* THEME HEADER BANNER */}
        {themeHeaderUrl ? (
          <div className="mb-4 rounded-xl overflow-hidden ring-1 ring-slate-200 bg-white">
            <img src={themeHeaderUrl} alt="Institute Header" className="w-full h-28 md:h-36 object-cover" loading="lazy" />
          </div>
        ) : null}

        
        <header className="mb-6">
  <div className="flex items-center gap-4">
    <img
      src="public\images\logo.png"          // <- public/images/logo.png
      alt="SVIST / Aimtech Logo"
      className="w-30 h-30 object-contain rounded-md bg-white ring-1 ring-slate-200 p-1"
      loading="lazy"
    />
    <div className="space-y-1">
      <h1 className="text-4xl font-bold text-slate-800">SVIST on Click (V1)</h1>
      <h2 className="text-3xl font-bold text-slate-600 underline underline-offset-4 decoration-2">
        Aimtech Campus Management System
      </h2>
      <h2 className="text-1xl font-bold text-slate-500">
        An Initiative by Dr.Nanadan Gupta (Director) & Aimtech Campus
      </h2>
    </div>
  </div>

  {(isStudent || isPureTeacher) && (
    <div className="mt-3 flex flex-wrap gap-2">
      {isStudent && (
        <div className="text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-md px-2 py-1">
          Institute (Student): <b>{formatCollegeLabel(studentCollegeId)}</b>
        </div>
      )}
      {isPureTeacher && (
        <div className="text-xs text-violet-700 bg-violet-50 ring-1 ring-violet-200 rounded-md px-2 py-1">
          Institute (Teacher): <b>{formatCollegeLabel(teacherCollegeId)}</b>
        </div>
      )}
    </div>
  )}
</header>

        <div className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-5">
          {activeTab === 'home' && (
            <div className="space-y-6">
              <div><h2 className="text-lg font-semibold text-slate-800">📊 Overview</h2></div>

              {/* Overview quick cards */}
              {!isStudent && !isPureTeacher && (
                <>
                  {isGroupOfficer && !isAdmin ? (
                    <div className="flex flex-wrap gap-4">
                      <div className="min-w-[120px] flex-1 rounded-lg bg-indigo-50 border border-indigo-100 p-4 text-center">
                        <div className="text-3xl font-extrabold text-indigo-600">{students.length}</div>
                        <div className="text-sm text-slate-700 mt-1">Students</div>
                      </div>
                    </div>
                  ) : isHR && !isAdmin ? (
                    <div className="flex flex-wrap gap-4">
                      <div className="min-w-[120px] flex-1 rounded-lg bg-amber-50 border border-amber-100 p-4 text-center">
                        <div className="text-3xl font-extrabold text-amber-600">{teachers.length}</div>
                        <div className="text-sm text-amber-700 mt-1">Teachers / Employees</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-4">
                      <div className="min-w-[120px] flex-1 rounded-lg bg-indigo-50 border border-indigo-100 p-4 text-center">
                        <div className="text-3xl font-extrabold text-indigo-600">{students.length}</div>
                        <div className="text-sm text-slate-700 mt-1">Students</div>
                      </div>
                      <div className="min-w-[120px] flex-1 rounded-lg bg-amber-50 border border-amber-100 p-4 text-center">
                        <div className="text-3xl font-extrabold text-amber-600">{teachers.length}</div>
                        <div className="text-sm text-amber-700 mt-1">Teachers</div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!hideCharts && !isStudent && !isPureTeacher && (
                <div className="h-56">
                  {pieData ? (
                    <Pie
                      data={pieData}
                      options={{
                        responsive: true,
                        plugins: { legend: { display: true, position: 'bottom' }, title: { display: false } },
                        maintainAspectRatio: false
                      }}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">Loading pie chart...</div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <h3 className="text-base font-semibold text-slate-800">
                  {isStudent ? '🗓️ Your Attendance (Daily) — Summary'
                             : isPureTeacher ? '🗓️ Your Attendance (Daily) — Summary'
                             : '🗓️ Attendance (Daily) — Summary'}
                </h3>
                {isStudent && (
                  <div className="text-xs text-slate-600 bg-slate-50 ring-1 ring-slate-200 rounded-md px-2 py-1">
                    Viewing as: <b>{studentName || 'Student'}</b>
                    {studentSection ? <> • Section <b>{studentSection}</b></> : null}
                    {studentSemester ? <> • Semester <b>{studentSemester}</b></> : null}
                  </div>
                )}
                {isPureTeacher && (
                  <div className="text-xs text-slate-600 bg-slate-50 ring-1 ring-slate-200 rounded-md px-2 py-1">
                    Viewing as: <b>{teacherName || 'Teacher'}</b>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <label className="flex items-center gap-2 bg-indigo-50 rounded-md px-3 py-2 ring-1 ring-indigo-100">
                    <span className="text-xs text-slate-700">Start</span>
                    <input id="attStart" type="date" value={attStart} onChange={(e) => setAttStart(e.target.value)} className="rounded border border-indigo-200 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
                  </label>
                  <label className="flex items-center gap-2 bg-indigo-50 rounded-md px-3 py-2 ring-1 ring-indigo-100">
                    <span className="text-xs text-slate-700">End</span>
                    <input id="attEnd" type="date" value={attEnd} onChange={(e) => setAttEnd(e.target.value)} className="rounded border border-indigo-200 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
                  </label>
                </div>
              </div>

              {/* Attendance KPI tiles */}
              {isStudent && (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                    <div className="text-xs text-cyan-800 mb-1">You Present</div>
                    <div className="text-2xl font-extrabold text-cyan-800">{kpiStudentPresent}</div>
                    <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-xs text-amber-800 mb-1">You Absent</div>
                    <div className="text-2xl font-extrabold text-amber-800">{kpiStudentAbsent}</div>
                    <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                  </div>
                </div>
              )}

              {isPureTeacher && (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                    <div className="text-xs text-cyan-800 mb-1">You Present</div>
                    <div className="text-2xl font-extrabold text-cyan-800">{kpiTeacherPresent}</div>
                    <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-xs text-amber-800 mb-1">You Absent</div>
                    <div className="text-2xl font-extrabold text-amber-800">{kpiTeacherAbsent}</div>
                    <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                  </div>
                </div>
              )}

              {!isStudent && !isPureTeacher && (
                <>
                  {isGroupOfficer && !isAdmin ? (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                        <div className="text-xs text-cyan-800 mb-1">Student Present</div>
                        <div className="text-2xl font-extrabold text-cyan-800">{kpiStudentPresent}</div>
                        <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <div className="text-xs text-amber-800 mb-1">Student Absent</div>
                        <div className="text-2xl font-extrabold text-amber-800">{kpiStudentAbsent}</div>
                        <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                      </div>
                    </div>
                  ) : isHR && !isAdmin ? (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-1">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="text-xs text-emerald-800 mb-1">Employee Present</div>
                        <div className="text-2xl font-extrabold text-emerald-800">{kpiEmployeePresent}</div>
                        <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                        <div className="text-xs text-cyan-800 mb-1">Student Present</div>
                        <div className="text-2xl font-extrabold text-cyan-800">{kpiStudentPresent}</div>
                        <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <div className="text-xs text-amber-800 mb-1">Student Absent</div>
                        <div className="text-2xl font-extrabold text-amber-800">{kpiStudentAbsent}</div>
                        <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="text-xs text-emerald-800 mb-1">Employee Present</div>
                        <div className="text-2xl font-extrabold text-emerald-800">{kpiEmployeePresent}</div>
                        <div className="text-xs text-slate-600 mt-1">{attStart} → {attEnd}</div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {chartError && !hideCharts && !isPureTeacher && (
                <div className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{chartError}</div>
              )}

              {!hideCharts && !isPureTeacher && (
                <div className="h-72">
                  {chartData ? (
                    <Bar
                      data={chartData}
                      options={{
                        responsive: true,
                        plugins: { legend: { display: true }, title: { display: false } },
                        maintainAspectRatio: false
                      }}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">Loading chart...</div>
                  )}
                </div>
              )}

              {/* Today's Updated Routine */}
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-semibold text-slate-800">🗓️ Today's Updated Routine</h3>
                  {todayCounts.total != null && !isPureTeacher && (
                    <span className="text-xs rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-slate-700">
                      Total Today: <b>{todayCounts.total}</b>
                    </span>
                  )}
                  {todayCounts.updated != null && !isPureTeacher && (
                    <span className="text-xs rounded-full bg-indigo-100 border border-indigo-200 px-2 py-0.5 text-indigo-800">
                      Updated Today: <b>{todayCounts.updated}</b>
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500">
                    {todayDate ? `Date: ${todayDate}` : ''}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Time</th>
                        <th className="px-3 py-2 font-medium">Subject</th>
                        <th className="px-3 py-2 font-medium">Classroom</th>
                        <th className="px-3 py-2 font-medium">Semester</th>
                        <th className="px-3 py-2 font-medium">Section</th>
                        {!isStudent && !isPureTeacher && <th className="px-3 py-2 font-medium">Teacher</th>}
                        {!isStudent && <th className="px-3 py-2 text-left font-medium">Updated At</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {todayRtLoading && (
                        <tr>
                          <td colSpan={isStudent ? 5 : (isPureTeacher ? 5 : 7)} className="px-3 py-3 text-slate-500 text-center">
                            Loading today's updated routine...
                          </td>
                        </tr>
                      )}
                      {!todayRtLoading && todayRoutines.map((r, idx) => (
                        <tr key={r.routineid ?? `${r.drsubjid}-${r.drclassroomid}-${idx}`} className={idx % 2 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-2 border-t border-slate-100 text-left">
                            {(r._from || r._to) ? `${r._from ?? ''} – ${r._to ?? ''}` : ((r.drfrom || r.drto) ? `${r.drfrom ?? ''} – ${r.drto ?? ''}` : '—')}
                          </td>
                          <td className="px-3 py-2 border-t border-slate-100 text-center">{r._subject ?? r.drsubjid ?? '—'}</td>
                          <td className="px-3 py-2 border-t border-slate-100 text-center">{r._room ?? r.drclassroomid ?? '—'}</td>
                          <td className="px-3 py-2 border-t border-slate-100 text-center">{r._semester ?? r.stu_curr_semester ?? '—'}</td>
                          <td className="px-3 py-2 border-t border-slate-100 text-center">{r._section ?? r.stu_section ?? '—'}</td>
                          {!isStudent && !isPureTeacher && (
                            <td className="px-3 py-2 border-t border-slate-100 text-center">{r._teacher ?? r.drclassteacherid ?? '—'}</td>
                          )}
                          {!isStudent && (
                            <td className="px-3 py-2 border-t border-slate-100 text-left text-slate-600">
                              {r._updated ? new Date(r._updated).toLocaleString() : (r.updatedat ? new Date(r.updatedat).toLocaleString() : '—')}
                            </td>
                          )}
                        </tr>
                      ))}
                      {!todayRtLoading && todayRoutines.length === 0 && (
                        <tr>
                          <td colSpan={isStudent ? 5 : (isPureTeacher ? 5 : 7)} className="px-3 py-3 text-slate-500 text-center">
                            {todayRtError || 'No updates today.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Pages */}
          {activeTab === 'menu' && <MenuManager readOnly={isStudent} />}
          {activeTab === 'manageUser' && <Manageuser readOnly={isStudent} users={users} />}
          {activeTab === 'userRole' && <UserRole readOnly={isStudent} roles={userRoles} />}
          {activeTab === 'MasterRole' && <MasterRole readOnly={isStudent} />}
          {activeTab === 'addCollege' && <AddCollege readOnly={isStudent} />}
          {activeTab === 'addGroup' && <CollegeGroupManager readOnly={isStudent} />}
          {activeTab === 'department' && <SubjectDepartement readOnly={isStudent} />}
          {activeTab === 'collegeAcadYear' && <CollegeAcadYear readOnly={isStudent} />}
          {activeTab === 'subjects' && <MasterSubject readOnly={isStudent} />}
          {activeTab === 'addCourse' && <AddCourse readOnly={isStudent} />}
          {activeTab === 'subjectCourse' && <SubjectCourse readOnly={isStudent} />}
          {activeTab === 'subjectElec' && <SubjectElec readOnly={isStudent} />}
          {activeTab === 'masterStudent' && <MasterStudent readOnly={isStudent} students={students} />}
          {activeTab === 'masterTeacher' && <MasterTeacher readOnly={isStudent} teachers={teachers} />}
          {activeTab === 'subjectTeacher' && <SubjectTeacher readOnly={isStudent} />}
          {activeTab === 'teacherAvailability' && <TeacherAvailabilityManager readOnly={isStudent} />}
          {activeTab === 'courseRegistration' && <CourseRegistrationManager readOnly={isStudent} />}
          {activeTab === 'courseOffering' && <CourseOfferingManager readOnly={isStudent} />}
          {activeTab === 'classroomManager' && <ClassroomManager readOnly={isStudent} />}
          {activeTab === 'dailyRoutine' && <DailyRoutine readOnly={isStudent} />}
          {activeTab === 'examRoutine' && <ExamRoutineManager readOnly={isStudent} />}
          {activeTab === 'CollegeAttendenceManager' && <CollegeAttendenceManager readOnly={isStudent} />}
          {activeTab === 'EmployeeAttendanceManager' && <EmployeeAttendanceManager readOnly={isStudent} />}
          {activeTab === 'examResult' && <ExamResult readOnly={isStudent} />}
          {activeTab === 'deviceManager' && <SmsDeviceManager readOnly={isStudent} />}
          {activeTab === 'settings' && <WhiteboardManager />}

          {/* Bulk Upload Pages */}
          {activeTab === 'bulkStudents' && <StudentMasterManager readOnly={isStudent} />}
          {activeTab === 'bulkTeachers' && <TeacherMasterBulkUp readOnly={isStudent} />}
          {activeTab === 'examResultBulk' && <ExamResultBulkManager readOnly={isStudent} />}

          {/* ✅ Leave Applications page */}
          {activeTab === 'leaveManager' && <LeaveApplicationManager />}
        </div>
      </div>
    </div>
  );

  function Group({ group, items }) {
    const open = !!openGroups[group];
    return (
      <div style={styles.group}>
        <div style={styles.groupHeader(open)} onClick={() => toggleGroup(group)}>
          <div style={styles.groupHeaderLeft}>
            <Icon name={GROUP_ICONS[group] || 'folder'} />
            <span>{group}</span>
          </div>
          <span style={styles.caret(open)}>▶</span>
        </div>
        {open && <div style={styles.groupBody}>{items.map(it => <Leaf key={it.key} item={it} />)}</div>}
      </div>
    );
  }
}
