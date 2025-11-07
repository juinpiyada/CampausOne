import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css';

// --- helpers ---
const joinUrl = (base, path = '') =>
  path ? `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}` : String(base);

const pickArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.items)) return raw.items;
  if (raw && typeof raw === 'object') {
    const k = Object.keys(raw).find((x) => Array.isArray(raw[x]));
    if (k) return raw[k];
  }
  return [];
};

/* ===== ONLY-ADDED earlier: Auto-generate next Subject Course ID like SUB_COU_ID_001 ===== */
function getNextSubjectCourseId(list = []) {
  let maxNum = 0;
  for (const it of list) {
    const id = String(it?.sub_cou_id || '').trim();
    const m = /^SUB_COU_ID_(\d+)$/.exec(id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  const next = String(maxNum + 1).padStart(3, '0');
  return `SUB_COU_ID_${next}`;
}
/* ============================================================================== */

const initialForm = {
  sub_cou_id: '',
  sub_cou_mast_id: '',
  sub_cou_mast_sub_id: '',
  sub_cou_sem_no: '',
  sub_cou_iselective: false,
  sub_cou_electivegroupid: '',
  sub_cou_islab: false,
  sub_cou_isaactive: true,
};

const PAGE_SIZE = 4;

export default function SubjectCourseManager() {
  const SUBJECT_COURSE_API = joinUrl(config.SUBJECT_COURSE_ROUTE);
  const COURSE_API = joinUrl(config.COURSE_ROUTE, 'all');
  const SUBJECT_API = joinUrl(config.SUBJECT_ROUTE, 'st');

  const [form, setForm] = useState(initialForm);
  const [subjectCourses, setSubjectCourses] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([fetchSubjectCourses(), fetchCourses(), fetchSubjects()])
      .catch(() => {
        setError('Error loading data');
        setLoading(false);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSubjectCourses = async () => {
    const res = await axios.get(SUBJECT_COURSE_API);
    setSubjectCourses(pickArray(res.data));
  };

  const fetchCourses = async () => {
    const res = await axios.get(COURSE_API);
    setCourses(pickArray(res.data));
  };

  const fetchSubjects = async () => {
    const res = await axios.get(SUBJECT_API);
    setSubjects(pickArray(res.data?.subjects ?? res.data));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // ✅ if Is Elective toggled off, clear the elective group id locally
    if (name === 'sub_cou_iselective') {
      setForm((prev) => ({
        ...prev,
        sub_cou_iselective: checked,
        sub_cou_electivegroupid: checked ? prev.sub_cou_electivegroupid : '',
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // ✅ build payload that sends NULL for elective group when not needed
  const buildPayload = (f) => {
    const cleaned = { ...f };

    // If not elective OR empty field => send null to DB
    const raw = (cleaned.sub_cou_electivegroupid ?? '').toString().trim();
    cleaned.sub_cou_electivegroupid =
      cleaned.sub_cou_iselective && raw !== '' ? raw : null;

    // Optional: trim simple string fields
    cleaned.sub_cou_id = cleaned.sub_cou_id?.toString().trim();
    cleaned.sub_cou_mast_id = cleaned.sub_cou_mast_id?.toString().trim();
    cleaned.sub_cou_mast_sub_id = cleaned.sub_cou_mast_sub_id?.toString().trim();
    cleaned.sub_cou_sem_no = cleaned.sub_cou_sem_no?.toString().trim();

    return cleaned;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const payload = buildPayload(form); // ✅ use normalized payload

      if (editMode) {
        await axios.put(joinUrl(SUBJECT_COURSE_API, form.sub_cou_id), payload);
        setMsg('Subject course updated.');
      } else {
        await axios.post(SUBJECT_COURSE_API, payload);
        setMsg('Subject course added.');
      }
      setForm(initialForm);
      setEditMode(false);
      setShowForm(false);
      fetchSubjectCourses();
    } catch (err) {
      console.error(err);
      setError('Failed to save. Check console for errors.');
    }
  };

  const handleEdit = (course) => {
    // ✅ make sure null from DB displays as empty string in the input
    setForm({
      ...initialForm,
      ...course,
      sub_cou_electivegroupid: course.sub_cou_electivegroupid ?? '',
    });
    setEditMode(true);
    setShowForm(true);
    setMsg('');
    setError('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await axios.delete(joinUrl(SUBJECT_COURSE_API, id));
      fetchSubjectCourses();
      setMsg('Subject course deleted.');
    } catch (err) {
      console.error(err);
      setError('Failed to delete. Check console for errors.');
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setForm(initialForm);
    setShowForm(false);
    setError('');
    setMsg('');
  };

  // Filter + pagination
  const filteredCourses = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return subjectCourses;
    return subjectCourses.filter((course) =>
      [
        course.sub_cou_id,
        course.sub_cou_mast_id,
        course.sub_cou_mast_sub_id,
        course.sub_cou_sem_no,
        course.sub_cou_electivegroupid,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .some((txt) => txt.includes(s))
    );
  }, [subjectCourses, query]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = filteredCourses.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  /* ===== earlier: compute next ID whenever list changes (kept; harmless even without Add button) ===== */
  const nextSubjectCourseId = useMemo(
    () => getNextSubjectCourseId(subjectCourses),
    [subjectCourses]
  );
  /* ============================================================= */

  if (loading)
    return (
      <div className="mu-page">
        <div className="mu-title">Subject Course Manager</div>
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">
            <div className="mu-tablecard">
              <div className="mu-td mu-empty">Loading data...</div>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="mu-page">
      {(msg || error) && (
        <div className="toast-wrapper">
          <div className={`toast-box ${error ? 'toast--error' : ''}`}>
            <span className="toast-emoji">{error ? '⚠️' : '✅'}</span>
            <span className="toast-text">{error || msg}</span>
            <button
              className="toast-close"
              onClick={() => {
                setMsg('');
                setError('');
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <h1 className="mu-title">DPT/PRG to SUB/COR</h1>

      {/* Toolbar with Search (Add button removed as requested) */}
      <div className="mu-toolbar">
        <label className="searchbox" aria-label="Search subject courses">
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
        {/* Add button removed – no other logic touched */}
      </div>

      {/* Table Card */}
      <div className="mu-tablewrap-outer">
        <div className="mu-tablewrap">
          <div className="mu-tablecard" style={{ overflow: 'visible' }}>
            <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
              <table className="mu-table">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">ID</th>
                    <th className="mu-th">Program Set Up</th>
                    <th className="mu-th">Course</th>
                    <th className="mu-th">Semester</th>
                    <th className="mu-th">Elective</th>
                    <th className="mu-th">Elective Group</th>
                    <th className="mu-th">Lab</th>
                    <th className="mu-th">Active</th>
                    <th className="mu-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td className="mu-td mu-empty" colSpan={9}>
                        No subject courses found.
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((course) => (
                      <tr key={course.sub_cou_id}>
                        <td className="mu-td">{course.sub_cou_id}</td>
                        <td className="mu-td">{course.sub_cou_mast_id}</td>
                        <td className="mu-td">{course.sub_cou_mast_sub_id}</td>
                        <td className="mu-td">{course.sub_cou_sem_no}</td>
                        <td className="mu-td">{course.sub_cou_iselective ? 'Yes' : 'No'}</td>
                        <td className="mu-td">{course.sub_cou_electivegroupid ?? ''}</td>
                        <td className="mu-td">{course.sub_cou_islab ? 'Yes' : 'No'}</td>
                        <td className="mu-td">{course.sub_cou_isaactive ? 'Yes' : 'No'}</td>
                        <td className="mu-td">
                          <button className="btn btn--primary" onClick={() => handleEdit(course)}>
                            Edit
                          </button>
                          <button className="btn btn--danger" onClick={() => handleDelete(course.sub_cou_id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="mu-pagination mu-pagination--chips">
              <span className="mu-pageinfo mu-pageinfo--chips">{`Showing page ${page} of ${totalPages} pages`}</span>
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
          </div>
        </div>
      </div>

      {/* Add/Edit Modal (still used for Edit; Add button removed so this opens only via Edit) */}
      {showForm && (
        <div className="modal-overlay" onClick={handleCancel}>
          <form className="modal modal--wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <button type="button" className="modal-x" onClick={handleCancel}>
              ×
            </button>
            <h3 className="modal-heading">{editMode ? 'Edit Subject Course' : 'Add Subject Course'}</h3>
            <div className="form-grid form-grid--3">
              <div className="form-row">
                <label className="form-label">ID</label>
                <input
                  className="form-input"
                  name="sub_cou_id"
                  value={form.sub_cou_id}
                  onChange={handleChange}
                  disabled
                  required
                />
              </div>
              <div className="form-row">
                <label className="form-label">Program Set up</label>
                <select
                  className="form-input"
                  name="sub_cou_mast_id"
                  value={form.sub_cou_mast_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Select Course --</option>
                  {Array.isArray(courses) &&
                    courses.map((course) => (
                      <option key={course.courseid} value={course.courseid}>
                        {course.coursename || course.courseid}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-row">
                <label className="form-label">Course</label>
                <select
                  className="form-input"
                  name="sub_cou_mast_sub_id"
                  value={form.sub_cou_mast_sub_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Select Subject --</option>
                  {Array.isArray(subjects) &&
                    subjects.map((subject) => (
                      <option key={subject.subjectid} value={subject.subjectid}>
                        {subject.subjectid} — {subject.subjectname || subject.subjectcoursetype || ''}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-row">
                <label className="form-label">Semester No</label>
                <input
                  className="form-input"
                  name="sub_cou_sem_no"
                  value={form.sub_cou_sem_no}
                  onChange={handleChange}
                />
              </div>
              <div className="form-row">
                <label className="form-label">
                  <input
                    type="checkbox"
                    name="sub_cou_iselective"
                    checked={form.sub_cou_iselective}
                    onChange={handleChange}
                  />{' '}
                  Is Elective
                </label>
              </div>
              <div className="form-row">
                <label className="form-label">Elective Group ID</label>
                <input
                  className="form-input"
                  name="sub_cou_electivegroupid"
                  value={form.sub_cou_electivegroupid ?? ''}
                  onChange={handleChange}
                  disabled={!form.sub_cou_iselective}
                />
              </div>
              <div className="form-row">
                <label className="form-label">
                  <input
                    type="checkbox"
                    name="sub_cou_islab"
                    checked={form.sub_cou_islab}
                    onChange={handleChange}
                  />{' '}
                  Is Lab
                </label>
              </div>
              <div className="form-row">
                <label className="form-label">
                  <input
                    type="checkbox"
                    name="sub_cou_isaactive"
                    checked={form.sub_cou_isaactive}
                    onChange={handleChange}
                  />{' '}
                  Is Active
                </label>
              </div>
            </div>
            {!!error && <div className="modal-desc modal-desc--error">{error}</div>}
            {!!msg && <div className="modal-desc modal-desc--ok">{msg}</div>}
            <div className="modal-actions">
              <button type="submit" className="btn btn--primary">
                {editMode ? 'Update' : 'Add'} Subject Course
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
