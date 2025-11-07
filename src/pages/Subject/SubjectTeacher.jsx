// SMS-ui/src/pages/SubjectTeacher/SubjectTeacher.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import "../../index.css";

/* ---------------- helpers ---------------- */
const joinUrl = (base, path = "") =>
  path ? `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}` : String(base);

const pickArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.items)) return raw.items;
  if (raw && typeof raw === "object") {
    const k = Object.keys(raw).find((x) => Array.isArray(raw[x]));
    if (k) return raw[k];
  }
  return [];
};

/* ---------------- routes ---------------- */
const SUBJECT_TEACHER_API = joinUrl(config.SUBJECT_TEACHER_ROUTE);     // e.g. /api/subject-teacher
const TEACHER_IDS_API     = joinUrl(config.TEACHER_ROUTE, "only/ids"); // e.g. /api/teacher/only/ids
const SUBJECT_LIST_API    = joinUrl(config.SUBJECT_ROUTE, "list");     // e.g. /api/subject/list

const PAGE_SIZE = 5;

const initialForm = {
  subteaid: "",
  teacherid: "",           // UI dropdown; will be copied to subtea_masid before submit
  subtea_masid: "",
  subcollegesubid: "",
  subtea_collegedesc: "",
  subtea_acadyear: "",
  subcoll_acad_sem: "",
};

