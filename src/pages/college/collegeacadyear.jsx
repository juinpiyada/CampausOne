import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import "../../index.css";

/* ---------------- Safe URL joiner ---------------- */
function joinUrl(base = "", path = "") {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}/${p}`;
}

/* --------------- Helpers for academic year (Jul 1 → Jun 30) --------------- */
const START_BASE_YEAR = 2008;
const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const startISOFromYear = (y) => toISO(y, 7, 1);         // Jul 1
const endISOFromStartISO = (startISO) => {
  const y = Number(String(startISO).slice(0, 4));
  if (!Number.isFinite(y)) return "";
  return toISO(y + 1, 6, 30); // Jun 30 next year
};

// Normalize backend datetime → local YYYY-MM-DD
function toLocalISODate(dateLike) {
  if (!dateLike) return "";
  const s = String(dateLike);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return s.slice(0, 10);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/* ---------------- API Routes ---------------- */
const API = joinUrl(config.MASTER_ACADYEAR_ROUTE);
const DEPTS_API = joinUrl(config.MASTER_DEPTS_ROUTE);   // list/extract departments
const DEPTS_ROUTE = joinUrl(config.MASTER_DEPTS_ROUTE); // create/update departments

/* ---------------- Toast (same pattern as AddCollege.jsx) ---------------- */
function Toast({ show, message, type, onClose }) {
  if (!show) return null;
  return (
    <div className="toast-wrapper">
      <div className={`toast-box ${type === "error" ? "toast--error" : ""}`}>
        <span className="toast-emoji">{type === "error" ? "❌" : "✔️"}</span>
        <span className="toast-text">{message}</span>
        <button className="toast-close" onClick={onClose} aria-label="Close toast">×</button>
      </div>
    </div>
  );
}

/* ---------------- Small utility: next ACA_YEAR_### ---------------- */
function getNextAcadId(list = []) {
  let maxNum = 0;
  for (const r of list) {
    const id = String(r?.id || "").trim();
    const m = /^ACA_YEAR_(\d+)$/.exec(id);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!Number.isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `ACA_YEAR_${String(maxNum + 1).padStart(3, "0")}`;
}

/* ---------------- Generate next DEPT_### ---------------- */
function getNextDeptId(departments = []) {
  const ids = departments
    .map((d) => String(d.collegedeptid || ""))
    .filter((id) => /^DEPT_\d+$/.test(id))
    .map((id) => parseInt(id.replace("DEPT_", ""), 10));
  const next = (ids.length ? Math.max(...ids) : 0) + 1;
  return `DEPT_${String(next).padStart(3, "0")}`;
}

/* ---------------- Modal Form (Academic Year + Department) ---------------- */
function YearForm({
  initial,
  mode = "add",
  colleges,
  departments,
  startYearOptions,
  nextDeptId,
  onClose,
  onSaved
}) {
  const [form, setForm] = useState(() => ({
    // Academic year fields
    id: "",
    collegeid: "",
    collegedeptid: "",
    collegeacadyearstartdt: "",
    collegeacadyearenddt: "",
    collegeacadyearstatus: "",
    createdat: "",
    updatedat: "",
    // Department fields (mirrors MasterDepts.jsx)
    colldept_code: "",
    collegedeptdesc: "",
    colldepthod: "",
    colldepteaail: "",
    colldeptphno: "",
    ...(initial || {}),
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Populate department details when existing dept chosen (e.g., edit prefill)
  useEffect(() => {
    const exist = departments.find(d => String(d.collegedeptid) === String(form.collegedeptid));
    if (exist) {
      setForm(f => ({
        ...f,
        collegedeptdesc: exist.collegedeptdesc || f.collegedeptdesc || "",
        colldept_code: exist.colldept_code || f.colldept_code || "",
        colldepthod: exist.colldepthod || f.colldepthod || "",
        colldepteaail: exist.colldepteaail || f.colldepteaail || "",
        colldeptphno: exist.colldeptphno || f.colldeptphno || "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once for edit prefill

  // Filter departments by selected college (for suggestions)
  const filteredDepartments = useMemo(() => {
    if (!departments || departments.length === 0) return [];
    if (!form.collegeid) return departments;
    const hasKey = departments.some(d => d.collegeid && d.collegeid !== "");
    return hasKey
      ? departments.filter(d => String(d.collegeid) === String(form.collegeid))
      : departments;
  }, [departments, form.collegeid]);

  const fillFromExistingDesc = (desc) => {
    if (!desc) {
      setForm(prev => ({
        ...prev,
        collegedeptdesc: "",
        collegedeptid: "",
        colldept_code: "",
        colldepthod: "",
        colldepteaail: "",
        colldeptphno: "",
      }));
      return;
    }

    // match by description (case-insensitive) within filtered (same college if available)
    const match = filteredDepartments.find(
      d => String(d.collegedeptdesc || "").toLowerCase() === String(desc).toLowerCase()
    );

    if (match) {
      // Prefill all known fields for existing department
      const full = departments.find(d => String(d.collegedeptid) === String(match.collegedeptid)) || match;
      setForm(prev => ({
        ...prev,
        collegedeptdesc: desc,
        collegedeptid: String(match.collegedeptid),
        colldept_code: full.colldept_code || "",
        colldepthod: full.colldepthod || "",
        colldepteaail: full.colldepteaail || "",
        colldeptphno: full.colldeptphno || "",
      }));
    } else {
      // New department → assign next id & clear details for user to fill
      setForm(prev => ({
        ...prev,
        collegedeptdesc: desc,
        collegedeptid: nextDeptId || "DEPT_001",
        colldept_code: "",
        colldepthod: "",
        colldepteaail: "",
        colldeptphno: "",
      }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // College change → keep typed desc, rematch in the new college
    if (name === "collegeid") {
      const typedDesc = form.collegedeptdesc;
      setForm(prev => ({ ...prev, collegeid: value }));
      // after state update, recompute based on current departments list
      setTimeout(() => fillFromExistingDesc(typedDesc), 0);
      return;
    }

    // Department description (type-ahead)
    if (name === "collegedeptdesc") {
      fillFromExistingDesc(value);
      return;
    }

    // Department phone: enforce digits, max 10
    if (name === "colldeptphno") {
      const digits = value.replace(/\D/g, "").slice(0, 10);
      setForm(prev => ({ ...prev, colldeptphno: digits }));
      return;
    }

    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleStartSelect = (startISO) => {
    const end = startISO ? endISOFromStartISO(startISO) : "";
    setForm(prev => ({
      ...prev,
      collegeacadyearstartdt: startISO,
      collegeacadyearenddt: end
    }));
  };

  // Validate department fields similar to MasterDepts.jsx
  function validateDept() {
    // Always require these so Department can be upserted reliably
    if (!form.collegedeptid || !form.collegeid || !form.colldept_code || !form.collegedeptdesc) {
      return "Please fill Department ID, College, Dept Code, and Description.";
    }
    if ((form.colldeptphno || "").length > 0 && !/^\d{10}$/.test(form.colldeptphno)) {
      return "Department phone must be exactly 10 digits.";
    }
    if ((form.colldepteaail || "").length > 0 && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|in|org|net)$/.test(form.colldepteaail)) {
      return "Department email must end with .com or .in.";
    }
    return "";
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // 1) UPSERT Department first (so the year can reference it)
      const deptErr = validateDept();
      if (deptErr) {
        setError(deptErr);
        setLoading(false);
        return;
      }
      const deptPayload = {
        collegedeptid: form.collegedeptid,
        collegeid: form.collegeid,
        colldept_code: form.colldept_code,
        collegedeptdesc: form.collegedeptdesc,
        colldepthod: form.colldepthod,
        colldepteaail: form.colldepteaail,
        colldeptphno: form.colldeptphno,
      };
      const exists = departments.some(d => String(d.collegedeptid) === String(form.collegedeptid));
      if (exists) {
        await axios.put(joinUrl(DEPTS_ROUTE, `/${encodeURIComponent(form.collegedeptid)}`), deptPayload);
      } else {
        await axios.post(DEPTS_ROUTE, deptPayload);
      }

      // 2) Add or Update Academic Year
      if (mode === "edit") {
        await axios.put(joinUrl(API, `update/${form.id}`), form);
        onSaved("edit", form);
      } else {
        await axios.post(joinUrl(API, "add"), {
          ...form,
          createdat: new Date().toISOString(),
          updatedat: new Date().toISOString(),
        });
        onSaved("add", form);
      }

      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        (err?.request ? "Network error. Check backend & CORS." : "Operation failed.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal modal--wide">
      <button onClick={onClose} className="modal-x" aria-label="Close">×</button>
      <h2 className="modal-heading">{mode === "edit" ? "Edit Academic Year" : "Add Academic Year"}</h2>

      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="form-grid form-grid--3">
          {/* Academic Year — ID */}
          <div className="form-row">
            <label className="form-label">ID</label>
            <input
              className="form-input"
              name="id"
              value={form.id}
              onChange={handleChange}
              readOnly
            />
          </div>

          {/* Academic Year — College */}
          <div className="form-row">
            <label className="form-label">College</label>
            <select
              className="form-input"
              name="collegeid"
              value={form.collegeid}
              onChange={handleChange}
              required
            >
              <option value="">Select College</option>
              {colleges.map((c) => (
                <option key={c.collegeid} value={c.collegeid}>
                  {c.collegename} ({c.collegeid})
                </option>
              ))}
            </select>
          </div>

          

          {/* Academic Year — Start/End */}
          <div className="form-row">
            <label className="form-label">Start Date (Jul 1)</label>
            <select
              className="form-input"
              name="collegeacadyearstartdt"
              value={form.collegeacadyearstartdt}
              onChange={(e) => handleStartSelect(e.target.value)}
            >
              {form.collegeacadyearstartdt &&
                !startYearOptions.some(o => o.value === form.collegeacadyearstartdt) && (
                  <option value={form.collegeacadyearstartdt}>
                    {form.collegeacadyearstartdt} (loaded)
                  </option>
                )}
              <option value="">Select start (Jul 1)</option>
              {startYearOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="form-label">End Date (Jun 30 next year)</label>
            <input
              className="form-input"
              type="date"
              name="collegeacadyearenddt"
              value={form.collegeacadyearenddt}
              readOnly
            />
          </div>

          <div className="form-row">
            <label className="form-label">Status</label>
            <select
              className="form-input"
              name="collegeacadyearstatus"
              value={form.collegeacadyearstatus}
              onChange={handleChange}
            >
              <option value="">Select Status</option>
              <option value="Active">Active</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>
        </div>

        {/* --- Department details (auto-saved to MasterDepts) --- */}
        <h3 className="mu-subtitle" style={{ marginTop: "1rem" }}>Department/Program Details</h3>
        <div className="form-grid form-grid--3">
          <div className="form-row">
            <label className="form-label">Department ID</label>
            <input
              className="form-input"
              name="collegedeptid"
              value={form.collegedeptid || nextDeptId || ""}
              onChange={handleChange}
              readOnly
            />
          </div>
          <div className="form-row span-3">
            <label className="form-label">Description</label>
            <input
              className="form-input"
              name="collegedeptdesc"
              value={form.collegedeptdesc}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-row">
            <label className="form-label">Dept Code</label>
            <input
              className="form-input"
              name="colldept_code"
              value={form.colldept_code}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-row">
            <label className="form-label">HOD</label>
            <input
              className="form-input"
              name="colldepthod"
              value={form.colldepthod}
              onChange={handleChange}
            />
          </div>


          <div className="form-row">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              name="colldepteaail"
              value={form.colldepteaail}
              onChange={handleChange}
              placeholder="name@example.com"
              title="Must end with .com or .in"
            />
          </div>
          <div className="form-row">
            <label className="form-label">Phone</label>
            <input
              className="form-input"
              type="tel"
              name="colldeptphno"
              value={form.colldeptphno}
              onChange={handleChange}
              pattern="[0-9]{10}"
              maxLength={10}
              inputMode="numeric"
              title="Enter exactly 10 digits (0–9)"
            />
          </div>
        </div>

        {error && <div className="modal-desc">{error}</div>}

        <button type="submit" disabled={loading} className={`btn btn--submit ${loading ? "is-loading" : ""}`}>
          {loading ? (mode === "edit" ? "Saving..." : "Adding...") : (mode === "edit" ? "Save Changes" : "Add Academic Year")}
        </button>

        <button onClick={onClose} type="button" className="btn btn--close-fullwidth">
          Close
        </button>
      </form>
    </div>
  );
}

/* ---------------- Confirm Delete (matches AddCollege.jsx style) ---------------- */
function ConfirmDeleteYear({ record, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleDelete = async () => {
    setErr("");
    setLoading(true);
    try {
      await axios.delete(joinUrl(API, `delete/${record.id}`));
      onDeleted(record);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to delete.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <button onClick={onClose} className="modal-x" aria-label="Close">×</button>
      <div className="modal-title danger">Delete Academic Year?</div>
      <div className="modal-desc">
        Are you sure you want to delete<br />
        <b>{record.id}</b>?
      </div>
      {err && <div className="modal-desc">{err}</div>}
      <div className="modal-actions">
        <button onClick={handleDelete} disabled={loading} className="btn btn--danger">
          {loading ? "Deleting..." : "Yes, Delete"}
        </button>
        <button onClick={onClose} className="btn btn--secondary">Cancel</button>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
const PAGE_SIZE = 4;

export default function CollegeAcadYear() {
  const [years, setYears] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Popups (like AddCollege.jsx)
  const [showAdd, setShowAdd] = useState(false);
  const [editData, setEditData] = useState(null);
  const [deleteData, setDeleteData] = useState(null);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [toast, setToast] = useState({ show: false, message: "", type: "" });

  // Start-year options
  const startYearOptions = useMemo(() => {
    const now = new Date();
    const lastYear = now.getFullYear() + 5;
    const opts = [];
    for (let y = START_BASE_YEAR; y <= lastYear; y++) {
      const start = startISOFromYear(y);
      const label = `${y}-${y + 1} (Jul 1 → Jun 30)`;
      opts.push({ value: start, label });
    }
    return opts;
  }, []);

  useEffect(() => {
    fetchYears();
    fetchCollegesAndDepts();
  }, []);

  function normalizeColleges(data) {
    let arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    return arr
      .filter(c => (c.collegeid ?? c.college_id) && (c.collegename ?? c.college_name))
      .map(c => ({
        collegeid: String(c.collegeid ?? c.college_id),
        collegename: String(c.collegename ?? c.college_name),
      }));
  }

  function extractDepartments(data) {
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (Array.isArray(data.departments)) arr = data.departments;
    else if (Array.isArray(data.data)) arr = data.data;
    return arr
      .filter(d => (d.collegedeptid ?? d.dept_id ?? d.college_dept_id) && (d.collegedeptdesc ?? d.dept_desc ?? d.department_name))
      .map(d => ({
        collegedeptid: String(d.collegedeptid ?? d.dept_id ?? d.college_dept_id),
        collegedeptdesc: String(d.collegedeptdesc ?? d.dept_desc ?? d.department_name),
        collegeid: String(d.collegeid ?? d.college_id ?? d.parent_college_id ?? "")
      }));
  }

  const fetchYears = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API);
      setYears(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setMsg("Failed to fetch records. " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  };

  const fetchCollegesAndDepts = async () => {
    try {
      const deptsRes = await axios.get(DEPTS_API);
      setDepartments(extractDepartments(deptsRes.data));
    } catch (e) {
      setMsg("Failed to fetch department options. " + (e.message || ""));
    }
    const COLLEGES_URL = `${config.BASE_URL}/master-college/view-colleges`;
    axios
      .get(COLLEGES_URL)
      .then(res => {
        const raw = res?.data?.colleges ?? res?.data;
        setColleges(normalizeColleges(raw));
      })
      .catch(() => setColleges([]));
  };

  // Filter + pagination
  const filteredYears = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return years;
    return years.filter(item =>
      [
        item.id,
        item.collegeid,
        item.collegedeptid,
        item.collegeacadyear,
        item.collegeacadyearsemester,
        item.collegeacadyearname,
        item.collegeacadyeartype,
        item.collegeacadyearstartdt,
        item.collegeacadyearenddt,
        item.collegeacadyearstatus,
      ]
        .map(v => String(v ?? "").toLowerCase())
        .some(txt => txt.includes(s))
    );
  }, [years, query]);

  const totalPages = Math.max(1, Math.ceil(filteredYears.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = filteredYears.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: "", message: "" }), 2000);
  };

  // Success hooks from modals
  const handleSaved = (which) => {
    // Refresh both lists so UI stays in sync
    fetchYears();
    fetchCollegesAndDepts();
    if (which === "add") showToast("success", "Academic year & department saved!");
    if (which === "edit") showToast("success", "Academic year & department updated!");
    if (which === "delete") showToast("success", "Academic year deleted!");
  };

  // Pre-normalize edit record dates for the form
  const openEdit = (item) => {
    setEditData({
      ...item,
      collegeid: item.collegeid ? String(item.collegeid) : "",
      collegedeptid: item.collegedeptid ? String(item.collegedeptid) : "",
      collegeacadyearstartdt: toLocalISODate(item.collegeacadyearstartdt) || "",
      collegeacadyearenddt: toLocalISODate(item.collegeacadyearenddt) || "",
    });
  };

  const nextAcadId = useMemo(() => getNextAcadId(years), [years]);
  const nextDeptIdMemo = useMemo(() => getNextDeptId(departments), [departments]);

  return (
    <div className="mu-page">
      {(msg || error) && (
        <div className="toast-wrapper">
          <div className={`toast-box ${error ? "toast--error" : ""}`}>
            <span className="toast-emoji">{error ? "⚠️" : "✅"}</span>
            <span className="toast-text">{error || msg}</span>
            <button className="toast-close" onClick={() => { setMsg(""); setError(""); }}>×</button>
          </div>
        </div>
      )}

      <Toast {...toast} onClose={() => setToast({ ...toast, show: false })} />

      <h1 className="mu-title">ACADEMIC TERM / YEAR</h1>

      {/* Toolbar with Search + Add button */}
      <div className="mu-toolbar">
        <div className="searchbox" aria-label="Search academic years">
          <span className="searchbox__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" role="img" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="20" y1="20" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            className="searchbox__input"
            type="text"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <button
          className="btn btn--add"
          onClick={() => setShowAdd(true)}
        >
          <span className="btn-plus">＋</span> Add
        </button>
      </div>

      {/* Table Card */}
      <div className="mu-tablewrap-outer">
        <div className="mu-tablewrap">
          <div className="mu-tablecard" style={{ overflow: "visible" }}>
            <div style={{ overflowX: "auto", overflowY: "hidden" }}>
              <table className="mu-table">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">ID</th>
                    <th className="mu-th">College</th>
                    <th className="mu-th">Department</th>
                    {/* hidden: year/sem/yearname/type/current */}
                    <th className="mu-th">Start</th>
                    <th className="mu-th">End</th>
                    <th className="mu-th">Status</th>
                    <th className="mu-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="mu-td mu-empty" colSpan={7}>Loading...</td></tr>
                  ) : pageItems.length === 0 ? (
                    <tr><td className="mu-td mu-empty" colSpan={7}>No records found.</td></tr>
                  ) : pageItems.map((item) => (
                    <tr key={item.id}>
                      <td className="mu-td">{item.id}</td>
                      <td className="mu-td">
                        {colleges.find(c => String(c.collegeid) === String(item.collegeid))?.collegename || item.collegeid}
                      </td>
                      <td className="mu-td">
                        {departments.find(d => String(d.collegedeptid) === String(item.collegedeptid))?.collegedeptdesc || item.collegedeptid}
                      </td>
                      <td className="mu-td">{toLocalISODate(item.collegeacadyearstartdt)}</td>
                      <td className="mu-td">{toLocalISODate(item.collegeacadyearenddt)}</td>
                      <td className="mu-td">{item.collegeacadyearstatus}</td>
                      <td className="mu-td">
                        <button className="btn btn--primary" onClick={() => openEdit(item)} disabled={loading}>Edit</button>
                        <button className="btn btn--danger" onClick={() => setDeleteData(item)} disabled={loading}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="mu-pagination mu-pagination--chips">
              <span className="mu-pageinfo mu-pageinfo--chips">
                {`Showing page ${page} of ${totalPages} pages`}
              </span>
              <div className="mu-pagebtns mu-pagebtns--chips">
                <button
                  className="pagechip"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  «
                </button>
                <span className="pagechip pagechip--active">{page}</span>
                <button
                  className="pagechip"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <YearForm
              initial={{ id: nextAcadId }}
              mode="add"
              colleges={colleges}
              departments={departments}
              startYearOptions={startYearOptions}
              nextDeptId={nextDeptIdMemo}
              onClose={() => setShowAdd(false)}
              onSaved={(which) => handleSaved(which)}
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editData && (
        <div className="modal-overlay" onClick={() => setEditData(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <YearForm
              initial={editData}
              mode="edit"
              colleges={colleges}
              departments={departments}
              startYearOptions={startYearOptions}
              nextDeptId={nextDeptIdMemo}
              onClose={() => setEditData(null)}
              onSaved={(which) => handleSaved(which)}
            />
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteData && (
        <div className="modal-overlay" onClick={() => setDeleteData(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <ConfirmDeleteYear
              record={deleteData}
              onClose={() => setDeleteData(null)}
              onDeleted={() => handleSaved("delete")}
            />
          </div>
        </div>
      )}
    </div>
  );
}