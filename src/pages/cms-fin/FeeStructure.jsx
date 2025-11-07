// src/pages/FeeStructureManager.jsx
import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import { FaPlus, FaTrash, FaEdit, FaSearch, FaInfoCircle } from "react-icons/fa";

/* ---------------- Small helpers ---------------- */
const toISODate = (v) => (v ? String(v).slice(0, 10) : "");

function toFixed2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

/* ---- Semester normalization ---- */
function normalizeSemester(val) {
  if (val === null || val === undefined) return "";
  const m = String(val).match(/(\d{1,2})/);
  if (!m) return "";
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n)) return "";
  return n >= 1 && n <= 8 ? String(n) : "";
}

/* ---- Year/AY helpers ---- */
function extractYear(dateLike) {
  if (!dateLike) return null;
  // Try native Date first
  const d = new Date(dateLike);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    if (y >= 1990 && y <= 2100) return y;
  }
  // Fallback: regex
  const s = String(dateLike);
  const m = s.match(/\b(19|20)\d{2}\b/);
  if (!m) return null;
  const y = parseInt(m[0], 10);
  return Number.isNaN(y) ? null : y;
}
function deriveAYFromStartEnd(startLike, endLike) {
  const sy = extractYear(startLike);
  const ey = extractYear(endLike);
  if (sy && ey) {
    const tail = Math.max(sy + 1, ey);
    return `${sy}-${tail}`;
  }
  if (sy) return `${sy}-${sy + 1}`;
  if (ey) return `${ey - 1}-${ey}`;
  return "";
}
function deriveAcademicYearFromDate(admissionDate) {
  const y = extractYear(admissionDate);
  return y ? `${y}-${y + 1}` : "";
}

/* Prefer exact admission key when present */
function getPreferredAdmissionDate(obj) {
  if (obj?.stuadmissiondt) return obj.stuadmissiondt;
  return (
    obj?.stu_admission_dt ??
    obj?.stuadmissiondate ??
    obj?.admissiondt ??
    obj?.admission_date ??
    obj?.admissionDate ??
    obj?.joining_date ??
    obj?.stujoiningdate ??
    obj?.joinDate ??
    ""
  );
}

/* --- Read program dates from many shapes --- */
function getPreferredProgramDates(programObj) {
  if (!programObj || typeof programObj !== "object") return { start: "", end: "" };

  const start =
    programObj.subject_course_start_date ??
    programObj.subject_course_start ??
    programObj.academic_year_start ??
    programObj.academic_year_start_date ??
    programObj.acad_year_start ??
    programObj.acad_year_start_date ??
    programObj.acayear_start ??
    programObj.acayear_start_dt ??
    programObj.start_date ??
    programObj.startDate ??
    programObj.prog_start_date ??
    programObj.course_start_date ??
    "";

  const end =
    programObj.subject_course_end_date ??
    programObj.subject_course_end ??
    programObj.academic_year_end ??
    programObj.academic_year_end_date ??
    programObj.acad_year_end ??
    programObj.acad_year_end_date ??
    programObj.acayear_end ??
    programObj.acayear_end_dt ??
    programObj.end_date ??
    programObj.endDate ??
    programObj.prog_end_date ??
    programObj.course_end_date ??
    "";

  return { start, end };
}

/* Student helpers */
function pickSemesterFromStudent(s) {
  const candidates = [
    s.stucurrentsem,
    s.current_semester,
    s.currentsemester,
    s.semester_no,
    s.semester,
    s.sem,
  ];
  const found = candidates.find(
    (x) => x !== undefined && x !== null && String(x).trim() !== ""
  );
  return found ? String(found) : "";
}

function normalizeStudent(s) {
  const stuid =
    s.stuid ?? s.studentid ?? s.student_id ?? s.id ?? s.stu_id ?? "";
  const stuname =
    s.stuname ??
    s.studentname ??
    s.student_name ??
    s.name ??
    s.fullname ??
    s.full_name ??
    "";
  const stu_course_id =
    s.stu_course_id ??
    s.courseid ??
    s.programId ??
    s.program_id ??
    s.prg_id ??
    "";
  const admission = getPreferredAdmissionDate(s);
  let semfees = s.semfees ?? s.sem_fees ?? s.seemfees ?? 0;
  semfees = Number.isFinite(Number(semfees)) ? Number(semfees) : 0;

  return {
    stuid: String(stuid || "").trim(),
    stuname: String(stuname || "").trim(),
    stu_course_id: String(stu_course_id || "").trim(),
    admissionDate: admission,
    semester: pickSemesterFromStudent(s),
    semfees,
    _raw: s,
  };
}

