import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import config from "../../config/middleware_config";

/* ---------------- Safe URL joiner ---------------- */
function joinUrl(base = "", path = "") {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}/${p}`;
}

/* ---------------- Routes ---------------- */
const BASE = joinUrl(config.BASE_URL || "", config.API_PREFIX || "");
const ROUTES = {
  MANAGER: joinUrl(BASE, config.EXAM_ROUTINE_MANAGER_ROUTE || "/exam-routine-manager"),
  TEACHER: joinUrl(BASE, config.TEACHER_ROUTE || "/teacher"),
  CLASS_ROOM: joinUrl(BASE, config.CLASS_ROOM_ROUTE || "/class-room"),
  MASTER_ACADYEAR: joinUrl(BASE, config.MASTER_ACADYEAR_ROUTE || "/master-acadyear"),
};

/* ---------------- APIs ---------------- */
const OFFERINGS_API =
  (config.COURSE_OFFERING_ROUTE && String(config.COURSE_OFFERING_ROUTE).trim())
    ? (/^https?:\/\//i.test(String(config.COURSE_OFFERING_ROUTE))
        ? String(config.COURSE_OFFERING_ROUTE).trim()
        : joinUrl(BASE, String(config.COURSE_OFFERING_ROUTE).trim()))
    : joinUrl(BASE, "/course-offering");

const SUBJECTS_API = joinUrl(config.SUBJECT_ROUTE || joinUrl(BASE, "/subject"), "list");

/* ---------------- Model ---------------- */
const emptyForm = {
  examid: "",
  examofferid: "",
  examtermid: "",
  examtype: "",
  examtitle: "",
  examdate: "",
  examst_time: "",
  examen_time: "",
  examroomid: "",
  exammaxmarks: "",
  examwtpercentge: "",
  examcondby: "",
  examremarks: "",
  sem: "",
  section: "",
  program: "",
};

/* ---------------- Max Marks to Weight Mapping ---------------- */
const MAX_MARKS_OPTIONS = [
  { value: "25", weight: "25" },
  { value: "40", weight: "40" },
  { value: "60", weight: "60" }
];

/* ---------------- Helpers ---------------- */
const isObj = (x) => x && typeof x === "object";
const SUBJECT_INDEX_KEY = "sms_subject_index_v1";

function getDeep(obj, path) {
  if (!isObj(obj)) return "";
  const parts = String(path || "").split(".").map((s) => s.trim()).filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return "";
    cur = cur[p];
  }
  return cur ?? "";
}

function normalizeAyString(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{4})\s*[-/]\s*(\d{2})$/);
  if (m) return `${m[1]}-${m[1].slice(0, 2)}${m[2]}`;
  return t.replace(/\s+/g, " ").toLowerCase();
}

/* ---------------- Offering normalization ---------------- */
function normalizeOfferings(payload) {
  const raw = Array.isArray(payload) ? payload : payload?.offerings || payload?.data || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((off) => {
      if (!isObj(off)) return null;
      const offerid = off.offerid ?? off.offer_id ?? off.id ?? off.offerId ?? off.OFFERID ?? "";
      if (!String(offerid)) return null;

      const sem =
        off.offer_semesterno ??
        off.offer_semester ??
        off.semester_no ??
        off.semester ??
        off.sem ??
        "";

      const section = off.offer_section ?? off.section ?? off.sec ?? "";

      const facultyId =
        off.offer_facultyid ??
        off.facultyid ??
        off.faculty_id ??
        off.teacherid ??
        off.teacher_id ??
        "";

      const termId =
        off.offfer_term ??
        off.offer_term ??
        off.offer_termid ??
        off.termid ??
        off.term_id ??
        "";

      const acadYear = off.academicyear || off.academic_year || off.acadyear || "";

      const programId =
        off.offer_programid ??
        off.programid ??
        off.program_id ??
        getDeep(off, "program.id") ??
        "";

      const programName =
        off.programname ??
        off.program_name ??
        off.programtitle ??
        off.program_title ??
        getDeep(off, "program.name") ??
        getDeep(off, "program.title") ??
        "";

      // subject id may be stored under offer_courseid or similar
      const subjectId =
        off.offer_courseid ??
        off.subjectid ??
        off.subject_id ??
        getDeep(off, "subject.id") ??
        "";

      // keep raw for later
      return {
        offerid: String(offerid),
        sem: String(sem || ""),
        section: String(section || ""),
        facultyId: String(facultyId || ""),
        termId: String(termId || ""),
        acadYear: String(acadYear || ""),
        programId: String(programId || ""),
        programName: String(programName || ""),
        subjectId: String(subjectId || ""),
        _raw: off,
      };
    })
    .filter(Boolean);
}

/* Build dropdown label using subject lookup */
function labelFromOffering(off, subjectById) {
  const subj = subjectById.get(String(off.subjectId));
  const subjName =
    subj?.name ||
    getDeep(off._raw, "subject.name") ||
    getDeep(off._raw, "subject.title") ||
    "";
  const course =
    off._raw?.coursename ||
    off._raw?.course_name ||
    getDeep(off._raw, "course.name") ||
    "";
  const main = subjName || course || "Subject";
  const meta = [];
  if (off.sem) meta.push(`Sem: ${off.sem}`);
  if (off.section) meta.push(`Sec: ${off.section}`);
  return meta.length ? `${main} (${meta.join(" | ")})` : main;
}

/* ---------------- Modal ---------------- */
function Modal({ open, title, onClose, children, width = 1000 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || "Dialog"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: width,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1e293b" }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: "#334155",
            }}
          >
            &times;
          </button>
        </div>
        <div style={{ padding: 18, overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Component ---------------- */
const ExamRoutineManager = () => {
  const [routines, setRoutines] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState(false);

  const [teachers, setTeachers] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [terms, setTerms] = useState([]);

  // subjects for label rendering
  const [subjects, setSubjects] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);

  /* -------- fetchers -------- */
  useEffect(() => {
    fetchRoutines();
    fetchTeachers();
    fetchOfferings();
    fetchRooms();
    fetchTerms();
    fetchSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRoutines = async () => {
    try {
      const res = await axios.get(ROUTES.MANAGER);
      const data = Array.isArray(res.data) ? res.data : res.data?.routines || [];
      setRoutines(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch exam routines:", err);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await axios.get(ROUTES.TEACHER);
      const arr = Array.isArray(res.data) ? res.data : res.data?.teachers || [];
      setTeachers(Array.isArray(arr) ? arr : []);
    } catch (err) {
      console.error("Failed to fetch teachers:", err);
    }
  };

  const fetchOfferings = async () => {
    try {
      const res = await axios.get(OFFERINGS_API);
      setOfferings(normalizeOfferings(res.data));
    } catch (err) {
      console.error("Failed to fetch offerings:", err);
      setOfferings([]);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await axios.get(ROUTES.CLASS_ROOM);
      const arr = Array.isArray(res.data) ? res.data : res.data?.classrooms || [];
      setRooms(Array.isArray(arr) ? arr : []);
    } catch (err) {
      console.error("Failed to fetch rooms:", err);
    }
  };

  const fetchTerms = async () => {
    try {
      const res = await axios.get(ROUTES.MASTER_ACADYEAR);
      const arr = Array.isArray(res.data) ? res.data : res.data?.terms || res.data?.acadyears || [];
      setTerms(Array.isArray(arr) ? arr : []);
    } catch (err) {
      console.error("Failed to fetch terms:", err);
    }
  };

  const fetchSubjects = async () => {
    try {
      const res = await axios.get(SUBJECTS_API);
      const raw = res?.data?.subjects || res?.data || [];
      const arr = Array.isArray(raw) ? raw : [];
      setSubjects(arr);
      // cache to localStorage for fallback
      const idx = {};
      arr.forEach((s) => {
        const id = String(s.subjectid ?? s.id ?? s.subject_code ?? "");
        if (!id) return;
        idx[id] = {
          name: s.subjectname || s.subjectdesc || s.subject_title || s.subject_code || "",
          code: s.subject_code || "",
        };
      });
      try { localStorage.setItem(SUBJECT_INDEX_KEY, JSON.stringify(idx)); } catch {}
    } catch (err) {
      console.warn("Subjects API failed; using cache if available");
      try {
        const cached = JSON.parse(localStorage.getItem(SUBJECT_INDEX_KEY) || "{}");
        const arr = Object.entries(cached).map(([id, v]) => ({
          subjectid: id,
          subjectname: v?.name || "",
          subject_code: v?.code || "",
        }));
        setSubjects(arr);
      } catch {}
    }
  };

  /* -------- generic handler for non-numeric fields -------- */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  /* -------- Handle max marks change with auto weight assignment -------- */
  const handleMaxMarksChange = (e) => {
    const selectedMaxMarks = e.target.value;
    const selectedOption = MAX_MARKS_OPTIONS.find(option => option.value === selectedMaxMarks);
    setForm((f) => ({
      ...f,
      exammaxmarks: selectedMaxMarks,
      examwtpercentge: selectedOption ? selectedOption.weight : ""
    }));
  };

  /* -------- submit with validation -------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = {
      ...form,
      exammaxmarks: form.exammaxmarks ? Number(form.exammaxmarks) : null,
      examwtpercentge: form.examwtpercentge ? Number(form.examwtpercentge) : null,
    };

    if (formData.exammaxmarks && (Number.isNaN(formData.exammaxmarks) || formData.exammaxmarks <= 0)) {
      console.error("Max Marks must be a positive number!");
      return;
    }
    if (formData.examwtpercentge && (Number.isNaN(formData.examwtpercentge) || formData.examwtpercentge < 0 || formData.examwtpercentge > 100)) {
      console.error("Weight (%) must be between 0 and 100!");
      return;
    }

    try {
      if (editing) {
        await axios.put(`${ROUTES.MANAGER}/${encodeURIComponent(form.examid)}`, formData);
        console.log("Routine updated successfully");
      } else {
        await axios.post(ROUTES.MANAGER, formData);
        console.log("Routine created successfully");
      }
      await fetchRoutines();
      setForm({ ...emptyForm });
      setEditing(false);
      setModalOpen(false);
    } catch (err) {
      console.error("Failed to save routine:", err);
    }
  };

  const handleEdit = (routine) => {
    setForm({
      ...routine,
      examofferid: routine.examofferid ? String(routine.examofferid) : "",
      examtermid: routine.examtermid ? String(routine.examtermid) : "",
      examroomid: routine.examroomid ? String(routine.examroomid) : "",
      examcondby: routine.examcondby ? String(routine.examcondby) : "",
      sem: routine.sem || "",
      section: routine.section || "",
      program: routine.program || "",
      exammaxmarks: (routine.exammaxmarks != null && routine.exammaxmarks !== "") ? String(routine.exammaxmarks) : "",
      examwtpercentge: (routine.examwtpercentge != null && routine.examwtpercentge !== "") ? String(routine.examwtpercentge) : "",
    });
    setEditing(true);
    setModalOpen(true);
  };

  async function deleteRoutineAPI(examid) {
    const id = encodeURIComponent(examid);
    try {
      return await axios.delete(`${ROUTES.MANAGER}/${id}`);
    } catch (e1) {
      try {
        return await axios.delete(`${ROUTES.MANAGER}/delete/${id}`);
      } catch (e2) {
        try {
          return await axios.delete(`${ROUTES.MANAGER}`, {
            data: { examid },
            headers: { "Content-Type": "application/json" },
          });
        } catch (e3) {
          try {
            return await axios.post(`${ROUTES.MANAGER}/delete`, { examid });
          } catch (e4) {
            throw e4;
          }
        }
      }
    }
  }

  const handleDelete = async (examid) => {
    try {
      await deleteRoutineAPI(examid);
      await fetchRoutines();
      console.log("Routine deleted successfully");
    } catch (err) {
      console.error("Delete failed:", err?.response?.data || err?.message || err);
    }
  };

  /* ---------------- Time options ---------------- */
  const generateTimeOptions = useCallback(() => {
    const options = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 48; i++) {
      const hours = String(start.getHours()).padStart(2, "0");
      const minutes = String(start.getMinutes()).padStart(2, "0");
      options.push(`${hours}:${minutes}`);
      start.setMinutes(start.getMinutes() + 30);
    }
    return options;
  }, []);

  /* ---------------- Exam ID ---------------- */
  const generateExamId = useCallback(() => {
    const examCount = routines.length + 1;
    return `EXAM_ID_${examCount.toString().padStart(3, "0")}`;
  }, [routines.length]);

  const handleOpenNewModal = () => {
    setEditing(false);
    const newForm = { ...emptyForm, examid: generateExamId() };
    setForm(newForm);
    setModalOpen(true);
  };

  /* ---------------- Maps ---------------- */
  const offeringById = useMemo(() => {
    const map = new Map();
    offerings.forEach((o) => map.set(String(o.offerid), o));
    return map;
  }, [offerings]);

  const subjectById = useMemo(() => {
    const map = new Map();
    (subjects || []).forEach((s) => {
      const id = String(s.subjectid ?? s.id ?? s.subject_code ?? "");
      if (!id) return;
      map.set(id, {
        name: s.subjectname || s.subjectdesc || s.subject_title || s.subject_code || "",
        code: s.subject_code || "",
      });
    });
    return map;
  }, [subjects]);

  const programNameById = useMemo(() => {
    const map = new Map();
    offerings.forEach((o) => {
      if (o.programId) {
        map.set(String(o.programId), o.programName || String(o.programId));
      }
    });
    return map;
  }, [offerings]);

  const roomLabelById = useMemo(() => {
    const map = new Map();
    rooms.forEach((r) => {
      const id = r.classroomid ?? r.roomid ?? r.id;
      const label = r.room_no ?? r.roomno ?? r.classroomname ?? id;
      if (id) map.set(String(id), String(label));
    });
    return map;
  }, [rooms]);

  const teacherLabelById = useMemo(() => {
    const map = new Map();
    teachers.forEach((t) => {
      const id = t.teacherid ?? t.id;
      const nm = t.teachername ?? t.name ?? id;
      if (id) map.set(String(id), String(nm));
    });
    return map;
  }, [teachers]);

  const termLabelById = useMemo(() => {
    const map = new Map();
    terms.forEach((term) => {
      const id = term.id ?? term.acadyearid ?? term.acadyearname ?? term.termid;
      const label = term.termname ?? term.acadyear ?? term.acadyearname ?? id;
      if (id) map.set(String(id), String(label));
    });
    return map;
  }, [terms]);

  /* ---------------- AY match helper (fallback) ---------------- */
  function findTermIdForAcademicYear(ayString) {
    const q = normalizeAyString(ayString);
    if (!q) return "";
    for (const [id, label] of termLabelById.entries()) {
      const norm = normalizeAyString(label);
      if (norm && (norm === q || norm.includes(q) || q.includes(norm))) {
        return String(id);
      }
    }
    return "";
  }

  /* ---------------- React to offering change ---------------- */
  useEffect(() => {
    const id = String(form.examofferid || "");
    if (!id) return;
    const node = offeringById.get(id);
    if (!node) return;

    const off = node._raw || {};

    const rawSemNo =
      node.sem ||
      off.offer_semesterno ||
      off.offer_semester ||
      off.semester_no ||
      off.semester ||
      off.sem ||
      "";

    const rawSection = node.section || off.offer_section || off.section || off.sec || "";

    const rawFaculty =
      node.facultyId ||
      off.offer_facultyid ||
      off.facultyid ||
      off.faculty_id ||
      off.teacherid ||
      off.teacher_id ||
      "";

    const rawTerm =
      node.termId ||
      off.offfer_term ||
      off.offer_term ||
      off.offer_termid ||
      off.termid ||
      off.term_id ||
      "";

    const ay = node.acadYear || off.academicyear || off.academic_year || off.acadyear || "";

    const programName =
      node.programName ||
      off.programname ||
      off.program_name ||
      off.programtitle ||
      off.program_title ||
      getDeep(off, "program.name") ||
      getDeep(off, "program.title") ||
      "";

    const programId =
      node.programId ||
      off.offer_programid ||
      off.programid ||
      off.program_id ||
      getDeep(off, "program.id") ||
      "";

    setForm((prev) => ({
      ...prev,
      sem: String(rawSemNo || prev.sem || ""),
      section: String(rawSection || prev.section || ""),
      program: String(programName || programId || prev.program || ""),
      examcondby: String(rawFaculty || prev.examcondby || ""),
      examtermid: String(rawTerm || "") || prev.examtermid || findTermIdForAcademicYear(ay),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.examofferid, offeringById]);

  /* ---------------- Small UI helpers ---------------- */
  const Labeled = ({ label, children, style }) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );

  const InfoBox = ({ title, value }) => (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "8px 10px",
        background: "#f8fafc",
      }}
    >
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>{value || "—"}</div>
    </div>
  );

  /* ---------------- Table schema ---------------- */
  const columns = [
    { key: "examid", label: "Exam ID" },
    { key: "examofferid", label: "Offering" },
    { key: "examtermid", label: "Term (Academic Year)" },
    { key: "sem", label: "Semester" },
    { key: "section", label: "Section" },
    { key: "program", label: "Program" },
    { key: "examtype", label: "Type" },
    { key: "examtitle", label: "Title" },
    { key: "examdate", label: "Date" },
    { key: "examst_time", label: "Start Time" },
    { key: "examen_time", label: "End Time" },
    { key: "examroomid", label: "Room" },
    { key: "exammaxmarks", label: "Max Marks" },
    { key: "examcondby", label: "Conducted By" },
  ];

  const inputStyle = {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    background: "white",
  };

  /* ---------------- Render ---------------- */
  return (
    <div
      style={{
        padding: "30px",
        backgroundColor: "#eef2ff",
        minHeight: "100vh",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: "24px", fontWeight: "bold", color: "#1e40af", margin: 0 }}>
          Exam Routine
        </h2>
        <button
          onClick={handleOpenNewModal}
          style={{
            padding: "10px 16px",
            backgroundColor: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          }}
        >
          + Add New Exam Routine
        </button>
      </div>

      {/* List */}
      <div
        style={{
          overflowX: "auto",
          backgroundColor: "#fff",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ backgroundColor: "#e0e7ff" }}>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    padding: "10px",
                    border: "1px solid #e5e7eb",
                    fontSize: "13px",
                    textAlign: "left",
                  }}
                >
                  {c.label}
                </th>
              ))}
              <th
                style={{
                  padding: "10px",
                  border: "1px solid #e5e7eb",
                  fontSize: "13px",
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {routines.map((routine, idx) => {
              const offNode = offeringById.get(String(routine.examofferid));
              const prettyOffer = offNode ? labelFromOffering(offNode, subjectById) : routine.examofferid;
              const prettyTerm = termLabelById.get(String(routine.examtermid)) || routine.examtermid;
              const prettyRoom = roomLabelById.get(String(routine.examroomid)) || routine.examroomid;
              const prettyTeacher =
                teacherLabelById.get(String(routine.examcondby)) || routine.examcondby;

              const programPretty =
                (routine.program &&
                  (programNameById.get(String(routine.program)) || String(routine.program))) ||
                offNode?.programName ||
                (offNode?.programId ? String(offNode.programId) : "");

              const values = {
                examid: routine.examid,
                examofferid: prettyOffer,
                examtermid: prettyTerm,
                sem: routine.sem || offNode?.sem || "",
                section: routine.section || offNode?.section || "",
                program: programPretty,
                examtype: routine.examtype,
                examtitle: routine.examtitle,
                examdate: routine.examdate,
                examst_time: routine.examst_time,
                examen_time: routine.examen_time,
                examroomid: prettyRoom,
                exammaxmarks: routine.exammaxmarks,
                examcondby: prettyTeacher,
              };

              return (
                <tr
                  key={routine.examid}
                  style={{ backgroundColor: idx % 2 === 0 ? "#f9fafb" : "#ffffff" }}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        padding: "10px",
                        border: "1px solid #e5e7eb",
                        fontSize: "13px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {String(values[c.key] ?? "")}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "10px",
                      border: "1px solid #e5e7eb",
                      display: "flex",
                      gap: "6px",
                    }}
                  >
                    <button
                      onClick={() => handleEdit(routine)}
                      style={{
                        backgroundColor: "#facc15",
                        color: "#000",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(routine.examid)}
                      style={{
                        backgroundColor: "#ef4444",
                        color: "#fff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {!routines.length && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{ padding: 16, textAlign: "center", color: "#6b7280" }}
                >
                  No exam routines yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal
        open={modalOpen}
        title={editing ? "Update Exam Routine" : "Add Exam Routine"}
        onClose={() => setModalOpen(false)}
        width={1100}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          <Labeled label="Exam ID">
            <input
              name="examid"
              value={form.examid}
              onChange={handleChange}
              placeholder="Exam ID"
              style={inputStyle}
              required
              disabled
            />
          </Labeled>

          <Labeled label="Course Offering">
            <select
              name="examofferid"
              value={form.examofferid}
              onChange={handleChange}
              style={inputStyle}
              required
            >
              <option value="" disabled>
                Select Course Offering
              </option>
              {offerings.map((off) => (
                <option key={off.offerid} value={off.offerid}>
                  {labelFromOffering(off, subjectById)}
                </option>
              ))}
            </select>
          </Labeled>

          <Labeled label="Term (Academic Year)">
            <input
              value={termLabelById.get(String(form.examtermid)) || ""}
              style={inputStyle}
              placeholder="Auto-filled from Course Offering"
              disabled
              readOnly
            />
            <input type="hidden" name="examtermid" value={form.examtermid} />
          </Labeled>

          {/* Auto-filled info from offering (display-only) */}
          <div style={{ gridColumn: "span 3" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              <InfoBox title="Semester" value={form.sem} />
              <InfoBox title="Section" value={form.section} />
              
            </div>
          </div>

          <Labeled label="Exam Type">
            <select
              name="examtype"
              value={form.examtype}
              onChange={handleChange}
              style={inputStyle}
              required
            >
              <option value="" disabled>
                Select Type
              </option>
              <option value="Online">Online</option>
              <option value="Offline">Offline</option>
            </select>
          </Labeled>

          <Labeled label="Exam Title">
            <select
              name="examtitle"
              value={form.examtitle}
              onChange={handleChange}
              style={inputStyle}
              required
            >
              <option value="" disabled>
                Select Title
              </option>
              <option value="ca1">CA1</option>
              <option value="ca2">CA2</option>
              <option value="ca3">CA3</option>
              <option value="ca4">CA4</option>
              <option value="pca1">PCA1</option>
              <option value="pca2">PCA2</option>
            </select>
          </Labeled>

          <Labeled label="Exam Date">
            <input
              name="examdate"
              value={form.examdate}
              type="date"
              onChange={handleChange}
              style={inputStyle}
            />
          </Labeled>

          <Labeled label="Start Time">
            <select
              name="examst_time"
              value={form.examst_time}
              onChange={handleChange}
              style={inputStyle}
              required
            >
              <option value="" disabled>
                Start Time
              </option>
              {generateTimeOptions().map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Labeled>

          <Labeled label="End Time">
            <select
              name="examen_time"
              value={form.examen_time}
              onChange={handleChange}
              style={inputStyle}
              required
            >
              <option value="" disabled>
                End Time
              </option>
              {generateTimeOptions().map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Labeled>

          <Labeled label="Room (Routine)">
            <select
              name="examroomid"
              value={form.examroomid}
              onChange={handleChange}
              style={inputStyle}
              required
            >
              <option value="" disabled>
                Select Room
              </option>
              {rooms.map((room) => {
                const id = room.classroomid ?? room.roomid ?? room.id;
                const label = room.room_no ?? room.roomno ?? room.classroomname ?? id;
                if (!id) return null;
                return (
                  <option key={String(id)} value={String(id)}>
                    {String(label)}
                  </option>
                );
              })}
            </select>
          </Labeled>

          <Labeled label="Max Marks">
            <select
              name="exammaxmarks"
              value={form.exammaxmarks}
              onChange={handleMaxMarksChange}
              style={inputStyle}
              required
            >
              <option value="" disabled>
                Select Max Marks
              </option>
              {MAX_MARKS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} Marks 
                </option>
              ))}
            </select>
            <input type="hidden" name="examwtpercentge" value={form.examwtpercentge} />
          </Labeled>

          <Labeled label="Conducted By (Teacher)">
            <select
              name="examcondby"
              value={form.examcondby}
              onChange={handleChange}
              style={inputStyle}
              required
            >
              <option value="" disabled>
                Select Teacher
              </option>
              {teachers.map((t) => {
                const id = t.teacherid ?? t.id;
                const nm = t.teachername ?? t.name ?? id;
                if (!id) return null;
                return (
                  <option key={String(id)} value={String(id)}>
                    {String(nm)}
                  </option>
                );
              })}
            </select>
          </Labeled>

          <input type="hidden" name="examremarks" value={form.examremarks} />

          <div
            style={{
              gridColumn: "span 3",
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              style={{
                padding: "10px 16px",
                backgroundColor: "#e5e7eb",
                color: "#111827",
                fontWeight: 700,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "10px 20px",
                backgroundColor: "#2563eb",
                color: "white",
                fontWeight: "bold",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
              }}
            >
              {editing ? "Update" : "Add"} Routine
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ExamRoutineManager;