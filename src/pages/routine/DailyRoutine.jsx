// DailyRoutine.jsx
import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import config from "../../config/middleware_config"; // ← adjust path if needed

// ---- Safe URL joiner (prevents double/missing slashes)
function joinUrl(base = "", path = "") {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}/${p}`;
}

// ===== API endpoints via config (no hardcoded URLs) =====
const API_BASE = joinUrl(config.DAILY_ROUTINE_ROUTE);                // /api/daily-routine
const COURSE_OFFERING_API = joinUrl(config.COURSE_OFFERING_ROUTE);   // /api/course-offering
const CLASSROOM_API = joinUrl(config.CLASS_ROOM_ROUTE);              // /api/class-room
const ACADYEAR_API = joinUrl(config.MASTER_ACADYEAR_ROUTE);          // /api/master-acadyear
const STUDENT_API = joinUrl(config.STUDENT_ROUTE, "list");           // /api/student/list
const SUBJECT_API = joinUrl(config.SUBJECT_ROUTE, "list");           // /api/subject/list
const COURSE_API = joinUrl(config.COURSE_ROUTE, "all");              // /api/course/all
const TEACHER_API = joinUrl(config.TEACHER_ROUTE);                   // /api/teacher

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Predefined slot times
const SLOT_TIMES = {
  "A1": { from: "08:00", to: "09:00" },
  "A2": { from: "09:00", to: "10:00" },
  "B1": { from: "10:00", to: "11:00" },
  "B2": { from: "11:00", to: "12:00" },
  "C1": { from: "12:00", to: "13:00" },
  "C2": { from: "13:00", to: "14:00" },
  "D1": { from: "14:00", to: "15:00" },
  "D2": { from: "15:00", to: "16:00" },
};

// HALF-HOUR rows from 08:00 to 18:00 (inclusive)
const VIEW_SLOTS = Array.from({ length: (18 - 8) * 2 + 1 }, (_, i) => 8 + i * 0.5);
const fmtSlot = (t) => {
  const h = Math.floor(t);
  const m = t % 1 ? "30" : "00";
  return `${String(h).padStart(2, "0")}:${m}`;
};

// dropdown slots
const TIME_SLOTS = [];
for (let h = 8; h < 18; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}
TIME_SLOTS.push("18:00");

/* ===================================================================================
   🔐 SESSION: fetch exactly like your Login component stores it.
=================================================================================== */
function getSessionUser() {
  const safeParse = (str) => {
    try { return JSON.parse(str || "null"); } catch { return null; }
  };

  const ss = safeParse(sessionStorage.getItem("sessionUser"));
  const lsAuth = safeParse(localStorage.getItem("auth"));
  const lsSess = safeParse(localStorage.getItem("sessionUser"));

  let src = ss || lsAuth || lsSess || {};

  const role = (() => {
    const raw = String(src.user_role || src.role || "").toLowerCase();
    const rolesStr = String(src.roles || "").toLowerCase();
    const isTeacher = raw.includes("teach") || rolesStr.includes("tchr");
    const isStudent = raw.includes("student") || rolesStr.includes("stud");
    const isAdmin = raw.includes("admin") || rolesStr.includes("adm");
    if (isTeacher) return "teacher";
    if (isStudent) return "student";
    if (isAdmin) return "admin";
    return raw || "user";
  })();

  const userid =
    src.userid || src.userId || src.user_id || src.username || "";

  const teacherid =
    src.teacher_id || src.teacherid || src.teacherID || src.teacherId ||
    src.teacher_userid || "";

  const stu_sem =
    src.student_semester || src.stu_curr_semester || src.stuSemester || src.semester || "";

  const stu_sec =
    src.student_section || src.stu_section || src.stuSection || src.section || "";

  return {
    raw: src,
    role,
    userid: String(userid || ""),
    teacherid: String(teacherid || ""),
    stu_curr_semester: String(stu_sem || ""),
    stu_section: String(stu_sec || ""),
  };
}

function sessionsShallowEqual(a, b) {
  const pick = (s) => [
    s?.role, s?.userid, s?.teacherid, s?.stu_curr_semester, s?.stu_section
  ].join("|");
  return pick(a) === pick(b);
}

// 🔔 tiny inline notice for missing session data
function MissingSessionNotice({ title, lines = [] }) {
  return (
    <div style={{
      maxWidth: 900, margin: "48px auto", padding: 20,
      border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff"
    }}>
      <h2 style={{marginTop:0}}>{title}</h2>
      <ul style={{marginTop: 10, lineHeight: 1.6}}>
        {lines.map((t,i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}

// ---- Small/consistent text tokens for routine cards only ----
const CARD_TXT = { baseSize: 12, smallSize: 11, lh: 1.25 };

function to24Hour(str) {
  if (!str) return 0;
  const [h, m] = str.split(":");
  return parseInt(h) + (parseInt(m) >= 30 ? 0.5 : 0);
}
function getDateOfNext(dayName) {
  const today = new Date();
  const targetDay = DAYS.indexOf(dayName);
  const currentDay = today.getDay() === 0 ? 6 : today.getDay() - 1;
  let diff = (targetDay - currentDay + 7) % 7;
  if (diff === 0) diff = 7;
  const date = new Date(today);
  date.setDate(today.getDate() + diff);
  return date.toISOString().slice(0, 10);
}
function formatDuration(fromF, toF) {
  const hrs = toF - fromF;
  if (hrs <= 0) return "";
  const minutes = Math.round(hrs * 60);
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

// Get day of week from date string
function getDayOfWeekFromDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const dayIdx = date.getDay() === 0 ? 6 : date.getDay() - 1;
  return dayIdx >= 0 && dayIdx < 6 ? DAYS[dayIdx] : "";
}

// Format date for display
function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

/** Robust teacher matching */
function routineBelongsToSessionTeacher(r, userId, teacherId) {
  const norm = (v) => (v == null ? "" : String(v).trim());
  const tid = norm(teacherId);
  const uid = norm(userId);
  const candidates = [
    r.drteacherid, r.drclassteacherid, r.classteacherid, r.teacherid,
    r.teacher_id, r.teacher?.teacherid, r.teacher?.id, r.teacher_userid,
    r.drclassteacher_userid, r.class_teacher_userid, r.classteacher_userid,
  ].map(norm).filter(Boolean);
  return candidates.some((id) => id === tid || (uid && id === uid));
}

export default function DailyRoutine() {
  // 🆕 reactive session that auto-updates when login changes
  const [SESSION, setSESSION] = useState(getSessionUser());

  // Role flags from current session
  const roleToken  = String(SESSION.role || "").toLowerCase();
  const rolesToken = String(SESSION.raw?.roles || "").toLowerCase();
  const isAdmin   = roleToken === "admin"   || roleToken.includes("admin")   || rolesToken.includes("adm");
  const isTeacher = roleToken === "teacher" || roleToken.includes("teach")   || rolesToken.includes("tchr");
  const isStudent = roleToken === "student" || roleToken.includes("student") || rolesToken.includes("stud");

  const sessUserId   = SESSION.userid;
  const sessTeacherId= SESSION.teacherid;
  const sessStuSem   = SESSION.stu_curr_semester;
  const sessStuSec   = SESSION.stu_section;

  const [routines, setRoutines] = useState([]);
  const [form, setForm] = useState({
    drdayofweek: "", drslot: "", drsubjid: "", drfrom: "", drto: "",
    drclassroomid: "", drislabsession: false, drisclasssession: false,
    drroutcnt: "1", drclassteacherid: "", drdate: "",
  });
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [offerings, setOfferings] = useState([]);
  const [subjects, setSubjects] = useState([]); // master list
  const [courses, setCourses] = useState([]);   // master list
  const [classrooms, setClassrooms] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [acadyears, setAcadyears] = useState([]);
  const [filterCourse, setFilterCourse] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterAcadYear, setFilterAcadYear] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [students, setStudents] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjectList, setSubjectList] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [effectiveTeacherId, setEffectiveTeacherId] = useState(String(sessTeacherId || ""));
  
  // Calendar view states
  const [viewMode, setViewMode] = useState("week"); // "week" or "date"
  const [viewDate, setViewDate] = useState(""); // for specific date view
  const [showCalendar, setShowCalendar] = useState(false);

  // 🔒 Lock student filters to their own sem/section so they only see their routine
  useEffect(() => {
    if (isStudent) {
      if (sessStuSem) setFilterSemester(String(sessStuSem));
      if (sessStuSec) setFilterSection(String(sessStuSec));
    }
  }, [isStudent, sessStuSem, sessStuSec]);

  // 🆕 Auto-detect login/session changes (same tab) and refresh data
  useEffect(() => {
    let prev = getSessionUser();

    const read = () => {
      const cur = getSessionUser();
      if (!sessionsShallowEqual(prev, cur)) {
        prev = cur;
        setSESSION(cur);         // triggers re-render & data reload via next effect
      }
    };

    // Catch changes on focus/visibility + cross-tab storage changes
    const onFocus = () => read();
    const onVis = () => { if (document.visibilityState === "visible") read(); };
    const onStorage = (e) => {
      if (e.key === "sessionUser" || e.key === "auth") read();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);

    // Short bootstrap polling (helps when login just finished in SPA route)
    let ticks = 0;
    const iv = setInterval(() => { read(); if (++ticks > 10) clearInterval(iv); }, 1000);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      clearInterval(iv);
    };
  }, []);

  // Initial load + reload whenever session identity/role changes
  useEffect(() => {
    const loadAll = async () => {
      await Promise.allSettled([
        fetchRoutines(),
        fetchOfferings(),
        fetchClassrooms(),
        fetchTeachers(),
        fetchAcadyears(),
        fetchStudents(),
        fetchSubjects(),
        fetchCourses(),
      ]);
    };
    loadAll();
  }, [
    SESSION.userid,
    SESSION.teacherid,
    SESSION.stu_curr_semester,
    SESSION.stu_section,
    SESSION.role
  ]);

  // Also refresh routines when tab regains focus (keeps view fresh)
  useEffect(() => {
    const onFocus = () => fetchRoutines();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // 🔁 When teachers list arrives and session lacks teacher_id, derive & persist it
  useEffect(() => {
    if (!isTeacher) return;

    if (sessTeacherId) {
      setEffectiveTeacherId(String(sessTeacherId));
      return;
    }

    if (teachers && teachers.length && sessUserId) {
      const match = teachers.find(
        (t) =>
          String(t.teacheruserid ?? t.userid ?? t.user_id ?? t.userId) ===
          String(sessUserId)
      );
      if (match?.teacherid) {
        const tid = String(match.teacherid);
        setEffectiveTeacherId(tid);
        try {
          const cur = JSON.parse(sessionStorage.getItem("sessionUser") || "{}");
          sessionStorage.setItem(
            "sessionUser",
            JSON.stringify({
              ...cur,
              teacher_id: tid,
              teacher_userid:
                cur?.teacher_userid ??
                String(match.teacheruserid ?? match.userid ?? sessUserId),
            })
          );
        } catch {}
      }
    }
  }, [isTeacher, sessTeacherId, sessUserId, teachers]);

  // Handy console confirmation
  useEffect(() => {
    if (isTeacher) {
      console.log("[DailyRoutine] role:", SESSION.role);
      console.log("[DailyRoutine] userid:", SESSION.userid);
      console.log("[DailyRoutine] teacher_id (session):", sessTeacherId || "(none)");
      console.log("[DailyRoutine] teacher_id (effective):", effectiveTeacherId || "(none)");
    }
  }, [isTeacher, effectiveTeacherId, sessTeacherId, SESSION]);

  // ------- API fetchers -------
  const fetchSubjects = async () => {
    try {
      const res = await axios.get(SUBJECT_API);
      const arr = Array.isArray(res.data?.subjects)
        ? res.data.subjects
        : Array.isArray(res.data)
        ? res.data
        : [];
      setSubjects(arr);
    } catch {
      setSubjects([]);
    }
  };
  const fetchCourses = async () => {
    try {
      const res = await axios.get(COURSE_API);
      const arr = Array.isArray(res.data) ? res.data : [];
      setCourses(arr);
    } catch {
      setCourses([]);
    }
  };
  const fetchStudents = async () => {
    try {
      const res = await axios.get(STUDENT_API);
      const studentList = Array.isArray(res.data?.students)
        ? res.data.students
        : Array.isArray(res.data)
        ? res.data
        : [];
      setStudents(studentList);
      // Only extract sections from students
      // Semesters are now extracted from course offerings
      setSections(
        [...new Set(studentList.map((s) => s.stu_section).filter(Boolean))].sort()
      );
    } catch {
      setStudents([]); 
      setSections([]);
    }
  };
  const fetchRoutines = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_BASE);
      const routineList = res.data?.routines || res.data || [];
      setRoutines(routineList);
      
      // Also extract unique semesters from existing routines
      const semestersFromRoutines = [...new Set(
        routineList
          .map(r => r.stu_curr_semester)
          .filter(Boolean)
      )].sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return String(a).localeCompare(String(b));
      });
      
      // Merge with existing semesters if any
      setSemesters(prev => {
        const combined = new Set([...prev, ...semestersFromRoutines]);
        return [...combined].sort((a, b) => {
          const numA = parseInt(a);
          const numB = parseInt(b);
          if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
          }
          return String(a).localeCompare(String(b));
        });
      });
      
      setMessage("");
    } catch {
      setMessage("Failed to load routines.");
    }
    setLoading(false);
  };
  const fetchOfferings = async () => {
    try {
      const res = await axios.get(COURSE_OFFERING_API);
      const offeringArr = Array.isArray(res.data) ? res.data : res.data.offerings || [];
      setOfferings(offeringArr);

      const subjMap = new Map();
      const semesterSet = new Set();
      
      offeringArr.forEach((off) => {
        const sid = off.offerid;
        const sname = off.subjectname || off.subject_NAME || off.coursename;
        if (sid && !subjMap.has(sid)) subjMap.set(sid, sname || sid);
        
        // Extract semesters from offerings using offer_semesterno
        if (off.offer_semesterno) {
          semesterSet.add(String(off.offer_semesterno));
        }
      });
      
      const subList = [...subjMap.entries()].map(([subjectid, subjectname]) => ({ subjectid, subjectname }));
      setSubjectList(subList);
      
      // Set semesters from offerings
      const semesterList = [...semesterSet].filter(Boolean).sort((a, b) => {
        // Sort numerically if possible, otherwise alphabetically
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return String(a).localeCompare(String(b));
      });
      setSemesters(semesterList);
      
      if (!form.drsubjid && subList.length > 0) {
        setForm((prev) => ({ ...prev, drsubjid: subList[0].subjectid }));
      }
    } catch {
      setOfferings([]); 
      setSubjectList([]);
      setSemesters([]);
    }
  };
  const fetchClassrooms = async () => {
    try {
      const res = await axios.get(CLASSROOM_API);
      setClassrooms(Array.isArray(res.data) ? res.data : res.data.classrooms || []);
    } catch {
      setClassrooms([]);
    }
  };
  const fetchTeachers = async () => {
    try {
      const res = await axios.get(TEACHER_API);
      setTeachers(Array.isArray(res.data) ? res.data : res.data.teachers || []);
    } catch {
      setTeachers([]);
    }
  };
  const fetchAcadyears = async () => {
    try {
      const res = await axios.get(ACADYEAR_API);
      setAcadyears(Array.isArray(res.data) ? res.data : res.data.acadyears || res.data || []);
    } catch {
      setAcadyears([]);
    }
  };

  const initialForm = {
    drdayofweek: "", drslot: "", drsubjid: "", drfrom: "", drto: "",
    drclassroomid: "", drislabsession: false, drisclasssession: false,
    drroutcnt: "1", drclassteacherid: "", drdate: "",
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "drslot" && SLOT_TIMES[value]) {
      // When slot is selected, automatically set the from and to times
      setForm((prev) => ({ 
        ...prev, 
        drslot: value,
        drfrom: SLOT_TIMES[value].from,
        drto: SLOT_TIMES[value].to
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    }
  };

  const getRoutineKey = (routine) =>
    [
      routine.drdayofweek, routine.drslot, routine.drsubjid, routine.drclassroomid,
      routine.stu_curr_semester, routine.stu_section, routine.acad_year, routine.drdate,
    ].join("_");

  const handleEdit = (routine) => {
    if (!isAdmin) return; // 🔒 only admin
    setEditingRoutine(routine);
    setForm({
      ...routine,
      drislabsession: !!routine.drislabsession,
      drisclasssession: !!routine.drisclasssession,
      drclassteacherid: routine.drclassteacherid || "",
      stu_curr_semester: routine.stu_curr_semester || "",
      stu_section: routine.stu_section || "",
      acad_year: routine.acad_year || "",
      drdate: routine.drdate || "",
    });
    setSelectedDate(routine.drdate || "");
    setShowModal(true);
    setMessage("");
  };

  const handleCellClick = (dayIdx, slotFloat) => {
    if (!isAdmin) return;
    const day = DAYS[dayIdx];
    const from = fmtSlot(slotFloat);
    const to = fmtSlot(Math.min(slotFloat + 0.5, 18));
    const date = getDateOfNext(day);

    setEditingRoutine(null);
    setForm((prev) => ({
      ...initialForm,
      drdayofweek: day, drfrom: from, drto: to, drdate: date,
      drroutcnt: "1",
      stu_curr_semester: prev.stu_curr_semester || "",
      stu_section: prev.stu_section || "",
      acad_year: prev.acad_year || "",
    }));
    setSelectedDate(date);
    setShowModal(true);
    setMessage("");
  };

  // ---- mapping helpers using master lists ----
  const getOffering = (offeringId, offs) => offs.find((o) => String(o.offerid) === String(offeringId)) || null;
  const getSubjectDescFromId = (subjId) => {
    const s = subjects.find(
      (x) =>
        String(x.subjectid) === String(subjId) ||
        String(x.subject_code) === String(subjId) ||
        String(x.subjectname) === String(subjId)
    );
    return s ? (s.subjectname || s.subjectdesc || s.subject_description || s.subject_code || subjId) : subjId;
  };
  const getCourseDescFromId = (courseId) => {
    const c = courses.find(
      (x) =>
        String(x.courseid) === String(courseId) ||
        String(x.course_code) === String(courseId) ||
        String(x.coursename) === String(courseId) ||
        String(x.coursedesc) === String(courseId)
    );
    return c ? (c.coursename || c.coursedesc || c.course_description || c.course_code || courseId) : courseId;
  };
  const getSubjectDescByOfferingId = (offeringId) => {
    const o = getOffering(offeringId, offerings);
    if (!o) return "-";
    return getSubjectDescFromId(o.offer_courseid);
  };
  const getCourseDescByOfferingId = (offeringId) => {
    const o = getOffering(offeringId, offerings);
    if (!o) return "-";
    return getCourseDescFromId(o.offer_programid);
  };
  const getSubjectIdByOfferingId = (offeringId) => {
    const o = getOffering(offeringId, offerings);
    return o?.offer_courseid || "-";
  };

  // ---- Prevent Teacher Overlap in Section ----
  function isTeacherDoubleBookedInSection() {
    const fromTime = to24Hour(form.drfrom);
    const toTime = to24Hour(form.drto);
    return routines.some((r) => {
      if (editingRoutine && getRoutineKey(r) === getRoutineKey(editingRoutine)) return false;
      if (
        r.drdayofweek === form.drdayofweek &&
        r.stu_section === (form.stu_section || filterSection) &&
        String(r.drclassteacherid) === String(form.drclassteacherid) &&
        to24Hour(r.drfrom) < toTime &&
        to24Hour(r.drto) > fromTime
      ) {
        return true;
      }
      return false;
    });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);

    const selectedOffering = filterCourse || offerings[0]?.offerid || "";
    const formData = {
      ...form,
      drsubjid: selectedOffering,
      stu_curr_semester: form.stu_curr_semester || filterSemester,
      stu_section: form.stu_section || filterSection,
      acad_year: form.acad_year || filterAcadYear,
      drdate: form.drdate,
    };

    if (!formData.drsubjid || !formData.drclassroomid || !formData.acad_year || !formData.drdate) {
      setMessage("Course Offering ID, Classroom ID, Academic Year and Date are required!");
      setLoading(false);
      return;
    }
    if (isTeacherDoubleBookedInSection()) {
      setMessage("Error: This teacher is already assigned to another routine in the same section, day, and overlapping time.");
      setLoading(false);
      return;
    }

    try {
      if (editingRoutine && editingRoutine.routineid != null) {
        await axios.put(joinUrl(API_BASE, String(editingRoutine.routineid)), formData);
        setMessage("Routine updated.");
      } else {
        await axios.post(API_BASE, formData);
        setMessage("Routine added.");
      }
      setForm(initialForm);
      setEditingRoutine(null);
      setShowModal(false);
      setSelectedDate("");
      await fetchRoutines();
      await fetchOfferings();
    } catch (err) {
      setMessage("Operation failed: " + (err.response?.data?.error || err.message));
    }
    setLoading(false);
  };

  const handleDelete = async (routine) => {
    if (!isAdmin) return;
    if (!window.confirm("Delete this routine?")) return;
    setLoading(true);
    try {
      if (routine && routine.routineid != null) {
        await axios.delete(joinUrl(API_BASE, String(routine.routineid)));
      } else {
        await axios.delete(joinUrl(API_BASE, "delete"), {
          data: {
            drdayofweek: routine.drdayofweek,
            drslot: routine.drslot,
            drsubjid: routine.drsubjid,
            drclassroomid: routine.drclassroomid,
            stu_curr_semester: routine.stu_curr_semester,
            stu_section: routine.stu_section,
            acad_year: routine.acad_year,
            drdate: routine.drdate,
          },
        });
      }
      setMessage("Routine deleted.");
      await fetchRoutines();
    } catch (err) {
      setMessage("Delete failed: " + (err.response?.data?.error || err.message));
    }
    setLoading(false);
  };

  const handleCancel = () => {
    setEditingRoutine(null);
    setForm(initialForm);
    setShowModal(false);
    setSelectedDate("");
    setMessage("");
  };

  // 👉 derive the logged-in teacher object from the fetched teachers (for header)
  const currentTeacher = useMemo(() => {
    if (!teachers || !teachers.length) return null;
    const byId = teachers.find((t) => String(t.teacherid) === String(effectiveTeacherId));
    if (byId) return byId;
    const byUser = teachers.find(
      (t) => String(t.teacheruserid ?? t.userid ?? t.user_id) === String(sessUserId)
    );
    return byUser || null;
  }, [teachers, effectiveTeacherId, sessUserId]);

  // 🌟 Session-based visibility
  let sessionFilteredRoutines = routines;
  if (isTeacher && (effectiveTeacherId || sessUserId)) {
    sessionFilteredRoutines = sessionFilteredRoutines.filter((r) =>
      routineBelongsToSessionTeacher(r, sessUserId, effectiveTeacherId)
    );
  } else if (isStudent && (sessStuSem || sessStuSec)) {
    sessionFilteredRoutines = sessionFilteredRoutines.filter((r) => {
      const semOk = sessStuSem ? String(r.stu_curr_semester) === String(sessStuSem) : true;
      const secOk = sessStuSec ? String(r.stu_section) === String(sessStuSec) : true;
      return semOk && secOk;
    });
  }

  const filteredRoutines = sessionFilteredRoutines.filter((r) => {
    let ok = true;
    if (filterCourse) ok = ok && r.drsubjid === filterCourse;
    if (filterSubject) ok = ok && getSubjectIdByOfferingId(r.drsubjid) === filterSubject;
    if (filterAcadYear)
      ok =
        ok &&
        (r.acad_year === filterAcadYear ||
          r.acadyearid === filterAcadYear ||
          r.academicyearid === filterAcadYear);
    if (filterSemester) ok = ok && r.stu_curr_semester === filterSemester;
    if (filterSection) ok = ok && r.stu_section === filterSection;
    
    // Filter by specific date if in date view mode
    if (viewMode === "date" && viewDate) {
      const viewDayOfWeek = getDayOfWeekFromDate(viewDate);
      ok = ok && r.drdayofweek === viewDayOfWeek;
      // Also check if routine has specific date and matches
      if (r.drdate) {
        ok = ok && r.drdate === viewDate;
      }
    }
    
    return ok;
  });

  const getRoutinesAt = (dayIdx, slotFloat) => {
    const day = DAYS[dayIdx];
    return filteredRoutines.filter((r) => {
      if (viewMode === "date" && viewDate) {
        // In date view mode, show routines for the specific date's day of week
        const viewDayOfWeek = getDayOfWeekFromDate(viewDate);
        if (r.drdayofweek !== viewDayOfWeek) return false;
      } else {
        // In normal week view, filter by the day column
        if (r.drdayofweek !== day) return false;
      }
      const from = to24Hour(r.drfrom);
      return from === slotFloat;
    });
  };

  function getTeacherNameAndId(id) {
    if (!id) return "Not Assigned";
    const t = teachers.find((t) => String(t.teacherid) === String(id));
    return t ? `${t.teachername} (${t.teacherid})` : `(${id})`;
  }
  function getClassroomName(id) {
    const room = classrooms.find((r) => String(r.classroomid) === String(id));
    return room ? (room.classroomname || `Classroom - ${room.classroomid}`) : `Classroom - ${id}`;
  }
  function getAvailableTeachers(day, from, to, editingTeacherId = null) {
    if (!day || !from || !to) return teachers;
    const fromTime = to24Hour(from);
    const toTime = to24Hour(to);
    const occupiedTeacherIds = routines
      .filter(
        (r) =>
          r.drdayofweek === day &&
          r.drclassteacherid &&
          to24Hour(r.drfrom) < toTime &&
          to24Hour(r.drto) > fromTime &&
          (!editingRoutine || getRoutineKey(r) !== getRoutineKey({ ...form, ...editingRoutine }))
      )
      .map((r) => String(r.drclassteacherid));
    return teachers.filter(
      (t) =>
        !occupiedTeacherIds.includes(String(t.teacherid)) ||
        (editingTeacherId && String(t.teacherid) === String(editingTeacherId))
    );
  }

  // ✅ EARLY ROLE/SESSION GUARDS (after hooks so hook order is stable)
  const studentNeeds = isStudent && (!sessStuSem || !sessStuSec);
  const teacherNeeds = isTeacher && !(sessUserId || sessTeacherId);
  if (studentNeeds) {
    return (
      <MissingSessionNotice
        title="Student Routine"
        lines={[
          "Semester and Section were not found in session.",
          "Ensure login response sets `student_semester` and `student_section` in sessionStorage('sessionUser').",
          "Try sign out / sign in again."
        ]}
      />
    );
  }
  if (teacherNeeds) {
    return (
      <MissingSessionNotice
        title="Teacher Routine"
        lines={[
          "Teacher user_id or teacher_id was not found in session.",
          "Ensure login response sets `userid` (preferred) and/or `teacher_id` in sessionStorage('sessionUser').",
          "Try sign out / sign in again."
        ]}
      />
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        maxWidth: 1500,
        margin: "0 auto",
        minHeight: 640,
        boxShadow: "0 2px 12px rgba(99,102,241,0.10)",
        padding: "18px 18px 36px 18px",
        position: "relative",
      }}
    >
      {/* 🔎 Session banner (read-only info for clarity) */}
      <div
        style={{
          marginBottom: 10,
          padding: "8px 12px",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fafafa",
          color: "#4b5563",
          fontSize: 13,
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span><b>Role:</b> {SESSION.role || "unknown"}</span>

        {isTeacher && (
          <>
            <span><b>User ID:</b> {SESSION.userid || "-"}</span>
            <span><b>Teacher ID:</b> {effectiveTeacherId || "-"}</span>
            <span>
              <b>Teacher:</b>{" "}
              {currentTeacher
                ? `${currentTeacher.teachername} (${currentTeacher.teacherid})`
                : "—"}
            </span>
          </>
        )}

        {isStudent && (
          <>
            <span><b>Semester:</b> {sessStuSem || "-"}</span>
            <span><b>Section:</b> {sessStuSec || "-"}</span>
          </>
        )}
      </div>

      {isAdmin && (
        <button
          onClick={() => {
            setShowModal(true);
            setForm(initialForm);
            setEditingRoutine(null);
            setSelectedDate("");
          }}
          style={{
            position: "absolute",
            right: 180,
            top: 18,
            zIndex: 5,
            background: "#fff",
            border: "1.7px solid #d4d4d4",
            borderRadius: "22px",
            fontWeight: 700,
            color: "#444",
            fontSize: 18,
            boxShadow: "0 2px 9px #f3f4f690",
            padding: "6px 28px 6px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            transition: "box-shadow .14s",
          }}
        >
          <span
            style={{
              display: "inline-block",
              fontWeight: 900,
              fontSize: 22,
              marginRight: 3,
              position: "relative",
              top: 1,
            }}
          >
            +
          </span>
          Add
        </button>
      )}
      
      {/* Calendar button for all users */}
      <button
        onClick={() => setShowCalendar(!showCalendar)}
        style={{
          position: "absolute",
          right: 32,
          top: 18,
          zIndex: 5,
          background: showCalendar ? "#6366f1" : "#fff",
          border: "1.7px solid #6366f1",
          borderRadius: "22px",
          fontWeight: 700,
          color: showCalendar ? "#fff" : "#6366f1",
          fontSize: 16,
          boxShadow: "0 2px 9px #6366f120",
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          transition: "all .2s",
        }}
      >
        📅 Calendar
      </button>

      <h2
        style={{
          color: "#18181b",
          fontSize: 26,
          fontWeight: 800,
          marginBottom: 12,
          marginTop: 2,
          marginLeft: 7,
        }}
      >
        CLASS SCHEDULE
      </h2>

      {/* Enhanced Calendar/Date View Section */}
      {showCalendar && (
        <div
          style={{
            margin: "0 7px 24px 7px",
            padding: "20px",
            border: "2px solid transparent",
            borderRadius: 16,
            background: "linear-gradient(white, white) padding-box, linear-gradient(135deg, #667eea 0%, #764ba2 100%) border-box",
            boxShadow: "0 10px 30px rgba(99, 102, 241, 0.15)",
          }}
        >
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "2px solid #f3f4f6"
          }}>
            <h3 style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              📅 Calendar View
            </h3>
            <div style={{
              display: "flex",
              gap: 8
            }}>
              <button
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setViewDate(today);
                  setViewMode("date");
                }}
                style={{
                  padding: "6px 14px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 20,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "transform 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}
                onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
                onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
              >
                ⚡ Today
              </button>
            </div>
          </div>
          
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 20,
            alignItems: "center"
          }}>
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#f8fafc",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0"
                }}>
                  <label style={{
                    fontWeight: 600,
                    color: "#475569",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}>
                    🗓️ Select Date:
                  </label>
                  <input
                    type="date"
                    value={viewDate}
                    onChange={(e) => {
                      setViewDate(e.target.value);
                      setViewMode("date");
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "2px solid #cbd5e1",
                      fontSize: 14,
                      fontWeight: 500,
                      background: "#fff",
                      color: "#334155",
                      cursor: "pointer",
                      outline: "none",
                      transition: "border-color 0.2s"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                    onBlur={(e) => e.target.style.borderColor = "#cbd5e1"}
                  />
                </div>
                
                <div style={{
                  display: "flex",
                  gap: 8
                }}>
                  <button
                    onClick={() => {
                      setViewDate("");
                      setViewMode("week");
                    }}
                    style={{
                      padding: "8px 16px",
                      background: viewMode === "week" 
                        ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" 
                        : "#f1f5f9",
                      color: viewMode === "week" ? "#fff" : "#475569",
                      border: viewMode === "week" ? "none" : "1px solid #cbd5e1",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    📋 Week View
                  </button>
                  
                  <button
                    onClick={() => {
                      setViewMode("date");
                      if (!viewDate) {
                        setViewDate(new Date().toISOString().split('T')[0]);
                      }
                    }}
                    style={{
                      padding: "8px 16px",
                      background: viewMode === "date" 
                        ? "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)" 
                        : "#f1f5f9",
                      color: viewMode === "date" ? "#fff" : "#475569",
                      border: viewMode === "date" ? "none" : "1px solid #cbd5e1",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    📆 Day View
                  </button>
                </div>
              </div>
              
              {viewDate && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12
                }}>
                  <div style={{
                    padding: "10px 16px",
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    color: "white",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 700,
                    boxShadow: "0 4px 12px rgba(245, 158, 11, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                  }}>
                    <span style={{ fontSize: 18 }}>📍</span>
                    <span>{getDayOfWeekFromDate(viewDate)}</span>
                  </div>
                  <div style={{
                    padding: "10px 16px",
                    background: "#fff",
                    border: "2px solid #e2e8f0",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#334155"
                  }}>
                    {formatDateDisplay(viewDate)}
                  </div>
                </div>
              )}
            </div>
            
            {viewMode === "date" && (
              <div style={{
                padding: "12px 16px",
                background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                border: "1px solid #fbbf24",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                gap: 10
              }}>
                <span style={{ fontSize: 20 }}>👁️</span>
                <div>
                  <div style={{
                    fontSize: 11,
                    color: "#92400e",
                    fontWeight: 500,
                    marginBottom: 2
                  }}>
                    VIEWING MODE
                  </div>
                  <div style={{
                    fontSize: 14,
                    color: "#78350f",
                    fontWeight: 700
                  }}>
                    {viewDate ? `Single Day - ${getDayOfWeekFromDate(viewDate)}` : "Date Selection"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 👇 Student header */}
      {isStudent && (
        <div
          style={{
            margin: "8px 7px 14px 7px",
            padding: "8px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            background: "#f8fafc",
            color: "#334155",
            fontSize: 13,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            fontWeight: 700,
          }}
        >
          <span>Your Daily Routine</span>
          <span>• Semester: {sessStuSem || "-"}</span>
          <span>• Section: {sessStuSec || "-"}</span>
        </div>
      )}

      {/* 👇 Teacher header */}
      {isTeacher && (
        <div
          style={{
            margin: "8px 7px 14px 7px",
            padding: "8px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            background: "#f0f9ff",
            color: "#0c4a6e",
            fontSize: 13,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            fontWeight: 700,
          }}
        >
          <span>Your Classes</span>
          <span>• Teacher: {currentTeacher ? currentTeacher.teachername : "—"}</span>
          <span>• Teacher ID: {effectiveTeacherId || "—"}</span>
          <span>• User ID: {SESSION.userid || "—"}</span>
        </div>
      )}

      {/* Admin-only filters */}
      {isAdmin && (
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            marginLeft: 7,
            marginBottom: 16,
          }}
        >
          <select
            value={filterCourse}
            onChange={(e) => {
              const selectedOfferingId = e.target.value;
              setFilterCourse(selectedOfferingId);
              
              // Auto-set semester when course is selected
              if (selectedOfferingId) {
                const selectedOffering = offerings.find(off => off.offerid === selectedOfferingId);
                if (selectedOffering) {
                  const offeringSemester = selectedOffering.offer_semesterno || "";
                  if (offeringSemester) {
                    setFilterSemester(String(offeringSemester));
                  }
                }
              }
            }}
            style={{
              padding: 8,
              borderRadius: 7,
              border: "1.3px solid #c7d2fe",
              minWidth: 150,
            }}
          >
            <option value="">All Courses</option>
            {offerings.map((off) => (
              <option key={off.offerid} value={off.offerid}>
                {getCourseDescByOfferingId(off.offerid)} ({off.offerid})
              </option>
            ))}
          </select>

          <select
            value={filterAcadYear}
            onChange={(e) => setFilterAcadYear(e.target.value)}
            style={{
              padding: 8,
              borderRadius: 7,
              border: "1.3px solid #c7d2fe",
              minWidth: 140,
            }}
          >
            <option value="">All Academic Years</option>
            {acadyears.map((y) => (
              <option
                key={y.acadyearid || y.id}
                value={y.acadyearname || y.name || y.acadyearid || y.id}
              >
                {y.acadyearname || y.name || y.acadyearid || y.id}
              </option>
            ))}
          </select>

          <select
            value={filterSemester}
            onChange={(e) => setFilterSemester(e.target.value)}
            style={{
              padding: 8,
              borderRadius: 7,
              border: "1.3px solid #c7d2fe",
              minWidth: 150,
            }}
          >
            <option value="">Select Semester</option>
            {semesters.map((sem) => (
              <option key={sem} value={sem}>
                {sem}
              </option>
            ))}
          </select>

          <select
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
            style={{
              padding: 8,
              borderRadius: 7,
              border: "1.3px solid #c7d2fe",
              minWidth: 150,
            }}
          >
            <option value="">Select Section</option>
            {sections.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setFilterCourse("");
              setFilterSubject("");
              setFilterAcadYear("");
              setFilterSemester("");
              setFilterSection("");
            }}
            style={{
              background: "#e0e7ff",
              color: "#3b0764",
              border: "1.3px solid #6366f1",
              borderRadius: 8,
              padding: "7px 20px",
              fontWeight: 700,
            }}
          >
            Reset
          </button>
        </div>
      )}

      {/* Empty-states */}
      {isStudent && filteredRoutines.length === 0 && (
        <div
          style={{
            margin: "10px 7px 16px 7px",
            padding: "12px 14px",
            border: "1px dashed #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          No routines found for Semester <b>{sessStuSem || "-"}</b> &amp; Section <b>{sessStuSec || "-"}</b>.
        </div>
      )}
      {isTeacher && filteredRoutines.length === 0 && (
        <div
          style={{
            margin: "10px 7px 16px 7px",
            padding: "12px 14px",
            border: "1px dashed #93c5fd",
            borderRadius: 10,
            background: "#ffffff",
            color: "#1d4ed8",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          No routines found for Teacher ID <b>{effectiveTeacherId || "—"}</b>.
        </div>
      )}

      <div
        style={{
          width: "100%",
          overflow: "auto",
          borderRadius: 12,
          border: "1.4px solid #e4e4e7",
          background: "#fafbfe",
          boxShadow: "0 2px 9px #e0e7ff44",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            background: "#fafbfe",
            borderRadius: 10,
            fontSize: 14,
            minWidth: 1200,
          }}
        >
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th
                style={{
                  width: 70,
                  background: "#fff",
                  fontWeight: 700,
                  color: "#71717a",
                }}
              ></th>
              {viewMode === "date" && viewDate ? (
                <th
                  style={{
                    padding: "8px 0",
                    fontWeight: 700,
                    color: "#6366f1",
                    fontSize: 16,
                    borderBottom: "1.2px solid #ede9fe",
                    background: "#f0f9ff",
                  }}
                >
                  {getDayOfWeekFromDate(viewDate)} - {new Date(viewDate).toLocaleDateString()}
                </th>
              ) : (
                DAYS.map((day) => (
                  <th
                    key={day}
                    style={{
                      padding: "8px 0",
                      fontWeight: 700,
                      color: "#3b3b3b",
                      fontSize: 14,
                      borderBottom: "1.2px solid #ede9fe",
                      background: "#fff",
                    }}
                  >
                    {day.slice(0, 3)}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {VIEW_SLOTS.map((slot) => (
              <tr key={slot}>
                <td
                  style={{
                    padding: "6px 5px",
                    fontWeight: 600,
                    color: "#a1a1aa",
                    textAlign: "right",
                    background: "#fff",
                    borderRight: "1.2px solid #f3f4f6",
                    fontSize: 12,
                    lineHeight: CARD_TXT.lh,
                  }}
                >
                  {fmtSlot(slot)}
                </td>
                {viewMode === "date" && viewDate ? (
                  // Single column for specific date
                  <td
                    onClick={() => {
                      const dayOfWeek = getDayOfWeekFromDate(viewDate);
                      const dayIdx = DAYS.indexOf(dayOfWeek);
                      if (dayIdx >= 0) handleCellClick(dayIdx, slot);
                    }}
                    title={isAdmin ? "Click to add routine here" : ""}
                    style={{
                      minWidth: 800,
                      height: 32,
                      background: "#fff",
                      borderBottom: "1.1px solid #f3f4f6",
                      verticalAlign: "top",
                      position: "relative",
                      padding: 0,
                      cursor: isAdmin ? "pointer" : "default",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "0 2px",
                      }}
                    >
                      {getRoutinesAt(DAYS.indexOf(getDayOfWeekFromDate(viewDate)), slot).map((routine) => {
                        let bg, borderLeft, label;
                        if (routine.drislabsession && routine.drisclasssession) {
                          bg = "linear-gradient(90deg,#6366f1,#38bdf8)";
                          borderLeft = "5px solid #a21caf";
                          label = (
                            <span
                              style={{
                                fontSize: CARD_TXT.smallSize,
                                lineHeight: CARD_TXT.lh,
                                fontWeight: 700,
                                color: "#fff",
                                background: "linear-gradient(90deg,#ef4444 70%,#2563eb 90%)",
                                padding: "1px 10px",
                                borderRadius: 6,
                                marginLeft: 8,
                                display: "inline-block",
                              }}
                            >
                              Lab + Class
                            </span>
                          );
                        } else if (routine.drislabsession) {
                          bg = "#e0f2fe";
                          borderLeft = "5px solid #2563eb";
                          label = (
                            <span
                              style={{
                                fontSize: CARD_TXT.smallSize,
                                lineHeight: CARD_TXT.lh,
                                fontWeight: 700,
                                color: "#fff",
                                background: "#2563eb",
                                padding: "1px 8px",
                                borderRadius: 6,
                                marginLeft: 8,
                                display: "inline-block",
                              }}
                            >
                              Lab
                            </span>
                          );
                        } else if (routine.drisclasssession) {
                          bg = "#fee2e2";
                          borderLeft = "5px solid #ef4444";
                          label = (
                            <span
                              style={{
                                fontSize: CARD_TXT.smallSize,
                                lineHeight: CARD_TXT.lh,
                                fontWeight: 700,
                                color: "#fff",
                                background: "#ef4444",
                                padding: "1px 8px",
                                borderRadius: 6,
                                marginLeft: 8,
                                display: "inline-block",
                              }}
                            >
                              Class
                            </span>
                          );
                        } else {
                          bg = "#f3f4f6";
                          borderLeft = "5px solid #a3a3a3";
                          label = "";
                        }

                        const subjDesc = getSubjectDescByOfferingId(routine.drsubjid);
                        const durationBadge = formatDuration(
                          to24Hour(routine.drfrom),
                          to24Hour(routine.drto)
                        );

                        return (
                          <div
                            key={getRoutineKey(routine)}
                            style={{
                              background: bg,
                              border: "1px solid #d1d5db",
                              borderLeft: borderLeft,
                              borderRadius: 7,
                              margin: "1px 1px",
                              padding: "4px 8px 3px 8px",
                              fontWeight: 600,
                              fontSize: CARD_TXT.baseSize,
                              color: "#222",
                              display: "flex",
                              flexDirection: "column",
                              gap: 1,
                              boxShadow: "0 1px 6px #0001",
                              position: "relative",
                              cursor: "pointer",
                              lineHeight: CARD_TXT.lh,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isAdmin) handleEdit(routine);
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                justifyContent: "space-between",
                              }}
                            >
                              <span>
                                <b style={{ fontSize: 14, fontWeight: 900 }}>
                                  {routine.drslot || "--"}
                                </b>
                                <span
                                  style={{
                                    color: "#2563eb",
                                    fontWeight: 700,
                                    marginLeft: 10,
                                    fontSize: CARD_TXT.baseSize,
                                  }}
                                >
                                  {getClassroomName(routine.drclassroomid)}
                                </span>
                              </span>
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                {durationBadge && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      background: "#eef2ff",
                                      border: "1px solid #c7d2fe",
                                      color: "#3730a3",
                                    }}
                                  >
                                    {durationBadge}
                                  </span>
                                )}
                                <span
                                  style={{
                                    fontSize: CARD_TXT.smallSize,
                                    color: "#2563eb",
                                    fontWeight: 700,
                                    lineHeight: CARD_TXT.lh,
                                  }}
                                >
                                  {routine.drfrom}–{routine.drto}
                                </span>
                              </span>
                            </div>

                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#111", fontWeight: 700 }}>
                              {subjDesc}
                            </div>

                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#444", fontWeight: 600, margin: "2px 0" }}>
                              <b>Date:</b> {routine.drdate || "--"}
                            </div>

                            {label && <div style={{ marginTop: 2 }}>{label}</div>}

                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#6366f1" }}>
                              <b>Teacher:</b> {getTeacherNameAndId(routine.drclassteacherid)}
                            </div>
                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#ff6b00" }}>
                              <b>Semester:</b> {routine.stu_curr_semester || "--"}
                            </div>
                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#0ea5e9" }}>
                              <b>Section:</b> {routine.stu_section || "--"}
                            </div>

                            {isAdmin && (
                              <div style={{ display: "flex", gap: "5px", marginTop: "6px" }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleEdit(routine); }}
                                  style={{
                                    padding: "3px 10px",
                                    borderRadius: "5px",
                                    background: "#4CAF50",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: CARD_TXT.smallSize,
                                    lineHeight: CARD_TXT.lh,
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(routine); }}
                                  style={{
                                    padding: "3px 10px",
                                    borderRadius: "5px",
                                    background: "#f44336",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: CARD_TXT.smallSize,
                                    lineHeight: CARD_TXT.lh,
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                ) : (
                  // Normal week view with all days
                  DAYS.map((day, dayIdx) => (
                  <td
                    key={day}
                    onClick={() => handleCellClick(dayIdx, slot)}
                    title={isAdmin ? "Click to add routine here" : ""}
                    style={{
                      minWidth: 120,
                      maxWidth: 350,
                      height: 32,
                      background: "#fff",
                      borderBottom: "1.1px solid #f3f4f6",
                      verticalAlign: "top",
                      position: "relative",
                      padding: 0,
                      cursor: isAdmin ? "pointer" : "default",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "0 2px",
                      }}
                    >
                      {getRoutinesAt(dayIdx, slot).map((routine) => {
                        let bg, borderLeft, label;
                        if (routine.drislabsession && routine.drisclasssession) {
                          bg = "linear-gradient(90deg,#6366f1,#38bdf8)";
                          borderLeft = "5px solid #a21caf";
                          label = (
                            <span
                              style={{
                                fontSize: CARD_TXT.smallSize,
                                lineHeight: CARD_TXT.lh,
                                fontWeight: 700,
                                color: "#fff",
                                background: "linear-gradient(90deg,#ef4444 70%,#2563eb 90%)",
                                padding: "1px 10px",
                                borderRadius: 6,
                                marginLeft: 8,
                                display: "inline-block",
                              }}
                            >
                              Lab + Class
                            </span>
                          );
                        } else if (routine.drislabsession) {
                          bg = "#e0f2fe";
                          borderLeft = "5px solid #2563eb";
                          label = (
                            <span
                              style={{
                                fontSize: CARD_TXT.smallSize,
                                lineHeight: CARD_TXT.lh,
                                fontWeight: 700,
                                color: "#fff",
                                background: "#2563eb",
                                padding: "1px 8px",
                                borderRadius: 6,
                                marginLeft: 8,
                                display: "inline-block",
                              }}
                            >
                              Lab
                            </span>
                          );
                        } else if (routine.drisclasssession) {
                          bg = "#fee2e2";
                          borderLeft = "5px solid #ef4444";
                          label = (
                            <span
                              style={{
                                fontSize: CARD_TXT.smallSize,
                                lineHeight: CARD_TXT.lh,
                                fontWeight: 700,
                                color: "#fff",
                                background: "#ef4444",
                                padding: "1px 8px",
                                borderRadius: 6,
                                marginLeft: 8,
                                display: "inline-block",
                              }}
                            >
                              Class
                            </span>
                          );
                        } else {
                          bg = "#f3f4f6";
                          borderLeft = "5px solid #a3a3a3";
                          label = "";
                        }

                        const fromF = to24Hour(routine.drfrom);
                        const toF = to24Hour(routine.drto);
                        const durationBadge = formatDuration(fromF, toF);

                        const subjDesc = getSubjectDescByOfferingId(routine.drsubjid);
                        const courseDesc = getCourseDescByOfferingId(routine.drsubjid);

                        return (
                          <div
                            key={getRoutineKey(routine)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: bg,
                              border: "1.2px solid #d1d5db",
                              borderLeft: borderLeft,
                              borderRadius: 10,
                              margin: "2px 0",
                              padding: "6px 10px 6px 12px",
                              fontWeight: 600,
                              fontSize: CARD_TXT.baseSize,
                              color: "#222",
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              boxShadow: "0 2px 9px #0001",
                              position: "relative",
                              cursor: "default",
                              lineHeight: CARD_TXT.lh,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 9,
                                justifyContent: "space-between",
                              }}
                            >
                              <span style={{ lineHeight: CARD_TXT.lh }}>
                                <b style={{ fontWeight: 800 }}>
                                  Subject: {subjDesc} | Course: {courseDesc} | Offering ID: {routine.drsubjid}
                                </b>
                                <span
                                  style={{
                                    color: "#2563eb",
                                    fontWeight: 700,
                                    marginLeft: 10,
                                    fontSize: CARD_TXT.baseSize,
                                    lineHeight: CARD_TXT.lh,
                                  }}
                                >
                                  {getClassroomName(routine.drclassroomid)}
                                </span>
                              </span>

                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                {durationBadge && (
                                  <span
                                    title="Duration"
                                    style={{
                                      fontSize: CARD_TXT.smallSize,
                                      fontWeight: 800,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      background: "#eef2ff",
                                      border: "1px solid #c7d2fe",
                                      color: "#3730a3",
                                    }}
                                  >
                                    {durationBadge}
                                  </span>
                                )}
                                <span
                                  style={{
                                    fontSize: CARD_TXT.smallSize,
                                    color: "#2563eb",
                                    fontWeight: 700,
                                    lineHeight: CARD_TXT.lh,
                                  }}
                                >
                                  {routine.drfrom}–{routine.drto}
                                </span>
                              </span>
                            </div>

                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#111", fontWeight: 700 }}>
                              {subjDesc}
                            </div>

                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#444", fontWeight: 600, margin: "2px 0" }}>
                              <b>Date:</b> {routine.drdate || "--"}
                            </div>

                            {label && <div style={{ marginTop: 2 }}>{label}</div>}

                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#6366f1" }}>
                              <b>Teacher:</b> {getTeacherNameAndId(routine.drclassteacherid)}
                            </div>
                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#ff6b00" }}>
                              <b>Semester:</b> {routine.stu_curr_semester || "--"}
                            </div>
                            <div style={{ fontSize: CARD_TXT.baseSize, color: "#0ea5e9" }}>
                              <b>Section:</b> {routine.stu_section || "--"}
                            </div>

                            {isAdmin && (
                              <div style={{ display: "flex", gap: "5px", marginTop: "6px" }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleEdit(routine); }}
                                  style={{
                                    padding: "3px 10px",
                                    borderRadius: "5px",
                                    background: "#4CAF50",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: CARD_TXT.smallSize,
                                    lineHeight: CARD_TXT.lh,
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(routine); }}
                                  style={{
                                    padding: "3px 10px",
                                    borderRadius: "5px",
                                    background: "#f44336",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: CARD_TXT.smallSize,
                                    lineHeight: CARD_TXT.lh,
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                ))
              )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message && (
        <div
          style={{
            marginTop: 12,
            marginLeft: 7,
            color: message.toLowerCase().includes("fail") || message.toLowerCase().includes("error") ? "#dc2626" : "#065f46",
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      {showModal && isAdmin && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(100,115,255,0.13)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(2.5px)",
          }}
          onClick={handleCancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 13,
              boxShadow: "0 6px 32px #818cf855",
              minWidth: 440,
              maxWidth: "98vw",
              padding: "38px 38px 28px 38px",
              position: "relative",
              border: "1.5px solid #a5b4fc",
            }}
          >
            <button
              onClick={handleCancel}
              style={{
                position: "absolute",
                right: 15,
                top: 12,
                border: "none",
                background: "none",
                fontSize: 28,
                fontWeight: 800,
                color: "#6366f1",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ×
            </button>
            <h3
              style={{
                margin: "0 0 22px 0",
                textAlign: "center",
                fontWeight: 800,
                letterSpacing: 1,
                color: "#3b0764",
              }}
            >
              {editingRoutine ? "Edit Routine" : "Add Routine"}
            </h3>
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "19px 21px",
                  marginBottom: 20,
                }}
              >
                {/* Date Picker with Auto Day of Week */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontWeight: 600, marginBottom: 3, marginLeft: 2, color: "#444" }}>
                    Date
                  </label>
                  <input
                    type="date"
                    name="drdate"
                    value={form.drdate}
                    onChange={(e) => {
                      const d = new Date(e.target.value);
                      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                      const dayName = dayIdx >= 0 && dayIdx < 6 ? DAYS[dayIdx] : "";
                      setForm((prev) => ({ ...prev, drdayofweek: dayName, drdate: e.target.value }));
                      setSelectedDate(e.target.value);
                    }}
                    required
                    style={{ padding: 9, borderRadius: 6, border: "1.3px solid #c7d2fe" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontWeight: 600, marginBottom: 3, marginLeft: 2, color: "#444" }}>
                    Day of Week
                  </label>
                  <input
                    type="text"
                    value={form.drdayofweek || "Auto-calculated"}
                    disabled
                    style={{ 
                      padding: 9, 
                      borderRadius: 6, 
                      border: "1.3px solid #e5e7eb", 
                      backgroundColor: "#f9fafb",
                      color: "#6b7280",
                      cursor: "not-allowed"
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontWeight: 600, marginBottom: 3, marginLeft: 2, color: "#444" }}>
                    Slot
                  </label>
                  <select
                    name="drslot"
                    value={form.drslot}
                    onChange={handleChange}
                    required
                    style={{ padding: 9, borderRadius: 6, border: "1.3px solid #c7d2fe" }}
                  >
                    <option value="">Select Slot</option>
                    <option value="A1">A1 (08:00 - 09:00)</option>
                    <option value="A2">A2 (09:00 - 10:00)</option>
                    <option value="B1">B1 (10:00 - 11:00)</option>
                    <option value="B2">B2 (11:00 - 12:00)</option>
                    <option value="C1">C1 (12:00 - 13:00)</option>
                    <option value="C2">C2 (13:00 - 14:00)</option>
                    <option value="D1">D1 (14:00 - 15:00)</option>
                    <option value="D2">D2 (15:00 - 16:00)</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontWeight: 600, marginBottom: 3, marginLeft: 2, color: "#444" }}>
                    Time
                  </label>
                  <input
                    type="text"
                    value={form.drfrom && form.drto ? `${form.drfrom} - ${form.drto}` : "Auto-set from slot"}
                    disabled
                    style={{ 
                      padding: 9, 
                      borderRadius: 6, 
                      border: "1.3px solid #e5e7eb", 
                      backgroundColor: "#f9fafb",
                      color: "#6b7280",
                      cursor: "not-allowed"
                    }}
                  />
                </div>

                {/* Readonly Subject & Course Description derived from selected Course Offering (optional showcase) */}
                <input
                  type="text"
                  value={getSubjectDescByOfferingId(filterCourse || offerings[0]?.offerid)}
                  readOnly
                  style={{
                    padding: 9,
                    borderRadius: 6,
                    border: "1.3px solid #c7d2fe",
                    background: "#f3f4f6",
                    color: "#6b7280",
                    fontWeight: 600,
                    cursor: "not-allowed",
                    gridColumn: "1 / 3",
                  }}
                  placeholder="Subject (auto)"
                />
                <input
                  type="text"
                  value={getCourseDescByOfferingId(filterCourse || offerings[0]?.offerid)}
                  readOnly
                  style={{
                    padding: 9,
                    borderRadius: 6,
                    border: "1.3px solid #c7d2fe",
                    background: "#f3f4f6",
                    color: "#6b7280",
                    fontWeight: 600,
                    cursor: "not-allowed",
                    gridColumn: "1 / 3",
                  }}
                  placeholder="Course (auto)"
                />

<select
  name="drclassroomid"
  value={form.drclassroomid}
  onChange={handleChange}
  required
  style={{ padding: 9, borderRadius: 6, border: "1.3px solid #c7d2fe" }}
>
  <option value="">Select Classroom</option>
{classrooms.map((room) => (
  <option key={String(room.classroomid)} value={String(room.classroomid)}>
    {room.classroomcode || room.classroom_code || room.classroomname || room.classroom_name || room.classroomid}
  </option>
))}

</select>


                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontWeight: 600 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      name="drislabsession"
                      checked={!!form.drislabsession}
                      onChange={handleChange}
                      style={{ width: 18, height: 18 }}
                      id="drislabsession"
                    />
                    <label htmlFor="drislabsession">Lab Session</label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      name="drisclasssession"
                      checked={!!form.drisclasssession}
                      onChange={handleChange}
                      style={{ width: 18, height: 18 }}
                      id="drisclasssession"
                    />
                    <label htmlFor="drisclasssession">Class Session</label>
                  </div>
                </div>

                <select
                  name="drclassteacherid"
                  value={form.drclassteacherid}
                  onChange={handleChange}
                  required
                  style={{ padding: 9, borderRadius: 6, border: "1.3px solid #c7d2fe" }}
                >
                  <option value="">Class Teacher</option>
                  {getAvailableTeachers(
                    form.drdayofweek,
                    form.drfrom,
                    form.drto,
                    editingRoutine?.drclassteacherid
                  ).map((t) => (
                    <option key={t.teacherid} value={t.teacherid}>
                      {t.teachername} ({t.teacherid})
                    </option>
                  ))}
                </select>

                {/* Hidden routine count field - always 1 */}
                <input
                  type="hidden"
                  name="drroutcnt"
                  value="1"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "13px",
                  background: loading
                    ? "linear-gradient(90deg, #818cf8, #a5b4fc)"
                    : "linear-gradient(90deg, #7c3aed, #6366f1 60%, #a5b4fc)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "9px",
                  fontWeight: "bold",
                  fontSize: 17,
                  letterSpacing: 1,
                  cursor: loading ? "default" : "pointer",
                  marginTop: 3,
                  boxShadow: "0 2px 16px #b5bdf680",
                }}
              >
                {editingRoutine ? "Update Routine" : "Add Routine"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
