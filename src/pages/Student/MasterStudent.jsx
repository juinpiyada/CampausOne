import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import config from '../../config/middleware_config';
// ---- PDF Generation Imports ----
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
// ---- NEW: Import signature getter from UserDtlsManager ----
import { getStoredSignatureData } from '../UserDtl/UserDtlsManager';
// ---- NEW: Import StudentInformationManager ----
import StudentInformationManager from '../studentinformation/StudentInformationManager';

// ---- Safe URL joiner ----
const joinUrl = (base, path = '') =>
  path
    ? `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
    : String(base);

// ===== Helpers to format/parse composite address (front-end only) =====
function formatStuAddress({ addrCurrent, addrPermanent, pinCode }) {
  const parts = [];
  if (addrCurrent) parts.push(`Current: ${addrCurrent}`);
  if (addrPermanent) parts.push(`Permanent: ${addrPermanent}`);
  if (pinCode) parts.push(`PIN: ${pinCode}`);
  return parts.join(' || ');
}
function parseStuAddress(stuaddress) {
  const raw = String(stuaddress || '').trim();
  const out = { addrCurrent: '', addrPermanent: '', pinCode: '' };
  if (!raw) return out;
  if (raw.includes('||')) {
    raw.split('||').forEach(part => {
      const p = part.trim();
      if (p.toLowerCase().startsWith('current:')) {
        out.addrCurrent = p.slice('current:'.length).trim();
      } else if (p.toLowerCase().startsWith('permanent:')) {
        out.addrPermanent = p.slice('permanent:'.length).trim();
      } else if (p.toLowerCase().startsWith('pin:')) {
        out.pinCode = p.slice('pin:'.length).trim();
      }
    });
  } else {
    out.addrCurrent = raw; // backward compat
  }
  return out;
}

const initialState = {
  stuid: '',
  stu_enrollmentnumber: '',
  stu_rollnumber: '',
  stu_regn_number: '',
  stuname: '',
  stuFirstName: '',
  admission_officer_name: '',   
  stuLastName: '',
  stuemailid: '',
  stumob1: '',
  stumob2: '',
  stucaste: '',
  stugender: '',
  studob: '',
  stucategory: '',
  scholrshipfees: '',
  stuadmissiondt: '',
  stu_course_id: '',
  stu_lat_entry: false,
  stu_curr_semester: '',
  stu_section: '',
  stuvalid: true,
  stuuserid: '',
  stuaddress: '',
  addrCurrent: '',
  addrPermanent: '',
  pinCode: '',
  sameAsCurrent: false,
  stuguardianFirstName: '',
  stuguardianLastName: '',
  stu_mother_firstname: '',   // 👈 UI only
  stu_mother_lastname: '',    // 👈 UI only
  stuguardianaddress: '',
  stuguardianemailid: '',
  stuguardianmob1: '',
  stuguardianmob2: '',
  stu_inst_id: '',
  programDescription: '',
  // --- academic performance / sem fees ---
  sem1: '',
  sem2: '',
  sem3: '',
  sem4: '',
  sem5: '',
  sem6: '',
  sem7: '',
  sem8: '',
  sem9: '',
  sem10: '',
  cgpa: '',
  remarks: false,
  balance: '', 
};

/* ------------ Auto-generate next Student ID (STU_ID_001, 002, ...) ------------ */
function getNextStudentId(list = []) {
  let maxNum = 0;
  for (const s of list) {
    const id = String(s?.stuid || '').trim();
    const m = /^STU_ID_(\d+)$/.exec(id);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!Number.isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  const next = String(maxNum + 1).padStart(3, '0');
  return `STU_ID_${next}`;
}

// helper for digit-only, max 10
const only10Digits = (v) => (String(v || '').replace(/\D/g, '').slice(0, 10));
// helper to allow only numeric values
const onlyDigits = (v) => String(v || '').replace(/\D/g, '');
const onlyNumericFloat = (v) =>
  String(v || '')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*)\./g, '$1') // single dot
    .slice(0, 6);               // e.g., "99.99"

// ---- PDF Helper Functions ----
function detectMimeFromBase64(b64 = "") {
  const head = b64.slice(0, 16);
  if (head.startsWith("JVBERi0")) return "application/pdf";
  if (head.startsWith("iVBOR")) return "image/png";
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("R0lG")) return "image/gif";
  if (head.startsWith("UklGR")) return "image/webp";
  if (head.startsWith("UEsDB") || head.startsWith("UEs")) return "application/zip";
  return "application/octet-stream";
}
function makeBlobUrl(b64, mime) {
  try {
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mime || "application/octet-stream" });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Error creating blob URL:", e);
    return null;
  }
}
// CSV export of the CURRENT filtered rows (mirrors full CSV structure)
function exportStudentsCSV(rows) {
  if (!Array.isArray(rows)) rows = [];

  // ----- Excel delimiter hint (forces comma in Excel) -----
  const SEP_HINT = 'sep=,';

  // ----- Headers (MUST mirror row order) -----
  const headers = [
    'ID',
    'Name',
    'Email',
    'Mobile',
    'Roll No',
    'Enrollment',
    'Semester',
    'Section',
    'Program Description',
    'Mother Name',
    'Guardian Email',
    'Guardian Mobile',
    'Admission Officer Name',
    'Admission Date'
  ];

  const escapeCSV = (v = '') => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const csvRows = [];

  // Header line
  csvRows.push(headers.map(escapeCSV).join(','));

  // Data lines
  rows.forEach((r) => {
    // Normalize values to match your latest keys / fallbacks
    const programDescription = r.programdescription ?? r.programDescription ?? '';
    const guardianEmail = r.stu_mother_email ?? r.stuparentemailid ?? '';
    const guardianMobile =
      r.stuprentmob1 ?? r.stuprentmob2 ??
      r.stuparentmob1 ?? r.stuparentmob2 ??
      r.guardian_mobile ?? r.guardianMobile ?? '';

    const admissionDate =
      (typeof formatDateTimeForDisplay === 'function'
        ? (formatDateTimeForDisplay(r.stuadmissiondt) || '')
        : (r.stuadmissiondt ? new Date(r.stuadmissiondt).toISOString().slice(0, 10) : '')
      );

    const line = [
      r.stuid ?? '',
      r.stuname ?? '',
      r.stuemailid ?? '',
      r.stumob1 ?? '',
      r.stu_rollnumber ?? '',
      r.stu_enrollmentnumber ?? '',
      (r.stu_curr_semester ?? r.stu_curr ?? ''),
      r.stu_section ?? '',
      programDescription,
      r.stu_mother_name ?? '',
      guardianEmail,
      guardianMobile,
      r.admission_officer_name ?? '',
      admissionDate,
    ].map(escapeCSV).join(',');

    csvRows.push(line);
  });

  // Build CSV text with Excel helpers
  const BOM = '\uFEFF'; // ensure Excel reads UTF-8
  const csvText = [SEP_HINT, ...csvRows].join('\r\n');
  const blob = new Blob([BOM + csvText], { type: 'text/csv;charset=utf-8;' });

  // Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `students_filtered_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;

  // Append for Safari compatibility
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

// PDF export of the CURRENT filtered rows (mirrors latest CSV columns)
async function exportStudentsPDF(rows) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });

  // ---- Header
  doc.setFontSize(16);
  doc.text('Student List (Filtered)', 30, 38);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 30, 56);

  // ---- Normalize body (mirror CSV order)
  const body = (rows ?? []).map((r) => {
    const programDescription = r.programdescription ?? r.programDescription ?? '';
    const guardianEmail = r.stu_mother_email ?? r.stuparentemailid ?? '';
    const guardianMobile =
      r.stuprentmob1 ?? r.stuprentmob2 ??
      r.stuparentmob1 ?? r.stuparentmob2 ??
      r.guardian_mobile ?? r.guardianMobile ?? '';

    const admissionDate =
      (typeof formatDateTimeForDisplay === 'function'
        ? (formatDateTimeForDisplay(r.stuadmissiondt) || '')
        : (r.stuadmissiondt ? new Date(r.stuadmissiondt).toISOString().slice(0,10) : '')
      );

    return [
      r.stuid ?? '',
      r.stuname ?? '',
      r.stuemailid ?? '',
      r.stumob1 ?? '',
      r.stu_rollnumber ?? '',
      r.stu_enrollmentnumber ?? '',
      (r.stu_curr_semester ?? r.stu_curr ?? ''),
      r.stu_section ?? '',
      programDescription,
      r.stu_mother_name ?? '',
      guardianEmail,
      guardianMobile,
      r.admission_officer_name ?? '',
      admissionDate
    ];
  });

  // ---- Columns (must match body order)
  const head = [[
    'ID',
    'Name',
    'Email',
    'Mobile',
    'Roll No',
    'Enrollment',
    'Semester',
    'Section',
    'Program Description',
    'Mother Name',
    'Guardian Email',
    'Guardian Mobile',
    'Admission Officer Name',
    'Admission Date'
  ]];

  // ---- Column widths (proportional; sums to 1.00)
  const margins = { left: 24, right: 24, top: 72, bottom: 24 };
  const pageWidth = doc.internal.pageSize.getWidth();
  const available = pageWidth - margins.left - margins.right;

  //               0     1     2      3     4     5     6     7     8      9      10     11     12     13
  const weights = [0.04, 0.08, 0.10, 0.06, 0.06, 0.08, 0.04, 0.04, 0.14, 0.08, 0.12, 0.06, 0.08, 0.02];
  const columnStyles = {};
  weights.forEach((w, i) => {
    columnStyles[i] = { cellWidth: Math.floor(available * w) };
  });

  // Slight font tweak for big lists
  const baseFont = (body.length > 200 ? 8 : 9);

  autoTable(doc, {
    startY: margins.top,
    head,
    body,
    theme: 'grid',
    tableWidth: 'wrap',              // fit columns within available width
    styles: {
      fontSize: baseFont,
      cellPadding: 4,
      overflow: 'linebreak',
      halign: 'left',
      valign: 'middle',
      minCellHeight: 16,
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: 255,
      halign: 'center',
      valign: 'middle'
    },
    columnStyles,
    margin: margins,
    didDrawPage: (data) => {
      // Footer page number
      const pageStr = `Page ${doc.getNumberOfPages()}`;
      doc.setFontSize(10);
      doc.text(pageStr, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
    }
  });

  doc.save(`students_filtered_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`);
}

// unchanged helpers you already have
function formatDateTimeForDisplay(dateTimeStr) {
  if (!dateTimeStr) return '';
  try {
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return dateTimeStr;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    console.error("Error formatting date:", e);
    return dateTimeStr;
  }
}

const getBase64FromLocalImage = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/png');
      resolve(dataURL);
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
};


