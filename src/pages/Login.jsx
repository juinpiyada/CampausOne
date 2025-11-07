// src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { LuGraduationCap } from 'react-icons/lu';
import config from '../config/middleware_config';

export default function Login() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [userRole, setUserRole] = useState('');
  const navigate = useNavigate();

  const pick = (...vals) => vals.find(v => v !== undefined && v !== null);

  /* ---------- helpers: role/redirect detection ---------- */
  // Strict finance checks: ONLY FIN_ACT or FIN_ACT_ADM
  const isFinanceByRoles = (rolesLike) => {
    if (!rolesLike) return false;
    const arr = Array.isArray(rolesLike) ? rolesLike : String(rolesLike).split(/[,\s]+/);
    const set = new Set(
      arr
        .filter(Boolean)
        .map(r => String(r).trim().toLowerCase().replace(/-/g, '_')) // normalize dash→underscore just in case
    );
    return set.has('fin_act') || set.has('fin_act_adm');
  };

  // Keep user_role strings for backward compatibility, but STRICT
  const isFinanceByStrings = (user_role /*, role_description */) => {
    const ur = String(user_role || '').toLowerCase();
    return ur === 'finance' || ur === 'finance_admin';
  };

  const pathFromAuth = (auth) => {
    if (!auth) return '/dashboard';
    const roles = auth.roles || [];
    // Only finance users get /finDashbord
    if (isFinanceByRoles(roles) || isFinanceByStrings(auth.user_role)) {
      return '/finDashbord';
    }
    return '/dashboard';
  };

  /* CHANGED: stricter session check + role-aware redirect on mount */
  const hasValidSession = () => {
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || 'null');
      const sess = JSON.parse(sessionStorage.getItem('sessionUser') || 'null');
      if (!auth || !auth.userId || auth.isAuthenticated !== true) return false;
      if (!sess) return false;
      const aUID = String(auth.userId || auth.userid || auth.username || '');
      const sUID = String(sess.userId || sess.userid || sess.username || '');
      if (!aUID || !sUID || aUID !== sUID) return false;

      // optional age limit (24h) – safe default if timestamp missing
      const ts = new Date(auth.login_time || 0).getTime();
      if (!ts || Number.isNaN(ts)) return true;
      const ageHours = (Date.now() - ts) / 36e5;
      return ageHours < 24;
    } catch {
      return false;
    }
  };

  // On mount, check for session and redirect if already logged in (strict)
  useEffect(() => {
    try {
      if (hasValidSession()) {
        const auth = JSON.parse(localStorage.getItem('auth') || 'null');
        setUserRole(auth?.user_role || '');
        navigate(pathFromAuth(auth), { replace: true });
      }
    } catch {}
  }, [navigate]);

  const downloadSessionTxt = (auth) => {
    try {
      const ts = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}`;

      const lines = [
        '=== School Management System — Session Snapshot ===',
        `Generated (Local ISO): ${ts.toISOString()}`,
        '',
        `User ID: ${auth.userId || ''}`,
        `Name: ${auth.name || ''}`,
        `Role: ${auth.user_role || ''}`,
        `Role Description: ${auth.role_description || ''}`,
        `Roles: ${Array.isArray(auth.roles) ? auth.roles.join(', ') : (auth.roles || '')}`,
        '',
        '--- Student Info ---',
        `Student UserID (stuuserid): ${auth.stuuserid ?? ''}`,
        `Student Semester: ${auth.student_semester ?? ''}`,
        `Student Section: ${auth.student_section ?? ''}`,
        '',
        '--- Teacher Info ---',
        `Teacher UserID: ${auth.teacher_userid ?? ''}`,
        `Teacher ID: ${auth.teacher_id ?? ''}`,
        `Teacher Designation: ${auth.teacher_designation ?? ''}`,
        `Teacher Type: ${auth.teacher_type ?? ''}`,
        '',
        '--- College / Group (Active) ---',
        `Active College ID: ${auth.college_id ?? ''}`,
        `Active College Name: ${auth.college_name ?? ''}`,
        `Active College Code: ${auth.collegecode ?? ''}`,
        `Active College Group ID: ${auth.college_group_id ?? ''}`,
        `Active Group ID: ${auth.active_group_id ?? ''}`,
        '',
        '--- Group Owner (if any) ---',
        `Group Owner ID: ${auth.group_id ?? ''}`,
        `Group Owner Role: ${auth.group_role ?? ''}`,
        `Group Owner Desc: ${auth.group_desc ?? ''}`,
        '',
        '--- Group Context Flags ---',
        `Is Group Admin: ${String(auth.is_group_admin ?? '')}`,
        `Group Mode: ${auth.group_mode || ''}`,
        `Child User Role: ${auth.child_user_role || ''}`,
        '',
        `Hide Charts (session): ${String(auth.hide_charts ?? '')}`,
        `Login Time: ${auth.login_time || ''}`,
      ];

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${auth.userId || 'user'}_${stamp}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Could not generate session .txt:', e);
    }
  };

  /* ---------- NEW: choose best redirect path from server response ---------- */
  const bestRedirectFromResponse = (resp, data) => {
     // priority: JSON redirect_url → header X-Redirect-To → role inference → default
     const jsonUrl = data?.redirect_url;
     const headerUrl = resp?.headers?.['x-redirect-to'];
     if (jsonUrl && typeof jsonUrl === 'string') return jsonUrl;
     if (headerUrl && typeof headerUrl === 'string') return headerUrl;

     // infer from roles/user_role/role_description
    if (isFinanceByRoles(data?.roles) || isFinanceByStrings(data?.user_role)) {
       return '/finDashbord';
     }
     return '/dashboard';
   };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setShowSuccess(false);

    if (!userId || !password) {
      setError('Both fields are required');
      return;
    }
    setLoading(true);

    try {
      const resp = await axios.post(config.LOGIN_ROUTE, { username: userId, password });
      const data = resp?.data || {};

      if (!data || !data.roles?.length) {
        setError('Invalid response from server');
        setLoading(false);
        return;
      }

      const normalizedUserId = pick(data.userid, data.userId, data.user_id, data.username) ?? '';
      const teacherId = pick(
        data.teacher_id, data.teacherid, data.teacherId, data?.teacher?.teacherid,
        data?.teacher?.id, data?.teacher?.teacherID
      ) ?? null;

      const teacherUserid = pick(
        data.teacher_userid, data.teacherUserid, data.teacherUserId,
        data?.teacher?.userid, data?.teacher?.user_id
      ) ?? null;

      const stuUserId = pick(data.stuuserid, data.student_userid, data.studentUserId) ?? null;
      const studentSemester = pick(data.student_semester, data.stu_curr_semester, data.semester) ?? null;
      const studentSection = pick(data.student_section, data.stu_section, data.section) ?? null;

      // normalize teacher designation & type
      const teacherDesignation = pick(
        data.teacher_designation, data.teacherDesignation, data.teacher_design, data.t_designation,
        data.teacherdesign, data?.teacher?.designation
      ) ?? null;

      const teacherType = pick(
        data.teacher_type, data.teacherType, data.t_type, data.teachertype,
        data?.teacher?.type
      ) ?? null;

      const rolesArr = Array.isArray(data.roles) ? data.roles : [];
      const roleSet = new Set(
        [
          ...rolesArr,
          data.user_role,
          data.userroledesc,
          data.role_description
        ]
          .filter(Boolean)
          .map(r => String(r).toLowerCase())
          .flatMap(r => r.split(/[,\s]+/).map(s => s.trim()).filter(Boolean))
      );

      const isStudentRole =
  ['student', 'stu_curr', 'stu_onboard', 'stu_passed', 'stu_council', 'student_council']
    .some(k => roleSet.has(k));


      const hideCharts = !!isStudentRole;

      // group flags
      const primaryRoleRaw = pick(data.user_role, data.userroledesc, data.role_description) ?? '';
      const primaryRole = String(primaryRoleRaw).trim().toLowerCase();

      const isGroupAdmin = primaryRole === 'grp_adm' || roleSet.has('grp_adm');
      const isGroupMgmtUser = primaryRole === 'grp_mgmt_usr' || roleSet.has('grp_mgmt_usr');
      const isHr = roleSet.has('hr_leave') || roleSet.has('role_hr') || roleSet.has('hr');

      const groupMode = isGroupAdmin
        ? 'group_of_institute'
        : (isGroupMgmtUser ? 'college_under_group' : 'single_college');

      const childUserRole = isGroupAdmin ? 'grp_mgmt_usr' : null;

      // active college/group normalization
      const activeCollegeId = pick(
        data.college_id,
        data.active_college_id,
        data.collegeid,
        data.owner_college_id,
        data.student_college_id,
        data.teacher_college_id
      ) ?? null;

      const activeCollegeName = pick(
        data.college_name,
        data.active_college_name,
        data.collegename,
        data.owner_college_name,
        data.student_college_name,
        data.teacher_college_name
      ) ?? null;

      const activeCollegeCode = pick(
        data.collegecode,
        data.college_code,
        data.active_college_code,
        data.owner_college_code,
        data.student_college_code,
        data.teacher_college_code
      ) ?? null;

      const activeCollegeGroupId = pick(
        data.college_group_id,
        data.active_college_group_id,
        data.owner_college_group_id,
        data.student_college_group_id,
        data.teacher_college_group_id
      ) ?? null;

      const activeGroupId = pick(
        data.active_group_id,
        data.group_id,
        data.college_group_id
      ) ?? null;

      const groupOwnerId = pick(data.group_id) ?? null;
      const groupOwnerRole = pick(data.group_role) ?? null;
      const groupOwnerDesc = pick(data.group_desc) ?? null;

      const authPayload = {
        userId: String(normalizedUserId || ''),
        name: data.username || '',
        user_role: data.user_role || '',
        role_description: data.role_description || '',
        roles: data.roles || [],
        stuuserid: stuUserId,
        student_semester: studentSemester,
        student_section: studentSection,
        teacher_userid: teacherUserid ? String(teacherUserid) : null,
        teacher_id: teacherId ? String(teacherId) : null,
        teacher_designation: teacherDesignation ? String(teacherDesignation) : null,
        teacher_type: teacherType ? String(teacherType) : null,
        login_time: new Date().toISOString(),
        hide_charts: hideCharts,
        isAuthenticated: true,

        is_group_admin: isGroupAdmin,
        is_hr: isHr,
        group_mode: groupMode,
        child_user_role: childUserRole,

        college_id: activeCollegeId ? String(activeCollegeId) : null,
        collegeid: activeCollegeId ? String(activeCollegeId) : null,
        college_name: activeCollegeName || null,
        collegename: activeCollegeName || null,
        collegecode: activeCollegeCode || null,
        college_code: activeCollegeCode || null,
        college_group_id: activeCollegeGroupId ? String(activeCollegeGroupId) : null,
        active_group_id: activeGroupId ? String(activeGroupId) : null,

        student_college_id: data.student_college_id ?? null,
        teacher_college_id: data.teacher_college_id ?? null,
        owner_college_id: data.owner_college_id ?? null,

        group_id: groupOwnerId ? String(groupOwnerId) : null,
        group_role: groupOwnerRole || null,
        group_desc: groupOwnerDesc || null
      };

      try { localStorage.removeItem('auth'); sessionStorage.removeItem('sessionUser'); } catch {}
      localStorage.setItem('auth', JSON.stringify(authPayload));
      sessionStorage.setItem('sessionUser', JSON.stringify(authPayload));
      sessionStorage.setItem('dashboard_hide_charts', hideCharts ? 'true' : 'false');

      sessionStorage.setItem('group_mode', groupMode);
      sessionStorage.setItem('is_group_admin', isGroupAdmin ? 'true' : 'false');
      sessionStorage.setItem('child_user_role', childUserRole || '');
      sessionStorage.setItem('active_college_id', authPayload.college_id || '');
      sessionStorage.setItem('active_group_id', authPayload.active_group_id || '');
      sessionStorage.setItem('college_code', authPayload.collegecode || '');

      setUserRole(authPayload.user_role || '');

      // // Auto-download session snapshot
      // downloadSessionTxt(authPayload);

      // Decide redirect path (honor server hints)
      const targetPath = bestRedirectFromResponse(resp, data);

      setShowSuccess(true);
      setTimeout(() => {
        navigate(targetPath);
      }, 1400);
    } catch (err) {
      if (err.response) {
        const msg = err.response?.data?.error || 'Invalid credentials or server error.';
        if (err.response.status === 403) setError('Access Denied: You do not have permission to log in.');
        else if (err.response.status === 401) setError('Invalid credentials, please check your username and password.');
        else setError(msg);
      } else {
        setError('A network error occurred, please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const SuccessOverlay = ({ role }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
      <style>{`
        @keyframes popIn { 0% { transform: scale(.9); opacity:.0 } 100% { transform: scale(1); opacity:1 } }
        @keyframes draw { to { stroke-dashoffset: 0 } }
        @keyframes fadeInUp { 0% { opacity:0; transform: translateY(6px) } 100% { opacity:1; transform: translateY(0) } }
        .draw-circle { stroke-dasharray: 300; stroke-dashoffset: 300; animation: draw .6s ease-out forwards; }
        .draw-check { stroke-dasharray: 80; stroke-dashoffset: 80; animation: draw .5s .45s ease-out forwards; }
      `}</style>
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl animate-[popIn_.35s_ease-out]">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-indigo-500/20 via-fuchsia-500/20 to-amber-500/20 blur-2xl" />
        <div className="mx-auto mb-5 grid place-items-center">
          <svg width="96" height="96" viewBox="0 0 120 120" className="">
            <defs>
              <linearGradient id="g" x1="0" x2="1">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="40" fill="none" stroke="url(#g)" strokeWidth="10" className="draw-circle" />
            <path d="M45 60 l10 10 20-24" fill="none" stroke="url(#g)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" className="draw-check" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-slate-900">Welcome back!</h3>
        <p className="mt-1 text-sm text-slate-600">
          Logged in as <span className="font-medium text-indigo-600">{role || 'user'}</span>. Redirecting…
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.2s]" />
          <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce" />
          <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
        </div>
      </div>
    </div>
  );

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center bg-slate-50 font-sans">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-indigo-200/40 via-purple-200/30 to-sky-200/40 blur-3xl rounded-full animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-tl from-rose-200/30 via-amber-200/30 to-pink-200/30 blur-3xl rounded-full animate-pulse delay-2000"></div>
      </div>
      <div className="w-full max-w-4xl mx-auto px-6 py-12">
        <div className="mx-auto w-full max-w-lg rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-100 shadow-xl p-8 sm:p-10">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg">
            <LuGraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight text-center">
            Welcome back<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">.</span>
          </h1>
          <p className="mt-2 text-center text-slate-600">Sign in to your Campus&nbsp;Management&nbsp;System account.</p>
          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
            <div>
              <label htmlFor="userid" className="block text-sm font-semibold text-slate-700 mb-1.5">User ID</label>
              <input
                id="userid"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. john.doe"
                autoComplete="username"
                className="w-full rounded-lg border border-slate-300 bg-white/70 backdrop-blur-sm px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-400/50 transition"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-300 bg-white/70 backdrop-blur-sm px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-400/50 transition"
              />
            </div>
            {error && (
              <div
                className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 disabled:from-indigo-400 disabled:to-purple-400 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 004 12z" />
                  </svg>
                  <span className="ml-2">Signing in…</span>
                </>
              ) : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
      {showSuccess && <SuccessOverlay role={userRole} />}
    </main>
  );
}