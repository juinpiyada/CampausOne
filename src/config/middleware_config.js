// src/middleware_config.js

// Optional: safe URL joiner to avoid '//' or missing '/' when composing paths.
export function joinUrl(base = "", path = "") {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}/${p}`;
}

const config = {
  // ===================== Server Configuration =====================
  PORT: import.meta.env.VITE_PORT,
  BASE_URL: import.meta.env.VITE_BASE_URL,
  API_PREFIX: import.meta.env.VITE_API_PREFIX,

  // ===================== Auth & Login =====================
  LOGIN_ROUTE: import.meta.env.VITE_LOGIN_ROUTE,

  // ===================== Master Routes =====================
  COLLEGES_ROUTE: import.meta.env.VITE_COLLEGES_ROUTE,
  // NOTE: This points to the API root by design; used as a base in code when needed.
  MASTER_USER_ROUTE: import.meta.env.VITE_MASTER_USER_ROUTE,
  COLLEGE_GROUP_ROUTE: import.meta.env.VITE_COLLEGE_GROUP_ROUTE,
  COURSE_ROUTE: import.meta.env.VITE_COURSE_ROUTE,
  SUBJECT_ROUTE: import.meta.env.VITE_SUBJECT_ROUTE,

  // Students
  STUDENT_ROUTE: import.meta.env.VITE_STUDENT_ROUTE,        // /api/student (legacy/primary)
  STUDENT_UP_ROUTE: import.meta.env.VITE_STUDENT_UP_ROUTE,  // /api/students-up (new alias)

  // Teachers
  TEACHER_ROUTE: import.meta.env.VITE_TEACHER_ROUTE,
  TEACHER_BULK_UP_ROUTE: import.meta.env.VITE_TEACHER_BULK_UP_ROUTE, // /api/teacher-master-bulk-up

  MASTER_DEPTS_ROUTE: import.meta.env.VITE_MASTER_DEPTS_ROUTE,
  MASTER_ACADYEAR_ROUTE: import.meta.env.VITE_MASTER_ACADYEAR_ROUTE,
  SUBJECT_COURSE_ROUTE: import.meta.env.VITE_SUBJECT_COURSE_ROUTE,
  MENU_MASTER_ROUTE: import.meta.env.VITE_MENU_MASTER_ROUTE,
  SUBJECT_TEACHER_ROUTE: import.meta.env.VITE_SUBJECT_TEACHER_ROUTE,
  USER_ROLE_ROUTE: import.meta.env.VITE_USER_ROLE_ROUTE,
  MASTER_ROLE_ROUTE: import.meta.env.VITE_MASTER_ROLE_ROUTE,
  DAILY_ROUTINE_ROUTE: import.meta.env.VITE_DAILY_ROUTINE_ROUTE,
  CLASS_ROOM_ROUTE: import.meta.env.VITE_CLASS_ROOM_ROUTE,
  TEACHER_AVAILABILITY_ROUTE: import.meta.env.VITE_TEACHER_AVAILABILITY_ROUTE,
  COLLEGE_DAILY_ROUTINE_ROUTE: import.meta.env.VITE_COLLEGE_DAILY_ROUTINE_ROUTE,
  COURSE_OFFERING_ROUTE: import.meta.env.VITE_COURSE_OFFERING_ROUTE,
  COURSE_REGISTRATION_ROUTE: import.meta.env.VITE_COURSE_REGISTRATION_ROUTE,
  COLLEGE_EXAM_ROUTINE_ROUTE: import.meta.env.VITE_COLLEGE_EXAM_ROUTINE_ROUTE,
  SUBJECT_ELECTIVE_ROUTE: import.meta.env.VITE_SUBJECT_ELECTIVE_ROUTE,
  EXAM_ROUTINE_MANAGER_ROUTE: import.meta.env.VITE_EXAM_ROUTINE_MANAGER_ROUTE,
  COLLEGE_ATTENDANCE_ROUTE: import.meta.env.VITE_COLLEGE_ATTENDANCE_ROUTE,
  EMPLOYEE_ATTENDANCE_ROUTE: import.meta.env.VITE_EMPLOYEE_ATTENDANCE_ROUTE,
  EXAM_RESULT_ROUTE: import.meta.env.VITE_EXAM_RESULT_ROUTE,
  DASHBOARD_FETCHING_ID: import.meta.env.VITE_DASHBOARD_FETCHING_ID,
  CHART_DATA_ROUTE: import.meta.env.VITE_CHART_DATA_ROUTE,
  CALENDAR_ATTENDANCE_ROUTE: import.meta.env.VITE_CALENDAR_ATTENDANCE_ROUTE,
  SMS_DEVICE_ROUTE: import.meta.env.VITE_SMS_DEVICE_ROUTE,
  WHITEBOARD_CMS_ROUTE: import.meta.env.VITE_WHITEBOARD_CMS_ROUTE,
  TEACHER_DTLS_ROUTE: import.meta.env.VITE_TEACHER_DTLS_ROUTE,
  USER_DTLS_ROUTE: import.meta.env.VITE_USER_DTLS_ROUTE,
  TEACHER_INFO_ROUTE: import.meta.env.VITE_TEACHER_INFO_ROUTE,
  // ===================== Finance (Fee/Payments) Routes =====================
  FIN_UI_FEE_STRUCTURE_ROUTE: import.meta.env.VITE_FIN_UI_FEE_STRUCTURE_ROUTE,
  FIN_UI_PAYMENTS_ROUTE: import.meta.env.VITE_FIN_UI_PAYMENTS_ROUTE,
  FIN_UI_STUDENT_FEE_INVOICE_ROUTE: import.meta.env.VITE_FIN_UI_STUDENT_FEE_INVOICE_ROUTE,
  FIN_UI_STUDENT_SCHOLARSHIP_ROUTE: import.meta.env.VITE_FIN_UI_STUDENT_SCHOLARSHIP_ROUTE,
  STUDENT_INFORMATION_ROUTE: import.meta.env.VITE_STUDENT_INFORMATION_ROUTE,
  // ===================== Leave Applications =====================
  // Matches: app.use('/api/leave-application', leaveApplicationRouter);
  LEAVE_APPLICATION_ROUTE: import.meta.env.VITE_LEAVE_APPLICATION_ROUTE,

  // ===================== Demand Letters =====================
  DEMAND_LETTERS_ROUTE: import.meta.env.VITE_DEMAND_LETTERS_ROUTE,
};

export default config;