/* Program id parsing */
function parseProgramId(rawId) {
  const id = String(rawId || "");
  const m = id.match(/_S(\d{1,2})$/i);
  const semFromId = m ? String(parseInt(m[1], 10)) : "";
  const baseId = id.replace(/_S\d{1,2}$/i, "");
  return { baseId, semFromId };
}

/* UI preview helpers */
function safeEqCI(a, b) {
  return String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
}
function countByCourseOnly(studentsNorm, fee_prg_id) {
  if (!fee_prg_id) return 0;
  return studentsNorm.filter((s) => safeEqCI(s.stu_course_id, fee_prg_id)).length;
}
function countByCourseAndSemester(studentsNorm, fee_prg_id, fee_semester_no) {
  if (!fee_prg_id || !fee_semester_no) return 0;
  const semStr = String(fee_semester_no);
  return studentsNorm.filter((s) => {
    if (!safeEqCI(s.stu_course_id, fee_prg_id)) return false;
    const norm = normalizeSemester(s.semester);
    return norm && norm === semStr;
  }).length;
}

/* ---------------- Component ---------------- */
export default function FeeStructureManager() {
  const [feeStructures, setFeeStructures] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [alert, setAlert] = useState({ show: false, message: "", variant: "" });

  const [form, setForm] = useState({
    fee_struct_id: "",
    fee_prg_id: "",
    fee_acad_year: "", // auto (program dates preferred, fallback admissions)
    fee_semester_no: "",
    fee_head: "",
    fee_amount: "",        // user-entered per-head amount
    fee_is_mandatory: true,
    fee_due_dt: "",
    fee_remarks: "",
  });

  // existing: applies per-head amount to students
  const [applyToStudents, setApplyToStudents] = useState(true);
  // optional: apply the full Program Total (auto) instead of per-head amount
  const [applyProgramTotal, setApplyProgramTotal] = useState(false);

  // AY detect info (for small hint under Program)
  const [detectedAYInfo, setDetectedAYInfo] = useState({ ay: "", sample: 0, source: "" });

  /* ---------------- Fetch Helpers ---------------- */
  const fetchCourses = async () => {
    setCoursesLoading(true);
    try {
      const res = await axios.get(`${config.COURSE_ROUTE}/list`);
      setCourses(res.data.courses || []);
    } catch (err) {
      console.error("Error fetching courses:", err);
      setAlert({ show: true, message: "Failed to fetch courses", variant: "danger" });
    } finally {
      setCoursesLoading(false);
    }
  };

  const fetchFeeStructures = async () => {
    setLoading(true);
    try {
      const res = await axios.get(config.FIN_UI_FEE_STRUCTURE_ROUTE);
      setFeeStructures(res.data.feeStructures || []);
    } catch (err) {
      console.error("Error fetching fee structures:", err);
      setAlert({ show: true, message: "Failed to fetch fee structures", variant: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${config.STUDENT_ROUTE}/list`);
      const list = res.data.students || res.data || [];
      setStudents(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error fetching students:", err);
      setStudents([]);
    }
  };

  /* ---------- SUBJECT_COURSE first: program details (start/end) ---------- */
  const fetchProgramDetails = async (programId) => {
    const { baseId } = parseProgramId(programId);
    const subjectCourse = config.SUBJECT_COURSE_ROUTE;
    const course = config.COURSE_ROUTE;

    const urls = [
      // SUBJECT_COURSE exact
      `${subjectCourse}/get?courseid=${encodeURIComponent(programId)}`,
      `${subjectCourse}/details/${encodeURIComponent(programId)}`,
      `${subjectCourse}/details?courseid=${encodeURIComponent(programId)}`,
      `${subjectCourse}/list?courseid=${encodeURIComponent(programId)}`,
      // SUBJECT_COURSE baseId
      `${subjectCourse}/get?courseid=${encodeURIComponent(baseId)}`,
      `${subjectCourse}/details/${encodeURIComponent(baseId)}`,
      `${subjectCourse}/details?courseid=${encodeURIComponent(baseId)}`,
      `${subjectCourse}/list?courseid=${encodeURIComponent(baseId)}`,
      // COURSE fallbacks
      `${course}/get?courseid=${encodeURIComponent(programId)}`,
      `${course}/details/${encodeURIComponent(programId)}`,
      `${course}/details?courseid=${encodeURIComponent(programId)}`,
      `${course}/list?courseid=${encodeURIComponent(programId)}`,
      `${course}/get?courseid=${encodeURIComponent(baseId)}`,
      `${course}/details/${encodeURIComponent(baseId)}`,
      `${course}/details?courseid=${encodeURIComponent(baseId)}`,
      `${course}/list?courseid=${encodeURIComponent(baseId)}`,
    ];

    for (const url of urls) {
      try {
        const res = await axios.get(url);
        const data = res?.data;
        if (!data) continue;

        if (Array.isArray(data?.courses) && data.courses.length) return data.courses[0];
        if (Array.isArray(data?.subjectCourses) && data.subjectCourses.length) return data.subjectCourses[0];
        if (Array.isArray(data) && data.length) return data[0];
        if (typeof data === "object") return data;
      } catch (_) {
        /* try next */
      }
    }

    // local cache
    return (
      (courses || []).find(
        (c) =>
          safeEqCI(String(c.courseid || c.id || ""), programId) ||
          safeEqCI(String(c.courseid || c.id || ""), baseId)
      ) || null
    );
  };

  /* ---------- Compute AY for program: program dates preferred ---------- */
  async function computeAcademicYearForProgram(programId) {
    if (!programId) return { ay: "", sample: 0, source: "" };

    // Prefer program start/end
    const program = await fetchProgramDetails(programId);
    const { start, end } = getPreferredProgramDates(program);
    const ayFromProgram = deriveAYFromStartEnd(start, end);
    if (ayFromProgram) {
      return { ay: ayFromProgram, sample: 0, source: "program-dates" };
    }

    // Fallback: mode of students' admission years
    const { baseId } = parseProgramId(programId);
    const list =
      (studentsByCourse[programId] || studentsByCourse[baseId] || []).map((x) => x._raw ?? x);

    const ayCounts = {};
    let sample = 0;
    for (const s of list) {
      const adm = getPreferredAdmissionDate(s) || s?.admissionDate || "";
      const ay = deriveAcademicYearFromDate(adm);
      if (!ay) continue;
      sample++;
      ayCounts[ay] = (ayCounts[ay] || 0) + 1;
    }

    let pickedAY = "";
    let maxCnt = 0;
    Object.entries(ayCounts).forEach(([ay, cnt]) => {
      if (cnt > maxCnt) {
        maxCnt = cnt;
        pickedAY = ay;
      }
    });

    return { ay: pickedAY, sample, source: pickedAY ? "admission-mode" : "" };
  }

  /* ---------- Autofill AY + Semester when Program changes ---------- */
  async function autoFillAYFromProgram(programId, prevForm) {
    if (!programId) return;

    // AY from program dates, fallback to admissions
    const { ay, sample, source } = await computeAcademicYearForProgram(programId);

    // Semester from suffix or students' majority
    const { baseId, semFromId } = parseProgramId(programId);
    const list = studentsByCourse[programId] || studentsByCourse[baseId] || [];
    const semCounts = {};
    for (const s of list) {
      const sem = normalizeSemester(s.semester);
      if (!sem) continue;
      semCounts[sem] = (semCounts[sem] || 0) + 1;
    }
    let derivedSem = "";
    let semMax = 0;
    Object.entries(semCounts).forEach(([sem, cnt]) => {
      if (cnt > semMax) {
        semMax = cnt;
        derivedSem = sem;
      }
    });
    const finalSem = normalizeSemester(semFromId || derivedSem || prevForm?.fee_semester_no);

    setForm((p) => ({
      ...p,
      fee_acad_year: ay || p.fee_acad_year,
      fee_semester_no: finalSem || p.fee_semester_no,
    }));
    setDetectedAYInfo({ ay, sample, source });
  }

  useEffect(() => {
    fetchFeeStructures();
    fetchCourses();
    fetchStudents();
  }, []);

  /* ---------------- Derived data ---------------- */
  const studentsNorm = useMemo(
    () => (Array.isArray(students) ? students.map(normalizeStudent) : []),
    [students]
  );

  const studentsByCourse = useMemo(() => {
    const map = {};
    for (const s of studentsNorm) {
      const id = s.stu_course_id;
      if (!id) continue;
      if (!map[id]) map[id] = [];
      map[id].push(s);
    }
    return map;
  }, [studentsNorm]);

  const courseNameById = useMemo(() => {
    const m = {};
    (courses || []).forEach((c) => {
      if (c?.courseid) m[String(c.courseid)] = c.coursedesc || "";
    });
    return m;
  }, [courses]);

  const programOptions = useMemo(() => {
    const ids = Object.keys(studentsByCourse);
    const opts = ids.map((rawId) => {
      const { baseId, semFromId } = parseProgramId(rawId);
      const name = courseNameById[rawId] || courseNameById[baseId] || rawId;
      const semLabel = semFromId ? ` (Sem ${semFromId})` : "";
      return {
        id: rawId,
        label: `${name}${semLabel} (${rawId})`,
        sortKey: name,
      };
    });
    opts.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
    return opts;
  }, [studentsByCourse, courseNameById]);

  const filteredFeeStructures = feeStructures.filter((item) =>
    Object.values(item).some(
      (val) => val && val.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  /* Recompute AY/Sem when Program changes and on initial data load */
  useEffect(() => {
    (async () => {
      if (form.fee_prg_id) {
        await autoFillAYFromProgram(form.fee_prg_id, form);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.fee_prg_id, students, courses]);

  /* ---------------- Matching preview counts ---------------- */
  const previewCourseOnlyCount = useMemo(
    () => countByCourseOnly(studentsNorm, form.fee_prg_id),
    [studentsNorm, form.fee_prg_id]
  );

  const previewCourseSemCount = useMemo(
    () =>
      countByCourseAndSemester(
        studentsNorm,
        form.fee_prg_id,
        normalizeSemester(form.fee_semester_no)
      ),
    [studentsNorm, form.fee_prg_id, form.fee_semester_no]
  );

  /* ---------------- Program Total (Auto) ---------------- */
  const programTotalAllSem = useMemo(() => {
    if (!form.fee_prg_id) return 0;
    const prg = String(form.fee_prg_id).trim().toUpperCase();
    let total = 0;
    for (const fs of feeStructures) {
      if (String(fs.fee_prg_id || "").trim().toUpperCase() === prg) {
        const n = Number(fs.fee_amount);
        if (Number.isFinite(n)) total += n;
      }
    }
    return Number(total.toFixed(2));
  }, [feeStructures, form.fee_prg_id]);

  /* ---------------- Helpers: apply to students ---------------- */
  const getMatchedStudents = useMemo(() => {
    const prg = String(form.fee_prg_id || "");
    const sem = normalizeSemester(form.fee_semester_no);
    if (!prg || !sem) return [];
    return studentsNorm.filter(
      (s) => safeEqCI(s.stu_course_id, prg) && normalizeSemester(s.semester) === sem
    );
  }, [studentsNorm, form.fee_prg_id, form.fee_semester_no]);

  const applyToStudentsBulk = async (matched, amountNum) => {
    if (!Array.isArray(matched) || matched.length === 0) return { updated: 0 };
    const semester = normalizeSemester(form.fee_semester_no);

    const r = await axios.post(
      `${config.STUDENT_ROUTE}/seemfees/bulk`,
      {
        studentIds: matched.map((x) => x.stuid),
        amount: amountNum,
        mode: "set",
        semester,
      },
      { headers: { "Content-Type": "application/json" } }
    );
    const updated = Number(r?.data?.updated ?? matched.length);
    return { updated };
  };

  /* ---------------- Handlers ---------------- */
  const handleChange = async (e) => {
    const { name, value, type, checked } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (name === "fee_prg_id") {
      await autoFillAYFromProgram(value, form);
    }
  };

  const generateId = () => "FS-" + Date.now();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Ensure AY exists (final guard)
      let ayToUse = String(form.fee_acad_year || "").trim();
      if (!ayToUse && form.fee_prg_id) {
        const { ay } = await computeAcademicYearForProgram(form.fee_prg_id);
        ayToUse = ay || "";
        if (ayToUse) {
          setForm((p) => ({ ...p, fee_acad_year: ayToUse }));
        }
      }

      const normalizedSemStr = normalizeSemester(form.fee_semester_no);
      const normalizedSemNum = normalizedSemStr ? Number(normalizedSemStr) : null;

      const amountNum = Number(form.fee_amount);
      const isAmountValid = Number.isFinite(amountNum) && amountNum >= 0;

      const payload = {
        ...form,
        fee_struct_id: editing ? form.fee_struct_id : generateId(),
        fee_prg_id: String(form.fee_prg_id || "").trim(),
        fee_acad_year: ayToUse, // auto-generated AY
        fee_semester_no: normalizedSemNum,
        fee_amount: isAmountValid ? Number(amountNum.toFixed(2)) : null,
        fee_due_dt: form.fee_due_dt || null,
      };

      if (!payload.fee_prg_id) {
        setAlert({ show: true, message: "Please select a Program.", variant: "danger" });
        return;
      }
      if (!payload.fee_acad_year) {
        setAlert({
          show: true,
          message: "Academic Year could not be auto-generated (no program dates or admissions found).",
          variant: "danger",
        });
        return;
      }
      if (!payload.fee_head) {
        setAlert({ show: true, message: "Please select a Category.", variant: "danger" });
        return;
      }
      if (
        payload.fee_semester_no === null ||
        !Number.isInteger(payload.fee_semester_no) ||
        payload.fee_semester_no < 1 ||
        payload.fee_semester_no > 8
      ) {
        setAlert({ show: true, message: "Semester must be an integer between 1 and 8.", variant: "danger" });
        return;
      }
      if (!isAmountValid) {
        setAlert({ show: true, message: "Enter a valid Amount (number ≥ 0).", variant: "danger" });
        return;
      }

      let apiMsg = "";
      if (editing) {
        await axios.put(
          `${config.FIN_UI_FEE_STRUCTURE_ROUTE}/${editing.fee_struct_id}`,
          payload,
          { headers: { "Content-Type": "application/json" } }
        );
        apiMsg = "Fee structure updated.";
        setEditing(null);
      } else {
        await axios.post(
          `${config.FIN_UI_FEE_STRUCTURE_ROUTE}`,
          payload,
          { headers: { "Content-Type": "application/json" } }
        );
        apiMsg = "Fee structure added.";
      }

      let applyMsg = "";
      if (applyToStudents) {
        try {
          const matched = getMatchedStudents;
          if (matched.length > 0) {
            const amountToApply = applyProgramTotal ? programTotalAllSem : payload.fee_amount;
            const { updated } = await applyToStudentsBulk(matched, amountToApply);
            applyMsg = ` Applied ₹${toFixed2(amountToApply)} to ${updated} student(s).`;
            await fetchStudents();
          } else {
            applyMsg = " No matching students to apply.";
          }
        } catch (e) {
          console.error("Failed to apply to students:", e?.response?.data || e.message);
          applyMsg = " Failed to apply to students.";
        }
      }

      const previewMsg =
        `Preview: ${previewCourseOnlyCount} student(s) share this Program; ` +
        `${previewCourseSemCount} student(s) share Program + Semester.`;

      setAlert({
        show: true,
        message: `${apiMsg} Amount saved: ₹${toFixed2(payload.fee_amount)}.${applyMsg} ${previewMsg}`,
        variant: "success",
      });

      resetForm();
      setShowModal(false);
      fetchFeeStructures();
    } catch (err) {
      console.error("Error saving fee structure:", err);
      setAlert({
        show: true,
        message:
          err?.response?.data?.error ||
          err?.response?.data?.details ||
          "Failed to save fee structure",
        variant: "danger",
      });
    }
  };

  const resetForm = () => {
    setForm({
      fee_struct_id: "",
      fee_prg_id: "",
      fee_acad_year: "",
      fee_semester_no: "",
      fee_head: "",
      fee_amount: "",
      fee_is_mandatory: true,
      fee_due_dt: "",
      fee_remarks: "",
    });
    setApplyToStudents(true);
    setApplyProgramTotal(false);
    setDetectedAYInfo({ ay: "", sample: 0, source: "" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this fee structure?")) return;
    try {
      await axios.delete(`${config.FIN_UI_FEE_STRUCTURE_ROUTE}/${id}`);
      setAlert({ show: true, message: "Fee structure deleted successfully", variant: "success" });
      fetchFeeStructures();
    } catch (err) {
      console.error("Error deleting fee structure:", err);
      setAlert({ show: true, message: "Failed to delete fee structure", variant: "danger" });
    }
  };

  const handleEdit = (item) => {
    setEditing(item);
    setForm({
      ...item,
      fee_prg_id: String(item.fee_prg_id || "").trim(),
      fee_due_dt: item.fee_due_dt ? toISODate(item.fee_due_dt) : "",
      fee_semester_no: normalizeSemester(item.fee_semester_no),
      fee_amount: item.fee_amount ?? "",
    });
    setApplyToStudents(true);
    setApplyProgramTotal(false);
    setShowModal(true);
    setDetectedAYInfo({ ay: "", sample: 0, source: "" });
  };

  const openAddModal = () => {
    setEditing(null);
    resetForm();
    setShowModal(true);
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center">
              <FaEdit className="mr-3 text-blue-600" /> Fee Structure Manager
            </h1>
            <button
              onClick={openAddModal}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <FaPlus className="mr-2" /> Add Fee Structure
            </button>
          </div>

          {alert.show && (
            <div
              className={`mb-4 rounded px-4 py-3 text-sm ${
                alert.variant === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {alert.message}
            </div>
          )}

          {/* Search */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaSearch className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search fee structures..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Program</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Semester</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Mandatory</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Remarks</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFeeStructures.map((f) => (
                    <tr key={f.fee_struct_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm">{f.fee_struct_id}</td>
                      <td className="px-6 py-4 text-sm">
                        {courseNameById[String(f.fee_prg_id)] || String(f.fee_prg_id)}
                      </td>
                      <td className="px-6 py-4 text-sm">{f.fee_acad_year}</td>
                      <td className="px-6 py-4 text-sm">{f.fee_semester_no}</td>
                      <td className="px-6 py-4 text-sm">{f.fee_head}</td>
                      <td className="px-6 py-4 text-sm">₹{toFixed2(f.fee_amount ?? 0)}</td>
                      <td className="px-6 py-4 text-sm">{f.fee_is_mandatory ? "Yes" : "No"}</td>
                      <td className="px-6 py-4 text-sm">
                        {f.fee_due_dt ? new Date(f.fee_due_dt).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-6 py-4 text-sm">{f.fee_remarks}</td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => handleEdit(f)}
                          className="text-yellow-600 hover:text-yellow-800 mr-2"
                          title="Edit"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => handleDelete(f.fee_struct_id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          <FaTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredFeeStructures.length === 0 && (
                    <tr>
                      <td colSpan="10" className="px-6 py-6 text-center text-sm text-gray-500">
                        No records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

    {/* Modal Form (smaller, tighter, scrollable) */}
{showModal && (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-3 z-50">
    <div
      className="
        relative w-full bg-white rounded-2xl shadow-2xl
        sm:max-w-lg md:max-w-xl lg:max-w-2xl
        max-h-[90vh] overflow-y-auto
      "
    >
      {/* Close (optional) */}
      <button
        type="button"
        onClick={() => setShowModal(false)}
        className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Close"
      >
        ×
      </button>

      <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-3 text-sm">
        {/* Program */}
        <div>
          <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
            Program
          </label>
          <select
            name="fee_prg_id"
            value={form.fee_prg_id}
            onChange={handleChange}
            required
            className="
              w-full border border-gray-300 rounded-md
              p-2 md:p-2.5 text-sm
              focus:ring-blue-500 focus:border-blue-500
            "
          >
            <option value="">Select</option>
            {programOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <p className="text-[11px] md:text-xs text-gray-500 mt-1 leading-snug">
            AY auto-fills from Program start/end dates (preferred). If unavailable, it falls
            back to the most common admission year among students (<code>Y → Y+1</code>).
          </p>

          {detectedAYInfo?.ay && (
            <p className="text-[11px] md:text-xs text-emerald-700 mt-1 leading-snug">
              Detected AY: <b>{detectedAYInfo.ay}</b>
              {detectedAYInfo.source ? ` (${detectedAYInfo.source})` : ""}
              {detectedAYInfo.sample ? ` • sample: ${detectedAYInfo.sample}` : ""}
            </p>
          )}
        </div>

              {/* Academic Year (auto, read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                <input
                  type="text"
                  name="fee_acad_year"
                  value={form.fee_acad_year}
                  readOnly
                  placeholder="Auto-filled from program dates or admissions"
                  className="w-full border border-gray-300 rounded-md p-2 bg-gray-100 text-gray-700 cursor-not-allowed"
                />
              </div>

              {/* Semester */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                <select
                  name="fee_semester_no"
                  value={normalizeSemester(form.fee_semester_no)}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select</option>
                  {Array.from({ length: 8 }, (_, i) => String(i + 1)).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Auto-fills; you can override.</p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  name="fee_head"
                  value={form.fee_head}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select</option>
                  <option value="Tuition Fee">Tuition Fee</option>
                  <option value="Hostel Fee">Hostel Fee</option>
                  <option value="Mess Fee">Mess Fee</option>
                  <option value="Exam Fee">Exam Fee</option>
                  <option value="Registration Fee">Registration Fee</option>
                  <option value="Others/Miscellaneous">Others/Miscellaneous</option>
                </select>
              </div>

              {/* Amount (user-entered per-head) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="fee_amount"
                  value={form.fee_amount}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This value is saved to the Fee Structure and can be applied to each matched student’s <code>seemfees</code>.
                </p>
              </div>

              {/* Program Total (auto) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Program Total (Auto) — All Semesters & Heads
                </label>
                <input
                  type="text"
                  readOnly
                  value={`₹${toFixed2(programTotalAllSem)}`}
                  className="w-full border border-gray-300 rounded-md p-2 bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Auto-summed from all fee structures for the selected Program (ignores Semester filter).
                </p>
              </div>

              {/* Preview row */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm flex items-start gap-2">
                <FaInfoCircle className="mt-0.5" />
                <div>
                  <div>
                    <b>Preview:</b> {previewCourseOnlyCount} student(s) share this Program (course-only match).
                  </div>
                  <div>
                    <b>Narrowed by Semester:</b> {previewCourseSemCount} student(s) share Program + Semester.
                  </div>
                </div>
              </div>

              {/* Mandatory + Due Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="fee_is_mandatory"
                    checked={form.fee_is_mandatory}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="ml-2 text-sm text-gray-700">Mandatory</label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    name="fee_due_dt"
                    value={form.fee_due_dt}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                <select
                  name="fee_remarks"
                  value={form.fee_remarks}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select</option>
                  {/* <option value="Paid">Paid</option> */}
                  <option value="Due">Due</option>
                </select>
              </div>

              {/* Apply toggles */}
              {!editing && (
                <div className="space-y-2">
                  <div className="flex items-center bg-gray-50 p-3 rounded border border-gray-200">
                    <input
                      id="applyToStudents"
                      type="checkbox"
                      checked={applyToStudents}
                      onChange={(e) => setApplyToStudents(e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="applyToStudents" className="ml-2 text-sm text-gray-700">
                      Apply to all students of the selected Program & Semester now (<code>student_master.seemfees</code>).
                    </label>
                  </div>

                  <div className={`flex items-center p-3 rounded border ${applyProgramTotal ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                    {/* <input
                      id="applyProgramTotal"
                      type="checkbox"
                      checked={applyProgramTotal}
                      onChange={(e) => setApplyProgramTotal(e.target.checked)}
                      className="h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                      disabled={!applyToStudents}
                    /> */}
                    {/* <label htmlFor="applyProgramTotal" className={`ml-2 text-sm ${applyToStudents ? "text-gray-700" : "text-gray-400"}`}>
                      Use <b>Program Total (Auto)</b> ₹{toFixed2(programTotalAllSem)} instead of per-head Amount when applying to students.
                    </label> */}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 flex items-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {editing ? (
                    <>
                      <FaEdit className="mr-2" /> Update
                    </>
                  ) : (
                    <>
                      <FaPlus className="mr-2" /> Add
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}