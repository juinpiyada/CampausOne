// SMS-ui/src/pages/CourseOffering/CollegeCourseOfferingManager.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css';

/* =========================================================
   Small helpers
   ========================================================= */
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

const API = joinUrl(config.COURSE_OFFERING_ROUTE);

// Prefer explicit route; else build from BASE_URL
const CLASS_ROOM_BASE =
  (config.CLASS_ROOM_ROUTE && String(config.CLASS_ROOM_ROUTE).trim()) ||
  joinUrl(String(config.BASE_URL || ''), '/api/class-room');

const PAGE_SIZE = 4;
const OFFER_PREFIX = 'COURSE_OFFER_ID_';

const defaultForm = {
  offerid: '',
  offer_programid: '',   // UI holds department id here; we map to courseid when submitting
  offer_courseid: '',    // subjectid
  offer_term: '',
  offer_facultyid: '',
  offer_semesterno: '',
  offer_section: '',
  offer_capacity: '',
  offerroom: '',
  offer_collegename: '',
  teacher_dept_override: '' // Optional override for teacher department filtering
};

/* =========================================================
   Colleges normalization
   ========================================================= */
function ensureViewCollegesUrl(baseMaybeWithOrWithoutView) {
  // Prefer configured route; otherwise build from BASE_URL
  const explicit = String(baseMaybeWithOrWithoutView || config.COLLEGES_ROUTE || '').trim();
  if (explicit) {
    return /\/view-colleges\/?$/i.test(explicit) ? explicit : joinUrl(explicit, 'view-colleges');
  }
  // Fallback from BASE_URL
  return joinUrl(String(config.BASE_URL || ''), '/master-college/view-colleges');
}
function pickArrayLike(obj) {
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj?.rows)) return obj.rows;
  if (Array.isArray(obj?.data)) return obj.data;
  if (Array.isArray(obj?.colleges)) return obj.colleges;
  if (Array.isArray(obj?.result)) return obj.result;
  return [];
}
function normalizeColleges(payload) {
  const arr = pickArrayLike(payload?.data ?? payload);
  return arr
    .map((c) => {
      const id =
        c.collegeid ??
        c.college_id ??
        c.id ??
        c.code ??
        c.slug ??
        String(c.collegename ?? c.college_name ?? c.name ?? '');
      const name = String(
        c.collegename ?? c.college_name ?? c.name ?? c.title ?? c.label ?? id ?? ''
      ).trim();
      return { id, name };
    })
    .filter((x) => x.name);
}

/* =========================================================
   Rooms normalization
   ========================================================= */
function normalizeRooms(payload) {
  const arr = Array.isArray(payload?.classrooms)
    ? payload.classrooms
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
    ? payload.rows
    : Array.isArray(payload?.result)
    ? payload.result
    : Array.isArray(payload)
    ? payload
    : [];

  return arr
    .map((r) => {
      const id =
        r.classroomid ??
        r.class_room_id ??
        r.classroom_id ??
        r.id ??
        r.code ??
        r.roomno ??
        r.room_no ??
        r.number ??
        '';
      const name = String(
        r.classroomname ??
          r.class_room_name ??
          r.classroom_name ??
          r.roomname ??
          r.room_name ??
          r.name ??
          r.title ??
          r.label ??
          id
      ).trim();
      return { id: String(id || name || '').trim(), name: name || String(id || '').trim() };
    })
    .filter((x) => x.id && x.name);
}

/* =========================================================
   Academic Year helpers
   ========================================================= */
function parseYearLike(y) {
  const startRaw =
    y.collegeacadyearstartdt ??
    y.startdt ??
    y.start_date ??
    y.start ??
    null;
  if (startRaw) {
    const t = Date.parse(startRaw);
    if (!Number.isNaN(t)) return t; // larger = “newer”
  }
  const label = String(
    y.year ?? y.acadyearname ?? y.termname ?? y.label ?? y.name ?? ''
  ).trim();
  const matches = label.match(/(20\d{2})/g);
  if (matches && matches.length) return Math.max(...matches.map(Number));
  const idNum = Number(y.acad_yearid ?? y.id ?? y.termid ?? NaN);
  if (Number.isFinite(idNum)) return idNum;
  return -Infinity;
}
function getYearId(y) {
  return (
    y.acad_yearid ??
    y.id ??
    y.termid ??
    y.year ??
    y.acadyearname ??
    y.termname ??
    ''
  );
}
function pickLatestYear(years = []) {
  if (!Array.isArray(years) || years.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const y of years) {
    const status = String(y.collegeacadyearstatus || '').toLowerCase();
    const baseScore = parseYearLike(y);
    const bonus = status === 'active' ? 1 : 0;
    const score = baseScore + bonus;
    if (score > bestScore) {
      bestScore = score;
      best = y;
    }
  }
  return best || years[0];
}
function filterYearsByDept(years, deptId) {
  if (!deptId) return [];
  return (years || []).filter(
    (y) =>
      String(y.collegedeptid ?? y.dept_id ?? y.departmentid ?? '') === String(deptId)
  );
}

/* =========================================================
   Subject helpers (+ local semester cache)
   ========================================================= */
const SEM_STORE_KEY = 'sms_subject_semesters_v1';
function loadSemesterMap() {
  try { return JSON.parse(localStorage.getItem(SEM_STORE_KEY) || '{}') || {}; }
  catch { return {}; }
}
function attachLocalSemesterToSubjects(rows) {
  const map = loadSemesterMap();
  return (rows || []).map(r => ({
    ...r,
    _localSemester: map[r.subjectid] ?? r._localSemester ?? ''
  }));
}