export default function SubjectTeacher() {
  const [records, setRecords] = useState([]);
  const [teacherList, setTeacherList] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  /* ------------ fetchers ------------ */
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [stRes, tRes, sRes] = await Promise.all([
        axios.get(SUBJECT_TEACHER_API),
        axios.get(TEACHER_IDS_API),
        axios.get(SUBJECT_LIST_API),
      ]);
      setRecords(pickArray(stRes.data));
      setTeacherList(pickArray(tRes.data));
      setSubjects(pickArray(sRes.data?.subjects ?? sRes.data));
    } catch (e) {
      console.error(e);
      setError("Error fetching data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ------------ helpers for ID ------------ */
  const generateNextId = () => {
    if (!records || records.length === 0) return "SUB_TECH_001";
    const ids = records
      .map(r => String(r.subteaid || ""))
      .filter(id => /^SUB_TECH_\d+$/.test(id))
      .map(id => parseInt(id.replace("SUB_TECH_", ""), 10))
      .filter(n => !isNaN(n));

    const maxNum = ids.length > 0 ? Math.max(...ids) : 0;
    const nextNum = maxNum + 1;
    return `SUB_TECH_${String(nextNum).padStart(3, "0")}`;
  };

  /* ------------ handlers ------------ */
  const resetForm = () => setForm(initialForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(""); setError("");

    // backend expects subtea_masid (teacher id)
    const payload = { ...form, subtea_masid: form.teacherid };
    delete payload.teacherid;

    try {
      if (editing) {
        await axios.put(joinUrl(SUBJECT_TEACHER_API, form.subteaid), payload);
        setMessage("Subject Teacher updated successfully");
      } else {
        await axios.post(SUBJECT_TEACHER_API, payload);
        setMessage("Subject Teacher added successfully");
      }
      setShowForm(false);
      setEditing(false);
      resetForm();
      fetchAll();
    } catch (err) {
      console.error(err?.response?.data || err);
      setError("Error saving the record.");
    }
  };

  const handleEdit = (row) => {
    setForm({
      subteaid: row.subteaid || "",
      teacherid: row.subtea_masid || "",
      subtea_masid: row.subtea_masid || "",
      subcollegesubid: row.subcollegesubid || "",
      subtea_collegedesc: row.subtea_collegedesc || "",
      subtea_acadyear: row.subtea_acadyear || "",
      subcoll_acad_sem: row.subcoll_acad_sem || "",
    });
    setEditing(true);
    setShowForm(true);
    setMessage(""); setError("");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    setError(""); setMessage("");
    try {
      await axios.delete(joinUrl(SUBJECT_TEACHER_API, id));
      setRecords(list => list.filter(r => r.subteaid !== id));
      setMessage("Record deleted successfully.");
    } catch (err) {
      console.error(err);
      setError("Error deleting the record.");
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(false);
    resetForm();
    setError(""); setMessage("");
  };

  /* ------------ search + pagination ------------ */
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return records;
    return records.filter(r =>
      [
        r.subteaid,
        r.subtea_masid,
        r.subcollegesubid,
        r.subtea_collegedesc,
        r.subtea_acadyear,
        r.subcoll_acad_sem,
      ]
        .map(v => String(v ?? "").toLowerCase())
        .some(txt => txt.includes(s))
    );
  }, [records, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  /* ------------ render ------------ */
  return (
    <div className="mu-page">
      {(message || error) && (
        <div className="toast-wrapper">
          <div className={`toast-box ${error ? "toast--error" : ""}`}>
            <span className="toast-emoji">{error ? "⚠️" : "✅"}</span>
            <span className="toast-text">{error || message}</span>
            <button className="toast-close" onClick={() => { setMessage(""); setError(""); }}>×</button>
          </div>
        </div>
      )}

      <h1 className="mu-title">Subject Teacher Management</h1>

      {/* Toolbar */}
      <div className="mu-toolbar">
        <label className="searchbox" aria-label="Search subject-teacher">
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
        </label>

        <button
          className="btn btn--add"
          onClick={() => { 
            setShowForm(true); 
            setEditing(false); 
            resetForm(); 
            setForm(f => ({ ...f, subteaid: generateNextId() })); 
            setMessage(""); 
            setError(""); 
          }}
        >
          <span className="btn-plus">＋</span> Add
        </button>
      </div>

      {/* Table Card */}
      <div className="mu-tablewrap-outer">
        <div className="mu-tablewrap">

          <div className="mu-tablecard">
            <div style={{ overflowX: "auto", overflowY: "hidden" }}>
              <table className="mu-table">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">ID</th>
                    <th className="mu-th">Teacher ID</th>
                    <th className="mu-th">College Subject ID</th>
                    <th className="mu-th">Description</th>
                    <th className="mu-th">Academic Year</th>
                    <th className="mu-th">Semester</th>
                    <th className="mu-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="mu-td mu-empty" colSpan={7}>Loading...</td></tr>
                  ) : pageItems.length === 0 ? (
                    <tr><td className="mu-td mu-empty" colSpan={7}>No Records Found</td></tr>
                  ) : (
                    pageItems.map((t) => (
                      <tr key={t.subteaid}>
                        <td className="mu-td">{t.subteaid}</td>
                        <td className="mu-td">{t.subtea_masid}</td>
                        <td className="mu-td">{t.subcollegesubid}</td>
                        <td className="mu-td">{t.subtea_collegedesc}</td>
                        <td className="mu-td">{t.subtea_acadyear}</td>
                        <td className="mu-td">{t.subcoll_acad_sem}</td>
                        <td className="mu-td">
                          <button className="btn btn--primary" onClick={() => handleEdit(t)}>Edit</button>
                          <button className="btn btn--danger" onClick={() => handleDelete(t.subteaid)}>Delete</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination — chips style like CollegeGroup */}
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
        <div className="modal-overlay" onClick={handleCancel}>
          <form className="modal modal--wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <button type="button" className="modal-x" onClick={handleCancel}>×</button>
            <h3 className="modal-heading">{editing ? "Edit Subject Teacher" : "Add Subject Teacher"}</h3>

            <div className="form-grid form-grid--3">
              <div className="form-row">
                <label className="form-label">Subject Teacher ID</label>
                <input
                  className="form-input"
                  name="subteaid"
                  value={form.subteaid}
                  disabled
                  required
                />
              </div>

              <div className="form-row">
                <label className="form-label">College Description</label>
                <input
                  className="form-input"
                  name="subtea_collegedesc"
                  value={form.subtea_collegedesc}
                  onChange={(e) => setForm(f => ({ ...f, subtea_collegedesc: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Academic Year</label>
                <input
                  className="form-input"
                  name="subtea_acadyear"
                  value={form.subtea_acadyear}
                  onChange={(e) => setForm(f => ({ ...f, subtea_acadyear: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Semester</label>
                <input
                  className="form-input"
                  name="subcoll_acad_sem"
                  value={form.subcoll_acad_sem}
                  onChange={(e) => setForm(f => ({ ...f, subcoll_acad_sem: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Teacher ID</label>
                <select
                  className="form-input"
                  name="teacherid"
                  value={form.teacherid}
                  onChange={(e) => setForm(f => ({ ...f, teacherid: e.target.value }))}
                  required
                >
                  <option value="">-- Select Teacher --</option>
                  {teacherList.map((t) => (
                    <option key={t.teacherid ?? t.id} value={t.teacherid ?? t.id}>
                      {(t.teacherid ?? t.id)} — {t.teachername ?? t.name ?? ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">College Subject ID</label>
                <select
                  className="form-input"
                  name="subcollegesubid"
                  value={form.subcollegesubid}
                  onChange={(e) => setForm(f => ({ ...f, subcollegesubid: e.target.value }))}
                  required
                >
                  <option value="">-- Select Subject --</option>
                  {subjects.map((s) => (
                    <option key={s.subjectid} value={s.subjectid}>
                      {s.subjectid} — {s.subjectname ?? s.subjectdesc ?? s.subjectcode}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!!error && <div className="modal-desc modal-desc--error">{error}</div>}
            {!!message && <div className="modal-desc modal-desc--ok">{message}</div>}

            <div className="modal-actions">
              <button type="submit" className="btn btn--primary">{editing ? "Update" : "Add"} Record</button>
              <button type="button" className="btn btn--secondary" onClick={handleCancel}>Cancel</button>
            </div>

            <button type="button" className="btn btn--close-fullwidth" onClick={handleCancel}>Close</button>
          </form>
        </div>
      )}
    </div>
  );
}