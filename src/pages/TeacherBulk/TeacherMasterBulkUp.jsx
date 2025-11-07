// SMS-ui/src/pages/Teacher/TeacherMasterBulkUp.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config";

// Base URL (env must have VITE_TEACHER_BULK_UP_ROUTE)
const API_BASE =
  config.TEACHER_BULK_UP_ROUTE ||
  `${config.BASE_URL}${config.API_PREFIX}/teacher-master-bulk-up`;

// ---- Columns (order matters for CSV template) ----
const COLS = [
  "teacherid",
  "teacheruserid",
  "teachername",
  "teacheraddress",
  "teacheremailid",
  "teachermob1",
  "teachermob2",
  "teachergender",
  "teachercaste",
  "teacherdoj",
  "teacherdesig",
  "teachertype",
  "teachermaxweekhrs",
  "teachercollegeid",
  "teachervalid",
  "teacherparentname1",
  "teacherparentname2",
  "pancardno",
  "aadharno",
  "communication_address",
  "permanent_address",
  "teacherdob",
  "ismarried",
  "emergency_contact_name",
  "emergency_contact_address",
  "emergency_contact_phone",
  "createdat",
  "updatedat",
  "teacher_dept_id",
];

// handy defaults (show core first; rest under “Advanced”)
const defaultForm = {
  teacherid: "",
  teachername: "",
  teacheremailid: "",
  teachermob1: "",
  teachergender: "",
  teacherdesig: "",
  teachercollegeid: "",
  teacher_dept_id: "",
  // advanced
  teacheruserid: "",
  teacheraddress: "",
  teachermob2: "",
  teachercaste: "",
  teacherdoj: "",
  teachertype: "",
  teachermaxweekhrs: "",
  teachervalid: "",
  teacherparentname1: "",
  teacherparentname2: "",
  pancardno: "",
  aadharno: "",
  communication_address: "",
  permanent_address: "",
  teacherdob: "",
  ismarried: "",
  emergency_contact_name: "",
  emergency_contact_address: "",
  emergency_contact_phone: "",
  createdat: "",
  updatedat: "",
};

const joinUrl = (base = "", path = "") => {
  const b = String(base).replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return p ? `${b}/${p}` : b;
};