function readSubjectSemester(s) {
  const local = s?._localSemester ?? s?.localSemester ?? '';
  const raw =
    s?.subjectsemester ??
    s?.semester ??
    s?.subject_semester ??
    s?.stu_semester ??
    local ??
    '';
  const n = Number(raw);
  if (Number.isFinite(n)) return n > 0 ? String(n) : '';
  return String(raw || '');
}
function matchesDeptAndSemester(subj, deptId, sem) {
  if (!deptId || !sem) return false;
  const subjDept = String(subj.subjectdeptid ?? '');
  const subjSem  = readSubjectSemester(subj);
  return String(subjDept) === String(deptId) && String(subjSem) === String(sem);
}
function matchesDeptOnly(subj, deptId) {
  if (!deptId) return false;
  const subjDept = String(subj.subjectdeptid ?? '');
  return String(subjDept) === String(deptId);
}
function deriveSemestersFromSubjects(subjects, deptId) {
  const list = (subjects || []).filter((s) => matchesDeptOnly(s, deptId));
  const nums = new Set();
  list.forEach((s) => {
    const sem = readSubjectSemester(s);
    const n = Number(sem);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  });
  const arr = Array.from(nums).sort((a, b) => a - b);
  return arr.length ? arr : [1, 2, 3, 4, 5, 6, 7, 8];
}
function pickDefaultSemesterForDept(subjects, deptId) {
  const list = (subjects || []).filter((s) => matchesDeptOnly(s, deptId));
  if (!list.length) return '';
  const freq = new Map();
  list.forEach((s) => {
    const sem = readSubjectSemester(s);
    const n = Number(sem);
    if (Number.isFinite(n) && n > 0) {
      freq.set(n, (freq.get(n) || 0) + 1);
    }
  });
  if (!freq.size) return '';
  let best = null;
  let bestCount = -1;
  for (const [sem, count] of freq.entries()) {
    if (count > bestCount || (count === bestCount && sem < best)) {
      best = sem;
      bestCount = count;
    }
  }
  return String(best ?? '');
}

/* =========================================================
   Program (dept) → Course resolver
   ========================================================= */
function resolveCourseId({
  programVal,
  selectedSubjectId,
  courses = [],
  subjects = [],
  departments = []
}) {
  const v = String(programVal || '').trim();
  if (!v) return null;

  console.log('🔍 Resolving Course ID for:', { programVal: v, selectedSubjectId, coursesCount: courses.length, subjectsCount: subjects.length });

  // 1) Direct match with existing course id/code
  const byId = courses.find(
    (c) => String(c.courseid) === v || String(c.course_code) === v
  );
  if (byId) {
    console.log('✅ Found direct course match:', byId.courseid || byId.course_code);
    return byId.courseid || byId.course_code;
  }

  // 2) From subject linkage (if subject is selected and has course mapping)
  if (selectedSubjectId) {
    const subj = subjects.find((s) => String(s.subjectid) === String(selectedSubjectId));
    if (subj) {
      const subjCourseId =
        subj?.courseid ??
        subj?.subjectcourseid ??
        subj?.subject_courseid ??
        subj?.course_id ??
        null;
      if (subjCourseId) {
        console.log('✅ Found course ID from subject:', subjCourseId);
        return String(subjCourseId);
      }
    }
  }

  // 3) From department → course linkage on course rows
  const byDept = courses.find((c) =>
    [c.collegedeptid, c.collegedept, c.deptid, c.departmentid, c.dept_id]
      .map((x) => String(x ?? ''))
      .includes(v)
  );
  if (byDept) {
    console.log('✅ Found course by department linkage:', byDept.courseid || byDept.course_code);
    return byDept.courseid || byDept.course_code;
  }

  // 4) Heuristic matching by department code/description
  const deptRow = departments.find((d) => String(d.collegedeptid) === v);
  if (deptRow) {
    const deptCode = String(deptRow?.colldept_code || '')
      .trim()
      .toUpperCase();
    const descToken = String(deptRow?.collegedeptdesc || '')
      .split(/\s+/)[0]
      .trim()
      .toUpperCase();

    const needles = [deptCode, descToken, v.toUpperCase()].filter(Boolean);
    if (needles.length) {
      const byCode = courses.find((c) => {
        const cid = String(c.courseid ?? '').toUpperCase();
        const ccode = String(c.course_code ?? '').toUpperCase();
        const cname = String(c.coursename ?? c.coursedesc ?? '').toUpperCase();
        return needles.some((n) => n && (cid.includes(n) || ccode.includes(n) || cname.includes(n)));
      });
      if (byCode) {
        console.log('✅ Found course by heuristic matching:', byCode.courseid || byCode.course_code);
        return byCode.courseid || byCode.course_code;
      }
    }
  }

  // 5) FALLBACK: If we have courses available, try to find a default one
  if (courses.length > 0) {
    // Try to find a course that might be a default or general one
    const defaultCourse = courses.find(c => 
      String(c.coursename || c.coursedesc || '').toLowerCase().includes('general') ||
      String(c.coursename || c.coursedesc || '').toLowerCase().includes('default') ||
      String(c.course_code || '').toLowerCase().includes('gen')
    ) || courses[0]; // Fallback to first available course
    
    if (defaultCourse) {
      console.log('⚠️ Using fallback course:', defaultCourse.courseid || defaultCourse.course_code);
      return defaultCourse.courseid || defaultCourse.course_code;
    }
  }

  // 6) ULTIMATE FALLBACK: Use the department ID itself if no course mapping exists
  // This assumes the backend can handle department IDs as course IDs
  console.log('⚠️ No course mapping found, using department ID as fallback:', v);
  return v;
}

/* =========================================================
   NEW: resilient teacher fetch (keeps API unchanged)
   ========================================================= */
async function fetchTeachersResilient() {
  const base = String(config.TEACHER_ROUTE || '').trim();
  const baseUrlFallback = joinUrl(String(config.BASE_URL || ''), '/api/teacher');
  const candidates = [
    base,
    joinUrl(base, 'list'),
    joinUrl(base, 'all'),
    joinUrl(base, 'view'),
    baseUrlFallback
  ].filter((u, i, a) => u && a.indexOf(u) === i);

  for (const url of candidates) {
    try {
      const r = await axios.get(url);
      return r?.data?.teachers || r?.data || [];
    } catch {}
  }
  return [];
}


/* =========================================================
   Component
   ========================================================= */
