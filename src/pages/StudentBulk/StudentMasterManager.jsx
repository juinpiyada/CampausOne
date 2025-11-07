// SMS-ui/src/pages/Student/StudentMasterManager.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config";

const API_BASE =
  config.STUDENT_UP_ROUTE && String(config.STUDENT_UP_ROUTE).trim()
    ? config.STUDENT_UP_ROUTE
    : config.STUDENT_ROUTE; // fallback to legacy route

// ---- Columns in DB (order matters for CSV template) ----
const COLS = [
  "stuid",
  "stu_enrollmentnumber",
  "stu_rollnumber",
  "stu_regn_number",
  "stuname",
  "stuemailid",
  "stumob1",
  "stumob2",
  "stucaste",
  "stugender",
  "studob",
  "stucategory",
  "stuadmissiondt",
  "stu_course_id",
  "stu_lat_entry",
  "stu_curr_semester",
  "stu_section",
  "stuvalid",
  "stuuserid",
  "stuparentname",
  "stuaddress",
  "stuparentemailid",
  "stuprentmob1",
  "stuprentmob2",
  "stuparentaddress",
  "stu_inst_id",
  "createdat",
  "updatedat",
];

// Minimal defaults for creating/updating one student.
const defaultForm = {
  stuid: "",
  stuname: "",
  stuemailid: "",
  stumob1: "",
  stugender: "",
  studob: "",
  stu_curr_semester: "",
  stu_section: "",
  stu_inst_id: "",
  // optional / advanced
  stu_enrollmentnumber: "",
  stu_rollnumber: "",
  stu_regn_number: "",
  stumob2: "",
  stucaste: "",
  stucategory: "",
  stuadmissiondt: "",
  stu_course_id: "",
  stu_lat_entry: "",
  stuvalid: "",
  stuuserid: "",
  stuparentname: "",
  stuaddress: "",
  stuparentemailid: "",
  stuprentmob1: "",
  stuprentmob2: "",
  stuparentaddress: "",
  createdat: "",
  updatedat: "",
};

function Join({ base = "", path = "" }) { return null; }

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

