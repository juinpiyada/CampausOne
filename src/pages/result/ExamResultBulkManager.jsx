// SMS-ui/src/pages/result/ExamResultBulkManager.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config";

const API_BASE =
  (config.EXAM_RESULT_ROUTE && String(config.EXAM_RESULT_ROUTE).trim())
    ? config.EXAM_RESULT_ROUTE
    : "/api/exam-result"; // fallback

// child routes available in your merged API file
const ROUTINES_URL = `${API_BASE}/exam-routine-manager`;
const STUDENTS_LIST_URL = `${API_BASE}/students/list`;

// ---- Columns in DB (order matters for CSV template) ----
const COLS = [
  "examresultid",
  "examresult_examid",
  "examstudentid",
  "exammarksobtained",
  "examgrade",
  "examremarks",
  "createdat",
  "updatedat",
  "examstudent_rollno",
  "examstudent_name",
  "examstudent_sem",
  "examtitle",
  "examstudent_program_id",
];

const defaultForm = {
  examresultid: "",
  examresult_examid: "",
  examstudentid: "",
  exammarksobtained: "",
  examgrade: "",
  examremarks: "",
  createdat: "",
  updatedat: "",
  examstudent_rollno: "",
  examstudent_name: "",
  examstudent_sem: "",
  examtitle: "", // CA1/CA2/CA3/CA4/PCA1/PCA2
  examstudent_program_id: "",
  // UI-only (not sent): show these when picking exam
  _exam_section: "",
};

const joinUrl = (base = "", path = "") => {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = String(base).replace(/\/+$/, "");
  const p = String(path).replace(/^\/+/, "");
  return `${b}/${p}`;
};

