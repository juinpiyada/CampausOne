import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import "../../index.css";

/* ---------- helpers ---------- */
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

const PAGE_SIZE = 4;

export default function SubjectElective() {
  // ===== API endpoints from config (unchanged) =====
  const SUBJECT_ELECTIVE_API = joinUrl(config.SUBJECT_ELECTIVE_ROUTE); // e.g. .../api/subject-elective
  const MASTER_SUBJECT_API = joinUrl(config.SUBJECT_ROUTE, "list");    // e.g. .../api/subject/list

  // ===== state =====
  const [electives, setElectives] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState({
    sub_elec_id: "",
    sub_elec_mas_sub: "",
    sub_elec_semesterno: "",
    sub_elec_grp_code: "",
    sub_elec_grp_name: "",
    sub_elec_max_courseallowed: "",
    sub_elec_min_coursereqd: "",
    sub_elec_remarks: "",
    createdat: "",
    updatedat: "",
  });

  /* ===== effects ===== */
  useEffect(() => {
    fetchElectives();
    fetchSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===== data loaders (unchanged logic) ===== */
  const fetchElectives = async () => {
    try {
      const res = await axios.get(SUBJECT_ELECTIVE_API);
      setElectives(pickArray(res.data));
    } catch (err) {
      console.error("Error fetching electives:", err);
      setElectives([]);
    }
  };

  const fetchSubjects = async () => {
    try {
      const res = await axios.get(MASTER_SUBJECT_API);
      setSubjects(pickArray(res.data?.subjects ?? res.data));
    } catch (err) {
      console.error("Error fetching subjects:", err);
      setSubjects([]);
    }
  };

  /* ===== handlers (unchanged API + field names) ===== */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      sub_elec_id: "",
      sub_elec_mas_sub: "",
      sub_elec_semesterno: "",
      sub_elec_grp_code: "",
      sub_elec_grp_name: "",
      sub_elec_max_courseallowed: "",
      sub_elec_min_coursereqd: "",
      sub_elec_remarks: "",
      createdat: "",
      updatedat: "",
    });
    setEditing(false);
  };

  // Auto-generate ID for new records
  const generateId = () => {
    const electiveCount = electives.length + 1; // Auto-incrementing count
    return `ELEC_${electiveCount.toString().padStart(3, "0")}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const now = new Date().toISOString();
      const dataToSend = { ...formData, updatedat: now };

      if (!formData.sub_elec_id) {
        // Auto-generate ID for new records if not provided
        dataToSend.sub_elec_id = generateId();
      }

      if (editing) {
        await axios.put(joinUrl(SUBJECT_ELECTIVE_API, formData.sub_elec_id), dataToSend);
        setMessage("Updated successfully.");
      } else {
        dataToSend.createdat = now;
        await axios.post(SUBJECT_ELECTIVE_API, dataToSend);
        setMessage("Subject elective group added successfully.");
      }

      setShowForm(false);
      resetForm();
      fetchElectives();
    } catch (err) {
      setError("Error saving data.");
      console.error("Save Error:", err?.response?.data || err);
    }
  };

  const handleEdit = (elec) => {
    setFormData(elec);
    setEditing(true);
    setShowForm(true);
    setMessage("");
    setError("");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this?")) return;
    setError("");
    setMessage("");
    try {
      await axios.delete(joinUrl(SUBJECT_ELECTIVE_API, id));
      setMessage("Deleted successfully.");
      fetchElectives();
    } catch (err) {
      setError("Error deleting data.");
      console.error("Delete Error:", err);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(false);
    resetForm();
    setError("");
    setMessage("");
  };

  /* ===== search + pagination ===== */
  const filteredElectives = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return electives;
    return electives.filter((g) =>
      [
        g.sub_elec_id,
        g.sub_elec_mas_sub,
        g.sub_elec_semesterno,
        g.sub_elec_grp_code,
        g.sub_elec_grp_name,
        g.sub_elec_max_courseallowed,
        g.sub_elec_min_coursereqd,
        g.sub_elec_remarks,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .some((txt) => txt.includes(s))
    );
  }, [electives, query]);

  const totalPages = Math.max(1, Math.ceil(filteredElectives.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = filteredElectives.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  /* ===== UI (class-based, no inline styles) ===== */
  return (
    <div className="mu-page">
      {(message || error) && (
        <div className="toast-wrapper">
          <div className={`toast-box ${error ? "toast--error" : ""}`}>
            <span className="toast-emoji">{error ? "⚠️" : "✅"}</span>
            <span className="toast-text">{error || message}</span>
            <button
              className="toast-close"
              onClick={() => {
                setMessage("");
                setError("");
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <h1 className="mu-title">ELECTIVE GROUP</h1>

      {/* Toolbar with Search + Add button */}
      <div className="mu-toolbar">
        <label className="searchbox" aria-label="Search subject electives">
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
            <table className="mu-table">
              <thead>
                <tr className="mu-thead-row">
                  <th className="mu-th">ID</th>
                  <th className="mu-th">Master Subject</th>
                  <th className="mu-th">Semester</th>
                  <th className="mu-th">Group Code</th>
                  <th className="mu-th">Group Name</th>
                  <th className="mu-th">Max</th>
                  <th className="mu-th">Min</th>
                  <th className="mu-th">Remarks</th>
                  <th className="mu-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td className="mu-td mu-empty" colSpan={9}>
                      No electives found.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((elec) => (
                    <tr key={elec.sub_elec_id}>
                      <td className="mu-td">{elec.sub_elec_id}</td>
                      <td className="mu-td">{elec.sub_elec_mas_sub}</td>
                      <td className="mu-td">{elec.sub_elec_semesterno}</td>
                      <td className="mu-td">{elec.sub_elec_grp_code}</td>
                      <td className="mu-td">{elec.sub_elec_grp_name}</td>
                      <td className="mu-td">{elec.sub_elec_max_courseallowed}</td>
                      <td className="mu-td">{elec.sub_elec_min_coursereqd}</td>
                      <td className="mu-td">{elec.sub_elec_remarks}</td>
                      <td className="mu-td">
                        <button className="btn btn--primary" onClick={() => handleEdit(elec)}>
                          Edit
                        </button>
                        <button
                          className="btn btn--danger"
                          onClick={() => handleDelete(elec.sub_elec_id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination (chips style to match CollegeGroupManager) */}
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
          <form
            className="modal modal--wide"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <button type="button" className="modal-x" onClick={handleCancel}>
              ×
            </button>
            <h3 className="modal-heading">
              {editing ? "Edit Subject Elective Group" : "Add Subject Elective Group"}
            </h3>

            <div className="form-grid form-grid--3">
              {/* ID */}
              <div className="form-row">
                <label className="form-label">Elective Group ID</label>
                <input
                  className="form-input"
                  name="sub_elec_id"
                  value={formData.sub_elec_id || generateId()} // Auto-generate ID if empty
                  onChange={handleChange}
                  disabled // Make the ID field read-only (non-editable)
                  required
                />
              </div>

              {/* Semester */}
              <div className="form-row">
                <label className="form-label">Semester No</label>
                <input
                  className="form-input"
                  type="number"
                  name="sub_elec_semesterno"
                  value={formData.sub_elec_semesterno}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Master Subject */}
              <div className="form-row">
                <label className="form-label">Master Subject</label>
                <select
                  className="form-input"
                  name="sub_elec_mas_sub"
                  value={formData.sub_elec_mas_sub}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Select Master Subject --</option>
                  {subjects.map((subject) => (
                    <option key={subject.subjectid} value={subject.subjectid}>
                      {subject.subjectid} — {subject.subjectname ?? subject.subjectdesc ?? subject.subjectcode}
                    </option>
                  ))}
                </select>
              </div>

              {/* Group Code */}
              <div className="form-row">
                <label className="form-label">Group Code</label>
                <input
                  className="form-input"
                  name="sub_elec_grp_code"
                  value={formData.sub_elec_grp_code}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Group Name */}
              <div className="form-row">
                <label className="form-label">Group Name</label>
                <input
                  className="form-input"
                  name="sub_elec_grp_name"
                  value={formData.sub_elec_grp_name}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Max Courses Allowed */}
              <div className="form-row">
                <label className="form-label">Max Courses Allowed</label>
                <input
                  className="form-input"
                  type="number"
                  name="sub_elec_max_courseallowed"
                  value={formData.sub_elec_max_courseallowed}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Min Courses Required */}
              <div className="form-row">
                <label className="form-label">Min Courses Required</label>
                <input
                  className="form-input"
                  type="number"
                  name="sub_elec_min_coursereqd"
                  value={formData.sub_elec_min_coursereqd}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Remarks (optional) */}
              <div className="form-row span-2">
                <label className="form-label">Remarks</label>
                <input
                  className="form-input"
                  name="sub_elec_remarks"
                  value={formData.sub_elec_remarks}
                  onChange={handleChange}
                  placeholder=""
                />
              </div>
            </div>

            {!!error && <div className="modal-desc modal-desc--error">{error}</div>}
            {!!message && <div className="modal-desc modal-desc--ok">{message}</div>}

            <div className="modal-actions">
              <button type="submit" className="btn btn--primary">
                {editing ? "Update" : "Add"} Subject Elective
              </button>
              <button type="button" className="btn btn--secondary" onClick={handleCancel}>
                Cancel
              </button>
            </div>

            <button type="button" className="btn btn--close-fullwidth" onClick={handleCancel}>
              Close
            </button>
          </form>
        </div>
      )}
    </div>
  );
}