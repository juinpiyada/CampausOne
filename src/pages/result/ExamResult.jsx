// SMS-ui/src/pages/result/ExamResult.jsx
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import "../../index.css";

// ---- Safe URL joiners ----
function joinUrl(base = "", path = "") {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}/${p}`;
}
function buildApi(...parts) {
  return parts.filter(Boolean).reduce((acc, part) => joinUrl(acc, part), "");
}
const api = (...p) => buildApi(...p);

// ---- Toast ----
function Toast({ show, message, type, onClose }) {
  if (!show) return null;
  return (
    <div className="toast-wrapper">
      <div className={`toast-box ${type === "error" ? "toast--error" : ""}`}>
        <span className="toast-emoji">
          {type === "error" ? "❌" : "✔️"}
        </span>
        <span className="toast-text">{message}</span>
        <button
          className="toast-close"
          onClick={onClose}
          aria-label="Close toast"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ---- Pagination ----
function Pagination({ currentPage, totalPages, onChange }) {
  return (
    <div className="mu-pagebtns">
      <button
        disabled={currentPage === 1}
        className="btn-page"
        onClick={() => onChange(currentPage - 1)}
        aria-label="Previous page"
      >
        «
      </button>
      <span className="badge-page">{currentPage}</span>
      <button
        disabled={currentPage === totalPages}
        className="btn-page"
        onClick={() => onChange(currentPage + 1)}
        aria-label="Next page"
      >
        »
      </button>
    </div>
  );
}

// ---- Field component ----
function Field({ label, name, type, value, onChange, disabled, className = "" }) {
  return (
    <div className={`form-row ${className}`}>
      <label className="form-label">{label}</label>
      <input
        type={type || "text"}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="form-input"
        autoComplete="off"
      />
    </div>
  );
}

// ---- Modal Form for Add/Edit Result ----
function ResultForm({ initial, onClose, onSaved, mode = "add" }) {
  const [form, setForm] = useState(
    initial || {
      examresultid: "",
      examresult_examid: "",
      examstudentid: "",
      exammarksobtained: "",
      examgrade: "",
      examremarks: "",
      createdat: "",
      updatedat: "",
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const EXAM_RESULT_API = api(config.EXAM_RESULT_ROUTE);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "edit") {
        await axios.put(`${EXAM_RESULT_API}/${form.examresultid}`, { ...form });
      } else {
        await axios.post(EXAM_RESULT_API, { ...form });
      }
      onSaved(mode, form);
      onClose();
    } catch (err) {
      setError("Failed to save result. Please check data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal modal--wide">
      <button onClick={onClose} className="modal-x" aria-label="Close">
        ×
      </button>
      <h2 className="modal-heading">
        {mode === "edit" ? "Edit Exam Result" : "Add Exam Result"}
      </h2>

      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="form-grid form-grid--3">
          <Field
            label="Result ID"
            name="examresultid"
            type="text"
            value={form.examresultid}
            onChange={handleChange}
            disabled={mode === "edit"}
          />
          <Field
            label="Exam ID"
            name="examresult_examid"
            type="text"
            value={form.examresult_examid}
            onChange={handleChange}
          />
          <Field
            label="Student ID"
            name="examstudentid"
            type="text"
            value={form.examstudentid}
            onChange={handleChange}
          />

          <Field
            label="Marks Obtained"
            name="exammarksobtained"
            type="number"
            value={form.exammarksobtained}
            onChange={handleChange}
          />
          <Field
            label="Grade"
            name="examgrade"
            type="text"
            value={form.examgrade}
            onChange={handleChange}
          />
          <Field
            label="Remarks"
            name="examremarks"
            type="text"
            value={form.examremarks}
            onChange={handleChange}
          />

          <Field
            label="Created At"
            name="createdat"
            type="datetime-local"
            value={form.createdat}
            onChange={handleChange}
          />
          <Field
            label="Updated At"
            name="updatedat"
            type="datetime-local"
            value={form.updatedat}
            onChange={handleChange}
          />
        </div>

        {error && <div className="modal-desc modal-desc--error">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className={`btn btn--submit ${loading ? "is-loading" : ""}`}
        >
          {loading
            ? mode === "edit"
              ? "Saving..."
              : "Adding..."
            : mode === "edit"
            ? "Save Changes"
            : "Add Result"}
        </button>

        <button onClick={onClose} type="button" className="btn btn--close-fullwidth">
          Close
        </button>
      </form>
    </div>
  );
}

// ---- Confirm Delete Modal ----
function ConfirmDelete({ result, onClose, onDelete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const DELETE_API = (id) => api(config.EXAM_RESULT_ROUTE, id);

  const handleDelete = async () => {
    setError("");
    setLoading(true);
    try {
      await axios.delete(DELETE_API(result.examresultid));
      onDelete(result);
      onClose();
    } catch {
      setError("Failed to delete result.");
    }
    setLoading(false);
  };

  return (
    <div className="modal">
      <button onClick={onClose} className="modal-x" aria-label="Close">
        ×
      </button>
      <div className="modal-title danger">Delete Exam Result?</div>
      <div className="modal-desc">
        Are you sure you want to delete <br />
        <b>{result.examresultid}</b>?
      </div>
      {error && <div className="modal-desc">{error}</div>}
      <div className="modal-actions">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="btn btn--danger"
        >
          {loading ? "Deleting..." : "Yes, Delete"}
        </button>
        <button onClick={onClose} className="btn btn--secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Main Export ----
const ITEMS_PER_PAGE = 4;

export default function ExamResult() {
  const [showAdd, setShowAdd] = useState(false);
  const [editData, setEditData] = useState(null);
  const [deleteData, setDeleteData] = useState(null);
  const [resultList, setResultList] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });

  const VIEW_API = api(config.EXAM_RESULT_ROUTE);

  const fetchResults = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(VIEW_API);
      const raw = res?.data?.results ?? res?.data ?? [];
      setResultList(Array.isArray(raw) ? raw : []);
    } catch {
      setResultList([]);
      setError("Failed to load results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []); // eslint-disable-line

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: "", message: "" }), 2000);
  };

  const handleSaved = (mode) => {
    fetchResults();
    if (mode === "add") showToast("success", "Exam result added successfully!");
    else if (mode === "edit") showToast("success", "Exam result updated!");
    else if (mode === "delete") showToast("success", "Exam result deleted!");
  };

  const filteredList = resultList.filter(
    (r) =>
      (r.examresultid ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.examstudentid ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.examresult_examid ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredList.length / ITEMS_PER_PAGE));
  const pagedList = filteredList.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setPage(1);
  }, [search, resultList.length]);

  return (
    <div className="mu-page">
      <Toast {...toast} onClose={() => setToast({ ...toast, show: false })} />

      <div className="mu-container">
        <h2 className="mu-title">EXAM RESULT</h2>

        {/* Toolbar */}
        <div className="mu-toolbar">
          <div className="searchbox">
            <span className="searchbox__icon" aria-hidden="true">
              <svg
                width="23"
                height="23"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="searchbox__input"
            />
          </div>

          <button className="btn btn--add" onClick={() => setShowAdd(true)}>
            <span className="btn-plus">+</span>
            Add
          </button>
        </div>

        {/* Table */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">
            <h2 className="mu-subtitle">All Exam Results</h2>

            <div className="mu-tablecard">
              <div className="mu-hscroll">
                <table className="mu-table">
                  <thead>
                    <tr className="mu-thead-row">
                      <th className="mu-th">Result ID</th>
                      <th className="mu-th">Exam ID</th>
                      <th className="mu-th">Student ID</th>
                      <th className="mu-th">Marks</th>
                      <th className="mu-th">Grade</th>
                      <th className="mu-th">Remarks</th>
                      <th className="mu-th">Created At</th>
                      <th className="mu-th">Updated At</th>
                      <th className="mu-th mu-th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedList.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="mu-empty">
                          {loading ? "Loading..." : "No results found"}
                        </td>
                      </tr>
                    ) : (
                      pagedList.map((r) => (
                        <tr key={r.examresultid}>
                          <td className="mu-td">{r.examresultid}</td>
                          <td className="mu-td">{r.examresult_examid}</td>
                          <td className="mu-td">{r.examstudentid}</td>
                          <td className="mu-td">{r.exammarksobtained}</td>
                          <td className="mu-td">{r.examgrade}</td>
                          <td className="mu-td">{r.examremarks}</td>
                          <td className="mu-td">
                            {r.createdat?.substring(0, 19)}
                          </td>
                          <td className="mu-td">
                            {r.updatedat?.substring(0, 19)}
                          </td>
                          <td className="mu-td mu-td-actions">
                            <button
                              className="btn btn--primary"
                              onClick={() => setEditData(r)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--danger"
                              onClick={() => setDeleteData(r)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="mu-pagination">
              <span className="mu-pageinfo">
                Showing page {page} of {totalPages} pages
              </span>
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onChange={setPage}
              />
            </div>

            {error && <div className="mu-empty">{error}</div>}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <ResultForm
              initial={{ examresultid: `RESULT_ID_${resultList.length + 1}` }}
              onClose={() => setShowAdd(false)}
              onSaved={() => handleSaved("add")}
              mode="add"
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editData && (
        <div className="modal-overlay" onClick={() => setEditData(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <ResultForm
              initial={editData}
              onClose={() => setEditData(null)}
              onSaved={() => handleSaved("edit")}
              mode="edit"
            />
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteData && (
        <div className="modal-overlay" onClick={() => setDeleteData(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <ConfirmDelete
              result={deleteData}
              onClose={() => setDeleteData(null)}
              onDelete={() => handleSaved("delete")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
