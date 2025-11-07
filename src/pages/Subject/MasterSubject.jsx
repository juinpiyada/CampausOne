import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css'; // shared styles

/** ---------- tiny helpers ---------- */
const joinUrl = (base, path = '') =>
  path ? `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}` : String(base);

const range = (n) => Array.from({ length: Math.max(0, Number(n) || 0) }, (_, i) => i + 1);
const uniqueNums = (arr) => Array.from(new Set(arr.filter(n => Number.isFinite(n)))).sort((a,b)=>a-b);
const parseSemFromId = (courseid) => {
  const m = String(courseid || '').match(/_S(\d{1,2})$/i);
  if (!m) return null;
  const s = Number(m[1]);
  return Number.isFinite(s) ? s : null;
};
function deriveSemesterOptionsForDept(courses, deptId) {
  const list = (courses || []).filter(c => String(c.collegedept) === String(deptId));
  if (list.length === 0) return range(12);
  // prefer explicit totals if they exist on any row
  const totals = uniqueNums(list.map(c => Number(c.course_totsemester)).filter(n => n > 0));
  if (totals.length) return range(Math.max(...totals));
  // else fall back to suffixes in IDs (…_S01, …_S02, …)
  const suffixes = uniqueNums(list.map(c => parseSemFromId(c.courseid)).filter(n => n > 0));
  if (suffixes.length) return suffixes;
  return range(12);
}

/** ---------- Semester persistence (client-only) ---------- */
const SEM_STORE_KEY = 'sms_subject_semesters_v1';
const loadSemesterMap = () => {
  try { return JSON.parse(localStorage.getItem(SEM_STORE_KEY) || '{}') || {}; }
  catch { return {}; }
};
const saveSemesterMap = (map) => {
  try { localStorage.setItem(SEM_STORE_KEY, JSON.stringify(map || {})); } catch {}
};
// prefer backend fields; fall back to locally stored value
const readSemesterFromRow = (row) =>
  row?.subjectsemester ?? row?.semester ?? row?._localSemester ?? '';

/** ---------- Toast (same as AddCollege.jsx) ---------- */
function Toast({ show, message, type, onClose }) {
  if (!show) return null;
  return (
    <div className="toast-wrapper">
      <div className={`toast-box ${type === 'error' ? 'toast--error' : ''}`}>
        <span className="toast-emoji">{type === 'error' ? '❌' : '✔️'}</span>
        <span className="toast-text">{message}</span>
        <button className="toast-close" onClick={onClose} aria-label="Close toast">×</button>
      </div>
    </div>
  );
}