function Spinner({ className = "" }) {
  return (
    <svg className={`animate-spin h-5 w-5 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z" />
    </svg>
  );
}

export default function TeacherMasterBulkUp() {
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
  const [csvMode, setCsvMode] = useState("bulk"); // bulk | bulk-upsert
  const [csvBusy, setCsvBusy] = useState(false);

  // toast
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
      const res = await axios.get(url, { params: { q: q || undefined, limit, offset } });
      setRows(res.data?.rows || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      console.error(e);
      showToast("Failed to load teachers.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, limit, offset]);

  // CRUD helpers
  const openAdd = () => {
    setIsEdit(false);
    setForm({ ...defaultForm });
    setShowAdvanced(false);
    setShowModal(true);
  };

  const openEdit = (row) => {
    setIsEdit(true);
    const filled = { ...defaultForm };
    Object.keys(filled).forEach((k) => (filled[k] = row[k] ?? ""));
    filled.teacherid = row.teacherid || "";
    setForm(filled);
    setShowAdvanced(false);
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.teacherid || !form.teachername) {
      showToast("teacherid and teachername are required.", "error");
      return;
    }
    try {
      if (isEdit) {
        const url = joinUrl(API_BASE, form.teacherid);
        const { teacherid, ...rest } = form;
        await axios.put(url, rest);
        showToast("Teacher updated.");
      } else {
        const body = {};
        COLS.forEach((c) => (body[c] = form[c] ?? ""));
        const url = joinUrl(API_BASE, "");
        await axios.post(url, body);
        showToast("Teacher created.");
      }
      setShowModal(false);
      fetchList();
    } catch (e) {
      console.error(e);
      showToast(e?.response?.data?.error || "Save failed.", "error");
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete teacher ${row.teacherid}?`)) return;
    try {
      const url = joinUrl(API_BASE, row.teacherid);
      await axios.delete(url);
      showToast("Teacher deleted.");
      if (rows.length === 1 && offset > 0) setOffset(Math.max(0, offset - limit));
      else fetchList();
    } catch (e) {
      console.error(e);
      showToast("Delete failed.", "error");
    }
  };

  // CSV
  const handleCsvUpload = async () => {
    if (!csvFile) {
      showToast("Please choose a CSV file.", "error");
      return;
    }
    setCsvBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", csvFile);
      const path = csvMode === "bulk-upsert" ? "/bulk-upsert" : "/bulk";
      const url = joinUrl(API_BASE, path);
      await axios.post(url, fd, { headers: { "Content-Type": "multipart/form-data" } });
      showToast("CSV processed.");
      fetchList();
    } catch (e) {
      console.error(e);
      showToast(e?.response?.data?.error || "CSV upload failed.", "error");
    } finally {
      setCsvBusy(false);
    }
  };

  const downloadTemplate = () => {
    const header = COLS.join(",");
    const sample = [COLS.map((c) => (c === "teacherid" ? "TCHR_001" : ""))];
    const csv = [header, ...sample.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "master_teacher_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // pagination
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const nextPage = () => {
    if (offset + limit < total) setOffset(offset + limit);
  };
  const prevPage = () => {
    if (offset - limit >= 0) setOffset(offset - limit);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">
            Teacher Master 
          </h1>
          {/* Removed "Add Teacher" button as requested */}
        </div>
      </div>

      {/* CSV Card */}
      <div className="max-w-7xl mx-auto mt-6">
        <div className="bg-white rounded-2xl shadow p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Bulk Import</h2>
              <p className="text-sm text-gray-500">
                Upload CSV with headers exactly as required. Choose <b>Insert</b> or <b>Upsert</b>.
              </p>
            </div>
            {/* ⟵ Removed the old top-right Download Template button */}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
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
            <div>
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
            <div className="flex items-end">
              <div className="flex w-full md:w-auto gap-2">
                <button
                  onClick={handleCsvUpload}
                  disabled={csvBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 w-full md:w-auto disabled:opacity-60"
                >
                  {csvBusy ? (
                    <Spinner />
                  ) : (
                    <span className="material-icons-outlined text-base"></span>
                  )}
                  {csvBusy ? "Uploading..." : "Upload CSV"}
                </button>

                {/* ➕ New: Download Template beside Upload CSV */}
                <button
                  onClick={downloadTemplate}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Download Template
                </button>
              </div>
            </div>
          </div>

          {/* 🧹 Removed JSON message <pre> block entirely */}
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
                  onChange={(e) => {
                    setOffset(0);
                    setQ(e.target.value);
                  }}
                  placeholder="Search by ID / name / email / mobile"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="material-icons-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  search
                </span>
              </div>
              <select
                value={limit}
                onChange={(e) => {
                  setOffset(0);
                  setLimit(Number(e.target.value));
                }}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
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
                  <Th>Designation</Th>
                  <Th>College</Th>
                  <Th>Dept</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-gray-500">
                      <div className="inline-flex items-center gap-2">
                        <Spinner /> Loading…
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-gray-500">
                      No teachers found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.teacherid}>
                      <Td mono>{r.teacherid}</Td>
                      <Td>{r.teachername}</Td>
                      <Td>{r.teacheremailid}</Td>
                      <Td>{r.teachermob1}</Td>
                      <Td>{r.teachergender}</Td>
                      <Td>{r.teacherdesig}</Td>
                      <Td>{r.teachercollegeid}</Td>
                      <Td>{r.teacher_dept_id}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(r)}
                            className="rounded-lg border px-2 py-1 hover:bg-indigo-50 text-indigo-600 border-indigo-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(r)}
                            className="rounded-lg border px-2 py-1 hover:bg-rose-50 text-rose-600 border-rose-200"
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
              <h3 className="text-lg font-semibold">
                {isEdit ? "Edit Teacher" : "Add Teacher"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-auto">
              {/* Core */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Teacher ID*"
                  name="teacherid"
                  value={form.teacherid}
                  onChange={handleChange}
                  required
                  disabled={isEdit}
                />
                <Field
                  label="Name*"
                  name="teachername"
                  value={form.teachername}
                  onChange={handleChange}
                  required
                />
                <Field
                  label="Email"
                  name="teacheremailid"
                  value={form.teacheremailid}
                  onChange={handleChange}
                />
                <Field
                  label="Mobile"
                  name="teachermob1"
                  value={form.teachermob1}
                  onChange={handleChange}
                />
                <Select
                  label="Gender"
                  name="teachergender"
                  value={form.teachergender}
                  onChange={handleChange}
                  options={[
                    { label: "— Select —", value: "" },
                    { label: "Male", value: "Male" },
                    { label: "Female", value: "Female" },
                    { label: "Other", value: "Other" },
                  ]}
                />
                <Field
                  label="Designation"
                  name="teacherdesig"
                  value={form.teacherdesig}
                  onChange={handleChange}
                />
                <Field
                  label="College ID"
                  name="teachercollegeid"
                  value={form.teachercollegeid}
                  onChange={handleChange}
                />
                <Field
                  label="Dept ID"
                  name="teacher_dept_id"
                  value={form.teacher_dept_id}
                  onChange={handleChange}
                />
              </div>

              {/* Advanced */}
              <div className="mt-2">
                <button
                  onClick={() => setShowAdvanced((s) => !s)}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  {showAdvanced ? "Hide" : "Show"} advanced fields
                </button>

                {showAdvanced && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {COLS.filter(
                      (c) =>
                        ![
                          "teacherid",
                          "teachername",
                          "teacheremailid",
                          "teachermob1",
                          "teachergender",
                          "teacherdesig",
                          "teachercollegeid",
                          "teacher_dept_id",
                        ].includes(c)
                    ).map((c) => (
                      <Field
                        key={c}
                        label={c}
                        name={c}
                        value={form[c] ?? ""}
                        onChange={handleChange}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2"
                onClick={handleSave}
              >
                {isEdit ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`rounded-xl px-4 py-3 shadow text-sm text-white ${
              toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- tiny helpers ---------- */
function Th({ children }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
      {children}
    </th>
  );
}
function Td({ children, mono = false }) {
  return (
    <td className={`px-3 py-2 text-sm ${mono ? "font-mono" : ""} text-gray-800`}>
      {children || <span className="text-gray-400">—</span>}
    </td>
  );
}
function Field({
  label,
  name,
  value,
  onChange,
  required = false,
  placeholder = "",
  disabled = false,
}) {
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