export default function MasterStudent() {
  const [formData, setFormData] = useState(initialState);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [courses, setCourses] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  // fee distribution helpers
  const [distributeAcrossSem, setDistributeAcrossSem] = useState(true); // toggle
  const [courseFeeRowsAllSems, setCourseFeeRowsAllSems] = useState([]); // all sems for selected course
  // NEW: top-bar filters (right of Download)
const [semFilter, setSemFilter] = useState('ALL');     // 'ALL' | '1'..'10'
const [deptFilter, setDeptFilter] = useState('ALL');   // 'ALL' | programDescription value

  // Fee UI & data
  const [feeMode, setFeeMode] = useState('course_sem'); // 'course' | 'course_sem'
  const [feeRows, setFeeRows] = useState([]);           // rows from fee structure API for the chosen course/sem
  const [departments, setDepartments] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [semesterOptions, setSemesterOptions] = useState(
    Array.from({ length: 10 }, (_, i) => String(i + 1)) // default 1..10
  );
  const [toDeleteId, setToDeleteId] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;
  const navigate = useNavigate();
  const [showStudentInfoModal, setShowStudentInfoModal] = useState(false);
  const [currentStudentId, setCurrentStudentId] = useState('');
  const [downloadOpen, setDownloadOpen] = useState(false);

  // close download dropdown on outside click
  useEffect(() => {
    const close = () => setDownloadOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // ---- Endpoints ----
  const COURSE_LIST_URL = joinUrl(config.COURSE_ROUTE, 'list');
  // ---- Fee Structure API ----
  const FEE_STRUCT_URL = joinUrl(config.BASE_URL || '', 'api/cms-fee-structure');
  const COURSE_GET_BY_ID = (id) => joinUrl(config.COURSE_ROUTE, encodeURIComponent(id));
  const COLLEGES_URL = `${config.BASE_URL}/master-college/view-colleges`;
  const USERS_URL = joinUrl(config.MASTER_USER_ROUTE, 'users');
  const USER_ADD_URL = joinUrl(config.MASTER_USER_ROUTE, 'users');
  const USER_DELETE_ID = (userid) => joinUrl(config.MASTER_USER_ROUTE, `users/${encodeURIComponent(userid)}`);
  const STUDENT_LIST_URL = joinUrl(config.STUDENT_ROUTE, 'list');
  const STUDENT_ADD_URL = joinUrl(config.STUDENT_ROUTE, 'add');
  const STUDENT_UPDATE_ID = (id) => joinUrl(config.STUDENT_ROUTE, `update/${encodeURIComponent(id)}`);
  const STUDENT_DELETE_ID = (id) => joinUrl(config.STUDENT_ROUTE, `delete/${encodeURIComponent(id)}`);
  const STUDENT_VIEW_ID = (id) => joinUrl(config.STUDENT_ROUTE, encodeURIComponent(id));
  const DEPT_GET_BY_ID = (id) => joinUrl(config.MASTER_DEPTS_ROUTE, encodeURIComponent(id));
  const USER_DTLS_LIST_URL = joinUrl(
    config.USER_DTLS_ROUTE || `${String(config.BASE_URL || "").replace(/\/+$/, "")}/api/user-dtls`,
    'list'
  );
  const USER_DTLS_VIEW_ID = (id) => joinUrl(
    config.USER_DTLS_ROUTE || `${String(config.BASE_URL || "").replace(/\/+$/, "")}/api/user-dtls`,
    `id/${encodeURIComponent(id)}`
  );
  const STUDENT_INFORMATION_LIST_URL = joinUrl(
    config.STUDENT_INFORMATION_ROUTE || `${String(config.BASE_URL || "").replace(/\/+$/, "")}/api/student-information`,
    'list'
  );
  const STUDENT_INFORMATION_VIEW_ID = (id) => joinUrl(
    config.STUDENT_INFORMATION_ROUTE || `${String(config.BASE_URL || "").replace(/\/+$/, "")}/api/student-information`,
    encodeURIComponent(id)
  );
  const STUDENT_INFORMATION_ADD_URL = joinUrl(
    config.STUDENT_INFORMATION_ROUTE || `${String(config.BASE_URL || "").replace(/\/+$/, "")}/api/student-information`,
    'add'
  );
  const STUDENT_INFORMATION_UPDATE_ID = (id) => joinUrl(
    config.STUDENT_INFORMATION_ROUTE || `${String(config.BASE_URL || "").replace(/\/+$/, "")}/api/student-information`,
    `update/${encodeURIComponent(id)}`
  );

  /* ---------- Semester logic (no hardcoding of program names) ---------- */
  const extractSemFromCourse = (c) => {
    if (!c) return null;

    // Try common numeric fields first
    const numericFields = ['semester','course_semester','sem','defaultSemester','sem_no','currentsemester'];
    for (const k of numericFields) {
      const n = Number(c?.[k]);
      if (Number.isFinite(n) && n > 0 && n <= 10) return n;
    }

    // Fall back to parsing text like "BCA (Sem 2)" or "B.TECH Semester 7"
    const text = String(
      c?.coursedesc || c?.coursename || c?.name || c?.description || c?.courseid || ''
    );
    const m = text.match(/\bsem(?:ester)?\s*\(?\s*(\d{1,2})\s*\)?/i);
    return m ? parseInt(m[1], 10) : null;
  };

  const baseProgramKey = (c) => {
    const raw = String(
      c?.coursedesc || c?.coursename || c?.name || c?.description || c?.courseid || ''
    );
    // Remove "(Sem X)" and any explicit "Sem 3" text, normalize spaces, lower it
    return raw
      .replace(/\(.*?\)/g, '')
      .replace(/\bsem(?:ester)?\s*\d+\b/ig, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .toLowerCase();
  };

  const computeSemesterRange = (selectedCourse, allCourses) => {
    if (!selectedCourse) return { start: 1, end: 10 }; // default full range
    const groupKey = baseProgramKey(selectedCourse);
    const peers = allCourses.filter(c => baseProgramKey(c) === groupKey);

    const nums = peers.map(extractSemFromCourse).filter(n => Number.isFinite(n));
    const max = nums.length ? Math.max(...nums) : 10;           // max semester seen in that program
    const start = extractSemFromCourse(selectedCourse) || 1;     // if selected is like "Sem 3", start at 3

    return {
      start: Math.max(1, Math.min(start, 10)),
      end:   Math.max(1, Math.min(max,   10)),
    };
  };

  const ord = (n) => {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  };

  // 👉👉 NEW: your admission limitation filter
  // Only allow:
  // - B.Tech Sem 1
  // - B.Tech Sem 3
  // - Diploma Sem 1
  // - MBA Sem 1
  // - BCA Sem 1
  const isAllowedCourseForAdmission = (course) => {
    if (!course) return false;

    const sem = extractSemFromCourse(course) || 0;
    const descRaw = String(
      course.coursedesc ||
      course.coursename ||
      course.name ||
      course.description ||
      course.courseid ||
      ''
    ).toLowerCase();

    const isBtech = descRaw.includes('b.tech') || descRaw.includes('btech') || descRaw.includes('b.e') || descRaw.includes('b. e');
    const isDiploma = descRaw.includes('diploma');
    const isMBA = descRaw.includes('mba');
    const isBCA = descRaw.includes('bca');

    // B.Tech Sem 1 or Sem 3
    if (isBtech && (sem === 1 || sem === 3)) return true;

    // Diploma Sem 1
    if (isDiploma && sem === 1) return true;

    // MBA Sem 1
    if (isMBA && sem === 1) return true;

    // BCA Sem 1
    if (isBCA && sem === 1) return true;

    // else not allowed to pick in this UI
    return false;
  };

  // Fetch course description by ID
  const fetchCourseDescription = async (courseId) => {
    if (!courseId) {
      console.warn('No course ID provided for fetching');
      return;
    }
    try {
      setStatus('Fetching program details...');
      const response = await axios.get(COURSE_GET_BY_ID(courseId));
      const cd = response?.data?.course ?? response?.data ?? {};
      const normalized = {
        courseid: cd.courseid ?? courseId,
        coursedesc: cd.coursedesc ?? cd.description ?? cd.name ?? '',
      };
      setCourses(prev => {
        const exists = prev.some(c => c.courseid === normalized.courseid);
        const nextItem = { ...cd, ...normalized };
        return exists
          ? prev.map(c => (c.courseid === normalized.courseid ? nextItem : c))
          : [...prev, nextItem];
      });

      if (normalized.coursedesc) {
        setFormData(prev => ({
          ...prev,
          programDescription: normalized.coursedesc,
        }));
        setStatus('✅ Program details fetched successfully');
      } else {
        setStatus('⚠️ Program details fetched but description is missing');
      }
    } catch (error) {
      console.error('Error fetching course:', error);
      setStatus(`⛔ Failed to fetch program details: ${error.message || 'Unknown error'}`);
    }
  };

  // Fetch department description by ID
  const fetchDepartmentDescription = async (deptId) => {
    if (!deptId) {
      console.warn('No department ID provided for fetching');
      return;
    }
    try {
      setStatus('Fetching program details...');
      const response = await axios.get(DEPT_GET_BY_ID(deptId));
      const dd = response?.data?.department ?? response?.data ?? {};
      const deptDesc = dd.collegedeptdesc ?? dd.description ?? dd.name ?? '';

      setDepartments(prev => {
        const exists = prev.some(d => d.collegedeptid === dd.collegedeptid);
        return exists ? prev.map(d => (d.collegedeptid === dd.collegedeptid ? dd : d)) : [...prev, dd];
      });

      if (deptDesc) {
        setFormData(prev => ({ ...prev, programDescription: deptDesc }));
        setStatus('✅ Program details fetched successfully');
      } else {
        setStatus('⚠️ Program details fetched but description is missing');
      }
    } catch (error) {
      console.error('Error fetching department:', error);
      setStatus(`⛔ Failed to fetch program details: ${error.message || 'Unknown error'}`);
    }
  };

  // Fetch
  useEffect(() => {
    axios.get(COURSE_LIST_URL)
      .then(res => setCourses(res.data?.courses ?? res.data ?? []))
      .catch(() => setCourses([]));

    axios.get(COLLEGES_URL)
      .then(res => {
        const raw = res?.data?.colleges ?? res?.data;
        setColleges(raw ?? []);
      })
      .catch(() => setColleges([]));

    axios.get(USERS_URL)
      .then(res => setUsers(res.data?.users ?? res.data ?? []))
      .catch(() => setUsers([]));

    axios.get(config.MASTER_DEPTS_ROUTE)
      .then(res => {
        const depts = Array.isArray(res.data) ? res.data : (res.data?.departments || []);
        setDepartments(depts);
      })
      .catch(() => setDepartments([]));

    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await axios.get(STUDENT_LIST_URL);
      const rawStudents = res.data?.students ?? res.data ?? [];

      const enrichedStudents = await Promise.all(rawStudents.map(async (student) => {
        let programDesc = student.programDescription || student.programdescription || ''; // <— read either casing

        if (!programDesc && student.stu_course_id) {
          const cachedCourse = courses.find(c => c.courseid === student.stu_course_id);
          if (cachedCourse && cachedCourse.coursedesc) {
            programDesc = cachedCourse.coursedesc;
          } else {
            try {
              const courseRes = await axios.get(COURSE_GET_BY_ID(student.stu_course_id));
              const courseData = courseRes?.data?.course || courseRes?.data || {};
              programDesc = courseData.coursedesc || courseData.description || courseData.name || '';
            } catch (courseErr) {
              console.warn(`Could not fetch course for student ${student.stuid}:`, courseErr);
            }
          }
        }

        return {
          ...student,
          programDescription: programDesc || '',
        };
      }));

      setStudents(enrichedStudents);
    } catch (error) {
      console.error('Error fetching students:', error);
      setStudents([]);
    }
  };
// Unique department/program list for the filter
const deptOptions = useMemo(() => {
  const s = new Set();
  students.forEach(st => {
    const p = String(st.programDescription || '').trim();
    if (p) s.add(p);
  });
  return Array.from(s).sort();
}, [students]);

  // Compute running totals
  const feeSubtotal = useMemo(
    () => feeRows
      .filter(r => r.include)
      .reduce((sum, r) => sum + Number(r.editAmount ?? r.fee_amount ?? 0), 0),
    [feeRows]
  );

  // Total of the WHOLE course across all semesters (ignores per-row include in the table)
  const courseSubtotal = useMemo(
    () => courseFeeRowsAllSems.reduce(
      (sum, r) => sum + Number(r.fee_amount ?? r.editAmount ?? 0),
      0
    ),
    [courseFeeRowsAllSems]
  );
// Overall Balance for the whole course (Course Total − Scholarship)
const overallBalance = useMemo(() => {
  return Math.max(courseSubtotal - Number(formData.scholrshipfees || 0), 0);
}, [courseSubtotal, formData.scholrshipfees]);

  // How many semesters this program really has (derived from your course list)
  const totalSemesters = useMemo(() => {
    const selected = courses.find(c => c.courseid === formData.stu_course_id);
    const { end } = computeSemesterRange(selected, courses);
    return Math.max(1, Number(end || 8)); // fallback to 8 if unknown
  }, [formData.stu_course_id, courses]);

  // CURRENT (selected) semester as number
  const currentSemNum = useMemo(
    () => Math.max(1, Number(formData.stu_curr_semester || 1)),
    [formData.stu_curr_semester]
  );

  // EFFECTIVE SEM COUNT:
  // if distribute ON and mode is "course_sem": divide only by remaining sems (current .. total)
  // else: divide by entire totalSemesters
  const effectiveSemCount = useMemo(() => {
    if (feeMode === 'course_sem' && distributeAcrossSem) {
      // e.g. total = 6, current = 3 -> 6 - (3-1) = 4
      return Math.max(1, totalSemesters - (currentSemNum - 1));
    }
    return totalSemesters;
  }, [feeMode, distributeAcrossSem, totalSemesters, currentSemNum]);

  // Equal share FOR THIS SEM:
  const perSemShare = useMemo(() => {
    const base = Math.max(courseSubtotal - Number(formData.scholrshipfees || 0), 0);
    return Number((base / effectiveSemCount).toFixed(2));
  }, [courseSubtotal, formData.scholrshipfees, effectiveSemCount]);

  // Net Payable
  const feeNetPayable = useMemo(() => {
    if (feeMode === 'course_sem' && distributeAcrossSem) {
      return perSemShare;
    }
    return Math.max(feeSubtotal - Number(formData.scholrshipfees || 0), 0);
  }, [feeMode, distributeAcrossSem, perSemShare, feeSubtotal, formData.scholrshipfees]);

  // ✅✅ NEW: dynamic semester distribution that rebalances the OTHER semesters
  // so that (manual + auto) = (courseSubtotal - scholarship)
  const distributedSemAmounts = useMemo(() => {
    const arr = Array(10).fill(0);

    // if you are not in course_sem + distribute mode, keep the old behaviour
    // but your main problem was in this mode, so we fix that below
    if (!(feeMode === 'course_sem' && distributeAcrossSem)) {
      // old fallback: just show typed values or 0
      for (let i = 1; i <= 10; i++) {
  const key = `sem${i}`;
  const typed = formData[key];
  arr[i - 1] = (typed && String(typed).trim() !== '') ? (Number(typed) || 0) : 0;
}

      return arr;
    }

    // 1) base amount available for distribution
    const baseTotal = Math.max(courseSubtotal - Number(formData.scholrshipfees || 0), 0);

    // 2) collect manual sems (the ones user typed) only from currentSemNum .. totalSemesters
    let manualSum = 0;
    const autoSlots = [];

    for (let i = 1; i <= 10; i++) {
      const key = `sem${i}`;

      // semesters before the student actually joined → always 0
      if (i < currentSemNum) {
        arr[i - 1] = 0;
        continue;
      }
      // semesters after actual program length → 0
      if (i > totalSemesters) {
        arr[i - 1] = 0;
        continue;
      }

      const typed = formData[key];
      if (typed !== '' && typed !== null && typed !== undefined && String(typed).trim() !== '') {
        const num = Number(typed) || 0;
        arr[i - 1] = num;
        manualSum += num;
      } else {
        // this one should be auto-calculated later
        autoSlots.push(i);
      }
    }

    // 3) whatever is left after manual entries
    let remaining = Math.max(baseTotal - manualSum, 0);

    // 4) distribute to auto slots equally
    const perAuto = autoSlots.length ? Number((remaining / autoSlots.length).toFixed(2)) : 0;
    autoSlots.forEach((semNo) => {
      arr[semNo - 1] = perAuto;
    });

    return arr;
  }, [
    feeMode,
    distributeAcrossSem,
    courseSubtotal,
    formData.scholrshipfees,
    currentSemNum,
    totalSemesters,
    formData.sem1,
    formData.sem2,
    formData.sem3,
    formData.sem4,
    formData.sem5,
    formData.sem6,
    formData.sem7,
    formData.sem8,
    formData.sem9,
    formData.sem10,
  ]);
// Show manual value if present, otherwise show the live auto value
// Show manual value if present (even "0"), otherwise show the live auto value
const displayedSemValue = (n) => {
  const key = `sem${n}`;
  const v = formData[key];
  const isManual = v !== null && v !== undefined && String(v).trim() !== '';
  return isManual ? (Number(v) || 0) : (distributedSemAmounts[n - 1] || 0);
};



// When user edits sem N, freeze all earlier visible sems (currentSemNum..N-1)
// at their currently displayed values, then set sem N to the typed value.
// This makes earlier ones "stored", and rebalances the rest automatically.
const handleSemInputChange = (n, raw) => {
  const val = onlyNumericFloat(raw);
  setFormData(prev => {
    const next = { ...prev };

    // Freeze earlier visible sems if they weren't already manual
    for (let k = currentSemNum; k < n; k++) {
      const key = `sem${k}`;
      const alreadyManual = next[key] !== '' && next[key] !== null && next[key] !== undefined && String(next[key]).trim() !== '';
      if (!alreadyManual) {
        next[key] = String(distributedSemAmounts[k - 1] || 0);
      }
    }

    // Now set the edited sem to the typed value (locks this sem)
    next[`sem${n}`] = val;

    return next;
  });
};
// Reset a semester to auto-calc (make it empty so distribution fills it)
const clearSem = (n) =>
  setFormData(prev => ({ ...prev, [`sem${n}`]: '' }));

  // Load & filter fee structures for the selected program/semester
  const loadFees = async (courseId, sem, mode = feeMode) => {
    if (!courseId) {
      setFeeRows([]);
      setCourseFeeRowsAllSems([]);
      return;
    }
    try {
      const res = await axios.get(FEE_STRUCT_URL);
      const all = res.data?.feeStructures ?? res.data ?? [];

      // rows for the selected course across ALL semesters
      const rowsForCourse = all.filter(r =>
        String(r.fee_prg_id || '').trim().toLowerCase() === String(courseId).trim().toLowerCase()
      );

      // keep a copy of ALL course rows (unfiltered) for distribution math
      setCourseFeeRowsAllSems(
        rowsForCourse.map(r => ({
          ...r,
          // keep a stable editAmount so totals are consistent if you ever want to edit
          editAmount: Number(r.fee_amount || 0),
        }))
      );

      // rows to actually SHOW in the table
      let rows = rowsForCourse;
      if (mode === 'course_sem') {
        const nSem = Number(sem);
        rows = rowsForCourse.filter(r => Number(r.fee_semester_no) === nSem);
      }

      // enrich for UI
      setFeeRows(rows.map(r => ({
        ...r,
        include: true,
        editAmount: Number(r.fee_amount || 0),
      })));
    } catch {
      setFeeRows([]);
      setCourseFeeRowsAllSems([]);
    }
  };

  // Reload fees whenever Program/Sem/Mode changes
  useEffect(() => {
    if (!formData.stu_course_id) { setFeeRows([]); return; }
    loadFees(formData.stu_course_id, formData.stu_curr_semester, feeMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.stu_course_id, formData.stu_curr_semester, feeMode]);
  // Recompute whenever course list or selected course changes
  useEffect(() => {
    recomputeSemOptions(formData.stu_course_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.stu_course_id, courses]);

  // 🔽🔽 PASTE THIS WHOLE BLOCK RIGHT HERE 🔽🔽
  // After course/semester are known, normalize loaded sem values for edit mode
  useEffect(() => {
    if (!editing) return;

    const curr = Math.max(1, Number(formData.stu_curr_semester || 1));
    const total = totalSemesters;

    setFormData(prev => {
      const next = { ...prev };
      for (let i = 1; i <= 10; i++) {
        const key = `sem${i}`;
        const raw = next[key];

        if (i < curr) {
          // before joined semester: always locked to 0
          next[key] = '0';
          continue;
        }
        if (i > total) {
          // beyond program length: empty (ignored)
          next[key] = '';
          continue;
        }
        // current..total: if value is 0 or "0", treat as auto (empty)
        if (raw === 0 || raw === '0') next[key] = '';
      }
      return next;
    });
  }, [editing, formData.stu_curr_semester, totalSemesters]);
  // 🔼🔼 END OF PASTED BLOCK 🔼🔼



  const filteredCoursesBySem = useMemo(() => {
    const sem = String(formData.stu_curr_semester || '').trim();
    if (sem !== '1' && sem !== '3') return courses;
    const semNum = Number(sem);
    const norm = (s) => String(s || '').toLowerCase();
    const hits = courses.filter(c => (
      Number(c?.semester) === semNum ||
      Number(c?.course_semester) === semNum ||
      Number(c?.sem) === semNum ||
      Number(c?.defaultSemester) === semNum ||
      (c?.coursedesc && (norm(c.coursedesc).includes(`sem ${semNum}`) || norm(c.coursedesc).includes(`semester ${semNum}`)))
    ));
    return hits.length ? hits : courses;
  }, [courses, formData.stu_curr_semester]);

  // 1) Apply Semester + Department filters
const filteredByPickers = useMemo(() => {
  return students.filter(s => {
    const matchesSem =
      semFilter === 'ALL' ||
      String(s.stu_curr_semester || s.stu_curr || s.semester || '').replace(/\D/g,'') === String(semFilter);

    const pd = String(s.programDescription || '').trim();
    const matchesDept = deptFilter === 'ALL' || pd === deptFilter;

    return matchesSem && matchesDept;
  });
}, [students, semFilter, deptFilter]);

// 2) Then apply the text search box
const filtered = useMemo(() => {
  const q = query.trim().toLowerCase();
  if (!q) return filteredByPickers;
  return filteredByPickers.filter(s =>
    String(s.stuid ?? '').toLowerCase().includes(q) ||
    String(s.stuname ?? '').toLowerCase().includes(q) ||
    String(s.stuemailid ?? '').toLowerCase().includes(q) ||
    String(s.stu_rollnumber ?? '').toLowerCase().includes(q) ||
    String(s.stu_enrollmentnumber ?? '').toLowerCase().includes(q) ||
    String(s.stu_regn_number ?? '').toLowerCase().includes(q)
  );
}, [filteredByPickers, query]);

// === Download handlers that use ALL filtered rows (not just current page)
const onDownloadCSV = React.useCallback(() => {
  exportStudentsCSV(filtered);
}, [filtered]);

const onDownloadPDF = React.useCallback(() => {
  exportStudentsPDF(filtered);
}, [filtered]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const nextStuid = useMemo(() => getNextStudentId(students), [students]);

  const recomputeSemOptions = (courseId) => {
    const selected = courses.find(c => c.courseid === courseId);
    const { start, end } = computeSemesterRange(selected, courses);

    const opts = [];
    for (let i = start; i <= end; i++) opts.push(String(i));
    setSemesterOptions(opts.length ? opts : Array.from({ length: 10 }, (_, i) => String(i + 1)));

    // Keep current value valid; also set LE if semester >= 3
    setFormData(prev => {
      if (!opts.length) return prev;
      const curr = String(prev.stu_curr_semester || '');
      const valid = opts.includes(curr) ? curr : opts[0];
      const lat = Number(valid) >= 3;
      return { ...prev, stu_curr_semester: valid, stu_lat_entry: lat };
    });
  };

  // Recompute whenever course list or selected course changes
  useEffect(() => {
    recomputeSemOptions(formData.stu_course_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.stu_course_id, courses]);

  const handleChange = e => {
    const { name, value, type, checked } = e.target;

    if (name === 'stuFirstName' || name === 'stuLastName') {
      const alphabeticValue = value.replace(/[^a-zA-Z]/g, '');
      setFormData(prev => ({ ...prev, [name]: alphabeticValue }));
      return;
    }

    // --- IMPORTANT: if user is typing in sem/cgpa/scholarship, we still store it as before
    if (name.startsWith('sem') || name === 'cgpa' || name === 'scholrshipfees') {
      const val = onlyNumericFloat(value);
      setFormData(prev => ({ ...prev, [name]: val }));
      return;
    }

    // --- NEW: remarks as checkbox boolean ---
    if (name === 'remarks') {
      setFormData(prev => ({ ...prev, remarks: !!checked }));
      return;
    }

    if (name === 'stuguardianFirstName' || name === 'stuguardianLastName') {
      const alphabeticValue = value.replace(/[^a-zA-Z]/g, '');
      setFormData(prev => ({ ...prev, [name]: alphabeticValue }));
      return;
    }
    if (name === 'stu_mother_firstname' || name === 'stu_mother_lastname') {
  const alphabeticValue = value.replace(/[^a-zA-Z ]/g, '');
  setFormData(prev => ({ ...prev, [name]: alphabeticValue }));
  return;
}

    if (name === 'stuguardianemailid') {
      const lower = String(value || '').trim().toLowerCase();
      setFormData(prev => ({ ...prev, stuguardianemailid: lower }));
      return;
    }

    if (name === 'stumob2' || name === 'stuguardianmob1' || name === 'stuguardianmob2') {
      const digits = only10Digits(value);
      setFormData(prev => ({ ...prev, [name]: digits }));
      return;
    }

    if (name === 'stu_enrollmentnumber' || name === 'stu_rollnumber' || name === 'stu_regn_number') {
      const numericValue = onlyDigits(value);
      setFormData(prev => ({ ...prev, [name]: numericValue }));
      return;
    }

    setFormData(prev => {
      const updated = { ...prev, [name]: type === 'checkbox' ? checked : value };

      if (name === 'sameAsCurrent') {
        if (checked) {
          updated.addrPermanent = prev.addrCurrent || '';
        }
        return updated;
      }

      if (name === 'addrCurrent' && prev.sameAsCurrent) {
        updated.addrPermanent = value;
      }

      if (name === 'stu_curr_semester') {
        const n = Number(value);
        updated.stu_lat_entry = Number.isFinite(n) && n >= 3;
        return updated;
      }

      if (name === 'stu_course_id') {
        const courseId = value;
        if (courseId) {
          const cachedCourse = courses.find(c => c.courseid === courseId);
          if (cachedCourse && (cachedCourse.coursedesc || cachedCourse.name)) {
            updated.programDescription = cachedCourse.coursedesc || cachedCourse.name || '';
          } else {
            setTimeout(() => fetchCourseDescription(courseId), 0);
          }
          // NEW: recompute semester options for this course
          setTimeout(() => recomputeSemOptions(courseId), 0);
        } else {
          updated.programDescription = '';
          setTimeout(() => recomputeSemOptions(''), 0);
        }
      }

      return updated;
    });
  };

  const handle = async e => {
    e.preventDefault();
    setStatus(editing ? 'Updating...' : 'Submitting...');

    const mobile1 = String(formData.stumob1 || '');
    if (!/^\d{10}$/.test(mobile1)) {
      setStatus('⛔ Password (Mobile 1) must be exactly 10 digits.');
      return;
    }

    const email = String(formData.stuemailid || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.(com|in)$/i.test(email)) {
      setStatus('⛔ Enter a valid student email ending with .com or .in (e.g., user@example.com).');
      return;
    }

    const gEmail = String(formData.stuguardianemailid || '').trim();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.(com|in)$/.test(gEmail)) {
      setStatus('⛔ Guardian email must be lowercase, include @, and end with .com or .in (e.g., guardian@example.in).');
      return;
    }

    const compositeAddress = formatStuAddress({
      addrCurrent: formData.addrCurrent,
      addrPermanent: formData.addrPermanent,
      pinCode: formData.pinCode,
    });

    // 👉 when distribution is ON, use user-typed semX if present, otherwise fall back to auto (already dynamic)
    const semPayload = {};
    for (let i = 1; i <= 10; i++) {
      const key = `sem${i}`;
      const typed = formData[key];

      if (i < currentSemNum) {
        // before joined semester → 0
        semPayload[key] = 0;
      } else if (typed !== '' && typed !== null && typed !== undefined && String(typed).trim() !== '') {
  // any non-empty value (including "0") is manual
  semPayload[key] = Number(typed) || 0;


      } else if (feeMode === 'course_sem' && distributeAcrossSem && i <= totalSemesters) {
        // now our ui shows dynamic values — we can recompute the exact auto one here too
        // dynamic remaining:
        const baseTotal = Math.max(courseSubtotal - Number(formData.scholrshipfees || 0), 0);
        // sum of other manual values:
        let otherManual = 0;
        for (let j = currentSemNum; j <= totalSemesters; j++) {
          const k = `sem${j}`;
          if (j === i) continue;
          const tv = formData[k];
          if (tv && String(tv).trim() !== '') {
            otherManual += Number(tv) || 0;
          }
        }
        const remaining = Math.max(baseTotal - otherManual, 0);
        // how many auto slots?
        let autoCount = 0;
        for (let j = currentSemNum; j <= totalSemesters; j++) {
          const k = `sem${j}`;
          if (j === i) continue;
          const tv = formData[k];
          if (!tv || String(tv).trim() === '') autoCount++;
        }
        // including this i (the one we are filling) as 1 auto
        const finalCount = autoCount + 1;
        semPayload[key] = finalCount > 0 ? Number((remaining / finalCount).toFixed(2)) : 0;
      } else {
        semPayload[key] = 0;
      }
    }
const motherFullName = [
  (formData.stu_mother_firstname || '').trim(),
  (formData.stu_mother_lastname || '').trim(),
].filter(Boolean).join(' ');

    const payload = {
      ...formData,
      programdescription: formData.programDescription,  // <— map FE -> DB
      stuname: `${formData.stuFirstName} ${formData.stuLastName}`.trim(),
      studob: formData.studob ? formData.studob.slice(0,19) : null,
 stuadmissiondt: formData.stuadmissiondt ? formData.stuadmissiondt.slice(0,19) : null,
      stu_lat_entry: !!formData.stu_lat_entry,
      stuvalid: !!formData.stuvalid,
      stuaddress: compositeAddress,
      stuparentname: `${formData.stuguardianFirstName} ${formData.stuguardianLastName}`.trim(),
      stu_mother_name: motherFullName,
      stuparentemailid: gEmail,
      stuprentmob1: formData.stuguardianmob1,
      stuprentmob2: formData.stuguardianmob2,
      scholrshipfees: formData.scholrshipfees,
      stuparentaddress: formData.stuguardianaddress,

      // --- semester fees mapped to API (now editable per sem) ---
      sem1:  semPayload.sem1,
      sem2:  semPayload.sem2,
      sem3:  semPayload.sem3,
      sem4:  semPayload.sem4,
      sem5:  semPayload.sem5,
      sem6:  semPayload.sem6,
      sem7:  semPayload.sem7,
      sem8:  semPayload.sem8,
      sem9:  semPayload.sem9,
      sem10: semPayload.sem10,
      cgpa: Number(formData.cgpa || 0),
      remarks: !!formData.remarks,
      admission_officer_name: formData.admission_officer_name || '',

      // --- IMPORTANT: tell backend how many semesters this program actually has ---
      total_semesters: totalSemesters,

      // NEW: fee calculation snapshot (non-breaking, safe if API ignores)
      seemfees: Number(feeSubtotal.toFixed(2)),                 // raw sum of included fee heads
      fee_net_payable: Number(feeNetPayable.toFixed(2)),        // this is for CURRENT sem
      fee_calc_mode: feeMode,
      program_fee_override: Math.max(0, Math.round(courseSubtotal)), // whole course total
      fee_calc_snapshot: JSON.stringify(
        feeRows.map(r => ({
          id: r.fee_struct_id,
          head: r.fee_head,
          sem: r.fee_semester_no,
          mandatory: !!r.fee_is_mandatory,
          amount: Number(r.editAmount || r.fee_amount || 0),
          include: !!r.include
        }))
      ),
    };

    try {
      if (editing) {
        await axios.put(STUDENT_UPDATE_ID(editId), payload);
        setStatus('✅ Student updated!');
      } else {
        const userid = email;
        const password = mobile1;
        if (!userid || !password) {
          setStatus('⛔ User ID (email) and Password are required');
          return;
        }

        await axios.post(USER_ADD_URL, {
          userid,
          userpwd: password,
          userroles: 'STU-CURR',
          usercreated: new Date().toISOString(),
          userlastlogon: new Date().toISOString(),
          useractive: true,
        });

        const confirmPwd = window.prompt(
          `Verify password for student login\nLogin: ${userid}\nRe-enter password:`
        );
        if (confirmPwd !== password) {
          try {
            await axios.delete(USER_DELETE_ID(userid));
          } catch {}
          setStatus('⛔ Password verification failed. User creation rolled back.');
          return;
        }

        await axios.post(STUDENT_ADD_URL, {
          ...payload,
          stuuserid: userid,
        });

        try {
          const ures = await axios.get(USERS_URL);
          setUsers(ures.data?.users ?? ures.data ?? []);
        } catch {}

        setStatus('✅ User verified and Student added!');

        try {
          sessionStorage.setItem('user_dtls_prefill_userid', userid);
        } catch {}

        setShowModal(false);
        navigate('/user-dtls');
      }

      setFormData(initialState);
      setEditing(false);
      setEditId(null);
      fetchStudents();
    } catch (err) {
      setStatus('⛔ ' + (err.response?.data?.message || err.response?.data?.error || 'Failed to submit student'));
    }
  };

  const openAddModal = () => {
    setFormData({ ...initialState, stuid: nextStuid });
    setEditing(false);
    setEditId(null);
    setShowModal(true);
    setStatus('');
  };

  const openEditModal = async (rowStu) => {
    setStatus('Loading full record...');
    const id = rowStu?.stuid;
    let full = null;
    try {
      const res = await axios.get(STUDENT_VIEW_ID(id));
      full = res?.data?.student || res?.data || null;
      if (full) {
        full.programDescription = full.programDescription || full.programdescription || '';
      }
    } catch {
      full = rowStu || null;
    }

    if (!full) {
      setStatus('⛔ Could not load student record');
      return;
    }

    const stuname = String(full.stuname || '').trim();
    const [first = '', last = ''] = stuname.split(' ');
    const parentName = String(full.stuparentname || '').trim();
    const [gfirst = '', glast = ''] = parentName.split(' ');
    const motherFull = String(full.stu_mother_name || '').trim();
const motherParts = motherFull.split(' ');
const motherFirst = motherParts[0] || '';
const motherLast = motherParts.slice(1).join(' ') || '';

    const parsed = parseStuAddress(full.stuaddress);
    const _sameAs = !!parsed.addrCurrent && parsed.addrCurrent === parsed.addrPermanent;

    setFormData({
      ...initialState,
      ...full,
      stuFirstName: first,
      stuLastName: last,
      stuguardianFirstName: gfirst,
      stuguardianLastName: glast,
      stu_mother_firstname: motherFirst,   // 👈 NEW
  stu_mother_lastname: motherLast,     // 👈 NEW
  admission_officer_name: full.admission_officer_name || '',
      stuguardianemailid: (full.stuparentemailid || '').toLowerCase(),
      stuguardianmob1: full.stuprentmob1 || full.stuprentmob1 || '',
      stuguardianmob2: full.stuprentmob2 || full.stuprentmob2 || '',
      stuguardianaddress: full.stuparentaddress || '',
      addrCurrent: parsed.addrCurrent,
      addrPermanent: parsed.addrPermanent,
      pinCode: parsed.pinCode,
      sameAsCurrent: _sameAs,
      scholrshipfees: full.scholrshipfees || '',
      studob: full.studob ? String(full.studob).slice(0, 16) : '',
      stuadmissiondt: full.stuadmissiondt ? String(full.stuadmissiondt).slice(0, 16) : '',
      stu_lat_entry: String(full.stu_curr_semester || '') === '3',
      // --- bring sem/cgpa/remarks from DB into form ---
      sem1: String(full.sem1 ?? ''),
      sem2: String(full.sem2 ?? ''),
      sem3: String(full.sem3 ?? ''),
      sem4: String(full.sem4 ?? ''),
      sem5: String(full.sem5 ?? ''),
      sem6: String(full.sem6 ?? ''),
      sem7: String(full.sem7 ?? ''),
      sem8: String(full.sem8 ?? ''),
      sem9: String(full.sem9 ?? ''),
      sem10: String(full.sem10 ?? ''),
      cgpa: String(full.cgpa ?? ''),
      remarks: !!full.remarks,
      balance: full.balance ?? '',
    });

    setTimeout(() => recomputeSemOptions(full.stu_course_id || ''), 0);

    setEditing(true);
    setEditId(id);
    setShowModal(true);
    setStatus('');
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData(initialState);
    setEditing(false);
    setEditId(null);
    setStatus('');
  };

  const askDelete = (id) => {
    setToDeleteId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!toDeleteId) return;
    try {
      await axios.delete(STUDENT_DELETE_ID(toDeleteId));
      setStudents(prev => prev.filter(s => s.stuid !== toDeleteId));
    } catch {
      // soft fail
    } finally {
      setShowDeleteModal(false);
      setToDeleteId(null);
    }
  };

  const goto = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  const openUserDtls = (stu) => {
    const uid = String(stu.stuuserid || stu.stuemailid || '').trim();
    if (!uid) {
      setStatus('⛔ No linked user for this student.');
      return;
    }
    try {
      sessionStorage.setItem('user_dtls_prefill_userid', uid);
    } catch {}
    navigate('/user-dtls');
  };

  const goToStudentInfo = (student) => {
    navigate('/studentinformation');
  };

  // ------- WHOLE-DB DOWNLOAD HELPERS -------
  const fetchAllStudentsFresh = async () => {
    try {
      const res = await axios.get(STUDENT_LIST_URL);
      const raw = res?.data?.students ?? res?.data ?? [];

      const enriched = await Promise.all(raw.map(async (s) => {
        if (s.programDescription || !s.stu_course_id) return s;
        try {
          const cr = await axios.get(COURSE_GET_BY_ID(s.stu_course_id));
          const c = cr?.data?.course || cr?.data || {};
          return { ...s, programDescription: c.coursedesc || c.description || c.name || '' };
        } catch {
          return s;
        }
      }));

      return enriched;
    } catch (e) {
      console.error('Download fetch error:', e);
      return [];
    }
  };

const downloadAllCSV = async () => {
  setStatus('Preparing CSV...');
  const list = await fetchAllStudentsFresh();

  // ----- Excel delimiter hint (forces comma as separator in Excel) -----
  const SEP_HINT = 'sep=,';

  // ----- Headers (MUST mirror row order) -----
  const headers = [
    'ID',
    'Name',
    'Email',
    'Mobile',
    'Roll No',
    'Enrollment',
    'Semester',
    'Section',
    'Program Description',
    // 'Status',
    'Mother Name',
    'Gurdian Email',
    'Guardian Mobile',
    'Admission Officer Name',
    'Admission Date'
  ];

  const escapeCSV = (v = '') => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rows = list.map((s) => {
    // Program description (support both casings)
    const programDescription = s.programdescription ?? s.programDescription ?? '';

    // Mother email: prefer explicit, fallback to parent email
    const motherEmail = s.stu_mother_email ?? s.stuparentemailid ?? '';

    // Guardian mobile: try several likely keys in order
    const guardianMobile =
      s.stuprentmob1 ?? s.stuprentmob2 ??
      s.stuparentmob1 ?? s.stuparentmob2 ??
      s.guardian_mobile ?? s.guardianMobile ?? '';

    return [
      s.stuid ?? '',
      s.stuname ?? '',
      s.stuemailid ?? '',
      s.stumob1 ?? '',
      s.stu_rollnumber ?? '',
      s.stu_enrollmentnumber ?? '',
      s.stu_curr_semester ?? '',
      s.stu_section ?? '',
      programDescription,
      (s.stuvalid ? 'Active' : 'Inactive'),
      s.stu_mother_name ?? '',
      motherEmail,
      guardianMobile,
      s.admission_officer_name ?? '',
      // If your formatter is unavailable, fall back to ISO date
      (typeof formatDateTimeForDisplay === 'function'
        ? (formatDateTimeForDisplay(s.stuadmissiondt) || '')
        : (s.stuadmissiondt ? new Date(s.stuadmissiondt).toISOString().slice(0,10) : '')
      )
    ];
  });

  // Build CSV text
  const csvLines = [
    SEP_HINT,                                              // <-- makes Excel respect commas
    headers.map(escapeCSV).join(','),                      // header row
    ...rows.map((r) => r.map(escapeCSV).join(','))         // data rows
  ];
  const csv = csvLines.join('\r\n');

  // Add UTF-8 BOM so Excel detects encoding properly
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `students_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setStatus('✅ CSV downloaded.');
};


  const downloadAllPDF = async () => {
  setStatus('Preparing PDF...');
  const list = await fetchAllStudentsFresh();

  // Landscape A3 so all columns fit comfortably
  const doc = new jsPDF('l', 'pt', 'a3');

  // ---- Header
  doc.setFontSize(16);
  doc.text('Student Management - Full Export', 40, 40);
  doc.setFontSize(12);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 60);
  doc.text('All Students', 40, 80);

  // ---- Column definitions (mirrors CSV - no Status/Parent/Scholarship)
  const columns = [
    { header: 'ID',                       dataKey: 'stuid' },
    { header: 'Name',                     dataKey: 'stuname' },
    { header: 'Email',                    dataKey: 'stuemailid' },
    { header: 'Mobile',                   dataKey: 'stumob1' },
    { header: 'Roll No',                  dataKey: 'stu_rollnumber' },
    { header: 'Enrollment',               dataKey: 'stu_enrollmentnumber' },
    { header: 'Semester',                 dataKey: 'stu_curr_semester' },
    { header: 'Section',                  dataKey: 'stu_section' },
    { header: 'Program Description',      dataKey: 'programDescription' },
    { header: 'Mother Name',              dataKey: 'stu_mother_name' },
    { header: 'Guardian Email',           dataKey: 'guardianEmail' },
    { header: 'Guardian Mobile',          dataKey: 'guardianMobile' },
    { header: 'Admission Officer Name',   dataKey: 'admission_officer_name' },
    { header: 'Admission Date',           dataKey: 'stuadmissiondtFormatted' },
  ];

  // ---- Rows (normalize fields + format date)
  const rows = list.map((s) => {
    const programDescription = s.programdescription ?? s.programDescription ?? '';
    const guardianEmail = s.stu_mother_email ?? s.stuparentemailid ?? '';
    const guardianMobile =
      s.stuprentmob1 ?? s.stuprentmob2 ??
      s.stuparentmob1 ?? s.stuparentmob2 ??
      s.guardian_mobile ?? s.guardianMobile ?? '';
    const formattedDate =
      typeof formatDateTimeForDisplay === 'function'
        ? (formatDateTimeForDisplay(s.stuadmissiondt) || '')
        : (s.stuadmissiondt ? new Date(s.stuadmissiondt).toISOString().slice(0, 10) : '');

    return {
      stuid: s.stuid ?? '',
      stuname: s.stuname ?? '',
      stuemailid: s.stuemailid ?? '',
      stumob1: s.stumob1 ?? '',
      stu_rollnumber: s.stu_rollnumber ?? '',
      stu_enrollmentnumber: s.stu_enrollmentnumber ?? '',
      stu_curr_semester: s.stu_curr_semester ?? '',
      stu_section: s.stu_section ?? '',
      programDescription,
      stu_mother_name: s.stu_mother_name ?? '',
      guardianEmail,
      guardianMobile,
      admission_officer_name: s.admission_officer_name ?? '',
      stuadmissiondtFormatted: formattedDate,
    };
  });

  // ---- Column widths (fit all columns on page width)
  const margins = { left: 30, right: 30, top: 100, bottom: 30 };
  const pageWidth = doc.internal.pageSize.getWidth();
  const available = pageWidth - margins.left - margins.right;

  // Weights sum to ~1.00 to span the width
  const widthWeights = [
    0.045, // ID
    0.090, // Name
    0.120, // Email
    0.060, // Mobile
    0.060, // Roll No
    0.070, // Enrollment
    0.045, // Semester
    0.045, // Section
    0.150, // Program Description
    0.065, // Mother Name
    0.085, // Guardian Email
    0.055, // Guardian Mobile
    0.075, // Admission Officer Name
    0.035, // Admission Date
  ]; // total ≈ 1.00

  const columnStyles = {};
  widthWeights.forEach((w, i) => {
    columnStyles[i] = { cellWidth: Math.floor(available * w) };
  });

  // Slightly smaller fonts if many rows; keep headers readable
  const baseFont = list.length > 200 ? 8 : 9;

  autoTable(doc, {
    startY: margins.top,
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => r[c.dataKey] ?? '')),
    theme: 'grid',
    tableWidth: 'auto',
    styles: {
      fontSize: baseFont,
      cellPadding: 4,
      overflow: 'linebreak',     // wrap long text within the cell
      halign: 'left',
      valign: 'middle',
      minCellHeight: 16,
      lineWidth: 0.2,
    },
    headStyles: {
      fontSize: baseFont + 1,
      fillColor: [30, 58, 138],
      textColor: 255,
      halign: 'center',
      valign: 'middle',
    },
    columnStyles,
    margin: margins,
    didDrawPage: (data) => {
      const pageStr = `Page ${doc.getNumberOfPages()}`;
      doc.setFontSize(10);
      doc.text(pageStr, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
    },
  });

  doc.save(`students_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`);
  setStatus('✅ PDF downloaded.');
};


  const downloadStudentPDF = async (student) => {
    setStatus('Generating PDF...');
    try {
      const studentId = student.stuid;
      let fullStudent = student;

      try {
        const res = await axios.get(STUDENT_VIEW_ID(studentId));
        fullStudent = res?.data?.student || res?.data || fullStudent;
      } catch (fetchErr) {
        console.warn("Could not fetch full student details, using row ", fetchErr);
      }

      let courseDescription = fullStudent.programDescription;
      if (!courseDescription && fullStudent.stu_course_id) {
        try {
          const courseRes = await axios.get(COURSE_GET_BY_ID(fullStudent.stu_course_id));
          const courseData = courseRes?.data?.course || courseRes?.data || {};
          courseDescription = courseData.coursedesc || courseData.description || courseData.name || '';
        } catch (courseErr) {
          console.warn("Could not fetch course details: ", courseErr);
        }
      }

      const parsedAddress = parseStuAddress(fullStudent.stuaddress);

      const userId = fullStudent.stuuserid || fullStudent.stuemailid;
      if (!userId) {
        throw new Error("Student user ID not found.");
      }

      const userDtlsRes = await axios.get(USER_DTLS_LIST_URL);
      const allUserDtls = userDtlsRes.data?.user_dtls || [];

      const userSpecificDtls = allUserDtls.filter(dtls => dtls.usr_usr_id === userId);

      let aadharId = '';
      let abcId = '';
      let pictureData = null;
      let signatureData = null;

      const frontendSignatureData = getStoredSignatureData(userId);
      if (frontendSignatureData) {
        signatureData = frontendSignatureData;
      }

      for (const dtls of userSpecificDtls) {
        const desc = (dtls.usr_dtls_desc || '').toLowerCase();
        if (desc === 'aadhaar card') {
          aadharId = dtls.usr_aadharno || dtls.usr_dtls_value || '';
        } else if (desc === 'abc id') {
          abcId = dtls.usr_abc_id || dtls.usr_dtls_value || '';
        } else if (desc.includes('picture') && dtls.usr_dtls_file_base64) {
          pictureData = dtls.usr_dtls_file_base64;
        } else if (desc.includes('signature') && dtls.usr_dtls_file_base64 && !signatureData) {
          signatureData = dtls.usr_dtls_file_base64;
        }
      }

      if (!aadharId) {
        const aadharEntry = userSpecificDtls.find(dtls => dtls.usr_aadharno);
        if (aadharEntry) aadharId = aadharEntry.usr_aadharno;
      }

      if (!abcId) {
        const abcEntry = userSpecificDtls.find(dtls => dtls.usr_abc_id);
        if (abcEntry) abcId = abcEntry.usr_abc_id;
      }

      const pictureEntry = userSpecificDtls.find(
        dtls => (dtls.usr_dtls_desc || '').toLowerCase().includes('picture') && !dtls.usr_dtls_file_base64
      );

      if (pictureEntry && pictureEntry.usr_dtls_id && !pictureData) {
        try {
          const picRes = await axios.get(USER_DTLS_VIEW_ID(pictureEntry.usr_dtls_id));
          pictureData = picRes.data?.user_dtls?.usr_dtls_file_base64;
        } catch (picFetchErr) {
          console.warn("Could not fetch full picture ", picFetchErr);
        }
      }

      let collegeName = 'Swami Vivekananda Institute of Science and Technology';
      if (fullStudent.stu_inst_id) {
        const matchedCollege = colleges.find(c => c.collegeid === fullStudent.stu_inst_id);
        if (matchedCollege && matchedCollege.collegename) {
          collegeName = matchedCollege.collegename;
        }
      }

      let logoBase64 = null;
      try {
        logoBase64 = await getBase64FromLocalImage('public/images/logo.png');
      } catch (logoErr) {
        console.warn("Could not load college logo:", logoErr);
      }

      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
        <title>Student Information Report - ${fullStudent.stuid}</title>
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Roboto', Arial, sans-serif; color:#2c3e50; background:#fff; line-height:1.6; padding:0; margin:0; }
        .container { max-width:210mm; margin:0 auto; padding:10mm; background:white; }
        .header { display:flex; align-items:center; padding:20px 0; border-bottom:3px solid #1e3a8a; margin-bottom:30px; background:linear-gradient(135deg,#f8f9fa 0%,#e9ecef 100%); border-radius:8px 8px 0 0; padding:25px; }
        .logo-container { width:100px; height:100px; margin-right:25px; display:flex; align-items:center; justify-content:center; background:white; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1); padding:10px; }
        .logo-container img { max-width:100%; max-height:100%; object-fit:contain; }
        .header-text { flex:1; }
        .college-name { font-size:24px; font-weight:700; color:#1e3a8a; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.5px; }
        .document-title { font-size:18px; color:#495057; font-weight:500; margin-bottom:5px; }
        .student-id-header { font-size:14px; color:#6c757d; background:#fff; display:inline-block; padding:4px 12px; border-radius:4px; border:1px solid #dee2e6; margin-top:5px; }
        .photo-header { position:absolute; right:30px; top:30px; width:120px; height:150px; border:2px solid #dee2e6; border-radius:6px; overflow:hidden; background:#f8f9fa; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.1); }
        .photo-header img { width:100%; height:100%; object-fit:cover; }
        .photo-placeholder-text { color:#adb5bd; font-size:12px; text-align:center; padding:10px; }
        .section { margin-bottom:25px; background:#fff; border-radius:8px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid #e9ecef; }
        .section-title { font-size:16px; font-weight:600; color:#1e3a8a; margin-bottom:15px; padding-bottom:8px; border-bottom:2px solid #e3f2fd; text-transform:uppercase; letter-spacing:.5px; }
        .details-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
        .detail-item { display:flex; padding:8px 0; border-bottom:1px solid #f1f3f5; }
        .detail-label { font-weight:500; color:#495057; min-width:140px; font-size:13px; }
        .detail-value { flex:1; color:#212529; font-size:13px; font-weight:400; }
        .detail-value:empty::after { content:"—"; color:#adb5bd; }
        .detail-item.full-width { grid-column:1 / -1; }
        .signature-section { margin-top:40px; display:flex; justify-content:space-between; align-items:flex-end; padding:20px; background:#f8f9fa; border-radius:8px; border:1px solid #dee2e6; }
        .signature-block { text-align:center; min-width:200px; }
        .signature-label { font-size:12px; color:#6c757d; margin-bottom:8px; font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
        .signature-box { width:180px; height:60px; border:1px solid #adb5bd; border-radius:4px; background:white; margin:0 auto 8px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .signature-box img { max-width:100%; max-height:100%; object-fit:contain; }
        .signature-name { font-size:11px; color:#495057; border-top:1px solid #495057; padding-top:4px; margin-top:8px; min-width:150px; display:inline-block; }
        .footer { margin-top:30px; padding-top:20px; border-top:2px solid #e9ecef; display:flex; justify-content:space-between; align-items:center; color:#6c757d; font-size:11px; }
        .status-badge { display:inline-block; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:500; margin-left:8px; }
        .status-badge.active { background:#d4edda; color:#155724; border:1px solid #c3e6cb; }
        .status-badge.inactive { background:#f8d7da; color:#721c24; border:1px solid #f5c6cb; }
        @media print {
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .container { padding:0; }
          .section { break-inside: avoid; }
        }
        .sem-auto-btn{
  border:1px solid #d1d5db;
  background:#f9fafb;
  border-radius:6px;
  padding:2px 8px;
  font-weight:600;
  cursor:pointer;
}
.sem-auto-btn:hover{ background:#eef2f7; }

        </style>
        </head>
        <body>
        <div class="container">
        <div class="header" style="position: relative;">
          <div class="logo-container">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Institute Logo" />` : '<div style="font-size: 12px; color: #adb5bd;">LOGO</div>'}
          </div>
          <div class="header-text">
            <div class="college-name">${collegeName}</div>
            <div class="document-title">STUDENT INFORMATION REPORT</div>
            <div class="student-id-header">Student ID: ${fullStudent.stuid || 'N/A'}</div>
          </div>
          ${pictureData ? `
            <div class="photo-header">
              <img src="${makeBlobUrl(pictureData, detectMimeFromBase64(pictureData))}" alt="Student Photo" />
            </div>
          ` : `
            <div class="photo-header">
              <div class="photo-placeholder-text">Photo<br/>Not<br/>Available</div>
            </div>
          `}
        </div>

        <div class="section">
          <div class="section-title">Personal Information</div>
          <div class="details-grid">
            <div class="detail-item"><span class="detail-label">Full Name:</span><span class="detail-value"><strong>${fullStudent.stuname || ''}</strong></span></div>
            <div class="detail-item"><span class="detail-label">Gender:</span><span class="detail-value">${fullStudent.stugender || ''}</span></div>
            <div class="detail-item">
              <span class="detail-label">Scholarship Fees:</span>
              <span class="detail-value">${fullStudent.scholrshipfees || ''}</span>
            </div>
            <div class="detail-item"><span class="detail-label">Date of Birth:</span><span class="detail-value">${formatDateTimeForDisplay(fullStudent.studob)}</span></div>
            <div class="detail-item"><span class="detail-label">Category:</span><span class="detail-value">${fullStudent.stucategory || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Caste:</span><span class="detail-value">${fullStudent.stucaste || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Email Address:</span><span class="detail-value">${fullStudent.stuemailid || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Primary Contact:</span><span class="detail-value">${fullStudent.stumob1 || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Secondary Contact:</span><span class="detail-value">${fullStudent.stumob2 || ''}</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Academic Information</div>
          <div class="details-grid">
            <div class="detail-item"><span class="detail-label">Enrollment Number:</span><span class="detail-value"><strong>${fullStudent.stu_enrollmentnumber || ''}</strong></span></div>
            <div class="detail-item"><span class="detail-label">Roll Number:</span><span class="detail-value"><strong>${fullStudent.stu_rollnumber || ''}</strong></span></div>
            <div class="detail-item"><span class="detail-label">Registration Number:</span><span class="detail-value">${fullStudent.stu_regn_number || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Admission Date:</span><span class="detail-value">${formatDateTimeForDisplay(fullStudent.stuadmissiondt)}</span></div>
            <div class="detail-item full-width"><span class="detail-label">Program/Course:</span><span class="detail-value"><strong>${courseDescription || fullStudent.stu_course_id || ''}</strong></span></div>
            <div class="detail-item"><span class="detail-label">Current Semester:</span><span class="detail-value">${fullStudent.stu_curr_semester || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Section:</span><span class="detail-value">${fullStudent.stu_section || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Lateral Entry:</span><span class="detail-value">${fullStudent.stu_lat_entry ? 'Yes' : 'No'}</span></div>
            <div class="detail-item"><span class="detail-label">Status:</span><span class="detail-value">${fullStudent.stuvalid ? '<span class="status-badge active">ACTIVE</span>' : '<span class="status-badge inactive">INACTIVE</span>'}</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Identity Information</div>
          <div class="details-grid">
            <div class="detail-item"><span class="detail-label">Aadhaar Number:</span><span class="detail-value">${aadharId || ''}</span></div>
            <div class="detail-item"><span class="detail-label">ABC ID:</span><span class="detail-value">${abcId || ''}</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Address Information</div>
          <div class="details-grid">
            <div class="detail-item full-width"><span class="detail-label">Current Address:</span><span class="detail-value">${parsedAddress.addrCurrent || ''}</span></div>
            <div class="detail-item full-width"><span class="detail-label">Permanent Address:</span><span class="detail-value">${parsedAddress.addrPermanent || ''}</span></div>
            <div class="detail-item"><span class="detail-label">PIN Code:</span><span class="detail-value">${parsedAddress.pinCode || ''}</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Guardian/Parent Information</div>
          <div class="details-grid">
            <div class="detail-item"><span class="detail-label">Guardian Name:</span><span class="detail-value">${(fullStudent.stuparentname || '').trim() || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Guardian Email:</span><span class="detail-value">${fullStudent.stuparentemailid || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Guardian Contact 1:</span><span class="detail-value">${fullStudent.stuprentmob1 || ''}</span></div>
            <div class="detail-item"><span class="detail-label">Guardian Contact 2:</span><span class="detail-value">${fullStudent.stuprentmob2 || ''}</span></div>
            <div class="detail-item full-width"><span class="detail-label">Guardian Address:</span><span class="detail-value">${fullStudent.stuparentaddress || ''}</span></div>
          </div>
        </div>

        <div class="signature-section">
          <div class="signature-block">
            <div class="signature-label">Student Signature</div>
            <div class="signature-box">
              ${signatureData ? `<img src="${makeBlobUrl(signatureData, detectMimeFromBase64(signatureData))}" alt="Student Signature" />` : '<div style="font-size: 10px; color: #adb5bd;">Not Available</div>'}
            </div>
            <div class="signature-name">${fullStudent.stuname || ''}</div>
          </div>
          <div class="signature-block">
            <div class="signature-label">Authorized Signatory</div>
            <div class="signature-box"></div>
            <div class="signature-name">Office Use Only</div>
          </div>
        </div>

        <div class="footer">
          <div>This is a computer-generated document.</div>
          <div>Generated on: ${new Date().toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
          })}<br/>Page 1 of 1</div>
        </div>
        </div>
        </body>
        </html>
      `);
      printWindow.document.close();

      printWindow.onload = () => {
        setTimeout(() => {
          html2canvas(printWindow.document.body, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
              position = heightLeft - imgHeight;
              pdf.addPage();
              pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
              heightLeft -= pageHeight;
            }

            const filename = `Student_Report_${fullStudent.stuid || 'Unknown'}_${new Date().getTime()}.pdf`;
            pdf.save(filename);
            printWindow.close();
            setStatus('✅ PDF generated and downloaded successfully!');
          }).catch(err => {
            console.error("Error generating PDF:", err);
            setStatus('⛔ Failed to generate PDF.');
            printWindow.close();
          });
        }, 500);
      };
    } catch (err) {
      console.error("Error in downloadStudentPDF:", err);
      setStatus('⛔ Failed to generate PDF: ' + (err.message || 'Unknown error'));
    }
  };

  const closeStudentInfoModal = () => {
    setShowStudentInfoModal(false);
    setCurrentStudentId('');
  };

  return (
    <div className="mu-page">
      {/* lightweight styles for the download dropdown + hover */}
      <style>{`
        .dl-wrap { position: relative; }
        .dl-btn { background:#ffffff; border:1px solid #d0d7de; color:#1f2937; padding:10px 14px; border-radius:10px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px; transition:all .15s ease; }
        .dl-btn:hover { background:#f3f4f6; border-color:#c4ccd4; transform: translateY(-1px); }
        .dl-menu { position:absolute; right:0; top:110%; background:#fff; border:1px solid #e5e7eb; border-radius:10px; box-shadow:0 10px 20px rgba(0,0,0,.08); min-width:160px; padding:6px; z-index:20; }
        .dl-item { width:100%; text-align:left; background:transparent; border:none; cursor:pointer; padding:10px 12px; border-radius:8px; font-weight:500; color:#111827; }
        .dl-item:hover { background:#f3f4f6; }
      `}</style>

      <div className="mu-container">
        <h2 className="mu-title">Student Management</h2>

        {status && (
          <div
            className={`mb-4 p-3 rounded ${
              status.includes('✅')
                ? 'bg-green-100 text-green-800'
                : status.includes('⚠️')
                ? 'bg-yellow-100 text-yellow-800'
                : status.includes('⛔')
                ? 'bg-red-100 text-red-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {status}
          </div>
        )}

        <div className="mu-toolbar">
          <div className="searchbox">
            <div className="searchbox__icon">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search students..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="searchbox__input"
            />
          </div>

          {/* Download selector */}
          <div className="dl-wrap" onClick={e => e.stopPropagation()}>
              {/* NEW: Semester filter */}
  <select
    value={semFilter}
    onChange={(e) => { setSemFilter(e.target.value); setPage(1); }}
    className="dl-btn"  // reuse your button styling so it looks like a chip
    title="Filter by Semester"
    style={{ minWidth: 140 }}
  >
    <option value="ALL">All Semesters</option>
    {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(n => (
      <option key={n} value={n}>Semester {n}</option>
    ))}
  </select>

  {/* NEW: Department/Program filter */}
  <select
    value={deptFilter}
    onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
    className="dl-btn"
    title="Filter by Department / Program"
    style={{ minWidth: 200 }}
  >
    <option value="ALL">All Departments</option>
    {deptOptions.map(d => (
      <option key={d} value={d}>{d}</option>
    ))}
  </select>

            <button
              type="button"
              className="dl-btn"
              onClick={() => setDownloadOpen(v => !v)}
              title="Download full database"
            >
              Download <span style={{fontSize:12}}>▼</span>
            </button>
{downloadOpen && (
  <div className="dl-menu">
    <div className="dl-item" style={{fontWeight:700, cursor:'default'}}>This View</div>
    <button className="dl-item" onClick={() => { setDownloadOpen(false); onDownloadCSV(); }}>
      CSV (Current Filters)
    </button>
    <button className="dl-item" onClick={() => { setDownloadOpen(false); onDownloadPDF(); }}>
      PDF (Current Filters)
    </button>
    <div className="dl-item" style={{fontWeight:700, cursor:'default', marginTop:6}}>Full Database</div>
    <button className="dl-item" onClick={() => { setDownloadOpen(false); downloadAllCSV(); }}>
      CSV (All Students)
    </button>
    <button className="dl-item" onClick={() => { setDownloadOpen(false); downloadAllPDF(); }}>
      PDF (All Students)
    </button>
  </div>
)}
          </div>

          <button onClick={openAddModal} className="btn btn--add">
            <span className="btn-plus">+</span> Add Student
          </button>
        </div>

        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">
            <h3 className="mu-subtitle">All Students</h3>
            <div className="mu-tablecard">
              <div className="mu-hscroll">
                <table className="mu-table">
                  <thead>
                    <tr className="mu-thead-row">
                      <th className="mu-th">ID</th>
                      <th className="mu-th">Name</th>
                      <th className="mu-th">Email</th>
                      <th className="mu-th">Mobile</th>
                      <th className="mu-th">Roll No</th>
                      <th className="mu-th">Enrollment</th>
                      <th className="mu-th">Semester</th>
                      <th className="mu-th">Program Description</th>
                      <th className="mu-th">Status</th>
                      <th className="mu-th">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paged.map((student, idx) => (
                      <tr key={student.stuid || idx}>
                        <td className="mu-td mu-td--userid">{student.stuid}</td>
                        <td className="mu-td">{student.stuname}</td>
                        <td className="mu-td">{student.stuemailid}</td> {/* ✅ Email in correct column */}
                        <td className="mu-td">{student.stumob1}</td>    {/* ✅ Mobile next */}
                        <td className="mu-td">{student.stu_rollnumber}</td>
                        <td className="mu-td">{student.stu_enrollmentnumber}</td>
                        <td className="mu-td">{student.stu_curr_semester}</td>
                        <td className="mu-td">{student.programDescription || ''}</td>
                        <td className="mu-td">
                          <span className={student.stuvalid ? 'status status--active' : 'status status--inactive'}>
                            {student.stuvalid ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {/* ❌ Removed Scholarship Fees column entirely */}
                        <td className="mu-td">
                          <button onClick={() => openEditModal(student)} className="btn btn--primary">
                            Edit
                          </button>
                          <button onClick={() => askDelete(student.stuid)} className="btn btn--danger">
                            Delete
                          </button>
                          <button onClick={() => openUserDtls(student)} className="btn btn--primary">
                            User Details
                          </button>
                          <button onClick={() => goToStudentInfo(student)} className="btn btn--primary">
                            Student Info
                          </button>
                          <button onClick={() => downloadStudentPDF(student)} className="btn btn--primary">
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                </table>
              </div>

              <div className="mu-pagination mu-pagination--chips">
                <div className="mu-pageinfo mu-pageinfo--chips">
                  Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filtered.length)} to{' '}
                  {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} results
                </div>
                <div className="mu-pagebtns mu-pagebtns--chips">
                  <button
                    onClick={() => goto(1)}
                    disabled={currentPage === 1}
                    className="pagechip"
                  >
                    First
                  </button>
                  <button
                    onClick={() => goto(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="pagechip"
                  >
                    Previous
                  </button>
                  <span className="pagechip pagechip--active">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => goto(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="pagechip"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => goto(totalPages)}
                    disabled={currentPage === totalPages}
                    className="pagechip"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


      {showModal && (
        <div className="modal-overlay">
          <div className="modal modal--wide">
            <button onClick={closeModal} className="modal-x">×</button>
            <h3 className="modal-heading">{editing ? 'Edit Student' : 'Add New Student'}</h3>

            <form onSubmit={handle}>
              <div className="form-grid form-grid--5">
                <div className="form-row">
                  <label className="form-label">Student ID</label>
                  <input
                    type="text"
                    name="stuid"
                    value={formData.stuid}
                    onChange={handleChange}
                    className="form-input"
                    required
                    readOnly
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Scholarship Fees</label>
                  <input
                    type="text"
                    name="scholrshipfees"
                    value={formData.scholrshipfees}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Enter scholarship amount"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Institute</label>
                  <select
                    name="stu_inst_id"
                    value={formData.stu_inst_id}
                    onChange={handleChange}
                    className="form-input"
                    required
                  >
                    <option value="">Select Institute</option>
                    {colleges.map((college) => (
                      <option key={college.collegeid} value={college.collegeid}>
                        {college.collegename}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    name="stuFirstName"
                    value={formData.stuFirstName}
                    onChange={handleChange}
                    className="form-input"
                    required
                    placeholder="Alphabets only"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Last Name *</label>
                  <input
                    type="text"
                    name="stuLastName"
                    value={formData.stuLastName}
                    onChange={handleChange}
                    className="form-input"
                    required
                    placeholder="Alphabets only"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    name="stuemailid"
                    value={formData.stuemailid}
                    onChange={handleChange}
                    className="form-input"
                    required
                    placeholder="student@example.com"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Password (Mobile 1) *</label>
                  <input
                    type="text"
                    name="stumob1"
                    value={formData.stumob1}
                    onChange={handleChange}
                    className="form-input"
                    required
                    placeholder="10-digit mobile"
                    maxLength="10"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Mobile 2</label>
                  <input
                    type="text"
                    name="stumob2"
                    value={formData.stumob2}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="10-digit mobile"
                    maxLength="10"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Gender</label>
                  <select
                    name="stugender"
                    value={formData.stugender}
                    onChange={handleChange}
                    className="form-input"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">Date of Birth</label>
                  <input
                    type="datetime-local"
                    name="studob"
                    value={formData.studob}
                    onChange={handleChange}
                    className="form-input"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Religion</label>
                  <select
                    name="stucaste"
                    value={formData.stucaste}
                    onChange={handleChange}
                    className="form-input"
                  >
                    <option value="">Select</option>
                    <option value="Hindu">Hindu</option>
                    <option value="Muslim">Muslim</option>
                    <option value="Buddhism">Buddhism</option>
                    <option value="Christian">Christian</option>
                    <option value="Sikh">Sikh</option>
                    <option value="Jain">Jain</option>
                    <option value="Judaism">Judaism</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">Category</label>
                  <select
                    name="stucategory"
                    value={formData.stucategory}
                    onChange={handleChange}
                    className="form-input"
                  >
                    <option value="">Select Category</option>
                    <option value="General">General</option>
                    <option value="OBC">OBC</option>
                    <option value="SC">SC</option>
                    <option value="ST">ST</option>
                    <option value="EWS">EWS</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">Enrollment Number </label>
                  <input
                    type="text"
                    name="stu_enrollmentnumber"
                    value={formData.stu_enrollmentnumber}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Numeric only"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Roll Number </label>
                  <input
                    type="text"
                    name="stu_rollnumber"
                    value={formData.stu_rollnumber}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Numeric only"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Registration Number</label>
                  <input
                    type="text"
                    name="stu_regn_number"
                    value={formData.stu_regn_number}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Numeric only"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Admission Date</label>
                  <input
                    type="datetime-local"
                    name="stuadmissiondt"
                    value={formData.stuadmissiondt}
                    onChange={handleChange}
                    className="form-input"
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">Section</label>
                  <select
                    name="stu_section"
                    value={formData.stu_section}
                    onChange={handleChange}
                    className="form-input"
                  >
                    <option value="">Select</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">Program/Course</label>
                  <select
                    name="stu_course_id"
                    value={formData.stu_course_id}
                    onChange={handleChange}
                    className="form-input"
                  >
                    <option value="">Select Program</option>
                    {filteredCoursesBySem
                      .filter(isAllowedCourseForAdmission)   /* 👉 only show allowed ones */
                      .map((course) => (
                        <option key={course.courseid} value={course.courseid}>
                          {course.coursedesc || course.coursename || course.courseid}
                        </option>
                      ))}
                  </select>
                </div>

                {/* ===== Fees (auto from Fee Structure) ===== */}
                <div className="form-row span-5">
                  <style>{`
                    .fee-card{border:1px solid #e5e7eb;border-radius:12px;padding:12px}
                    .fee-flex{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
                    .fee-table{width:100%;border-collapse:collapse}
                    .fee-table th,.fee-table td{border:1px solid #eee;padding:8px;font-size:12.5px}
                    .fee-table th{background:#f9fafb;text-align:left}
                    .fee-pill{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:8px 12px;font-weight:600}
                    .fee-grid{display:grid;grid-template-columns: minmax(0,1.3fr) minmax(210px,0.7fr);gap:14px;align-items:flex-start}
                    .fee-summary--side{display:flex;flex-direction:column;gap:10px}
                    .fee-sem-list{background:#fff;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:6px 10px;max-height:180px;overflow-y:auto}
                    .fee-sem-item{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;padding:3px 0;border-bottom:1px dashed rgba(148,163,184,.2);gap:8px}
                    .fee-sem-item:last-child{border-bottom:0}
                    .fee-sem-input{width:90px;text-align:right;font-size:12px;padding:2px 6px;border:1px solid #d1d5db;border-radius:6px}
                  `}</style>

                  <div className="fee-card">
                    <div className="fee-flex">
                      <div><strong>Fees</strong> (from Fee Structure)</div>

                      {/* Mode selector */}
                      <label>
                        Mode:&nbsp;
                        <select
                          value={feeMode}
                          onChange={e => setFeeMode(e.target.value)}
                        >
                          <option value="course_sem">This semester only</option>
                          <option value="course">Course (all semesters)</option>
                        </select>
                      </label>

                      {/* Equal distribution toggle */}
                      <label style={{display:'flex', alignItems:'center', gap:6}}>
                        <input
                          type="checkbox"
                          checked={distributeAcrossSem}
                          onChange={e => setDistributeAcrossSem(e.target.checked)}
                          disabled={feeMode !== 'course_sem'}
                        />
                        <span>
                          Distribute course total equally across {feeMode === 'course_sem' && distributeAcrossSem ? effectiveSemCount : totalSemesters} semesters
                        </span>
                      </label>

                      {/* Info chip */}
                      <div style={{opacity:.8}}>
                        Program: <b>{formData.stu_course_id || '—'}</b> &nbsp;|&nbsp; Sem: <b>{formData.stu_curr_semester || '—'}</b>
                      </div>
                    </div>

                    {/* NEW: two-column layout — table left, summary right */}
                    <div className="fee-grid">
                      {/* Left: table */}
                      <div>
                        <table className="fee-table">
                          <thead>
                            <tr>
                              <th style={{width:36}}>#</th>
                              <th>Head</th>
                              <th style={{width:90}}>Mandatory</th>
                              <th style={{width:90}}>Semester</th>
                              <th style={{width:140}}>Amount (₹)</th>
                              <th style={{width:80}}>Include</th>
                            </tr>
                          </thead>
                          <tbody>
                            {feeRows.length === 0 && (
                              <tr><td colSpan={6} style={{textAlign:'center', color:'#6b7280'}}>No fee rows for this selection.</td></tr>
                            )}
                            {feeRows.map((r, idx) => (
                              <tr key={r.fee_struct_id || idx}>
                                <td>{idx + 1}</td>
                                <td>{r.fee_head || '—'}</td>
                                <td>{r.fee_is_mandatory ? 'Yes' : 'No'}</td>
                                <td>{r.fee_semester_no ?? '—'}</td>
                                <td>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={r.editAmount}
                                    onChange={e=>{
                                      const v = e.target.value;
                                      setFeeRows(rows => rows.map((it,i)=> i===idx ? {...it, editAmount: Number(v||0)} : it));
                                    }}
                                    style={{width:110}}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={!!r.include}
                                    onChange={e=>{
                                      const ch = e.target.checked;
                                      setFeeRows(rows => rows.map((it,i)=> i===idx ? {...it, include: ch} : it));
                                    }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Right: compact summary stack */}
                      <div className="fee-summary fee-summary--side">
                        {feeMode === 'course_sem' && distributeAcrossSem && (
                          <div className="fee-pill">Course Total: ₹{courseSubtotal.toFixed(2)}</div>
                        )}

                        <div className="fee-pill">
                          {feeMode === 'course_sem' && distributeAcrossSem
                            ? <>This Sem Share (Total ÷ {effectiveSemCount}): ₹{perSemShare.toFixed(2)}</>
                            : <>Subtotal: ₹{feeSubtotal.toFixed(2)}</>
                          }
                        </div>

                        <div className="fee-pill" style={{display:'flex', alignItems:'center', gap:8}}>
                          <span>Scholarship:</span>
                          <input
                            type="text"
                            name="scholrshipfees"
                            value={formData.scholrshipfees}
                            onChange={handleChange}
                            style={{width:120}}
                            placeholder="0.00"
                          />
                        </div>

{editing && formData.balance !== '' && (
  <div
    className="fee-pill"
    title="Value currently saved in the database"
    style={{ opacity: .9 }}
  >
    Net Payable: ₹{
      (Number.isFinite(Number(formData.balance)) ? Number(formData.balance) : 0).toFixed(2)
    }
  </div>
)}


                        {/* 👉 CHANGED: show only from currentSemNum to totalSemesters */}
                        <div className="fee-sem-list">
{Array.from({length: Math.max(0, totalSemesters - (currentSemNum - 1))}, (_,i)=> currentSemNum + i).map((n) => (
  <div key={n} className="fee-sem-item">
    <span>Semester {n}</span>

    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        className="fee-sem-input"
        value={displayedSemValue(n)}
        onChange={(e) => handleSemInputChange(n, e.target.value)}
      />

      {/* ↻ Reset this semester to auto-calc */}
      <button
        type="button"
        className="sem-auto-btn"
        title="Auto-calc this semester"
        onClick={() => clearSem(n)}
      >
        ↻
      </button>
    </div>
  </div>
))}
                        </div>

                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <label className="form-label">Current Semester *</label>
                  <select
                    name="stu_curr_semester"
                    value={formData.stu_curr_semester}
                    onChange={handleChange}
                    className="form-input"
                    required
                  >
                    <option value="">{semesterOptions.length ? 'Select Semester' : 'Select Program first'}</option>
                    {semesterOptions.map(s => (
                      <option key={s} value={s}>{ord(Number(s))} Semester</option>
                    ))}
                  </select>
                </div>

                {formData.programDescription && (
                  <div className="form-row span-3">
                    <label className="form-label">Program Description</label>
                    <textarea
                      name="programDescription"
                      value={formData.programDescription}
                      readOnly
                      className="form-input"
                      rows={2}
                    />
                  </div>
                )}
                <div className="form-row">
                  <label className="form-label">
                    <input
                      type="checkbox"
                      name="stu_lat_entry"
                      checked={formData.stu_lat_entry}
                      disabled
                      onChange={handleChange}
                    />{' '}
                    Lateral Entry
                  </label>
                </div>
                <div className="form-row">
                  <label className="form-label">
                    <input
                      type="checkbox"
                      name="stuvalid"
                      checked={formData.stuvalid}
                      onChange={handleChange}
                    />{' '}
                    Active Status
                  </label>
                </div>
                <div className="form-row span-3">
                  <label className="form-label">Current Address</label>
                  <textarea
                    name="addrCurrent"
                    value={formData.addrCurrent}
                    onChange={handleChange}
                    className="form-input"
                    rows={2}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">
                    <input
                      type="checkbox"
                      name="sameAsCurrent"
                      checked={formData.sameAsCurrent}
                      onChange={handleChange}
                    />{' '}
                    Same as current address
                  </label>
                </div>
                <div className="form-row span-3">
                  <label className="form-label">Permanent Address</label>
                  <textarea
                    name="addrPermanent"
                    value={formData.addrPermanent}
                    onChange={handleChange}
                    className="form-input"
                    rows={2}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">PIN Code</label>
                  <input
                    type="text"
                    name="pinCode"
                    value={formData.pinCode}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="6-digit PIN"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Father's First Name</label>
                  <input
                    type="text"
                    name="stuguardianFirstName"
                    value={formData.stuguardianFirstName}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Alphabets only"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Father's Last Name</label>
                  <input
                    type="text"
                    name="stuguardianLastName"
                    value={formData.stuguardianLastName}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="Alphabets only"
                  />
                  <div className="form-row">
  <label className="form-label">Mother's First Name</label>
  <input
    type="text"
    name="stu_mother_firstname"
    value={formData.stu_mother_firstname || ''}
    onChange={handleChange}
    className="form-input"
    placeholder="Alphabets only"
  />
</div>
<div className="form-row">
  <label className="form-label">Mother's Last Name</label>
  <input
    type="text"
    name="stu_mother_lastname"
    value={formData.stu_mother_lastname || ''}
    onChange={handleChange}
    className="form-input"
    placeholder="Alphabets only"
  />
</div>

                </div>
                <div className="form-row">
                  <label className="form-label">Guardian Email</label>
                  <input
                    type="email"
                    name="stuguardianemailid"
                    value={formData.stuguardianemailid}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="guardian@example.com"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Guardian Mobile 1</label>
                  <input
                    type="text"
                    name="stuguardianmob1"
                    value={formData.stuguardianmob1}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="10-digit mobile"
                    maxLength="10"
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">Guardian Mobile 2</label>
                  <input
                    type="text"
                    name="stuguardianmob2"
                    value={formData.stuguardianmob2}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="10-digit mobile"
                    maxLength="10"
                  />
                </div>
                <div className="form-row span-5">
                  <label className="form-label">Guardian Address</label>
                  <textarea
                    name="stuguardianaddress"
                    value={formData.stuguardianaddress}
                    onChange={handleChange}
                    className="form-input"
                    rows={2}
                  />
                </div>
                <div className="form-row">
  <label className="form-label">Admission Officer</label>
  <input
    type="text"
    name="admission_officer_name"
    value={formData.admission_officer_name}
    onChange={handleChange}
    className="form-input"
    placeholder="e.g., Ms. Priya Sen"
  />
</div>

              </div>

              <button type="submit" className="btn--submit">
                {editing ? 'Update Student' : 'Add Student'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="confirm-overlay">
          <div className="confirm">
            <button onClick={() => setShowDeleteModal(false)} className="confirm-x">×</button>
            <h3 className="confirm-title">Confirm Deletion</h3>
            <p className="confirm-desc">Are you sure you want to delete this student?</p>
            <div className="confirm-user">{toDeleteId}</div>
            <div className="confirm-actions">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="btn btn--secondary confirm-btn"
              >
                Cancel
              </button>
              <button onClick={confirmDelete} className="btn btn--danger confirm-btn">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showStudentInfoModal && (
        <div className="modal-overlay">
          <div className="modal modal--wide">
            <button onClick={closeStudentInfoModal} className="modal-x">×</button>
            <h3 className="modal-heading">Student Information for {currentStudentId}</h3>
            <div style={{maxHeight: '70vh', overflowY: 'auto'}}>
              <StudentInformationManager
                embedded
                initialStuid={currentStudentId}
                openImmediately
                onRequestClose={closeStudentInfoModal}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
