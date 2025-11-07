// SMS-ui/src/pages/Teacher/MasterTeacher.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


/* ---------- helpers ---------- */
const toStringSafe = (v) => (v === undefined || v === null ? '' : String(v).trim());
const toNumOrNull = (v) => {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_RE = /^[0-9]{12}$/;
const PHONE10 = /^\d{10}$/;

const DOC_DESC_OPTIONS = [
  'Picture',
  'Signature',
  '10+ Certificate',
  '10+ Marksheet',
  '12+ Certificate',
  '12+ Marksheet',
  'Graduation Certificate',
  'Graduation Marksheet',
  'Post Graduation Certificate',
  'Post Graduation Marksheet',
  'Doctorate Certificate',
];

const pickArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.data)) return raw.data;
  const k = raw && typeof raw === 'object' && Object.keys(raw).find((x) => Array.isArray(raw[x]));
  return k ? raw[k] : [];
};

const TEACHER_TYPES = [
  'Principal',
  'Faculty (Professor)',
  'Faculty (Assistant Professor)',
  'Faculty (Associate Professor)',
  'Technical Assistant',
  'Super-Admin',
  'Admin',
  'Admin Departement',
  'Marketing Departement',
  'Admission Officer',
  'Finance Cashier',
  'Cashier Admin',
  'HR',
  'HR LEAVE',
  'STUDENT COUNCILLOR',
];

/* 🔐 Role mapping based on teachertype (as asked) */
const ROLE_ID_BY_TYPE = {
  'Faculty (Assistant Professor)': 'USR_TCHR',
  'Principal': 'SMS_SUPERADM',
  'Faculty (Professor)': 'USR_TCHR',
  'Faculty (Associate Professor)': 'USR_TCHR',
  'Technical Assistant': 'USR_TCHR',
  'Super-Admin': 'SMS_SUPERADM',
  'Admin': 'admin',
  'Admin Departement': 'GRP_ACT',
  'Marketing Departement': 'GRP_ACT',
  'Admission Officer': 'GRP_AD_OFFICER',
  'Finance Cashier': 'FIN-ACT',
  'Cashier Admin': 'FIN_ACT_ADM',
  'HR': 'ROLE_HR',
  'HR LEAVE': 'HR_LEAVE',
  'STUDENT COUNCILLOR': 'STU_COUNCIL',
};

// 🔁 Auto-designation map (kept)
const DESIGNATION_BY_TYPE = {
  'Faculty (Assistant Professor)': 'Assistant Professor',
  'Faculty (Professor)': 'Professor',
  'Faculty (Associate Professor)': 'Associate Professor',
  'Technical Assistant': 'Teacher In-Charge',
  'Principal': 'Principal',
  'Super-Admin': 'Super Administrator',
  'Admin': 'Administrator',
  'Admin Departement': 'Department Admin',
  'Marketing Departement': 'Marketing Executive',
  'Admission Officer': 'Group Admission Officer',
  'Finance Cashier': 'Finance Cashier',
  'Cashier Admin': 'Cashier Admin',
  'HR': 'HR Manager',
  'HR LEAVE': 'HR Leave Manager',
  'STUDENT COUNCILLOR': 'Student Councillor',
};

const joinUrl = (base, path = '') =>
  path ? `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}` : String(base);

const parseAddrJson = (s) => {
  try {
    const o = typeof s === 'string' ? JSON.parse(s) : s || {};
    return {
      address1: toStringSafe(o.address1),
      address2: toStringSafe(o.address2),
      pincode: toStringSafe(o.pincode),
    };
  } catch {
    return { address1: '', address2: '', pincode: '' };
  }
};

function getInitialForm() {
  return {
    teacherid: '',
    // name pieces (stored together into teachername)
    firstName: '',
    lastName: '',
    teacheremailid: '',
    teachermob1: '',
    teachermob2: '',
    teacheraddress: '',

    // parents (stored together)
    fatherFirst: '',
    fatherLast: '',
    motherFirst: '',
    motherLast: '',

    pancardno: '',
    aadharno: '',

    // comm/permanent address pieces (stored JSON in *_address)
    comm_addr1: '',
    comm_addr2: '',
    comm_pincode: '',
    perm_addr1: '',
    perm_addr2: '',
    perm_pincode: '',

    teacherdob: '',
    teacherdoj: '',
    teachergender: '',
    teachercaste: '',
    ismarried: false,

    // emergency
    emergency_contact_name: '',
    emergency_contact_address: '',
    emergency_contact_phone: '',

    // fks/selectors
    teachercollegeid: '',
    teacher_dept_id: '',

    // type/category
    teachertype: '',

    // misc
    teacherdesig: '',
    teachermaxweekhrs: '',
    teachervalid: true,
  };
}
// NEW: UI validation helpers
const LETTERS_ONLY_RE = /^[A-Za-z\s]+$/;                        // letters + spaces
// accept ANY email domain (no TLD restriction)
const ANY_EMAIL_RE = /^[^@\s]+@[^@\s]+$/;