export default function StudentMasterManager() {
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // CSV state
  const [csvFile, setCsvFile] = useState(null);
  const [csvMode, setCsvMode] = useState("bulk"); // "bulk" or "bulk-upsert"
  const [csvBusy, setCsvBusy] = useState(false);

  // notifications
  const [toast, setToast] = useState({ show: false, type: "success", text: "" });
  const showToast = (text, type = "success") => {
    setToast({ show: true, type, text });
    setTimeout(() => setToast({ show: false, type, text: "" }), 3000);
  };

  // fetch list
  const fetchList = async () => {
    setLoading(true);
    try {
      const url = joinUrl(API_BASE, "");
      const res = await axios.get(url, {
        params: { q: q || undefined, limit, offset },
      });
      setRows(res.data?.rows || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error("fetchList error", err);
      showToast("Failed to load students.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, limit, offset]);

  // CRUD handlers
  const openAdd = () => {
    setIsEdit(false);
    setForm({ ...defaultForm });
    setShowAdvanced(false);
    setShowModal(true);
  };

  const openEdit = (row) => {
    setIsEdit(true);
    const filled = { ...defaultForm };
    Object.keys(filled).forEach((k) => { filled[k] = row[k] ?? ""; });
    filled.stuid = row.stuid || "";
    setForm(filled);
    setShowAdvanced(false);
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.stuid || !form.stuname) {
      showToast("stuid and stuname are required.", "error");
      return;
    }
    try {
      if (isEdit) {
        const url = joinUrl(API_BASE, form.stuid);
        const { stuid, ...rest } = form;
        await axios.put(url, rest);
        showToast("Student updated.");
      } else {
        const body = {};
        COLS.forEach((c) => (body[c] = form[c] ?? ""));
        const url = joinUrl(API_BASE, "");
        await axios.post(url, body);
        showToast("Student created.");
      }
      setShowModal(false);
      fetchList();
    } catch (err) {
      console.error("save error", err);
      const msg = err?.response?.data?.error || (isEdit ? "Failed to update student." : "Failed to create student.");
      showToast(msg, "error");
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete student ${row.stuid}?`)) return;
    try {
      const url = joinUrl(API_BASE, row.stuid);
      await axios.delete(url);
      showToast("Student deleted.");
      if (rows.length === 1 && offset > 0) {
        setOffset(Math.max(0, offset - limit));
      } else {
        fetchList();
      }
    } catch (err) {
      console.error("delete error", err);
      showToast("Failed to delete student.", "error");
    }
  };

  // CSV handlers
  const handleCsvUpload = async () => {
    if (!csvFile) {
      showToast("Please choose a CSV file.", "error");
      return;
    }
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
    const sample = [COLS.map((c) => (c === "stuid" ? "STU_001" : ""))];
    const csv = [header, ...sample.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "student_master_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // pagination helpers
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const nextPage = () => { if (offset + limit < total) setOffset(offset + limit); };
  const prevPage = () => { if (offset - limit >= 0) setOffset(offset - limit); };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">
            Student Master
          </h1>
          {/* Removed "Add Student" button */}
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
            {/* old top-right Download Template button removed */}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CSV File
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mode
              </label>
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
                  {csvBusy ? <Spinner /> : <span className="material-icons-outlined text-base"></span>}
                  {csvBusy ? "Uploading..." : "Upload CSV"}
                </button>

                {/* Download Template beside Upload CSV */}
                <button
                  onClick={downloadTemplate}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Download Template
                </button>
              </div>
            </div>
          </div>

          {/* JSON message block removed */}
        </div>
      </div>

      {/* Search & list */}
      <div className="max-w-7xl mx-auto mt-6">
        <div className="bg-white rounded-2xl shadow p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-80">
                <input
                  value={q}
                  onChange={(e) => { setOffset(0); setQ(e.target.value); }}
                  placeholder="Search by ID / name / email / roll no."
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="material-icons-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  search
                </span>
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
              <button
                onClick={prevPage}
                disabled={offset === 0 || loading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-gray-700">
                Page <b>{page}</b> / {totalPages}
              </span>
              <button
                onClick={nextPage}
                disabled={offset + limit >= total || loading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>ID</Th>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Mobile</Th>
                  <Th>Gender</Th>
                  <Th>Semester</Th>
                  <Th>Section</Th>
                  <Th>Institute</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-gray-500">
                      <div className="inline-flex items-center gap-2"><Spinner /> Loading…</div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-gray-500">No students found.</td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.stuid}>
                      <Td mono>{r.stuid}</Td>
                      <Td>{r.stuname}</Td>
                      <Td>{r.stuemailid}</Td>
                      <Td>{r.stumob1}</Td>
                      <Td>{r.stugender}</Td>
                      <Td>{r.stu_curr_semester}</Td>
                      <Td>{r.stu_section}</Td>
                      <Td>{r.stu_inst_id}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(r)}
                            className="rounded-lg border px-2 py-1 hover:bg-indigo-50 text-indigo-600 border-indigo-200"
                            title="Edit"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(r)}
                            className="rounded-lg border px-2 py-1 hover:bg-rose-50 text-rose-600 border-rose-200"
                            title="Delete"
                          >
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
              <h3 className="text-lg font-semibold">{isEdit ? "Edit Student" : "Add Student"}</h3>
              <button className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-auto">
              {/* Core fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Student ID*" name="stuid" value={form.stuid} onChange={handleChange} required disabled={isEdit} />
                <Field label="Name*" name="stuname" value={form.stuname} onChange={handleChange} required />
                <Field label="Email" name="stuemailid" value={form.stuemailid} onChange={handleChange} />
                <Field label="Mobile" name="stumob1" value={form.stumob1} onChange={handleChange} />
                <Select label="Gender" name="stugender" value={form.stugender} onChange={handleChange}
                  options={[{ label: "— Select —", value: "" }, { label: "Male", value: "Male" }, { label: "Female", value: "Female" }, { label: "Other", value: "Other" }]} />
                <Field label="Date of Birth (YYYY-MM-DD)" name="studob" value={form.studob} onChange={handleChange} placeholder="1998-05-20" />
                <Field label="Current Semester" name="stu_curr_semester" value={form.stu_curr_semester} onChange={handleChange} />
                <Field label="Section" name="stu_section" value={form.stu_section} onChange={handleChange} />
                <Field label="Institute ID" name="stu_inst_id" value={form.stu_inst_id} onChange={handleChange} />
              </div>

              {/* Advanced  */}
              <div className="mt-2">
                <button onClick={() => setShowAdvanced((s) => !s)} className="text-sm text-indigo-600 hover:underline">
                  {showAdvanced ? "Hide" : "Show"} advanced fields
                </button>

                {showAdvanced && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {COLS.filter((c) => !["stuid","stuname","stuemailid","stumob1","stugender","studob","stu_curr_semester","stu_section","stu_inst_id"].includes(c))
                      .map((c) => (<Field key={c} label={c} name={c} value={form[c] ?? ""} onChange={handleChange} />))}
                  </div>
                )}
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

/* ---------- small presentational helpers ---------- */
function Th({ children }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">{children}</th>;
}
function Td({ children, mono = false }) {
  return <td className={`px-3 py-2 text-sm ${mono ? "font-mono" : ""} text-gray-800`}>{children || <span className="text-gray-400">—</span>}</td>;
}

function Field({ label, name, value, onChange, required = false, placeholder = "", disabled = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <input
        name={name}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
      />
    </div>
  );
}

function Select({ label, name, value, onChange, options = [] }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        name={name}
        value={value ?? ""}
        onChange={onChange}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