const CollegeCourseOfferingManager = () => {
  const [formData, setFormData] = useState(defaultForm);
  const [offerings, setOfferings] = useState([]);

  const [courses, setCourses] = useState([]);    // master_course
  const [subjects, setSubjects] = useState([]);  // master_subject
  const [teachers, setTeachers] = useState([]);  // all teachers
  const [filteredTeachers, setFilteredTeachers] = useState([]); // teachers filtered by subject/department
  const [years, setYears] = useState([]);

  const [departments, setDepartments] = useState([]); // from /api/master-depts

  const [colleges, setColleges] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [studentSectionOptions, setStudentSectionOptions] = useState(['A', 'B', 'C']);

  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchDropdowns();
    fetchOfferings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize filtered teachers when teachers data is loaded
  useEffect(() => {
    if (teachers.length > 0 && filteredTeachers.length === 0) {
      setFilteredTeachers(teachers);
    }
  }, [teachers, filteredTeachers.length]);

  // Fetch teachers when department selection changes
  useEffect(() => {
    if (formData.offer_programid && departments.length > 0) {
      fetchTeachersForDepartment(formData.offer_programid);
    } else {
      setFilteredTeachers(teachers);
    }
  }, [formData.offer_programid, departments, teachers]);

  const fetchDropdowns = async () => {
    try {
      const collegesUrl = ensureViewCollegesUrl(config.COLLEGES_ROUTE);

      const roomGet = async () => {
        try {
          return await axios.get(CLASS_ROOM_BASE); // prefers /api/class-room => { classrooms: [...] }
        } catch {
          return await axios.get(joinUrl(CLASS_ROOM_BASE, 'list')); // fallback
        }
      };

      // Your departments API returns an ARRAY at config.MASTER_DEPTS_ROUTE
      const deptsUrl =
        (config.MASTER_DEPTS_ROUTE && String(config.MASTER_DEPTS_ROUTE).trim()) ||
        '/api/master-depts';

      // Use Promise.allSettled so one failure (like /api/teacher 500) doesn't nuke everything
      const [cr, sr, yr, col, roomRes, deptRes] = await Promise.allSettled([
        axios.get(joinUrl(config.COURSE_ROUTE, 'all')),
        axios.get(joinUrl(config.SUBJECT_ROUTE, 'list')),
        axios.get(config.MASTER_ACADYEAR_ROUTE),
        axios.get(collegesUrl),
        roomGet(),
        axios.get(deptsUrl)
      ]);

      // Courses
      if (cr.status === 'fulfilled') {
        setCourses(cr.value?.data?.courses || cr.value?.data || []);
      } else {
        setCourses([]);
      }

      // Subjects (+ local semester cache)
      if (sr.status === 'fulfilled') {
        const rawSubjects = sr.value?.data?.subjects || sr.value?.data || [];
        setSubjects(attachLocalSemesterToSubjects(rawSubjects));
      } else {
        setSubjects([]);
      }

      // Academic years
      if (yr.status === 'fulfilled') {
        setYears(yr.value?.data?.years || yr.value?.data?.acadyears || yr.value?.data || []);
      } else {
        setYears([]);
      }

      // Departments
      if (deptRes.status === 'fulfilled') {
        const rawDepts = Array.isArray(deptRes.value?.data)
          ? deptRes.value.data
          : deptRes.value?.data?.departments || [];
        const normDepts = (rawDepts || [])
          .map((d) => ({
            collegedeptid:
              d.collegedeptid ??
              d.deptid ??
              d.departmentid ??
              d.dept_id ??
              d.id ??
              d.code ??
              '',
            colldept_code: d.colldept_code ?? d.dept_code ?? d.code ?? '',
            collegedeptdesc:
              d.collegedeptdesc ??
              d.deptname ??
              d.departmentname ??
              d.dept_name ??
              d.name ??
              ''
          }))
          .filter((d) => d.collegedeptid && d.collegedeptdesc);
        setDepartments(normDepts);
      } else {
        setDepartments([]);
      }

      // Colleges
      if (col.status === 'fulfilled') {
        setColleges(normalizeColleges(col.value));
      } else {
        setColleges([]);
      }

      // Rooms
      if (roomRes.status === 'fulfilled') {
        setRooms(normalizeRooms(roomRes.value?.data));
      } else {
        setRooms([]);
      }

      setStudentSectionOptions(['A', 'B', 'C']);

      // Teachers: fetch resiliently (keeps UI working even if /api/teacher 500s)
      const tchs = await fetchTeachersResilient();
      setTeachers(tchs);
    } catch (err) {
      console.debug('[CourseOffering] fetchDropdowns error (outer):', err);
      setCourses([]); setSubjects([]); setTeachers([]); setYears([]);
      setDepartments([]);
      setColleges([]); setRooms([]);
      setStudentSectionOptions(['A', 'B', 'C']);
      setError('Failed to load dropdown data');
    }
  };

  const fetchOfferings = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API);
      setOfferings(res?.data?.offerings || res?.data || []);
    } catch (err) {
      setOfferings([]);
      setError('Failed to fetch offerings');
    } finally {
      setLoading(false);
    }
  };

  // Remove the old subject-based teacher fetching logic
  // Teachers are now filtered by department only

  const fetchTeachersForDepartment = async (departmentId) => {
    if (!departmentId) {
      setFilteredTeachers(teachers);
      return;
    }

    try {
      console.log(`🏢 Fetching teachers for department: ${departmentId}`);
      
      // Try the department-specific endpoint first
      try {
        const response = await axios.get(`${API}/teachers-for-department?departmentid=${encodeURIComponent(departmentId)}`);
        const deptTeachers = response.data?.teachers || [];
        
        if (deptTeachers.length > 0) {
          console.log(`✅ Found ${deptTeachers.length} teachers for department ${departmentId}`);
          setFilteredTeachers(deptTeachers);
          return;
        }
      } catch (apiErr) {
        // If the department endpoint fails, fallback to filtering locally
        console.log('⚠️ Department teacher API failed, using local filtering');
      }
      
      // Local filtering fallback - filter teachers by department if they have dept info
      const localFiltered = teachers.filter(t => {
        // Check if teacher has department association
        const teacherDept = t.departmentid || t.dept_id || t.teacher_dept || t.department;
        return !teacherDept || String(teacherDept) === String(departmentId);
      });
      
      if (localFiltered.length > 0) {
        console.log(`✅ Found ${localFiltered.length} teachers for department ${departmentId} (local filter)`);
        setFilteredTeachers(localFiltered);
      } else {
        console.log(`⚠️ No department-specific teachers found, showing all ${teachers.length} teachers`);
        setFilteredTeachers(teachers);
      }
    } catch (err) {
      console.error('Error in teacher filtering:', err.message);
      console.log('⚠️ Fallback: showing all teachers due to error');
      // Ultimate fallback to all teachers if everything fails
      setFilteredTeachers(teachers);
    }
  };

  const resetForm = () => setFormData(defaultForm);

  const handleChange = ({ target: { name, value, type, checked } }) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };

      // When Subject changes → auto-snap Semester if subject carries it
      if (name === 'offer_courseid') {
        const subj = subjects.find((s) => String(s.subjectid) === String(value));
        if (subj) {
          const sem = readSubjectSemester(subj);
          if (sem && String(sem) !== String(prev.offer_semesterno || '')) {
            next.offer_semesterno = String(sem);
          }
        }
      }

      // When Department changes → clear Subject, Semester, and Teacher
      if (name === 'offer_programid') {
        next.offer_courseid = '';
        next.offer_semesterno = '';
        next.offer_facultyid = ''; // Clear teacher selection when department changes
      }

      return next;
    });
  };

  /* ---------------- Academic year scoping by department ---------------- */
  const deptYears = useMemo(() => {
    if (!formData.offer_programid) return [];
    return filterYearsByDept(years, formData.offer_programid);
  }, [years, formData.offer_programid]);

  const yearsForSelect = useMemo(() => {
    if (!years || years.length === 0) return [];
    if (!deptYears.length) return years;
    const deptSet = new Set(deptYears.map((y) => String(getYearId(y))));
    const others = years.filter((y) => !deptSet.has(String(getYearId(y))));
    return [...deptYears, ...others];
  }, [years, deptYears]);

  useEffect(() => {
    if (!formData.offer_programid) return;
    if (!Array.isArray(years) || years.length === 0) return;
    const scoped = deptYears.length ? deptYears : years;
    const latest = pickLatestYear(scoped);
    if (!latest) return;
    const latestId = String(getYearId(latest) ?? '').trim();
    if (!latestId) return;

    setFormData((prev) => {
      if (String(prev.offer_term ?? '') === latestId) return prev;
      return { ...prev, offer_term: latestId };
    });
  }, [formData.offer_programid, years, deptYears]);

  /* ---------------- Subjects & Semesters (derived from subjects table) ---------------- */
  const filteredSubjects = useMemo(() => {
    const deptId = formData.offer_programid;
    const sem = String(formData.offer_semesterno || '');
    if (!deptId || !sem) return [];
    return (subjects || []).filter((s) => matchesDeptAndSemester(s, deptId, sem));
  }, [subjects, formData.offer_programid, formData.offer_semesterno]);

  const deptOnlySubjects = useMemo(() => {
    const deptId = formData.offer_programid;
    if (!deptId) return [];
    return (subjects || []).filter((s) => matchesDeptOnly(s, deptId));
  }, [subjects, formData.offer_programid]);

  const semesterOptions = useMemo(() => {
    if (!formData.offer_programid) return [1, 2, 3, 4, 5, 6, 7, 8];
    return deriveSemestersFromSubjects(subjects, formData.offer_programid);
  }, [subjects, formData.offer_programid]);

  const subjectsForSelect = useMemo(() => {
    if (!subjects || subjects.length === 0) return [];
    if (filteredSubjects.length) {
      const matchedIds = new Set(filteredSubjects.map((s) => String(s.subjectid)));
      const others = subjects.filter((s) => !matchedIds.has(String(s.subjectid)));
      return [...filteredSubjects, ...others];
    }
    if (deptOnlySubjects.length) {
      const matchedIds = new Set(deptOnlySubjects.map((s) => String(s.subjectid)));
      const others = subjects.filter((s) => !matchedIds.has(String(s.subjectid)));
      return [...deptOnlySubjects, ...others];
    }
    return subjects;
  }, [subjects, filteredSubjects, deptOnlySubjects]);

  // Auto choose a default semester for the dept
  useEffect(() => {
    const deptId = formData.offer_programid;
    if (!deptId) return;

    const suggestedSem = pickDefaultSemesterForDept(subjects, deptId);
    if (!suggestedSem) return;

    setFormData((prev) => {
      if (String(prev.offer_semesterno || '') === String(suggestedSem)) return prev;
      return { ...prev, offer_semesterno: String(suggestedSem) };
    });
  }, [subjects, formData.offer_programid]);

  // Auto select a subject when dept/semester changes
  useEffect(() => {
    const deptId = formData.offer_programid;
    if (!deptId) return;

    const sem = String(formData.offer_semesterno || '');
    const pool = sem ? filteredSubjects : deptOnlySubjects;
    const first = pool[0];

    setFormData((prev) => {
      const current = subjects.find((s) => String(s.subjectid) === String(prev.offer_courseid));
      if (sem && current && matchesDeptAndSemester(current, deptId, sem)) return prev;
      if (!sem && current && matchesDeptOnly(current, deptId)) return prev;

      const nextId = first ? String(first.subjectid) : '';
      if (String(prev.offer_courseid || '') === nextId) return prev;
      return { ...prev, offer_courseid: nextId };
    });
  }, [filteredSubjects, deptOnlySubjects, subjects, formData.offer_programid, formData.offer_semesterno]);

  /* ---------------- TEACHERS filtered by subject using subject_teacher table ---------------- */
  const teachersForDept = useMemo(() => {
    // Use the filtered teachers from the API calls
    return filteredTeachers || [];
  }, [filteredTeachers]);

  // Fetch teachers when department changes
  useEffect(() => {
    if (formData.offer_programid) {
      fetchTeachersForDepartment(formData.offer_programid);
    } else {
      setFilteredTeachers(teachers);
    }
  }, [formData.offer_programid, teachers]);

  // If current teacher selection doesn't belong to selected dept, clear it
  useEffect(() => {
    if (!formData.offer_programid) return;
    if (!formData.offer_facultyid) return;
    const ok = teachersForDept.some((t) => String(t.teacherid) === String(formData.offer_facultyid));
    if (!ok) {
      setFormData((prev) => ({ ...prev, offer_facultyid: '' }));
    }
  }, [teachersForDept, formData.offer_programid, formData.offer_facultyid]);

  /* ---------------- Offer ID generation ---------------- */
  const computeNextOfferId = (list = []) => {
    let maxNum = 0;
    let maxWidth = 3;
    list.forEach((o) => {
      const raw = String(o.offerid || '').trim();
      const m = raw.match(/^COURSE_OFFER_ID_(\d+)$/i);
      if (m) {
        const numStr = m[1];
        const num = parseInt(numStr, 10);
        if (Number.isFinite(num) && num > maxNum) {
          maxNum = num;
          maxWidth = Math.max(maxWidth, numStr.length);
        }
      }
    });
    const next = maxNum + 1;
    const padded = String(next).padStart(maxWidth, '0');
    return `${OFFER_PREFIX}${padded}`;
  };

  /* ---------------- Submit ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    // Basic validation
    if (!formData.offer_programid) {
      setError('Please select a Program/Department.');
      return;
    }
    
    if (!formData.offer_courseid) {
      setError('Please select a Subject/Course.');
      return;
    }

    let currentOfferId = formData.offerid;
    if (!editing && (!currentOfferId || !/^COURSE_OFFER_ID_\d+$/i.test(currentOfferId))) {
      currentOfferId = computeNextOfferId(offerings);
    }

    console.log('🚀 Starting course offering submission:', {
      programId: formData.offer_programid,
      subjectId: formData.offer_courseid,
      coursesAvailable: courses.length,
      subjectsAvailable: subjects.length,
      departmentsAvailable: departments.length
    });

    // Resolve department (program) → master_course.courseid
    const programForDB = resolveCourseId({
      programVal: formData.offer_programid,
      selectedSubjectId: formData.offer_courseid,
      courses,
      subjects,
      departments
    });

    console.log('🔍 Course resolution result:', { programForDB, originalDeptId: formData.offer_programid });

    if (!programForDB) {
      // Provide more detailed error information
      const selectedDept = departments.find(d => String(d.collegedeptid) === String(formData.offer_programid));
      const deptName = selectedDept?.collegedeptdesc || 'Unknown Department';
      
      setError(
        `Cannot resolve "${deptName}" to a valid Course ID. ` +
        `This might happen if: (1) No courses are linked to this department, ` +
        `(2) Course master data is missing, or (3) Subject-course linkage is incomplete. ` +
        `Available courses: ${courses.length}. Please contact administrator to set up course mappings.`
      );
      return;
    }

    // Build payload with validation
    const payload = {
      offerid: currentOfferId,
      offer_programid: programForDB || formData.offer_programid, // Use original dept ID as fallback
      offer_courseid: formData.offer_courseid, // subjectid
      offfer_term: formData.offer_term || '',  // DB column spelled with 3 f's
      offer_facultyid: formData.offer_facultyid || '',
      offer_semesterno: formData.offer_semesterno === '' ? null : Number(formData.offer_semesterno),
      offer_section: formData.offer_section || '',
      offer_capacity: formData.offer_capacity === '' ? null : Number(formData.offer_capacity),
      offerroom: formData.offerroom || '',
      offer_collegename: formData.offer_collegename || ''
    };
    
    // Clean up null values for empty strings to avoid backend issues
    Object.keys(payload).forEach(key => {
      if (payload[key] === null || payload[key] === undefined) {
        payload[key] = '';
      }
    });

    try {
      const exists = offerings.some((o) => String(o.offerid) === String(currentOfferId));

      console.log('📤 Submitting payload:', payload);

      if (exists) {
        await axios.put(`${API}/${encodeURIComponent(currentOfferId)}`, payload);
        setMessage('Offering updated successfully');
      } else {
        await axios.post(API, payload);
        setMessage('Offering created successfully');
      }

      resetForm();
      setEditing(false);
      setShowForm(false);
      fetchOfferings();
    } catch (err) {
      console.error('❌ Submit error:', err);
      
      // Extract detailed error message
      let errorMessage = 'Submit failed';
      
      if (err.response?.data) {
        const data = err.response.data;
        if (data.error) {
          errorMessage = data.error;
        } else if (data.details) {
          errorMessage = data.details;
        } else if (data.message) {
          errorMessage = data.message;
        } else if (typeof data === 'string') {
          errorMessage = data;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Check for specific error types
      if (err.response?.status === 500) {
        errorMessage = `Server error: ${errorMessage}. Please check if all required fields are properly filled and the course/department mapping exists.`;
      } else if (err.response?.status === 400) {
        errorMessage = `Validation error: ${errorMessage}`;
      } else if (err.response?.status === 404) {
        errorMessage = `Not found: ${errorMessage}`;
      }
      
      setError(errorMessage);
    }
  };

  /* ---------------- Edit/Delete ---------------- */
  const handleEdit = (off) => {
    setFormData({
      offerid: off.offerid ?? '',
      offer_programid: off.offer_programid ?? '',
      offer_courseid: off.offer_courseid ?? '',
      offer_term: off.offfer_term ?? off.offer_term ?? '',
      offer_facultyid: off.offer_facultyid ?? '',
      offer_semesterno: off.offer_semesterno ?? '',
      offer_section: off.offer_section ?? '',
      offer_capacity: off.offer_capacity ?? '',
      offerroom: off.offerroom ?? '',
      offer_collegename: off.offer_collegename ?? '',
      teacher_dept_override: '' // Reset override when editing existing records
    });
    setEditing(true);
    setShowForm(true);
    setMessage('');
    setError('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete ${id}?`)) return;
    setMessage('');
    setError('');
    try {
      await axios.delete(`${API}/${encodeURIComponent(id)}`);
      setOfferings((list) => list.filter((o) => String(o.offerid) !== String(id)));
      setMessage('Offering deleted');
    } catch (err) {
      setError('Delete failed');
    }
  };

  /* ---------------- Display helpers ---------------- */
  const getSubjectDesc = (subjId) => {
    const s = subjects.find(
      (x) =>
        String(x.subjectid) === String(subjId) ||
        String(x.subject_code) === String(subjId) ||
        String(x.subjectname) === String(subjId)
    );
    return s
      ? (s.subjectname || s.subjectdesc || s.subject_description || s.subject_code || subjId)
      : subjId;
  };

  // Show department desc if the stored value equals a dept id; else show course name
  const getCourseDesc = (courseId) => {
    const d = departments.find((x) => String(x.collegedeptid) === String(courseId));
    if (d) return d.collegedeptdesc || courseId;

    const c = courses.find(
      (x) =>
        String(x.courseid) === String(courseId) ||
        String(x.course_code) === String(courseId) ||
        String(x.coursename) === String(courseId) ||
        String(x.coursedesc) === String(courseId)
    );
    return c
      ? (c.coursename || c.coursedesc || c.course_description || c.course_code || courseId)
      : courseId;
  };

  /* ---------------- Filtering & pagination ---------------- */
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return offerings;
    return offerings.filter((o) =>
      [
        o.offerid,
        o.offer_programid,
        o.offer_courseid,
        o.offfer_term ?? o.offer_term,
        o.offer_facultyid,
        o.offer_semesterno,
        o.offer_section,
        o.offer_capacity,
        o.offerroom,
        o.offer_collegename
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .some((txt) => txt.includes(s))
    );
  }, [offerings, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const collegesWithCurrent = useMemo(() => {
    if (!formData.offer_collegename) return colleges;
    const exists = colleges.some((c) => c.name === formData.offer_collegename);
    return exists ? colleges : [{ id: formData.offer_collegename, name: formData.offer_collegename }, ...colleges];
  }, [colleges, formData.offer_collegename]);

  const roomsWithCurrent = useMemo(() => {
    if (!formData.offerroom) return rooms;
    const exists = rooms.some((r) => r.name === formData.offerroom || r.id === formData.offerroom);
    return exists ? rooms : [{ id: formData.offerroom, name: formData.offerroom }, ...rooms];
  }, [rooms, formData.offerroom]);

  /* =========================================================
     Render
     ========================================================= */
  return (
    <div className="mu-page">
      {/* Custom scrollbar styles */}
      <style>{`
        .horizontal-scroll-table {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f1f5f9;
        }
        
        .horizontal-scroll-table::-webkit-scrollbar {
          height: 8px;
        }
        
        .horizontal-scroll-table::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        
        .horizontal-scroll-table::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
          transition: background 0.2s ease;
        }
        
        .horizontal-scroll-table::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        
        .sticky-shadow-right {
          box-shadow: -2px 0 4px rgba(0, 0, 0, 0.1);
        }
        
        .sticky-shadow-left {
          box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
        }
      `}</style>
      {(message || error) && (
        <div className="toast-wrapper">
          <div className={`toast-box ${error ? 'toast--error' : ''}`}>
            <span className="toast-emoji">{error ? '⚠' : '✅'}</span>
            <span className="toast-text">{error || message}</span>
            <button
              className="toast-close"
              onClick={() => {
                setMessage('');
                setError('');
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <h1 className="mu-title">Course/Subject Enrollment</h1>

      {/* Toolbar */}
      <div className="mu-toolbar">
        <label className="searchbox" aria-label="Search offerings">
          <span className="searchbox__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" role="img" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="20" y1="20" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            className="searchbox__input"
            type="text"
            placeholder="Search offerings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <button
          className="btn btn--add"
          onClick={() => {
            const nextId = computeNextOfferId(offerings);
            setFormData({ ...defaultForm, offerid: nextId });
            setEditing(false);
            setShowForm(true);
            setMessage('');
            setError('');
          }}
        >
          <span className="btn-plus">＋</span> Add
        </button>
      </div>

      {/* Table Card */}
      <div className="mu-tablewrap-outer">
        <div className="mu-tablewrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.8em', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>↔️</span>
              <span>Scroll horizontally to view all columns</span>
            </div>
          </div>

          <div className="mu-tablecard mu-tablecard--with-pager">
            <div 
              className="mu-table-scroll horizontal-scroll-table" 
              style={{ 
                overflowX: 'auto',
                overflowY: 'visible',
                maxWidth: '100%',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                position: 'relative'
              }}
            >
              <table 
                className="mu-table" 
                style={{ 
                  minWidth: '1200px',
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: '0'
                }}
              >
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th" style={{ minWidth: '140px', width: '140px', position: 'sticky', left: '0', backgroundColor: '#f8fafc', zIndex: '2', borderRight: '2px solid #e2e8f0' }}>Enrollment ID</th>
                    <th className="mu-th" style={{ minWidth: '120px', width: '120px' }}>College</th>
                    <th className="mu-th" style={{ minWidth: '150px', width: '150px' }}>Depertment/Program & Semester</th>
                    <th className="mu-th" style={{ minWidth: '150px', width: '150px' }}>Subject</th>
                    <th className="mu-th" style={{ minWidth: '100px', width: '100px' }}>Year</th>
                    <th className="mu-th" style={{ minWidth: '120px', width: '120px' }}>Faculty</th>
                    <th className="mu-th" style={{ minWidth: '60px', width: '60px' }}>Sem</th>
                    <th className="mu-th" style={{ minWidth: '80px', width: '80px' }}>Section</th>
                    <th className="mu-th" style={{ minWidth: '80px', width: '80px' }}>Capacity</th>
                    <th className="mu-th" style={{ minWidth: '100px', width: '100px' }}>Room</th>
                    <th className="mu-th" style={{ minWidth: '160px', width: '160px', position: 'sticky', right: '0', backgroundColor: '#f8fafc', zIndex: '2', borderLeft: '2px solid #e2e8f0' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="mu-td mu-empty" colSpan={11}>
                        Loading...
                      </td>
                    </tr>
                  ) : pageItems.length === 0 ? (
                    <tr>
                      <td className="mu-td mu-empty" colSpan={11}>
                        No records found
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((off) => (
                      <tr key={off.offerid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td className="mu-td" style={{ minWidth: '140px', width: '140px', position: 'sticky', left: '0', backgroundColor: '#ffffff', zIndex: '1', borderRight: '2px solid #f1f5f9', fontWeight: '600', color: '#1e293b' }}>
                          {off.offerid}
                        </td>
                        <td className="mu-td" style={{ minWidth: '120px', width: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={off.offer_collegename || ''}>
                          {off.offer_collegename || ''}
                        </td>
                        <td className="mu-td" style={{ minWidth: '150px', width: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={getCourseDesc(off.offer_programid)}>
                          {getCourseDesc(off.offer_programid)}
                        </td>
                        <td className="mu-td" style={{ minWidth: '150px', width: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={getSubjectDesc(off.offer_courseid)}>
                          {getSubjectDesc(off.offer_courseid)}
                        </td>
                        <td className="mu-td" style={{ minWidth: '100px', width: '100px', textAlign: 'center' }}>
                          {(off.offfer_term ?? off.offer_term) || '-'}
                        </td>
                        <td className="mu-td" style={{ minWidth: '120px', width: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={off.offer_facultyid}>
                          {off.offer_facultyid || '-'}
                        </td>
                        <td className="mu-td" style={{ minWidth: '60px', width: '60px', textAlign: 'center' }}>
                          {off.offer_semesterno || '-'}
                        </td>
                        <td className="mu-td" style={{ minWidth: '80px', width: '80px', textAlign: 'center' }}>
                          {off.offer_section || '-'}
                        </td>
                        <td className="mu-td" style={{ minWidth: '80px', width: '80px', textAlign: 'center' }}>
                          {off.offer_capacity || '-'}
                        </td>
                        <td className="mu-td" style={{ minWidth: '100px', width: '100px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={off.offerroom}>
                          {off.offerroom || '-'}
                        </td>
                        <td className="mu-td" style={{ minWidth: '160px', width: '160px', position: 'sticky', right: '0', backgroundColor: '#ffffff', zIndex: '1', borderLeft: '2px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button 
                              className="btn btn--primary" 
                              onClick={() => handleEdit(off)}
                              style={{ 
                                fontSize: '0.8em', 
                                padding: '4px 8px',
                                minWidth: '50px',
                                borderRadius: '4px'
                              }}
                              title="Edit offering"
                            >
                              ✏️ Edit
                            </button>
                            <button 
                              className="btn btn--danger" 
                              onClick={() => handleDelete(off.offerid)}
                              style={{ 
                                fontSize: '0.8em', 
                                padding: '4px 8px',
                                minWidth: '55px',
                                borderRadius: '4px'
                              }}
                              title="Delete offering"
                            >
                              🗑️ Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination — chips style */}
            <div className="mu-pagination mu-pagination--chips">
              <span className="mu-pageinfo mu-pageinfo--chips">
                {`Showing page ${page} of ${totalPages} pages`}
              </span>
              <div className="mu-pagebtns mu-pagebtns--chips">
                <button
                  className="pagechip"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  «
                </button>
                <span className="pagechip pagechip--active">{page}</span>
                <button
                  className="pagechip"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  »
                </button>
              </div>
            </div>
            {/* /Pagination */}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowForm(false);
            setEditing(false);
            resetForm();
          }}
        >
          <form
            className="modal modal--wide"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <button
              type="button"
              className="modal-x"
              onClick={() => {
                setShowForm(false);
                setEditing(false);
                resetForm();
              }}
            >
              ×
            </button>
            <h3 className="modal-heading">{editing ? 'Edit Offering' : 'Add Offering'}</h3>

            <div className="form-grid form-grid--3">
              <div className="form-row">
                <label className="form-label">Enrollment ID</label>
                <input
                  className="form-input"
                  name="offerid"
                  value={formData.offerid}
                  onChange={handleChange}
                  disabled
                  placeholder={`${OFFER_PREFIX}001`}
                  required
                />
              </div>

              {/* College Name selector */}
              <div className="form-row">
                <label className="form-label">College Name</label>
                <select
                  className="form-input"
                  name="offer_collegename"
                  value={formData.offer_collegename}
                  onChange={handleChange}
                >
                  <option value="">Select College</option>
                  {collegesWithCurrent.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Program / Department selector */}
              <div className="form-row">
                <label className="form-label">Program / Department</label>
                <select
                  className="form-input"
                  name="offer_programid"
                  value={formData.offer_programid}
                  onChange={handleChange}
                >
                  <option value="">Select Program</option>
                  {departments.map((d) => (
                    <option key={d.collegedeptid} value={d.collegedeptid}>
                      {d.collegedeptdesc} ({d.collegedeptid})
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject dropdown */}
              <div className="form-row">
                <label className="form-label">Subject / Course</label>
                <select
                  className="form-input"
                  name="offer_courseid"
                  value={formData.offer_courseid}
                  onChange={handleChange}
                  disabled={!subjectsForSelect.length || !formData.offer_programid}
                >
                  <option value="">
                    {subjectsForSelect.length ? 'Select Subject' : 'No subjects available'}
                  </option>
                  {subjectsForSelect.map((s) => (
                    <option key={s.subjectid} value={s.subjectid}>
                      {s.subjectname || s.subjectdesc || s.subject_code || s.subjectid}
                      {readSubjectSemester(s) ? ` (Sem ${readSubjectSemester(s)})` : ''}
                    </option>
                  ))}
                </select>

                {!!formData.offer_programid && (
                  <div className="modal-desc" style={{ marginTop: '6px' }}>
                    <strong>Derived Semester Options for this Department:</strong>{' '}
                    {semesterOptions.join(', ')}
                  </div>
                )}
                {!!formData.offer_programid && !!formData.offer_semesterno && (
                  <div className="modal-desc" style={{ marginTop: '4px' }}>
                    <strong>Subjects for Dept &amp; Sem:</strong>{' '}
                    {filteredSubjects.length
                      ? filteredSubjects
                          .map(
                            (s) =>
                              s.subjectname ||
                              s.subjectdesc ||
                              s.subject_code ||
                              s.subjectid
                          )
                          .join(', ')
                      : 'No subjects found'}
                  </div>
                )}
              </div>

              <div className="form-row">
                <label className="form-label">Academic Year</label>
                <select
                  className="form-input"
                  name="offer_term"
                  value={formData.offer_term}
                  onChange={handleChange}
                >
                  <option value="">Select Academic Year</option>
                  {yearsForSelect.map((y) => (
                    <option
                      key={y.acad_yearid ?? y.id ?? y.termid ?? y.year}
                      value={y.acad_yearid ?? y.id ?? y.termid ?? y.year ?? ''}
                    >
                      {y.year ??
                        y.acadyearname ??
                        y.termname ??
                        (y.acad_yearid ?? y.id ?? '')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teacher — All Teachers (no department filtering) */}
              <div className="form-row">
                <label className="form-label">Select Teacher</label>
                <select
                  className="form-input"
                  name="offer_facultyid"
                  value={formData.offer_facultyid}
                  onChange={handleChange}
                >
                  <option value="">
                    Select Teacher ({teachersForDept.length} available)
                  </option>
                  {teachersForDept.map((t) => (
                    <option key={t.teacherid} value={t.teacherid}>
                      {t.teachername ?? t.teacherid}
                      {t.teacherdesig ? ` - ${t.teacherdesig}` : ''}
                      {t.teacheremailid ? ` (${t.teacheremailid})` : ''}
                    </option>
                  ))}
                </select>
                
                {/* Teacher availability info */}
                <div className="modal-desc" style={{ marginTop: '6px' }}>
                  <strong>Teacher Selection:</strong>{' '}
                  <span style={{ color: teachersForDept.length > 0 ? '#10b981' : '#ef4444' }}>
                    {teachersForDept.length > 0 
                      ? `✓ ${teachersForDept.length} teacher${teachersForDept.length !== 1 ? 's' : ''} available`
                      : '⚠ No teachers found'
                    }
                  </span>
                  <br />
                  <span style={{ fontSize: '0.85em', color: '#6b7280' }}>
                    {formData.offer_programid 
                      ? '🏢 Teachers filtered by selected department'
                      : '📊 Select a department to see department-specific teachers'
                    }
                  </span>
                </div>
                
                {/* Selected teacher details */}
                {!!formData.offer_facultyid && (() => {
                  const selectedTeacher = teachersForDept.find(t => String(t.teacherid) === String(formData.offer_facultyid));
                  return selectedTeacher ? (
                    <div className="modal-desc" style={{ marginTop: '4px', padding: '8px', backgroundColor: '#f0f9ff', borderRadius: '4px', border: '1px solid #e0f2fe' }}>
                      <strong>Selected Teacher:</strong> {selectedTeacher.teachername}<br />
                      {selectedTeacher.teacherdesig && <><strong>Designation:</strong> {selectedTeacher.teacherdesig}<br /></>}
                      {selectedTeacher.teacheremailid && <><strong>Email:</strong> {selectedTeacher.teacheremailid}<br /></>}
                      {selectedTeacher.teachermob1 && <><strong>Contact:</strong> {selectedTeacher.teachermob1}<br /></>}
                      {selectedTeacher.teachermaxweekhrs && <><strong>Max Weekly Hours:</strong> {selectedTeacher.teachermaxweekhrs}</>}
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Semester No */}
              <div className="form-row">
                <label className="form-label">Semester No</label>
                <select
                  className="form-input"
                  name="offer_semesterno"
                  value={formData.offer_semesterno}
                  onChange={handleChange}
                  disabled={!formData.offer_programid}
                >
                  <option value="">Select Semester</option>
                  {semesterOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section */}
              <div className="form-row">
                <label className="form-label">Section</label>
                <select
                  className="form-input"
                  name="offer_section"
                  value={formData.offer_section}
                  onChange={handleChange}
                >
                  <option value="">Select Section</option>
                  {studentSectionOptions.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              {/* Capacity */}
<div className="form-row">
  <label className="form-label" htmlFor="offer_capacity">Capacity</label>
  <input
    id="offer_capacity"
    className="form-input"
    type="number"
    name="offer_capacity"
    value={formData.offer_capacity ?? ""}
    placeholder="e.g., 30"
    inputMode="numeric"
    min={1}
    step={1}
    onKeyDown={(e) => {
      // Disallow non-integer/negative inputs
      if (['e','E','+','-','.'].includes(e.key)) e.preventDefault();
    }}
    onWheel={(e) => e.currentTarget.blur()} // prevent scroll changing value
    onChange={(e) => {
      const n = e.target.valueAsNumber;
      setFormData(prev => ({
        ...prev,
        // keep empty while typing; otherwise clamp to positive int
        offer_capacity: Number.isFinite(n) ? Math.max(1, Math.floor(n)) : ''
      }));
    }}
    onBlur={(e) => {
      // if left empty or <1, snap to 1
      const n = Number(e.target.value);
      if (!Number.isFinite(n) || n < 1) {
        setFormData(prev => ({ ...prev, offer_capacity: 1 }));
      }
    }}
  />
  {formData.offer_capacity !== '' && Number(formData.offer_capacity) < 1 && (
    <small className="form-error">Capacity must be a positive number.</small>
  )}
</div>


              {/* Room */}
              <div className="form-row">
                <label className="form-label">Room</label>
                <select
                  className="form-input"
                  name="offerroom"
                  value={formData.offerroom}
                  onChange={handleChange}
                >
                  <option value="">Select Room</option>
                  {roomsWithCurrent.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Diagnostic Information Panel (only shown when there are issues or in development) */}
            {(!!error || formData.offer_programid) && (
              <div className="form-row" style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9em', color: '#475569', fontWeight: '600' }}>📊 System Diagnostics</h4>
                <div style={{ fontSize: '0.8em', color: '#64748b', lineHeight: '1.4' }}>
                  <strong>Master Data Availability:</strong><br />
                  • Departments: {departments.length} loaded<br />
                  • Courses: {courses.length} loaded<br />
                  • Subjects: {subjects.length} loaded<br />
                  • Teachers: {teachers.length} loaded<br />
                  <br />
                  {formData.offer_programid && (
                    <>
                      <strong>Current Selection Analysis:</strong><br />
                      • Selected Department: {departments.find(d => String(d.collegedeptid) === String(formData.offer_programid))?.collegedeptdesc || 'Not found'}<br />
                      • Department ID: {formData.offer_programid}<br />
                      • Subjects in Department: {subjects.filter(s => matchesDeptOnly(s, formData.offer_programid)).length}<br />
                      • Teachers in Department: {teachersForDept.length}<br />
                      {formData.offer_courseid && (
                        <>
                          • Selected Subject: {getSubjectDesc(formData.offer_courseid)}<br />
                          • Subject ID: {formData.offer_courseid}<br />
                        </>
                      )}
                    </>
                  )}
                  <br />
                  <span style={{ fontSize: '0.75em', fontStyle: 'italic' }}>
                    💡 If you're experiencing course mapping issues, this data helps diagnose the problem.
                  </span>
                </div>
              </div>
            )}

            {!!error && <div className="modal-desc modal-desc--error">{error}</div>}
            {!!message && <div className="modal-desc modal-desc--ok">{message}</div>}

            <div className="modal-actions">
              <button type="submit" className="btn btn--primary">
                {editing ? 'Update' : 'Add'} Offering
              </button>
              
              {/* Advanced bypass option (only shown when there's an error) */}
              {!!error && error.includes('Cannot resolve') && (
                <button 
                  type="button" 
                  className="btn btn--warning"
                  style={{ backgroundColor: '#f59e0b', color: 'white' }}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!window.confirm('⚠️ ADVANCED: Force submit using department ID as course ID? This bypasses course mapping validation and may cause data inconsistencies. Continue only if you understand the implications.')) {
                      return;
                    }
                    
                    // Force submit with department ID as course ID
                    setMessage('');
                    setError('');
                    
                    let currentOfferId = formData.offerid;
                    if (!editing && (!currentOfferId || !/^COURSE_OFFER_ID_\d+$/i.test(currentOfferId))) {
                      currentOfferId = computeNextOfferId(offerings);
                    }
                    
                    const payload = {
                      offerid: currentOfferId,
                      offer_programid: formData.offer_programid, // Use department ID directly
                      offer_courseid: formData.offer_courseid,
                      offfer_term: formData.offer_term,
                      offer_facultyid: formData.offer_facultyid,
                      offer_semesterno: formData.offer_semesterno === '' ? '' : Number(formData.offer_semesterno),
                      offer_section: formData.offer_section,
                      offer_capacity: formData.offer_capacity === '' ? '' : Number(formData.offer_capacity),
                      offerroom: formData.offerroom,
                      offer_collegename: formData.offer_collegename
                    };
                    
                    try {
                      const exists = offerings.some((o) => String(o.offerid) === String(currentOfferId));
                      
                      if (exists) {
                        await axios.put(`${API}/${encodeURIComponent(currentOfferId)}`, payload);
                        setMessage('Offering updated (bypassed course mapping)');
                      } else {
                        await axios.post(API, payload);
                        setMessage('Offering created (bypassed course mapping)');
                      }
                      
                      resetForm();
                      setEditing(false);
                      setShowForm(false);
                      fetchOfferings();
                    } catch (err) {
                      console.error('❌ Force submit error:', err);
                      const errorMessage = err.response?.data?.error || err.response?.data?.details || err.message || 'Unknown error';
                      setError(`Force submit failed: ${errorMessage}`);
                    }
                  }}
                >
                  ⚡ Force Submit (Advanced)
                </button>
              )}
              
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditing(false);
                  resetForm();
                }}
              >
                Cancel
              </button>
            </div>

            <button
              type="button"
              className="btn btn--close-fullwidth"
              onClick={() => {
                setShowForm(false);
                setEditing(false);
                resetForm();
              }}
            >
              Close
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default CollegeCourseOfferingManager;