const PIN6_RE = /^\d{6}$/;
/* ---------- component ---------- */
export default function MasterTeacher() {
  const navigate = useNavigate();

  const [colleges, setColleges] = useState([]); // [{id,label}]
  const [departments, setDepartments] = useState([]); // [{value,label}]  // 🔄 Dept: label = DESCRIPTION
  const [teachers, setTeachers] = useState([]);
  const [formData, setFormData] = useState(getInitialForm());
  // NEW: field level errors for small inline messages
  const [errors, setErrors] = useState({
    firstName: '',
    lastName: '',
    fatherFirst: '',
    fatherLast: '',
    motherFirst: '',
    motherLast: '',
    teacheremailid: '',
    comm_pincode: '',
    perm_pincode: '',
    teachermob1: '',          
    teachermob2: '',          
    emergency_contact_name: '', 
    emergency_contact_phone: '',
  });

  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  // uploads modal
  const [showUploadsModal, setShowUploadsModal] = useState(false);
  const [uploadsTeacher, setUploadsTeacher] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [uploadsMsg, setUploadsMsg] = useState('');

  // quick upload fields
  const [upDesc, setUpDesc] = useState('');
  const [upDescCustom, setUpDescCustom] = useState('');
  const [upAadhaar, setUpAadhaar] = useState('');
  const [upFile, setUpFile] = useState(null);
  const [edu, setEdu] = useState(null);


  // left panel tabs inside uploads modal
  const [detailTab, setDetailTab] = useState('basic'); // 'basic' | 'contact' | 'optional' | 'uploads'

  // search + pagination
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  // === Address sync flags ===
const [sameCommAsAddr, setSameCommAsAddr] = useState(false);
const [samePermAsComm, setSamePermAsComm] = useState(false);
// ---- Upload preview cache ----
const [filePreviews, setFilePreviews] = useState({}); // { [dtlsId]: { type:'image'|'pdf'|'other', url?, ext? } }

// Tiny helpers
const extFromName = (name = '') => {
  const p = String(name).split('.').pop();
  return p && p.length <= 6 ? p.toLowerCase() : '';
};
// --- helper to fetch Picture & Signature from TeacherDtlsManager ---
const fetchTeacherFiles = async (teacherid) => {
  try {
    const { data } = await axios.get(API_DTLS, { params: { teacherId: teacherid, limit: 100 } });
    const rows = Array.isArray(data) ? data : data?.rows || data?.data || [];
    const result = {};
    for (const r of rows) {
      if (r.tchr_dtls_desc === "Picture" && Number(r.has_file)) {
        const res = await axios.get(joinUrl(API_DTLS, `${r.tchr_dtls_id}/file`), {
          responseType: "blob",
        });
        result.picture = URL.createObjectURL(res.data);
      }
      if (r.tchr_dtls_desc === "Signature" && Number(r.has_file)) {
        const res = await axios.get(joinUrl(API_DTLS, `${r.tchr_dtls_id}/file`), {
          responseType: "blob",
        });
        result.signature = URL.createObjectURL(res.data);
      }
    }
    return result;
  } catch {
    return {};
  }
};
// --- PDF generator ---
// --- PDF generator (screenshot-style) ---
const generateTeacherPDF = async (t) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();

  // === helpers ===
  const S = (v) => (v === undefined || v === null ? "—" : String(v));
  const addrObj = (raw, fall1, fall2, fallPin) => {
    const parsed = parseAddrJson(raw); // {"address1","address2","pincode"} if JSON
    const a1 = S(parsed.address1 || fall1);
    const a2 = S(parsed.address2 || fall2);
    const pin = S(parsed.pincode || fallPin);
    const parts = [a1, a2].filter(Boolean).join(", ");
    return [parts, pin].filter(Boolean).join("  —  PIN: " + (pin || "")).replace("  —  PIN:  ", "");
  };
  const deptLabel = deptLabelById?.[S(t.teacher_dept_id)] || S(t.teacher_dept_id);

  // image loader
  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  // center + fit an image inside a box
  const drawCenteredFit = async (imgUrl, boxX, boxY, boxW, boxH, pad = 6) => {
    const img = await loadImage(imgUrl);
    const availW = Math.max(1, boxW - pad * 2);
    const availH = Math.max(1, boxH - pad * 2);
    const ratio = img.width / img.height;

    let w = availW, h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    const x = boxX + (boxW - w) / 2;
    const y = boxY + (boxH - h) / 2;
    doc.addImage(img, "JPEG", x, y, w, h);
  };

  // center text horizontally within a box
  const textCenterInBox = (txt, boxX, boxW, y) => {
    const w = doc.getTextWidth(txt);
    const x = boxX + (boxW - w) / 2;
    doc.text(txt, x, y);
  };

  /* ===== Header: blue "Profile" bar ===== */
  doc.setFillColor(27, 94, 159);
  doc.roundedRect(margin, 15, pageW - 2 * margin, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text("Profile", margin + 4, 23);

  /* ===== Basic info (two columns) ===== */
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  const L = margin, R = pageW / 2;
  let y = 34, gap = 6;
  const label = (x, txt) => { doc.setFont(undefined, "bold"); doc.text(txt, x, y); };
  const value = (x, txt) => { doc.setFont(undefined, "normal"); doc.text(S(txt), x, y); y += gap; };

  // Left
  label(L, "Name :");        value(L + 22, t.teachername);
  label(L, "Teacher ID :");  value(L + 22, t.teacherid);
  label(L, "Email Id :");    value(L + 22, t.teacheremailid);

  // Right
  y = 34;
  label(R, "College :");     value(R + 24, t.teachercollegeid);
  label(R, "Dept :");        value(R + 24, deptLabel);
  label(R, "Mobile No :");   value(R + 24, t.teachermob1);
function buildEducationRows(edu = {}) {
  const rows = [];

  rows.push([
    'Class 10',
    [
      edu.class10_board || '—',
      `YOP: ${edu.class10_year_of_passing || '—'}`,
      `Scale: ${edu.class10_grade_scale || '—'}`,
      `Grade: ${edu.class10_gradepoint || '—'}`,
      `Marks: ${edu.class10_marks_total || '—'}`
    ].join(' | ')
  ]);

  rows.push([
    'Class 12',
    [
      [edu.class12_board || '—', edu.class12_stream ? `(${edu.class12_stream})` : ''].filter(Boolean).join(' '),
      `YOP: ${edu.class12_year_of_passing || '—'}`,
      `Scale: ${edu.class12_grade_scale || '—'}`,
      `Grade: ${edu.class12_gradepoint || '—'}`,
      `Marks: ${edu.class12_marks_total || '—'}`
    ].join(' | ')
  ]);

  rows.push([
    'Diploma',
    [
      `Branch: ${edu.diploma_branch || '—'}`,
      `YOP: ${edu.diploma_year_of_passing || '—'}`,
      `Scale: ${edu.diploma_grade_scale || '—'}`,
      `Sem GP: [${[
        edu.diploma_sem1_gp, edu.diploma_sem2_gp, edu.diploma_sem3_gp,
        edu.diploma_sem4_gp, edu.diploma_sem5_gp, edu.diploma_sem6_gp
      ].map(v => v || '—').join(', ')}]`
    ].join(' | ')
  ]);

  rows.push([
    'Bachelor',
    [
      `${edu.bachelor_degree || '—'} — ${edu.bachelor_department || '—'}`,
      `Univ: ${edu.bachelor_university || '—'}`,
      `YOP: ${edu.bachelor_year_of_passing || '—'}`,
      `Scale: ${edu.bachelor_grade_scale || '—'}`,
      `Grade: ${edu.bachelor_gradepoint || '—'}`
    ].join(' | ')
  ]);

  rows.push([
    'Master',
    [
      `${edu.master_degree || '—'} — ${edu.master_department || '—'}`,
      `Univ: ${edu.master_university || '—'}`,
      `YOP: ${edu.master_year_of_passing || '—'}`,
      `Scale: ${edu.master_grade_scale || '—'}`,
      `Grade: ${edu.master_gradepoint || '—'}`
    ].join(' | ')
  ]);

  rows.push([
    'PhD',
    [
      `Field: ${edu.phd_field || '—'}`,
      `Univ: ${edu.phd_university || '—'}`,
      `YOP: ${edu.phd_year_of_passing || '—'}`
    ].join(' | ')
  ]);

  return rows;
}

  /* ===== Picture & Signature boxes ===== */
  const boxY = 60;
  const boxW = (pageW - 2 * margin - 8) / 2, boxH = 60;

  const files = await fetchTeacherFiles(t.teacherid);

  // Left: Picture
  doc.roundedRect(L, boxY, boxW, boxH, 2, 2, "S");
  if (files.picture) await drawCenteredFit(files.picture, L, boxY, boxW, boxH, 8);
  doc.setFontSize(9);

  // Right: Signature
  const RS = L + boxW + 8;
  doc.roundedRect(RS, boxY, boxW, boxH, 2, 2, "S");
  if (files.signature) await drawCenteredFit(files.signature, RS, boxY, boxW, boxH, 8);
  doc.setFontSize(9);
  /* ===== Tables with full details ===== */
  let startY = boxY + boxH + 10;
  doc.setFontSize(11);

  // Employment
  autoTable(doc, {
    startY,
    head: [["Employment Details", ""]],
    body: [
      ["Designation", S(t.teacherdesig)],
      ["Type", S(t.teachertype)],
      ["Valid", t.teachervalid ? "Yes" : "No"],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 2.8 },
    headStyles: { fillColor: [249, 250, 251], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
    didDrawPage: (d) => (startY = d.cursor.y + 6),
  });

  // Contact
  autoTable(doc, {
    startY,
    head: [["Contact Details", ""]],
    body: [
      ["Email", S(t.teacheremailid)],
      ["Mobile 1", S(t.teachermob1)],
      ["Mobile 2", S(t.teachermob2)],
      ["Address (one line)", S(t.teacheraddress)],
      ["Communication Address", addrObj(t.communication_address, t.comm_addr1, t.comm_addr2, t.comm_pincode)],
      ["Permanent Address", addrObj(t.permanent_address, t.perm_addr1, t.perm_addr2, t.perm_pincode)],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 2.8 },
    headStyles: { fillColor: [249, 250, 251], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
    didDrawPage: (d) => (startY = d.cursor.y + 6),
  });

  // ID + Personal
  autoTable(doc, {
    startY,
    head: [["ID & Personal Details", ""]],
    body: [
      ["PAN", S(t.pancardno)],
      ["Aadhaar", S(t.aadharno)],
      ["Date of Birth", S(t.teacherdob)],
      ["Gender", S(t.teachergender)],
      ["Caste", S(t.teachercaste)],
      ["Marital", t.ismarried ? "Married" : "Unmarried"],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 2.8 },
    headStyles: { fillColor: [249, 250, 251], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
    didDrawPage: (d) => (startY = d.cursor.y + 6),
  });

  // Emergency
  autoTable(doc, {
    startY,
    head: [["Emergency Contact", ""]],
    body: [
      ["Name", S(t.emergency_contact_name)],
      ["Address", S(t.emergency_contact_address)],
      ["Phone", S(t.emergency_contact_phone)],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 2.8 },
    headStyles: { fillColor: [249, 250, 251], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
  });
  // ===== Education Info (always fetched now) =====
let eduData = {};
try {
  eduData = await fetchEducationByTeacher(t.teacherid);
} catch {
  eduData = {};
}

// Section title
doc.setFont('helvetica', 'bold');
doc.setFontSize(11);
const yStart = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 10) + 10;
doc.text('Education Info', 14, yStart);

// Table
autoTable(doc, {
  startY: yStart + 4,
  head: [['Section', 'Details']],
  body: buildEducationRows(eduData),
  theme: 'grid',
  styles: { fontSize: 10, cellPadding: 2.8, valign: 'top' },
  headStyles: { fillColor: [249, 250, 251], textColor: [15, 23, 42], fontStyle: 'bold' },
  columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
});

  // Save
  doc.save(`${S(t.teacherid)}_Profile.pdf`);
};


// ---- Education API (reuse BASE_URL) ----
const EDU_API_ROOT = config.TEACHER_INFO_ROUTE;

// fetch education for a teacher; returns {} if not found
async function fetchEducationByTeacher(teacherid) {
  if (!teacherid) return {};
  try {
    const { data } = await axios.get(
      joinUrl(EDU_API_ROOT, `by-teacher/${encodeURIComponent(teacherid)}`)
    );
    return data || {};
  } catch {
    // 404 or any error => no education record yet
    return {};
  }
}


// Fetch a tiny preview for one row (image ⇒ objectURL; pdf ⇒ badge; other ⇒ ext)
async function loadPreview(dtlsId) {
  if (!dtlsId) return;
  try {
    const url = joinUrl(API_DTLS, `${dtlsId}/file`);
    const res = await axios.get(url, { responseType: 'blob' });
    const type = res.headers['content-type'] || 'application/octet-stream';

    if (type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(res.data);
      setFilePreviews(prev => ({ ...prev, [dtlsId]: { type: 'image', url: objectUrl } }));
      return;
    }
    if (type === 'application/pdf') {
      setFilePreviews(prev => ({ ...prev, [dtlsId]: { type: 'pdf' } }));
      return;
    }

    const disp = res.headers['content-disposition'] || '';
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disp);
    const ext = extFromName(m?.[1] || '');
    setFilePreviews(prev => ({ ...prev, [dtlsId]: { type: 'other', ext } }));
  } catch {
    // ignore: if preview fails, cell will still show "Has file"
  }
}

// Revoke object URLs when the uploads modal closes
useEffect(() => {
  if (!showUploadsModal) {
    Object.values(filePreviews).forEach(p => p?.url && URL.revokeObjectURL(p.url));
    setFilePreviews({});
  }
}, [showUploadsModal]); 



  /* ---------- normalize ---------- */
 function normalizeColleges(raw) {
  const list = pickArray(raw);
  return list
    .map((c) => {
      const idRaw =
        c.collegeid ?? c.college_id ?? c.id ?? c.ID ?? c.CollegeID;
      const nameRaw =
        c.collegename ?? c.college_name ?? c.name ?? c.collegeName ?? '';
      const id = toStringSafe(idRaw);
      const name = toStringSafe(nameRaw);
      return id ? { id, name, label: `${id} — ${name}` } : null;
    })
    .filter(Boolean);
}


  function normalizeTeachers(raw) {
    const list = pickArray(raw);
    return list.map((t) => ({
      ...t,
      teacherid: toStringSafe(t.teacherid ?? t.id ?? t.teacher_id),
      teachercollegeid: toStringSafe(t.teachercollegeid ?? t.collegeid ?? t.college_id),
      teachername: toStringSafe(t.teachername ?? t.name ?? ''),
      teacheremailid: t.teacheremailid ?? t.email ?? '',
      teachermob1: t.teachermob1 ?? t.mobile1 ?? t.phone ?? '',
      teachergender: t.teachergender ?? t.gender ?? '',
      teacher_dept_id: toStringSafe(t.teacher_dept_id ?? ''),
      teachertype: toStringSafe(t.teachertype ?? ''),
      teachervalid: t.teachervalid ?? t.active ?? t.valid ?? true,
    }));
  }

  // 🔄 Dept: normalize departments so label = description (fallbacks kept)
  function normalizeDepts(raw) {
    return pickArray(raw)
      .map((r) => {
        const id =
          r.collegedeptid ??
          r.college_dept_id ??
          r.id ??
          r.COLLEGEDEPTID ??
          r.COLLEGE_DEPT_ID;
        const desc =
          r.collegedeptdesc ??
          r.description ??
          r.colldept_desc ??
          r.colldept_code ?? // last fallback if desc missing
          id;
        const value = toStringSafe(id);
        const label = toStringSafe(desc) || value;
        return value ? { value, label } : null;
      })
      .filter(Boolean);
  }

  // If "Communication same as Address" is ON, keep comm fields synced from simple Address
useEffect(() => {
  if (!sameCommAsAddr) return;
  setFormData((prev) => ({
    ...prev,
    // copy the single-line simple address into comm_addr1;
    // leave comm_addr2/pincode as-is so user can still add pin later if needed
    comm_addr1: toStringSafe(prev.teacheraddress),
    comm_addr2: prev.comm_addr2,
    comm_pincode: prev.comm_pincode,
  }));
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [sameCommAsAddr, formData.teacheraddress]);

// If "Permanent same as Communication" is ON, keep perm fields synced from comm fields
useEffect(() => {
  if (!samePermAsComm) return;
  setFormData((prev) => ({
    ...prev,
    perm_addr1: toStringSafe(prev.comm_addr1),
    perm_addr2: toStringSafe(prev.comm_addr2),
    perm_pincode: toStringSafe(prev.comm_pincode),
  }));
}, [samePermAsComm, formData.comm_addr1, formData.comm_addr2, formData.comm_pincode]);


  /* ---------- fetch ---------- */
 useEffect(() => {
  axios
    .get(`${config.BASE_URL}/master-college/view-colleges`)
  .then((res) => {
      const raw = res?.data?.colleges ?? res?.data;
      setColleges(normalizeColleges(raw));
    })
    .catch(() => setColleges([]));


  const MASTER_DEPTS_URL =
    config.MASTER_DEPTS_ROUTE || `${String(config.BASE_URL || '').replace(/\/+$/, '')}/api/master-depts`;

  axios
    .get(MASTER_DEPTS_URL)
    .then((res) => {
      setDepartments(normalizeDepts(res.data));
    })
    .catch(() => setDepartments([]));

  fetchTeachers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  const fetchTeachers = () => {
    axios
      .get(`${config.TEACHER_ROUTE}`)
      .then((res) => setTeachers(normalizeTeachers(res.data?.teachers ?? res.data ?? [])))
      .catch(() => setMsg('❌ Error fetching teacher list'));
  };

  /* ---------- uploads helpers ---------- */
  const API_DTLS =
    config.TEACHER_DTLS_ROUTE || joinUrl(String(config.BASE_URL || ''), '/api/teacher-dtls');

  const openUploadsModal = (teacher) => {
    setUploadsTeacher(teacher);
    setShowUploadsModal(true);
    setUploadsMsg('');
    setUpDesc('');
    setUpDescCustom('');
    setUpAadhaar('');
    setUpFile(null);
    setDetailTab('basic');
    fetchUploadsFor(teacher.teacherid);
    // NEW
  setEdu(null);
  fetchEducationByTeacher(teacher.teacherid).then(setEdu).catch(() => setEdu({}));
  };

  const closeUploadsModal = () => {
    setShowUploadsModal(false);
    setUploadsTeacher(null);
    setUploads([]);
    setUploadsMsg('');
  };

  const fetchUploadsFor = async (teacherid) => {
  try {
    setUploadsLoading(true);
    const { data } = await axios.get(API_DTLS, {
      params: { limit: 100, offset: 0, teacherId: teacherid },
    });
    const rows = pickArray(data);
    setUploads(rows);

    // Prefetch previews for any row that has a file
    Promise.all(
      rows.filter(r => Number(r.has_file)).map(r => loadPreview(r.tchr_dtls_id))
    ).catch(() => {});
  } catch (e) {
    setUploads([]);
    setUploadsMsg('❌ Could not load uploads.');
  } finally {
    setUploadsLoading(false);
  }
};


  const doQuickUpload = async () => {
    if (!uploadsTeacher) return;
    const teacherid = uploadsTeacher.teacherid;
    const desc = (upDesc === '__CUSTOM__' ? upDescCustom : upDesc).trim();
    const aadhaar = String(upAadhaar || '').trim();

    if (!desc) {
      setUploadsMsg('❌ Please select or enter a description.');
      return;
    }
    if (aadhaar && !AADHAAR_RE.test(aadhaar)) {
      setUploadsMsg('❌ Aadhaar must be 12 digits.');
      return;
    }
    const fd = new FormData();
    fd.append('tchr_teacher_id', teacherid);
    fd.append('tchr_dtls_desc', desc);
    if (aadhaar) fd.append('tchr_aadharno', aadhaar);
    if (upFile) fd.append('file', upFile);

    try {
      setUploadsMsg('⏳ Uploading...');
      await axios.post(API_DTLS, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadsMsg('✅ Uploaded!');
      setUpDesc('');
      setUpDescCustom('');
      setUpAadhaar('');
      setUpFile(null);
      fetchUploadsFor(teacherid);
    } catch (e) {
      setUploadsMsg(
        `❌ Upload failed: ${e?.response?.data?.detail || e?.response?.data?.error || e.message}`
      );
    }
  };

  /* ---------- search/pagination ---------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        String(t.teacherid ?? '').toLowerCase().includes(q) ||
        String(t.teachername ?? '').toLowerCase().includes(q) ||
        String(t.teacheremailid ?? '').toLowerCase().includes(q) ||
        String(t.teachercollegeid ?? '').toLowerCase().includes(q) ||
        String(t.teacher_dept_id ?? '').toLowerCase().includes(q) ||
        String(t.teachertype ?? '').toLowerCase().includes(q)
    );
  }, [teachers, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, currentPage]);

  /* ---------- handlers ---------- */
  const openAddModal = () => {
    setFormData(getInitialForm());
    setEditingId(null);
    setShowFormModal(true);
    setMsg('');
  };
  // ⬇️ REPLACE your current openEditModal with this version
const openEditModal = (t) => {
  // split existing name to first/surname for the form
  const [firstName, ...rest] = toStringSafe(t.teachername).split(' ').filter(Boolean);
  const lastName = rest.join(' ');

  // parse JSON addresses (server stores strings like {"address1","address2","pincode"})
  const comm = parseAddrJson(t.communication_address);
  const perm = parseAddrJson(t.permanent_address);

  setFormData((prev) => ({
    ...getInitialForm(),         // clean defaults so nothing stays undefined
    ...prev,

    // identity / ids
    teacherid: toStringSafe(t.teacherid),
    teacheremailid: toStringSafe(t.teacheremailid).toLowerCase(),
    teachermob1: toStringSafe(t.teachermob1),
    teachermob2: toStringSafe(t.teachermob2),

    // name pieces for UI
    firstName,
    lastName,

    // simple address (one line)
    teacheraddress: toStringSafe(t.teacheraddress),

    // parents
    fatherFirst: toStringSafe(t.teacherparentname1).split(' ')[0] || '',
    fatherLast:  toStringSafe(t.teacherparentname1).split(' ').slice(1).join(' ') || '',
    motherFirst: toStringSafe(t.teacherparentname2).split(' ')[0] || '',
    motherLast:  toStringSafe(t.teacherparentname2).split(' ').slice(1).join(' ') || '',

    // IDs
    pancardno: toStringSafe(t.pancardno),
    aadharno:  toStringSafe(t.aadharno),

    // comm/permanent (broken out for the form)
    comm_addr1: toStringSafe(comm.address1),
    comm_addr2: toStringSafe(comm.address2),
    comm_pincode: toStringSafe(comm.pincode),
    perm_addr1: toStringSafe(perm.address1),
    perm_addr2: toStringSafe(perm.address2),
    perm_pincode: toStringSafe(perm.pincode),

    // dates & personal
    teacherdob: toStringSafe(t.teacherdob),
    teacherdoj: toStringSafe(t.teacherdoj),
    teachergender: toStringSafe(t.teachergender),
    teachercaste: toStringSafe(t.teachercaste),
    ismarried: !!t.ismarried,

    // emergency
    emergency_contact_name:    toStringSafe(t.emergency_contact_name),
    emergency_contact_address: toStringSafe(t.emergency_contact_address),
    emergency_contact_phone:   toStringSafe(t.emergency_contact_phone),

    // fks/selectors
    teachercollegeid: toStringSafe(t.teachercollegeid),
    teacher_dept_id:  toStringSafe(t.teacher_dept_id),

    // type/designation
    teachertype: toStringSafe(t.teachertype),
    teacherdesig: toStringSafe(t.teacherdesig) || (DESIGNATION_BY_TYPE[t.teachertype] || ''),

    // misc
    teachermaxweekhrs: toStringSafe(t.teachermaxweekhrs),
    teachervalid: !!t.teachervalid,
  }));

  setEditingId(t.teacherid);
  setShowFormModal(true);
  setMsg('');
};

  const closeFormModal = () => {
    setShowFormModal(false);
    setEditingId(null);
    setFormData(getInitialForm());
    setMsg('');
  };

  // 🔁 When Type changes, auto-fill Designation from map (still editable)
// 🔁 When Type changes, auto-fill Designation from map (still editable)
// 🔁 When Type changes, auto-fill Designation from map (still editable)
// REPLACE the whole handleChange with this:
const handleChange = (e) => {
  const { name, value, type, checked } = e.target;
  const valRaw = type === 'checkbox' ? checked : toStringSafe(value);

  // local helper to set a field + (optional) error text
  const setField = (field, v, errKey, errMsg = '') => {
    setFormData((prev) => ({ ...prev, [field]: v }));
    if (errKey) setErrors((prev) => ({ ...prev, [errKey]: errMsg }));
  };

  // names that must be letters only (allow spaces)
  const nameOnlyFields = new Set([
    'firstName', 'lastName',
    'fatherFirst', 'fatherLast',
    'motherFirst', 'motherLast',
    'emergency_contact_name',
  ]);

  if (nameOnlyFields.has(name)) {
    // strip non-letters (UI hard block)
    const cleaned = valRaw.replace(/[^A-Za-z\s]/g, '');
    const showErr = cleaned.length !== valRaw.length || (cleaned && !LETTERS_ONLY_RE.test(cleaned));
    setField(name, cleaned, name, showErr ? 'Letters only' : '');
    return;
  }
   // ===== Address fields: keep spaces exactly as typed (no trim) =====
  const addressFields = new Set([
    'teacheraddress',
    'comm_addr1', 'comm_addr2',
    'perm_addr1', 'perm_addr2',
    'emergency_contact_address',
  ]);
  if (addressFields.has(name)) {
    setField(name, String(value)); // no trim
    return;
  }


// email lowercased — ANY domain is allowed
if (name === 'teacheremailid') {
  const lowered = valRaw.toLowerCase().trim();
  const ok = !lowered || ANY_EMAIL_RE.test(lowered);
  setField('teacheremailid', lowered, 'teacheremailid', ok ? '' : 'Enter a valid email (any domain)');
  return;
}


  // pincodes: digits only, max 6, show error if not 6 when present
  if (name === 'comm_pincode' || name === 'perm_pincode') {
    const digits = valRaw.replace(/\D/g, '').slice(0, 6);
    const ok = !digits || PIN6_RE.test(digits);
    setField(name, digits, name, ok ? '' : 'Please enter exactly 6 digits');
    return;
  }
   // ===== Mobiles: digits only, up to 10, enforce 10 =====
  if (name === 'teachermob1' || name === 'teachermob2' || name === 'emergency_contact_phone') {
    const digits = String(value).replace(/\D/g, '').slice(0, 10);
    const ok = !digits || PHONE10.test(digits);
    setField(name, digits, name, ok ? '' : 'Enter exactly 10 digits');
    return;
  }
  // teachertype → auto designation (kept from your code)
  if (name === 'teachertype') {
    const autoDesig = DESIGNATION_BY_TYPE[valRaw] || '';
    setFormData((prev) => ({
      ...prev,
      [name]: valRaw,
      teacherdesig: autoDesig || prev.teacherdesig,
    }));
    return;
  }

  // default
  setFormData((prev) => ({ ...prev, [name]: valRaw }));
};


  // Auto-generate ID for new records
  const generateId = () => {
    const teacherCount = teachers.length + 1;
    return `TECH_${teacherCount.toString().padStart(3, '0')}`;
  };

  const buildAddressJson = (a1, a2, pin) =>
    JSON.stringify({ address1: toStringSafe(a1), address2: toStringSafe(a2), pincode: toStringSafe(pin) });

  const handleSubmit = async (e) => {
    e.preventDefault();

    const teachername = `${toStringSafe(formData.firstName)} ${toStringSafe(formData.lastName)}`.trim();
    if (!teachername) {
      setMsg('❌ Please provide First Name and Surname.');
      return;
    }

    const teacheruserid = toStringSafe(formData.teacheremailid).toLowerCase();
if (!teacheruserid) {
  setMsg('❌ Email ID/User ID is required.');
  return;
}
// Basic format check only (any domain allowed)
if (!ANY_EMAIL_RE.test(teacheruserid)) {
  setMsg('❌ Please enter a valid email address.');
  return;
}

// Enforce exact 6-digit pincodes if provided
if (formData.comm_pincode && !PIN6_RE.test(formData.comm_pincode)) {
  setMsg('❌ Communication pincode must be exactly 6 digits.');
  return;
}
if (formData.perm_pincode && !PIN6_RE.test(formData.perm_pincode)) {
  setMsg('❌ Permanent pincode must be exactly 6 digits.');
  return;
}
    if (!toStringSafe(formData.teachermob1)) {
      setMsg('❌ Mobile1 (Password) is required.');
      return;
    }

    if (formData.pancardno && !PAN_RE.test(formData.pancardno)) {
      setMsg('❌ Invalid PAN format. Expected 10 chars: AAAAA9999A');
      return;
    }
    if (formData.aadharno && !AADHAAR_RE.test(formData.aadharno)) {
      setMsg('❌ Invalid Aadhaar format. Expected 12 digits.');
      return;
    }
    if (formData.emergency_contact_phone && !PHONE10.test(formData.emergency_contact_phone)) {
      setMsg('❌ Emergency contact phone must be exactly 10 digits.');
      return;
    }

    setSubmitting(true);
    const now = new Date();

    const payload = {
      teacherid: formData.teacherid || generateId(),
      teacheruserid, // links teacher -> user
      teachername,
      teacheraddress: formData.teacheraddress,
      teacheremailid: teacheruserid, // store lowercase
      teachermob1: formData.teachermob1, // used as password on backend
      teachermob2: formData.teachermob2,
      teachergender: formData.teachergender,
      teachercaste: formData.teachercaste,
      teacherdoj: formData.teacherdoj || null,
      teacherdesig: formData.teacherdesig,
      teachertype: formData.teachertype,
      teachermaxweekhrs: toNumOrNull(formData.teachermaxweekhrs),
      teachercollegeid: toStringSafe(formData.teachercollegeid),
      teachervalid: !!formData.teachervalid,

      teacher_dept_id: toStringSafe(formData.teacher_dept_id),

      teacherparentname1: `${toStringSafe(formData.fatherFirst)} ${toStringSafe(formData.fatherLast)}`.trim(),
      teacherparentname2: `${toStringSafe(formData.motherFirst)} ${toStringSafe(formData.motherLast)}`.trim(),

      pancardno: toStringSafe(formData.pancardno),
      aadharno: toStringSafe(formData.aadharno),

      communication_address: buildAddressJson(formData.comm_addr1, formData.comm_addr2, formData.comm_pincode),
      permanent_address: buildAddressJson(formData.perm_addr1, formData.perm_addr2, formData.perm_pincode),

      teacherdob: formData.teacherdob || null,
      ismarried: !!formData.ismarried,

      emergency_contact_name: formData.emergency_contact_name,
      emergency_contact_address: formData.emergency_contact_address,
      emergency_contact_phone: formData.emergency_contact_phone,

      createdat: now,
      updatedat: now,
    };

    try {
      if (editingId) {
        await axios.put(`${config.TEACHER_ROUTE}/${encodeURIComponent(editingId)}`, payload, {
          headers: { 'Content-Type': 'application/json' },
        });
        setMsg('✅ Teacher updated successfully!');
        closeFormModal();
        fetchTeachers();
      } else {
        // 1) Create teacher
        await axios.post(`${config.TEACHER_ROUTE}`, payload, {
          headers: { 'Content-Type': 'application/json' },
        });

        // 2) Ensure the linked master_user has the right role code based on teachertype
        const type = toStringSafe(formData.teachertype);
        const roleCode = ROLE_ID_BY_TYPE[type] || 'USER';

        // Try update first; if user doesn’t exist, create it
        try {
          await axios.put(`${config.MASTER_USER_ROUTE}/users/${encodeURIComponent(teacheruserid)}`, {
            // send a non-empty password so NOT NULL is satisfied
            userpwd: toStringSafe(formData.teachermob1) || 'ChangeMe@123',
            userroles: roleCode,
            userlastlogon: new Date().toISOString(),
            useractive: true,
          });
        } catch (err) {
          if (err?.response?.status === 404) {
            await axios.post(`${config.MASTER_USER_ROUTE}/users`, {
              userid: teacheruserid,
              userpwd: formData.teachermob1,
              userroles: roleCode,            // store CODE
              usercreated: new Date().toISOString(),
              userlastlogon: new Date().toISOString(),
              useractive: true,
            });
          } else {
            throw err;
          }
        }

        setMsg('✅ Teacher added and role synced!');
        closeFormModal();
        fetchTeachers();
        // Persist and go to TeacherInformation to fill education details
try { localStorage.setItem('lastTeacherId', payload.teacherid); } catch {}
navigate(`/teacher-info?teacherid=${encodeURIComponent(payload.teacherid)}`, {
  state: { teacherid: payload.teacherid, from: 'master-teacher' },
});
        
         
      }
    } catch (err) {
      setMsg(editingId ? '❌ Error updating teacher.' : '❌ Error adding teacher.');
    } finally {
      setSubmitting(false);
    }
  };

  const askDelete = (teacher) => setPendingDelete(teacher);
  const cancelDelete = () => setPendingDelete(null);
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await axios.delete(`${config.TEACHER_ROUTE}/${encodeURIComponent(pendingDelete.teacherid)}`);
      setTeachers((prev) => prev.filter((t) => t.teacherid !== pendingDelete.teacherid));
      setMsg('✅ Teacher deleted successfully!');
    } catch (err) {
      setMsg('❌ Error deleting teacher.');
    } finally {
      setPendingDelete(null);
    }
  };

  const goto = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  /* ---------- small presentational pieces for Uploads Modal ---------- */
  const DetailRow = ({ label, value }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', padding: '8px 10px' }}>
      <div style={{ fontWeight: 600, color: '#374151' }}>{label}</div>
      <div style={{ color: '#111827' }}>{toStringSafe(value) || '—'}</div>
    </div>
  );

  const SectionCard = ({ title, children }) => (
    <div className="mu-tablecard" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #eef2f7', background: '#f9fafb' }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );

  /* ---------- AUTO-FILL PERMANENT ADDRESS WHEN ADDRESS MATCHES COMMUNICATION ---------- */
  useEffect(() => {
    // Normalize a string: lowercase, trim, collapse spaces/commas
    const norm = (s) =>
      toStringSafe(s)
        .toLowerCase()
        .replace(/[\s,]+/g, ' ')
        .trim();

    const addrOneLine = norm(formData.teacheraddress);

    // Build a loose comparable string from communication address parts
    const commCombined = norm(
      [formData.comm_addr1, formData.comm_addr2, formData.comm_pincode].filter(Boolean).join(' ')
    );

    // If the single-line Address contains all comm parts (loose match), keep Permanent in sync
    const matches =
      commCombined.length > 0 &&
      addrOneLine.length > 0 &&
      addrOneLine.includes(norm(formData.comm_addr1)) &&
      (!formData.comm_addr2 || addrOneLine.includes(norm(formData.comm_addr2))) &&
      (!formData.comm_pincode || addrOneLine.includes(norm(formData.comm_pincode)));

    if (matches) {
      // Auto-populate Permanent = Communication (always keep in sync while it matches)
      setFormData((prev) => ({
        ...prev,
        perm_addr1: toStringSafe(prev.comm_addr1),
        perm_addr2: toStringSafe(prev.comm_addr2),
        perm_pincode: toStringSafe(prev.comm_pincode),
      }));
    }
    // If it doesn't match, do nothing — user can fill permanent address manually.
  }, [
    formData.teacheraddress,
    formData.comm_addr1,
    formData.comm_addr2,
    formData.comm_pincode,
  ]);

  // 🔄 Dept: quick lookup map (id -> description label) for viewer
  const deptLabelById = useMemo(
  () => Object.fromEntries((departments || []).map(d => [d.value, d.label])),
  [departments]
);

  const collegeNameById = useMemo(
  () => Object.fromEntries((colleges || []).map(c => [c.id, c.name || ''])),
  [colleges]
);

  /* ---------- UI ---------- */
  return (
    <div className="mu-page">
      <div className="mu-container">
        <h1 className="mu-title">EMPLOYEE</h1>

        {/* Toolbar: Search + Add */}
        <div className="mu-toolbar">
          <div className="searchbox">
            <span className="searchbox__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              className="searchbox__input"
              placeholder="Search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <button className="btn btn--add" onClick={openAddModal}>
            <span className="btn-plus">＋</span> Add
          </button>
        </div>

        {/* Table card */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">
            <div className="mu-tablecard">
              <div className="mu-hscroll">
              <table className="mu-table mu-table--teacher">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">ID</th>
                    <th className="mu-th">Name</th>
                    <th className="mu-th">Email</th>
                    <th className="mu-th">Mobile 1</th>
                    <th className="mu-th">Gender</th>
                    <th className="mu-th">College</th>
                    <th className="mu-th">Dept/Prog</th>
                    <th className="mu-th">Type</th>
                    <th className="mu-th">Valid</th>
                    <th className="mu-th" style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 ? (
                    <tr>
                      <td className="mu-empty" colSpan={10}>
                        No teacher data available.
                      </td>
                    </tr>
                  ) : (
                    paged.map((t) => (
                      <tr key={t.teacherid}>
                        <td className="mu-td">{t.teacherid}</td>
                        <td className="mu-td">{t.teachername}</td>
                        <td className="mu-td">{t.teacheremailid}</td>
                        <td className="mu-td">{t.teachermob1}</td>
                        <td className="mu-td">{t.teachergender}</td>
                        <td className="mu-td">
  {collegeNameById[t.teachercollegeid] || t.teachercollegeid || '—'}
</td>

                        <td className="mu-td">
  {deptLabelById[t.teacher_dept_id] || t.teacher_dept_id || '—'}
</td>

                        <td className="mu-td">{t.teachertype}</td>
                        <td className="mu-td">{t.teachervalid ? '✅' : '❌'}</td>
                        <td className="mu-td" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <td>
  {/* existing actions... */}
  <button
    className="btn btn-outline"
    onClick={() => {
      try { localStorage.setItem('lastTeacherId', t.teacherid); } catch {}
      navigate('/teacher-info', { state: { teacherid: t.teacherid, from: 'master-teacher' } });
    }}
  >
    Education Info
  </button>
</td>

                          <button className="btn btn--primary" onClick={() => openEditModal(t)}>
                            Edit
                          </button>
                          <button className="btn btn--danger" onClick={() => askDelete(t)}>
                            Delete
                          </button>
                          <button className="btn btn--primary" onClick={() => generateTeacherPDF(t)}>
  Download PDF
</button>

                          <button className="btn btn--secondary" onClick={() => openUploadsModal(t)}>
                            Uploads
                          </button>
                          
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </div>

            {/* Chips pagination */}
            <div className="mu-pagination mu-pagination--chips">
              <div className="mu-pageinfo mu-pageinfo--chips">
                Showing page {currentPage} of {totalPages} pages
              </div>
              <div className="mu-pagebtns mu-pagebtns--chips">
                <button className="pagechip" onClick={() => goto(currentPage - 1)} disabled={currentPage === 1}>
                  «
                </button>
                <button className="pagechip pagechip--active" disabled>
                  {currentPage}
                </button>
                <button className="pagechip" onClick={() => goto(currentPage + 1)} disabled={currentPage === totalPages}>
                  »
                </button>
              </div>

              {msg && (
                <div style={{ textAlign: 'center', marginTop: 12, fontWeight: 700 }}>
                  {msg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Teacher Modal */}
      {showFormModal && (
        <div className="modal-overlay" onClick={closeFormModal}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={closeFormModal}>
              ×
            </button>
            <div className="modal-heading">{editingId ? 'Edit Teacher' : 'Add New Employee'}</div>

            <form onSubmit={handleSubmit} autoComplete="off">
              <div className="form-grid form-grid--3">
                {/* IDs */}
                <div className="form-row">
                  <label className="form-label">Teacher ID</label>
                  <input
                    className="form-input"
                    type="text"
                    name="teacherid"
                    value={formData.teacherid || generateId()}
                    onChange={handleChange}
                    required
                    disabled
                  />
                </div>

                {/* Name split */}
                <div className="form-row">
                  <label className="form-label">First Name</label>
                  <input className="form-input" type="text" name="firstName" value={formData.firstName} onChange={handleChange} required />
{errors.firstName && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.firstName}</small>}

                </div>
                <div className="form-row">
                  <label className="form-label">Surname</label>
                  <input className="form-input" type="text" name="lastName" value={formData.lastName} onChange={handleChange} required />
{errors.lastName && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.lastName}</small>}

                </div>

                {/* Contacts */}
                <div className="form-row">
                  <label className="form-label">Email ID/User ID</label>
                  <input className="form-input" type="email" name="teacheremailid" value={formData.teacheremailid} onChange={handleChange} />
{errors.teacheremailid && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.teacheremailid}</small>}

                </div>
                <div className="form-row">
                  <label className="form-label">Mobile1(Password)</label>
                  <input className="form-input" type="text" name="teachermob1" value={formData.teachermob1} onChange={handleChange} />
                </div>
                <div className="form-row">
                  <label className="form-label">Mobile2</label>
                  <input className="form-input" type="text" name="teachermob2" value={formData.teachermob2} onChange={handleChange} />
                </div>

                {/* Simple Address */}
                <div className="form-row span-3">
                  <label className="form-label">Address</label>
                  <input className="form-input" type="text" name="teacheraddress" value={formData.teacheraddress} onChange={handleChange} />
                </div>

                {/* Parents */}
                <div className="form-row">
                  <label className="form-label">Father's First Name</label>
                  <input className="form-input" type="text" name="fatherFirst" value={formData.fatherFirst} onChange={handleChange} />
{errors.fatherFirst && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.fatherFirst}</small>}

                </div>
                <div className="form-row">
                  <label className="form-label">Father's Surname</label>
                  <input className="form-input" type="text" name="fatherLast" value={formData.fatherLast} onChange={handleChange} />
{errors.fatherLast && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.fatherLast}</small>}

                </div>
                <div className="form-row">
                  <label className="form-label">Mother First Name</label>
                  <input className="form-input" type="text" name="motherFirst" value={formData.motherFirst} onChange={handleChange} />
{errors.motherFirst && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.motherFirst}</small>}

                </div>
                <div className="form-row">
                  <label className="form-label">Mother Surname</label>
                 <input className="form-input" type="text" name="motherLast" value={formData.motherLast} onChange={handleChange} />
{errors.motherLast && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.motherLast}</small>}

                </div>

                {/* PAN / Aadhaar */}
                <div className="form-row">
                  <label className="form-label">PAN Card No</label>
                  <input className="form-input" type="text" name="pancardno" value={formData.pancardno} onChange={handleChange} placeholder="AAAAA9999A" />
                </div>
                <div className="form-row">
                  <label className="form-label">Aadhaar No</label>
                  <input className="form-input" type="text" name="aadharno" value={formData.aadharno} onChange={handleChange} placeholder="12 digits" />
                </div>

                {/* Communication Address */}
                <div className="form-row span-3" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
  <h3 style={{ margin: 0 }}>Communication Address</h3>
  <label style={{ display:'inline-flex', alignItems:'center', gap:8, fontWeight:600 }}>
    <input
      type="checkbox"
      checked={sameCommAsAddr}
      onChange={(e) => setSameCommAsAddr(e.target.checked)}
    />
    Same as Address
  </label>
</div>

                <div className="form-row">
                  <label className="form-label">Address 1</label>
                  <input className="form-input" type="text" name="comm_addr1" value={formData.comm_addr1} onChange={handleChange} />
                </div>
                <div className="form-row">
                  <label className="form-label">Address 2</label>
                  <input className="form-input" type="text" name="comm_addr2" value={formData.comm_addr2} onChange={handleChange} />
                </div>
                <div className="form-row">
                  <label className="form-label">Pincode</label>
                 <input className="form-input" type="text" name="comm_pincode" value={formData.comm_pincode} onChange={handleChange} maxLength={6} inputMode="numeric" />
{errors.comm_pincode && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.comm_pincode}</small>}

                </div>

                {/* Permanent Address */}
                <div className="form-row span-3" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
  <h3 style={{ margin: 0 }}>Permanent Address</h3>
  <label style={{ display:'inline-flex', alignItems:'center', gap:8, fontWeight:600 }}>
    <input
      type="checkbox"
      checked={samePermAsComm}
      onChange={(e) => setSamePermAsComm(e.target.checked)}
    />
    Same as Communication
  </label>
</div>

                <div className="form-row">
                  <label className="form-label">Address 1</label>
                  <input className="form-input" type="text" name="perm_addr1" value={formData.perm_addr1} onChange={handleChange} />
                </div>
                <div className="form-row">
                  <label className="form-label">Address 2</label>
                  <input className="form-input" type="text" name="perm_addr2" value={formData.perm_addr2} onChange={handleChange} />
                </div>
                <div className="form-row">
                  <label className="form-label">Pincode</label>
                  <input className="form-input" type="text" name="perm_pincode" value={formData.perm_pincode} onChange={handleChange} maxLength={6} inputMode="numeric" />
{errors.perm_pincode && <small style={{color:'#b91c1c',fontWeight:600}}>{errors.perm_pincode}</small>}

                </div>

                {/* Personal */}
                <div className="form-row">
                  <label className="form-label">D.O.B</label>
                  <input className="form-input" type="date" name="teacherdob" value={formData.teacherdob} onChange={handleChange} />
                </div>
                <div className="form-row">
                  <label className="form-label">Gender</label>
                  <select className="form-input" name="teachergender" value={formData.teachergender} onChange={handleChange}>
                    <option value="">-- Select --</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Others</option>
                  </select>
                </div>

                {/* Caste */}
                <div className="form-row">
                  <label className="form-label">Caste</label>
                  <input
                    className="form-input"
                    type="text"
                    name="teachercaste"
                    list="caste-list"
                    value={formData.teachercaste}
                    onChange={handleChange}
                    placeholder="Select or type…"
                  />
                  <datalist id="caste-list">
                    <option value="General" />
                    <option value="SC" />
                    <option value="ST" />
                    <option value="OBC" />
                    <option value="Other" />
                  </datalist>
                </div>

                <div className="form-row">
                  <label className="form-label">Marital</label>
                  <select className="form-input" name="ismarried" value={formData.ismarried ? 'yes' : 'no'} onChange={(e) => setFormData((p) => ({ ...p, ismarried: e.target.value === 'yes' }))}>
                    <option value="no">Unmarried</option>
                    <option value="yes">Married</option>
                  </select>
                </div>

                {/* Emergency contact */}
                <div className="form-row span-3">
                  <h3 style={{ margin: 0 }}>'Emergency Contact Person'</h3>
                </div>
                <div className="form-row">
                  <label className="form-label">Name</label>
                  <input className="form-input" type="text" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleChange} />
                </div>
                <div className="form-row">
                  <label className="form-label">Address</label>
                  <input className="form-input" type="text" name="emergency_contact_address" value={formData.emergency_contact_address} onChange={handleChange} />
                </div>
                <div className="form-row">
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="text" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleChange} placeholder="10 digits" />
                </div>

                {/* College & Department */}
                <div className="form-row">
                  <label className="form-label">College</label>
                  <select className="form-input" name="teachercollegeid" value={formData.teachercollegeid} onChange={handleChange}>
                    <option value="">Select College</option>
                    {(colleges ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 🔄 Dept: show description in the dropdown label; value stays the same ID */}
                <div className="form-row">
                  <label className="form-label">Department</label>
                  <select className="form-input" name="teacher_dept_id" value={formData.teacher_dept_id} onChange={handleChange}>
                    <option value="">Select Department</option>
                    {(departments ?? []).map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Type/Category */}
                <div className="form-row">
                  <label className="form-label">Type / Category</label>
                  <select className="form-input" name="teachertype" value={formData.teachertype} onChange={handleChange}>
                    <option value="">-- Select --</option>
                    {TEACHER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Designation & Hours */}
                <div className="form-row">
                  <label className="form-label">Designation</label>
                  <input
                    className="form-input"
                    type="text"
                    name="teacherdesig"
                    value={formData.teacherdesig}
                    onChange={handleChange}
                    placeholder={formData.teachertype ? `Auto: ${DESIGNATION_BY_TYPE[formData.teachertype] || ''}` : ''}
                  />
                </div>

                {/* Active */}
                <div className="form-row span-3" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label className="form-label">Active</label>
                  <input type="checkbox" name="teachervalid" checked={formData.teachervalid} onChange={handleChange} />
                </div>
              </div>

              <button type="submit" disabled={submitting} className={`btn--submit ${submitting ? 'is-loading' : ''}`}>
                {editingId ? 'Update Teacher' : 'Add Teacher'}
              </button>
            </form>

            {msg && (
              <div className={msg.startsWith('✅') ? 'modal-desc modal-desc--ok' : 'modal-desc modal-desc--error'}>
                {msg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={cancelDelete}>
              ×
            </button>
            <div className="modal-title danger">Delete Teacher</div>
            <div className="modal-desc">
              Are you sure you want to delete <span className="highlight">Teacher ID: {pendingDelete.teacherid}</span>?
            </div>
            <div className="modal-actions">
              <button className="btn btn--secondary" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="btn btn--danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uploads modal */}
      {showUploadsModal && uploadsTeacher && (
        <div className="modal-overlay" onClick={closeUploadsModal}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <button className="modal-x" onClick={closeUploadsModal}>×</button>
            <div className="modal-heading">Teacher Details</div>

            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, minHeight: 420 }}>
              {/* Left nav */}
              <div className="mu-tablecard" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: 14, borderBottom: '1px solid #eef2f7', fontWeight: 800 }}>Sections</div>
                {[
                  { key: 'basic', label: 'Basic Details' },
                  { key: 'contact', label: 'Contact Details' },
                  { key: 'optional', label: 'Optional Details' },
                  { key: 'uploads', label: 'Uploads' },
                ].map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setDetailTab(s.key)}
                    className={`btn ${detailTab === s.key ? 'btn--primary' : 'btn--secondary'}`}
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      borderRadius: 0,
                      border: 'none',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    {s.label}
                  </button>
                ))}

                <div style={{ padding: 12 }}>
                  <button
                    className="btn btn--secondary"
                    style={{ width: '100%' }}
                    onClick={() => navigate('/teacher-dtls', { state: { teacherid: uploadsTeacher.teacherid } })}
                  >
                    Go to full Uploads page
                  </button>
                </div>
              </div>

              {/* Right content */}
              <div style={{ display: 'grid', gap: 12 }}>
                {/* BASIC DETAILS */}
                {detailTab === 'basic' && (
                  <>
                    <SectionCard title="Basic Details">
                      <DetailRow label="Name" value={uploadsTeacher.teachername} />
                      <DetailRow label="Email" value={uploadsTeacher.teacheremailid} />
                      <DetailRow label="Gender" value={uploadsTeacher.teachergender} />
                      <DetailRow label="Designation" value={uploadsTeacher.teacherdesig} />
                      {/* 🔄 Dept: show description if we have it */}
                      <DetailRow
                        label="Department"
                        value={deptLabelById[uploadsTeacher.teacher_dept_id] || uploadsTeacher.teacher_dept_id}
                      />
                      <DetailRow label="Type" value={uploadsTeacher.teachertype} />
                      <DetailRow label="Code" value={uploadsTeacher.teacherid} />
                    </SectionCard>
                  </>
                )}

                {/* CONTACT DETAILS */}
                {detailTab === 'contact' && (
                  <>
                    <SectionCard title="Contact Details">
                      <DetailRow label="Phone Number" value={uploadsTeacher.teachermob1} />
                      <DetailRow label="Phone Number (Alt)" value={uploadsTeacher.teachermob2} />
                      {/* Address (simple line) */}
                      <DetailRow label="Address" value={uploadsTeacher.teacheraddress} />
                      {/* Communication & Permanent */}
                      {(() => {
                        const comm = parseAddrJson(uploadsTeacher.communication_address);
                        const perm = parseAddrJson(uploadsTeacher.permanent_address);
                        return (
                          <>
                            <DetailRow
                              label="Communication Address"
                              value={[
                                comm.address1,
                                comm.address2 && `, ${comm.address2}`,
                                comm.pincode && ` - ${comm.pincode}`,
                              ].filter(Boolean).join('')}
                            />
                            <DetailRow
                              label="Permanent Address"
                              value={[
                                perm.address1,
                                perm.address2 && `, ${perm.address2}`,
                                perm.pincode && ` - ${perm.pincode}`,
                              ].filter(Boolean).join('')}
                            />
                          </>
                        );
                      })()}
                    </SectionCard>
                  </>
                )}

                {/* OPTIONAL DETAILS */}
                {detailTab === 'optional' && (
                  <>
                    <SectionCard title="Optional Details">
                      <DetailRow label="Aadhaar Number" value={uploadsTeacher.aadharno} />
                      <DetailRow label="PAN Number" value={uploadsTeacher.pancardno} />
                      <DetailRow label="Parents (Father)" value={uploadsTeacher.teacherparentname1} />
                      <DetailRow label="Parents (Mother)" value={uploadsTeacher.teacherparentname2} />
                      <DetailRow label="Date of Birth" value={uploadsTeacher.teacherdob} />
                      <DetailRow label="Caste" value={uploadsTeacher.teachercaste} />
                      <DetailRow label="Marital" value={uploadsTeacher.ismarried ? 'Married' : 'Unmarried'} />
                      <DetailRow label="Active" value={uploadsTeacher.teachervalid ? 'Active' : 'Inactive'} />
                    </SectionCard>
                  </>
                )}

                {/* UPLOADS LIST + QUICK UPLOAD */}
                {detailTab === 'uploads' && (
                  <>
                    <SectionCard title="Uploads">
                      <div style={{ maxHeight: 280, overflow: 'auto' }}>
                        <table className="mu-table">
                          <thead>
                            <tr className="mu-thead-row">
                              <th className="mu-th">Description</th>
                              <th className="mu-th">Aadhaar</th>
                              <th className="mu-th">File</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadsLoading ? (
                              <tr><td className="mu-td" colSpan={3}>Loading…</td></tr>
                            ) : uploads.length === 0 ? (
                              <tr><td className="mu-td" colSpan={3}>No uploads yet.</td></tr>
                            ) : (
                              uploads.map((u) => (
                                <tr key={u.tchr_dtls_id || `${u.tchr_teacher_id}_${u.tchr_dtls_desc}_${u.tchr_aadharno || ''}`}>
                                  <td className="mu-td">{u.tchr_dtls_desc}</td>
                                  <td className="mu-td">{u.tchr_aadharno || '—'}</td>
                                  <td className="mu-td">
  {Number(u.has_file) ? (
    (() => {
      const p = filePreviews[u.tchr_dtls_id];
      if (p?.type === 'image') {
        return (
          <img
            src={p.url}
            alt="preview"
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              objectFit: 'cover',
              border: '1px solid #e5e7eb'
            }}
          />
        );
      }
      if (p?.type === 'pdf') {
        return (
          <span style={{
            display: 'inline-block',
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid #fecaca',
            background: '#fff1f2',
            color: '#b91c1c',
            fontWeight: 700,
            fontSize: 12
          }}>PDF</span>
        );
      }
      // Unknown or not yet loaded: show extension or a neutral badge
      return (
        <span style={{
          display: 'inline-block',
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid #e5e7eb',
          background: '#f3f4f6',
          color: '#374151',
          fontWeight: 700,
          fontSize: 12
        }}>{(p?.ext || 'FILE').toUpperCase()}</span>
      );
    })()
  ) : (
    <span style={{
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
      background: '#f3f4f6',
      color: '#6b7280',
      fontWeight: 700,
      fontSize: 12
    }}>No file</span>
  )}
</td>

                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>
                    {/* --- Education Info (appended under Optional Details) --- */}
<SectionCard title="Education Info">
  {!edu && (
    <div style={{ padding: '10px 12px', color: '#6b7280' }}>
      Loading education info…
    </div>
  )}

  {edu && (
    <div style={{ paddingBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', rowGap: 8, columnGap: 12, padding: '8px 10px' }}>
        {/* Class 10 */}
        <div style={{ fontWeight: 700, color: '#374151' }}>Class 10</div>
        <div>
          {(edu.class10_board || '—')}, YOP: {edu.class10_year_of_passing || '—'} |
          Scale: {edu.class10_grade_scale || '—'} | Grade: {edu.class10_gradepoint || '—'} |
          Marks: {edu.class10_marks_total || '—'}
        </div>

        {/* Class 12 */}
        <div style={{ fontWeight: 700, color: '#374151' }}>Class 12</div>
        <div>
          {(edu.class12_board || '—')} {edu.class12_stream ? `(${edu.class12_stream})` : ''},
          {' '}YOP: {edu.class12_year_of_passing || '—'} |
          Scale: {edu.class12_grade_scale || '—'} | Grade: {edu.class12_gradepoint || '—'} |
          Marks: {edu.class12_marks_total || '—'}
        </div>

        {/* Diploma */}
        <div style={{ fontWeight: 700, color: '#374151' }}>Diploma</div>
        <div>
          Branch: {edu.diploma_branch || '—'}, YOP: {edu.diploma_year_of_passing || '—'} |
          Scale: {edu.diploma_grade_scale || '—'} |
          Sem GP: [
            {[
              edu.diploma_sem1_gp, edu.diploma_sem2_gp, edu.diploma_sem3_gp,
              edu.diploma_sem4_gp, edu.diploma_sem5_gp, edu.diploma_sem6_gp
            ].map(v => v || '—').join(', ')}
          ]
        </div>

        {/* Bachelor */}
        <div style={{ fontWeight: 700, color: '#374151' }}>Bachelor</div>
        <div>
          {edu.bachelor_degree || '—'} — {edu.bachelor_department || '—'},
          {' '}Univ: {edu.bachelor_university || '—'}, YOP: {edu.bachelor_year_of_passing || '—'} |
          Scale: {edu.bachelor_grade_scale || '—'} | Grade: {edu.bachelor_gradepoint || '—'}
        </div>

        {/* Master */}
        <div style={{ fontWeight: 700, color: '#374151' }}>Master</div>
        <div>
          {edu.master_degree || '—'} — {edu.master_department || '—'},
          {' '}Univ: {edu.master_university || '—'}, YOP: {edu.master_year_of_passing || '—'} |
          Scale: {edu.master_grade_scale || '—'} | Grade: {edu.master_gradepoint || '—'}
        </div>

        {/* PhD */}
        <div style={{ fontWeight: 700, color: '#374151' }}>PhD</div>
        <div>
          Field: {edu.phd_field || '—'}, Univ: {edu.phd_university || '—'},
          {' '}YOP: {edu.phd_year_of_passing || '—'}
        </div>
      </div>
    </div>
  )}
</SectionCard>

                    <SectionCard title="Quick Upload">
                      <div style={{ padding: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
                          <select
                            className="form-input"
                            value={upDesc}
                            onChange={(e) => setUpDesc(e.target.value)}
                          >
                            <option value="">Select document</option>
                            {DOC_DESC_OPTIONS.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                            <option value="__CUSTOM__">Custom…</option>
                          </select>

                          {upDesc === '__CUSTOM__' ? (
                            <input
                              className="form-input"
                              placeholder="Custom description"
                              value={upDescCustom}
                              onChange={(e) => setUpDescCustom(e.target.value)}
                            />
                          ) : (
                            <input
                              className="form-input"
                              placeholder="Aadhaar (optional)"
                              value={upAadhaar}
                              onChange={(e) => setUpAadhaar(e.target.value)}
                            />
                          )}

                          <input
                            className="form-input"
                            type="file"
                            onChange={(e) => setUpFile(e.target.files?.[0] || null)}
                            style={{ gridColumn: '1 / -1' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                          <button className="btn btn--primary" onClick={doQuickUpload}>Upload</button>
                          <button
                            className="btn btn--secondary"
                            onClick={() => { setUpDesc(''); setUpDescCustom(''); setUpAadhaar(''); setUpFile(null); }}
                          >
                            Reset
                          </button>
                        </div>

                        {uploadsMsg && (
                          <div style={{ marginTop: 10, fontWeight: 700 }}>
                            {uploadsMsg}
                          </div>
                        )}
                      </div>
                    </SectionCard>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