function Spinner({ className = "" }) {
  return (
    <svg className={`animate-spin h-5 w-5 ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a 8 8 0 0 1 8-8v4A4 4 0 0 0 8 12H4z" />
    </svg>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">{children}</th>;
}
function Td({ children, mono = false }) {
  return <td className={`px-3 py-2 text-sm ${mono ? "font-mono" : ""} text-gray-800`}>{children ?? <span className="text-gray-400">—</span>}</td>;
}
function Field({ label, name, value, onChange, required = false, placeholder = "", disabled = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label} {required && <span className="text-rose-600">*</span>}</label>
      <input name={name} value={value ?? ""} onChange={onChange} placeholder={placeholder} disabled={disabled}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
    </div>
  );
}
function Select({ label, name, value, onChange, options = [], required = false, disabled = false, placeholder = "— Select —" }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label} {required && <span className="text-rose-600">*</span>}</label>
      <select name={name} value={value ?? ""} onChange={onChange} disabled={disabled}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function ExamResultBulkManager() {
  // list state
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });

  // CSV state
  const [csvFile, setCsvFile] = useState(null);
  const [csvMode, setCsvMode] = useState("bulk"); // "bulk" | "bulk-upsert"
  const [csvBusy, setCsvBusy] = useState(false);

  // reference data
  const [routines, setRoutines] = useState([]); // from /exam-routine-manager
  const [students, setStudents] = useState([]); // from /students/list

  // toast
  const [toast, setToast] = useState({ show: false, type: "success", text: "" });
  const showToast = (text, type = "success") => {
    setToast({ show: true, type, text });
    setTimeout(() => setToast({ show: false, type, text: "" }), 3000);
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const url = joinUrl(API_BASE, "");
      const res = await axios.get(url, { params: { q: q || undefined, limit, offset } });
      setRows(res.data?.rows || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error("fetchList error", err);
      showToast("Failed to load results.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchRoutines = async () => {
    try {
      const res = await axios.get(ROUTINES_URL);
      const arr = Array.isArray(res.data) ? res.data : res.data?.routines || [];
      setRoutines(Array.isArray(arr) ? arr : []);
    } catch (e) {
      console.error("Failed to fetch exam routines", e);
      setRoutines([]);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await axios.get(STUDENTS_LIST_URL);
      const arr = Array.isArray(res.data) ? res.data : res.data?.students || [];
      setStudents(Array.isArray(arr) ? arr : []);
    } catch (e) {
      console.error("Failed to fetch students", e);
      setStudents([]);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, limit, offset]);

  useEffect(() => {
    fetchRoutines();
    fetchStudents();
  }, []);

  // maps for quick lookup
  const routineById = useMemo(() => {
    const m = new Map();
    routines.forEach(r => r?.examid && m.set(String(r.examid), r));
    return m;
  }, [routines]);
  const studentById = useMemo(() => {
    const m = new Map();
    students.forEach(s => s?.stuid && m.set(String(s.stuid), s));
    return m;
  }, [students]);

  const openAdd = () => {
    setIsEdit(false);
    setForm({ ...defaultForm });
    setShowModal(true);
  };

  const openEdit = (row) => {
    setIsEdit(true);
    const filled = { ...defaultForm };
    Object.keys(filled).forEach((k) => { filled[k] = row[k] ?? ""; });
    filled.examresultid = row.examresultid || "";
    // try to hydrate UI-only section if we find routine
    const rt = routineById.get(String(row.examresult_examid || ""));
    if (rt) filled._exam_section = rt.section || "";
    setForm(filled);
    setShowModal(true);
  };

  // When Exam ID changes -> autofill title, sem, section, program
  const applyRoutineToForm = (examid) => {
    const r = routineById.get(String(examid || ""));
    if (!r) return;
    setForm((f) => ({
      ...f,
      examresult_examid: String(examid || ""),
      examtitle: r.examtitle || f.examtitle || "",
      examstudent_sem: r.sem || f.examstudent_sem || "",
      _exam_section: r.section || f._exam_section || "",
      examstudent_program_id: r.program || f.examstudent_program_id || "",
    }));
  };

  // When Student ID changes -> autofill name & roll (and fallbacks for sem/program if missing)
  const applyStudentToForm = (stuid) => {
    const s = studentById.get(String(stuid || ""));
    if (!s) return;
    setForm((f) => ({
      ...f,
      examstudentid: String(stuid || ""),
      examstudent_name: s.stuname || f.examstudent_name || "",
      examstudent_rollno: s.stu_rollnumber || f.examstudent_rollno || "",
      // if not filled from routine, gently fill from student master
      examstudent_sem: f.examstudent_sem || s.stu_curr_semester || "",
      examstudent_program_id: f.examstudent_program_id || s.stu_course_id || "",
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    // intercept selects that should hydrate the rest
    if (name === "examresult_examid") {
      applyRoutineToForm(value);
      return;
    }
    if (name === "examstudentid") {
      applyStudentToForm(value);
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.examresultid || !form.examresult_examid || !form.examstudentid) {
      showToast("examresultid, examresult_examid, examstudentid are required.", "error");
      return;
    }
    try {
      if (isEdit) {
        const url = joinUrl(API_BASE, form.examresultid);
        const { examresultid, _exam_section, ...rest } = form; // UI-only field stripped
        await axios.put(url, rest);
        showToast("Exam result updated.");
      } else {
        const body = {};
        COLS.forEach((c) => (body[c] = form[c] ?? ""));
        const url = joinUrl(API_BASE, "");
        await axios.post(url, body);
        showToast("Exam result created.");
      }
      setShowModal(false);
      fetchList();
    } catch (err) {
      console.error("save error", err);
      const msg = err?.response?.data?.error || (isEdit ? "Failed to update result." : "Failed to create result.");
      showToast(msg, "error");
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete result ${row.examresultid}?`)) return;
    try {
      const url = joinUrl(API_BASE, row.examresultid);
      await axios.delete(url);
      showToast("Exam result deleted.");
      if (rows.length === 1 && offset > 0) setOffset(Math.max(0, offset - limit));
      else fetchList();
    } catch (err) {
      console.error("delete error", err);
      showToast("Failed to delete result.", "error");
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return showToast("Please choose a CSV file.", "error");
    setCsvBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const path = csvMode === "bulk-upsert" ? "/bulk-upsert" : "/bulk";
      const url = joinUrl(API_BASE, path);
      await axios.post(url, formData, { headers: { "Content-Type": "multipart/form-data" } });
      showToast("CSV processed successfully.");
      fetchList();
    } catch (err) {
      console.error("csv error", err);
      const msg = err?.response?.data?.error || "CSV upload failed.";
      showToast(msg, "error");
    } finally {
      setCsvBusy(false);
    }
  };

  const downloadTemplate = () => {
    const header = COLS.join(",");
    const sampleRow = [
      "EXRES_001",        // examresultid
      "EXAM_ID_005",     // examresult_examid
      "STU_ID_001",      // examstudentid
      "",           // exammarksobtained
      "",               // examgrade
      "",            // examremarks
      "", // createdat
      "", // updatedat
      "",         // examstudent_rollno
      "",     // examstudent_name
      "",               // examstudent_sem
      "",             // examtitle (CA1/CA2/CA3/CA4/PCA1/PCA2)
      "",       // examstudent_program_id
    ].join(",");
    const csv = [header, sampleRow].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "college_exam_result_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // pagination
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const nextPage = () => { if (offset + limit < total) setOffset(offset + limit); };
  const prevPage = () => { if (offset - limit >= 0) setOffset(offset - limit); };

  // dropdown option builders
  const examOptions = useMemo(() => {
    return routines.map(r => ({
      value: String(r.examid),
      label: [
        r.examid,
        r.examtitle ? `• ${String(r.examtitle).toUpperCase()}` : null,
        r.sem ? `(Sem ${r.sem}${r.section ? ` | Sec ${r.section}` : ""}${r.program ? ` | ${r.program}` : ""})` : null
      ].filter(Boolean).join(" ")
    }));
  }, [routines]);

  const studentOptions = useMemo(() => {
    return students.map(s => ({
      value: String(s.stuid),
      label: [
        s.stuid,
        s.stuname ? `• ${s.stuname}` : null,
        s.stu_rollnumber ? `(Roll ${s.stu_rollnumber})` : null
      ].filter(Boolean).join(" ")
    }));
  }, [students]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">
            Exam Results — Bulk Upload
          </h1>
          <button onClick={openAdd}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2">
            Add Result
          </button>
        </div>
      </div>

      {/* CSV Card */}
      <div className="max-w-7xl mx-auto mt-6">
        <div className="bg-white rounded-2xl shadow p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Bulk Import</h2>
              <p className="text-sm text-gray-500">
                Upload CSV with all required headers. Choose <b>Insert</b> or <b>Upsert</b>.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
              <select
                value={csvMode}
                onChange={(e) => setCsvMode(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="bulk">Insert (skip duplicates)</option>
                <option value="bulk-upsert">Upsert (insert or update)</option>
              </select>
            </div>

            <div className="col-span-1 flex items-end">
              <div className="flex w-full md:w-auto gap-2">
                <button
                  onClick={handleCsvUpload}
                  disabled={csvBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 w-full md:w-auto disabled:opacity-60"
                >
                  {csvBusy ? <Spinner /> : null}
                  {csvBusy ? "Uploading..." : "Upload CSV"}
                </button>
                <button
                  onClick={downloadTemplate}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Download Template
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search & list */}
      <div className="max-w-7xl mx-auto mt-6">
        <div className="bg-white rounded-2xl shadow p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-96">
                <input
                  value={q}
                  onChange={(e) => { setOffset(0); setQ(e.target.value); }}
                  placeholder="Search by Result ID / Exam ID / Student ID / Title"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="material-icons-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">search</span>
              </div>
              <select
                value={limit}
                onChange={(e) => { setOffset(0); setLimit(Number(e.target.value)); }}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[10, 20, 50, 100].map((n) => (<option key={n} value={n}>{n} / page</option>))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={prevPage} disabled={offset === 0 || loading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">Prev</button>
              <span className="text-sm text-gray-700">Page <b>{Math.floor(offset / limit) + 1}</b> / {Math.max(1, Math.ceil(total / limit))}</span>
              <button onClick={nextPage} disabled={offset + limit >= total || loading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">Next</button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Result ID</Th>
                  <Th>Exam ID</Th>
                  <Th>Student ID</Th>
                  <Th>Title</Th>
                  <Th>Marks</Th>
                  <Th>Grade</Th>
                  <Th>Roll No</Th>
                  <Th>Name</Th>
                  <Th>Sem</Th>
                  <Th>Program</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loading ? (
                  <tr><td colSpan={11} className="py-10 text-center text-gray-500"><div className="inline-flex items-center gap-2"><Spinner /> Loading…</div></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={11} className="py-10 text-center text-gray-500">No results found.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.examresultid}>
                      <Td mono>{r.examresultid}</Td>
                      <Td mono>{r.examresult_examid}</Td>
                      <Td mono>{r.examstudentid}</Td>
                      <Td>{r.examtitle}</Td>
                      <Td>{r.exammarksobtained}</Td>
                      <Td>{r.examgrade}</Td>
                      <Td>{r.examstudent_rollno}</Td>
                      <Td>{r.examstudent_name}</Td>
                      <Td>{r.examstudent_sem}</Td>
                      <Td>{r.examstudent_program_id}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(r)}
                            className="rounded-lg border px-2 py-1 hover:bg-indigo-50 text-indigo-600 border-indigo-200" title="Edit">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(r)}
                            className="rounded-lg border px-2 py-1 hover:bg-rose-50 text-rose-600 border-rose-200" title="Delete">
                            Delete
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <div>Total: {total}</div>
            <div>Showing {rows.length} of {total}</div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">{isEdit ? "Edit Result" : "Add Result"}</h3>
              <button className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1) RESULT ID (as-is) */}
                <Field label="Result ID*" name="examresultid" value={form.examresultid} onChange={handleChange} required disabled={isEdit} />

                {/* 2) EXAM ID (from ExamRoutineManager) */}
                <Select
                  label="Exam ID*"
                  name="examresult_examid"
                  value={form.examresult_examid}
                  onChange={handleChange}
                  required
                  options={examOptions}
                />

                {/* 3) STUDENT ID (from MasterStudent) */}
                <Select
                  label="Student ID*"
                  name="examstudentid"
                  value={form.examstudentid}
                  onChange={handleChange}
                  required
                  options={studentOptions}
                />

                {/* Auto-filled from student */}
                <Field label="Student Name" name="examstudent_name" value={form.examstudent_name} onChange={handleChange} disabled />
                <Field label="Student Roll No" name="examstudent_rollno" value={form.examstudent_rollno} onChange={handleChange} disabled />

                {/* Auto-filled from routine (with fallback from student for sem/program) */}
                <Field label="Semester" name="examstudent_sem" value={form.examstudent_sem} onChange={handleChange} disabled />
                <Field label="Section (from Routine)" name="_exam_section" value={form._exam_section} onChange={handleChange} disabled />
                <Field label="Program (ID/Name)" name="examstudent_program_id" value={form.examstudent_program_id} onChange={handleChange} disabled />

                {/* Title comes from routine (CA1/CA2/…); still allow manual change if needed */}
                <Select
                  label="Exam Title"
                  name="examtitle"
                  value={form.examtitle}
                  onChange={handleChange}
                  options={[
                    { label: "CA1", value: "CA1" },
                    { label: "CA2", value: "CA2" },
                    { label: "CA3", value: "CA3" },
                    { label: "CA4", value: "CA4" },
                    { label: "PCA1", value: "PCA1" },
                    { label: "PCA2", value: "PCA2" },
                  ]}
                  placeholder="— From Routine —"
                />

                {/* Other editable result fields */}
                <Field label="Marks" name="exammarksobtained" value={form.exammarksobtained} onChange={handleChange} placeholder="88.50" />
                <Field label="Grade" name="examgrade" value={form.examgrade} onChange={handleChange} placeholder="A" />
                <Field label="Remarks" name="examremarks" value={form.examremarks} onChange={handleChange} />
                <Field label="Created At (YYYY-MM-DD HH:MM:SS)" name="createdat" value={form.createdat} onChange={handleChange} />
                <Field label="Updated At (YYYY-MM-DD HH:MM:SS)" name="updatedat" value={form.updatedat} onChange={handleChange} />
              </div>
            </div>

            <div className="px-5 py-4 border-t flex items-center justify-end gap-3">
              <button className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2" onClick={handleSave}>
                {isEdit ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={`rounded-xl px-4 py-3 shadow text-sm text-white ${toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"}`}>
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