/** ---------- Reusable Fields ---------- */
function Field({ label, name, type = 'text', value, onChange, required = true, disabled = false }) {
  return (
    <div className="form-row">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}
function SelectField({ label, name, value, onChange, options }) {
  return (
    <div className="form-row">
      <label className="form-label">{label}</label>
      <select className="form-input" name={name} value={value} onChange={onChange} required>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/** ---------- Add/Edit Modal (inner .modal only; overlay rendered by parent) ---------- */
function SubjectFormModal({
  editing,
  form,
  setForm,
  departments,
  semesterOptions,
  onDeptChange,
  onClose,
  onSubmit,
  loading,
  error,
}) {
  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    if (name === 'subjectdeptid') onDeptChange && onDeptChange(value);
  };
  const handleNumberChange = (e) => {
    const { name, value } = e.target;
    if (value === '' || Number(value) >= 0) setForm(f => ({ ...f, [name]: value }));
  };

  return (
    <div className="modal modal--wide">
      <button className="modal-x" type="button" onClick={onClose}>×</button>
      <h2 className="modal-heading">{editing ? 'Edit Subject' : 'Add Course/Subject'}</h2>

      <form onSubmit={onSubmit} autoComplete="off">
        <div className="form-grid form-grid--3">
          <Field label="Course ID/Subject ID" name="subjectid" value={form.subjectid} onChange={handleChange} disabled />
          <Field label="Code" name="subjectcode" value={form.subjectcode} onChange={handleChange} />
          <Field label="Description" name="subjectdesc" value={form.subjectdesc} onChange={handleChange} />

          <Field label="Credits" name="subjectcredits" type="number" value={form.subjectcredits} onChange={handleNumberChange} required={false} />

          {/* Always present */}
          <SelectField
            label="Course Type"
            name="subjectcoursetype"
            value={form.subjectcoursetype}
            onChange={handleChange}
            options={[
              { value: '', label: 'Select Course Type' },
              { value: 'Mandatory', label: 'Mandatory' },
              { value: 'Elective', label: 'Elective' },
            ]}
          />
          <SelectField
            label="Category"
            name="subjectcategory"
            value={form.subjectcategory}
            onChange={handleChange}
            options={[
              { value: '', label: 'Select Category' },
              { value: 'Lab', label: 'Lab' },
              { value: 'Theory', label: 'Theory' },
              { value: 'Session', label: 'Session' },
            ]}
          />
          {/* Conditional fields by Category */}
          {form.subjectcategory === 'Theory' && (
            <>
              <Field label="Lecture Hrs"  name="subjectlecturehrs"  type="number" value={form.subjectlecturehrs}  onChange={handleNumberChange} required={false} />
              <Field label="Tutorial Hrs"  name="subjecttutorialhrs" type="number" value={form.subjecttutorialhrs} onChange={handleNumberChange} required={false} />
            </>
          )}
          {form.subjectcategory === 'Lab' && (
            <>
              <Field label="Practical Hrs" name="subjectpracticalhrs" type="number" value={form.subjectpracticalhrs} onChange={handleNumberChange} required={false} />
              <Field label="Tutorial Hrs"  name="subjecttutorialhrs" type="number" value={form.subjecttutorialhrs} onChange={handleNumberChange} required={false} />
            </>
          )}
          {form.subjectcategory === 'Session' && (
            <Field label="Tutorial Hrs" name="subjecttutorialhrs" type="number" value={form.subjecttutorialhrs} onChange={handleNumberChange} required={false} />
          )}

          {/* Department + Semester */}
          <SelectField
            label="Department/Program"
            name="subjectdeptid"
            value={form.subjectdeptid}
            onChange={handleChange}
            options={[
              { value: '', label: 'Select Dept' },
              // ▼ show description as the visible text; keep ID as value
              ...departments.map(d => ({ value: d.collegedeptid, label: d.collegedeptdesc })),
            ]}
          />
          <SelectField
            label="Semester"
            name="subjectsemester"
            value={form.subjectsemester}
            onChange={handleChange}
            options={[
              { value: '', label: 'Select Semester' },
              ...semesterOptions.map(s => ({ value: String(s), label: String(s) })),
            ]}
          />

          <div className="form-row">
            <label className="form-label" htmlFor="subjectactive">Active</label>
            <input
              id="subjectactive"
              className="form-input"
              type="checkbox"
              name="subjectactive"
              checked={!!form.subjectactive}
              onChange={handleChange}
            />
          </div>
        </div>

        {!!error && <div className="modal-desc modal-desc--error">{error}</div>}

        <button type="submit" className={`btn btn--submit ${loading ? 'is-loading' : ''}`} disabled={loading}>
          {loading ? (editing ? 'Updating...' : 'Adding...') : editing ? 'Update Subject' : 'Add Subject'}
        </button>
        <button type="button" className="btn btn--close-fullwidth" onClick={onClose}>Close</button>
      </form>
    </div>
  );
}

/** ---------- Delete Modal (inner .modal only; overlay rendered by parent) ---------- */
function DeleteConfirmModal({ pendingDelete, onConfirm, onCancel }) {
  if (!pendingDelete) return null;
  return (
    <div className="modal">
      <button className="modal-x" onClick={onCancel}>×</button>
      <div className="modal-title danger">Delete Subject?</div>
      <div className="modal-desc">
        Are you sure you want to delete subject:{' '}
        <a href="#!" onClick={(e) => e.preventDefault()}>
          {pendingDelete.subjectdesc || pendingDelete.subjectid}
        </a>{' '}
        ?
      </div>
      <div className="modal-actions">
        <button className="btn btn--danger" onClick={onConfirm}>Yes, Delete</button>
        <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** ---------- Main ---------- */
export default function MasterSubject() {
  const [subjects, setSubjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]); // for semester derivation
  const [semesterOptions, setSemesterOptions] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    subjectid: '',
    subjectcode: '',
    subjectdesc: '',
    subjectcredits: '',
    subjectlecturehrs: '',
    subjecttutorialhrs: '',
    subjectpracticalhrs: '',
    subjectcoursetype: '',
    subjectcategory: '',
    subjectdeptid: '',
    subjectsemester: '',
    subjectactive: true,
  });
  const [loading, setLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Toast (same pattern as AddCollege.jsx)
  const [toast, setToast] = useState({ show: false, type: '', message: '' });
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: '', message: '' }), 2000);
  };

  // search + pagination
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  // delete confirmation
  const [pendingDelete, setPendingDelete] = useState(null);

  // endpoints
  const SUBJECT_LIST_URL   = joinUrl(config.SUBJECT_ROUTE, 'list');
  const SUBJECT_ADD_URL    = joinUrl(config.SUBJECT_ROUTE, 'add');
  const SUBJECT_UPDATE_URL = id => joinUrl(config.SUBJECT_ROUTE, `update/${encodeURIComponent(id)}`);
  const SUBJECT_DELETE_URL = id => joinUrl(config.SUBJECT_ROUTE, `delete/${encodeURIComponent(id)}`);
  const DEPARTMENTS_URL    = joinUrl(config.MASTER_DEPTS_ROUTE);
  const COURSE_ALL_URL     = joinUrl(config.COURSE_ROUTE, 'all');

  const attachLocalSemester = (rows) => {
    const map = loadSemesterMap();
    return rows.map(r => ({
      ...r,
      _localSemester: map[r.subjectid] ?? r.subjectsemester ?? r.semester ?? ''
    }));
  };

  const fetchSubjects = async () => {
    setLoading(true);
    try {
      const res = await axios.get(SUBJECT_LIST_URL);
      const rows = res.data?.subjects ?? res.data ?? [];
      setSubjects(attachLocalSemester(rows));
    } catch {
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };
  const fetchDepartments = async () => {
    try {
      const res = await axios.get(DEPARTMENTS_URL);
      setDepartments(res.data ?? []);
    } catch {
      setDepartments([]);
    }
  };
  const fetchCourses = async () => {
    try {
      const res = await axios.get(COURSE_ALL_URL);
      setCourses(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCourses([]);
    }
  };

  useEffect(() => {
    fetchSubjects();
    fetchDepartments();
    fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeptChangeForSem = (deptId) => {
    const opts = deriveSemesterOptionsForDept(courses, deptId);
    setSemesterOptions(opts);
    if (!opts.map(String).includes(String(form.subjectsemester))) {
      setForm(f => ({ ...f, subjectsemester: '' }));
    }
  };
  useEffect(() => {
    if (form.subjectdeptid) handleDeptChangeForSem(form.subjectdeptid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

  useEffect(() => { setPage(1); }, [query]);

  /** Build a quick index for departments to resolve descriptions */
  const deptIndex = useMemo(() => {
    const m = Object.create(null);
    (departments || []).forEach(d => {
      if (d && d.collegedeptid != null) m[String(d.collegedeptid)] = d;
    });
    return m;
  }, [departments]);

  const getDeptDesc = (row) => {
    const id = String(row?.subjectdeptid ?? '');
    return (
      deptIndex[id]?.collegedeptdesc ||
      row?.collegedeptdesc || // in case API already denormalized it
      id || ''
    );
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(s => {
      const id = String(s.subjectid ?? '').toLowerCase();
      const code = String(s.subjectcode ?? '').toLowerCase();
      const desc = String(s.subjectdesc ?? '').toLowerCase();
      const cat = String(s.subjectcategory ?? '').toLowerCase();
      const deptId = String(s.subjectdeptid ?? '').toLowerCase();
      const deptDesc = String(getDeptDesc(s) ?? '').toLowerCase(); // include dept description in search
      const ctype = String(s.subjectcoursetype ?? '').toLowerCase();
      const sem = String(readSemesterFromRow(s) ?? '').toLowerCase();
      return (
        id.includes(q) || code.includes(q) || desc.includes(q) ||
        cat.includes(q) || deptId.includes(q) || deptDesc.includes(q) ||
        ctype.includes(q) || sem.includes(q)
      );
    });
  }, [subjects, query, deptIndex]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  const handleSubmit = async e => {
    e.preventDefault();
    setModalError('');
    setLoading(true);

    if (!form.subjectid || !form.subjectcode || !form.subjectdesc) {
      setModalError('Subject ID, Code, and Description are required.');
      setLoading(false);
      return;
    }

    // keep your existing payload (no API changes required)
    const cleanForm = {
      ...form,
      subjectcredits:      form.subjectcredits      === '' ? null : Number(form.subjectcredits),
      subjectlecturehrs:   form.subjectlecturehrs   === '' ? null : Number(form.subjectlecturehrs),
      subjecttutorialhrs:  form.subjecttutorialhrs  === '' ? null : Number(form.subjecttutorialhrs),
      subjectpracticalhrs: form.subjectpracticalhrs === '' ? null : Number(form.subjectpracticalhrs),
      // still send number if backend wants to store it; harmless if ignored
      subjectsemester:     form.subjectsemester     === '' ? null : Number(form.subjectsemester),
    };

    try {
      if (editing) {
        await axios.put(SUBJECT_UPDATE_URL(form.subjectid), cleanForm);
        showToast('success', 'Subject updated successfully!');
      } else {
        await axios.post(SUBJECT_ADD_URL, cleanForm);
        showToast('success', 'Subject added successfully!');
      }

      // persist semester locally by subjectid (so it shows in table)
      const map = loadSemesterMap();
      map[form.subjectid] = cleanForm.subjectsemester ?? '';
      saveSemesterMap(map);

      setShowModal(false);
      setEditing(false);
      setForm({
        subjectid: '',
        subjectcode: '',
        subjectdesc: '',
        subjectcredits: '',
        subjectlecturehrs: '',
        subjecttutorialhrs: '',
        subjectpracticalhrs: '',
        subjectcoursetype: '',
        subjectcategory: '',
        subjectdeptid: '',
        subjectsemester: '',
        subjectactive: true,
      });
      // refresh list (re-attaches local semester)
      fetchSubjects();
    } catch (err) {
      setModalError(err.response?.data?.error || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClick = () => {
    setForm({
      subjectid: generateSubjectId(),
      subjectcode: '',
      subjectdesc: '',
      subjectcredits: '',
      subjectlecturehrs: '',
      subjecttutorialhrs: '',
      subjectpracticalhrs: '',
      subjectcoursetype: '',
      subjectcategory: '',
      subjectdeptid: '',
      subjectsemester: '',
      subjectactive: true,
    });
    setSemesterOptions([]);
    setEditing(false);
    setShowModal(true);
    setModalError('');
  };

  const handleEditClick = (subj) => {
    // prefill semester from backend or local store
    const preSem = String(readSemesterFromRow(subj) ?? '');
    setForm({
      ...subj,
      subjectactive:
        subj.subjectactive === true || subj.subjectactive === 'true' || subj.subjectactive === 1,
      subjectsemester: preSem,
    });
    handleDeptChangeForSem(subj.subjectdeptid || '');
    setEditing(true);
    setShowModal(true);
    setModalError('');
  };

  // delete flow with toast (same feel as College)
  const requestDelete = (subj) => setPendingDelete(subj);
  const deleteSubject = async (id) => {
    try {
      await axios.delete(SUBJECT_DELETE_URL(id));
      // also remove local semester mapping
      const map = loadSemesterMap();
      if (id in map) { delete map[id]; saveSemesterMap(map); }
      setSubjects(ss => ss.filter(d => d.subjectid !== id));
      showToast('success', 'Subject deleted successfully!');
    } catch {
      alert('Failed to delete subject');
    }
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteSubject(pendingDelete.subjectid);
    setPendingDelete(null);
  };
  const cancelDelete = () => setPendingDelete(null);

  const generateSubjectId = () => {
    const subjectCount = subjects.length + 1;
    return `SUB_ID_${subjectCount.toString().padStart(3, '0')}`;
  };

  return (
    <div className="mu-page">
      {/* Toast like AddCollege */}
      <Toast {...toast} onClose={() => setToast({ ...toast, show: false })} />

      {/* Title */}
      <h1 className="mu-title">Course / Subject</h1>

      {/* Toolbar (same markup/classes as AddCollege.jsx) */}
      <div className="mu-toolbar">
        <div className="searchbox">
          <span className="searchbox__icon" aria-hidden="true">
            <svg width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            className="searchbox__input"
            placeholder="Search"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <button className="btn btn--add" onClick={handleAddClick}>
          <span className="btn-plus">+</span> Add
        </button>
      </div>

      {/* Add/Edit Modal (overlay wrapper same as AddCollege.jsx) */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <SubjectFormModal
              editing={editing}
              form={form}
              setForm={setForm}
              departments={departments}
              semesterOptions={semesterOptions}
              onDeptChange={handleDeptChangeForSem}
              onClose={() => setShowModal(false)}
              onSubmit={handleSubmit}
              loading={loading}
              error={modalError}
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mu-tablewrap-outer">
        <div className="mu-tablewrap">
          <div className="mu-tablecard" style={{ overflow: 'visible' }}>
            <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
              <table className="mu-table">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">Subject ID</th>
                    <th className="mu-th">Code</th>
                    <th className="mu-th">Description</th>
                    <th className="mu-th">Credits</th>
                    <th className="mu-th">Lecture Hrs</th>
                    <th className="mu-th">Tutorial Hrs</th>
                    <th className="mu-th">Practical Hrs</th>
                    <th className="mu-th">Course Type</th>
                    <th className="mu-th">Category</th>
                    <th className="mu-th">Dept Name</th>
                    <th className="mu-th">Semester</th>
                    <th className="mu-th">Active</th>
                    <th className="mu-th" style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.length === 0 ? (
                    <tr>
                      <td className="mu-empty" colSpan={13}>
                        {loading ? 'Loading...' : 'No subjects found'}
                      </td>
                    </tr>
                  ) : (
                    currentItems.map(subj => (
                      <tr key={subj.subjectid}>
                        <td className="mu-td">{subj.subjectid}</td>
                        <td className="mu-td">{subj.subjectcode}</td>
                        <td className="mu-td">{subj.subjectdesc}</td>
                        <td className="mu-td">{subj.subjectcredits}</td>
                        <td className="mu-td">{subj.subjectlecturehrs}</td>
                        <td className="mu-td">{subj.subjecttutorialhrs}</td>
                        <td className="mu-td">{subj.subjectpracticalhrs}</td>
                        <td className="mu-td">{subj.subjectcoursetype}</td>
                        <td className="mu-td">{subj.subjectcategory}</td>
                        {/* ▼ Dept ID column shows collegedeptdesc (falls back to ID) */}
                        <td className="mu-td">{getDeptDesc(subj)}</td>
                        {/* 👇 shows semester from backend or from local saved value */}
                        <td className="mu-td">{readSemesterFromRow(subj) || ''}</td>
                        <td className="mu-td">{subj.subjectactive ? 'Yes' : 'No'}</td>
                        <td className="mu-td">
                          <button className="btn btn--primary" onClick={() => handleEditClick(subj)}>Edit</button>
                          <button className="btn btn--danger" onClick={() => requestDelete(subj)}>Delete</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination (chips style like other pages) */}
            <div className="mu-pagination mu-pagination--chips">
              <div className="mu-pageinfo mu-pageinfo--chips">Showing page {page} of {totalPages} pages</div>
              <div className="mu-pagebtns mu-pagebtns--chips">
                <button className="pagechip" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} title="Previous">«</button>
                <span className="pagechip pagechip--active">{page}</span>
                <button className="pagechip" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} title="Next">»</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation (overlay same as AddCollege.jsx) */}
      {pendingDelete && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div onClick={(e) => e.stopPropagation()}>
            <DeleteConfirmModal
              pendingDelete={pendingDelete}
              onConfirm={confirmDelete}
              onCancel={cancelDelete}
            />
          </div>
        </div>
      )}
    </div>
  );
}