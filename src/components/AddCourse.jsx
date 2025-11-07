// SMS-ui/src/components/AddCourse.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import config from '../config/middleware_config.js';
import '../index.css';

// ---- Safe URL joiner (prevents double slashes & respects absolute paths)
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

/* ----------------------------------------------
   Helpers
---------------------------------------------- */
function getInitialForm() {
  return {
    courseid: '',
    coursedesc: '',
    collegedept: '',           // stores DEPT ID (value in <select>)
    courseprgcod: '',
    course_totsemester: '',
    // store AY id here
    course_duration: '',
    // auto-filled when AY selected
    coursestartdate: '',
    courseenddate: ''
  };
}

// Auto-generate next CourseID like "CRS_001" or "COURSE_###"
function getNextCourseId(list = []) {
  let preferredPrefix = 'CRS_';
  let maxNum = 0;
  for (const c of list) {
    const raw = String(c?.courseid || '');
    const m = raw.match(/^(CRS_|COURSE_)(\d{3,})(?:_S\d{2})?$/i);
    if (m) {
      const prefix = m[1].toUpperCase();
      const num = parseInt(m[2], 10);
      if (!Number.isNaN(num) && num > maxNum) {
        maxNum = num;
        preferredPrefix = prefix;
      }
    }
  }
  const next = String(maxNum + 1).padStart(3, '0');
  return `${preferredPrefix}${next}`;
}

// Normalize yyyy-mm-dd for <input type="date">
const toDateInput = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const toDateOrNull = (val) => (val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null);
const toNumOrNull = (val) => (val === '' ? null : Number(val));

// Build per-semester course id: CRS_001_S01, CRS_001_S02, ...
function idForSemester(baseId, semIndex) {
  const s = String(semIndex).padStart(2, '0');
  const replaced = String(baseId).replace(/_S\d{2}$/i, '');
  return `${replaced}_S${s}`;
}

// Decorate description with semester suffix (non-destructive)
function descForSemester(desc, semIndex) {
  const clean = String(desc || '').replace(/\s*\(Sem\s*\d+\)\s*$/i, '').trim();
  return `${clean} (Sem ${semIndex})`;
}

export default function AddCourse({ showTable = true }) {
  const [form, setForm] = useState(getInitialForm());
  const [departments, setDepartments] = useState([]); // each: { collegedeptid, collegedeptdesc?, colldept_code? }
  const [courses, setCourses] = useState([]);
  const [acadYears, setAcadYears] = useState([]); // Academic Years
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(false);

  // search + pagination
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  // delete confirmation modal
  const [pendingDelete, setPendingDelete] = useState(null);

  // Base routes from env-driven config
  const DEPT_BASE = config.MASTER_DEPTS_ROUTE;
  const COURSE_BASE = config.COURSE_ROUTE;
  const ACADYEAR_BASE = config.MASTER_ACADYEAR_ROUTE;

  // Derived endpoints
  const DEPT_SELECTOR_URL = joinUrl(DEPT_BASE, 'selector');
  const DEPT_DETAIL_URL = (id) => joinUrl(DEPT_BASE, id); // /:id
  const COURSE_ALL_URL    = joinUrl(COURSE_BASE, 'all');
  const COURSE_ADD_URL    = joinUrl(COURSE_BASE, 'add');
  const COURSE_UPDATE_URL = (id) => joinUrl(COURSE_BASE, `update/${id}`);
  const COURSE_DELETE_URL = (id) => joinUrl(COURSE_BASE, `delete/${id}`);

  // Academic Years: base '/' returns all AY rows
  const ACADYEAR_LIST_URL = joinUrl(ACADYEAR_BASE, '');

  // Fetch departments, courses, academic years
  useEffect(() => {
    fetchDepartments();
    fetchAcadYears();
    if (showTable) fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showSuccess && showTable) fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSuccess]);

  // reset to first page when query changes
  useEffect(() => setPage(1), [query]);

  const fetchDepartments = async () => {
    try {
      const res = await axios.get(DEPT_SELECTOR_URL);
      const base = Array.isArray(res.data) ? res.data : [];

      // If selector didn’t include descriptions, fetch details per id to enrich
      const needsEnrich = base.some(d => !d.collegedeptdesc);
      if (needsEnrich && base.length) {
        const detailPromises = base.map(async (d) => {
          try {
            const det = await axios.get(DEPT_DETAIL_URL(d.collegedeptid));
            const body = det?.data || {};
            return {
              ...d,
              collegedeptdesc: body.collegedeptdesc ?? d.collegedeptdesc,
              colldept_code: body.colldept_code ?? d.colldept_code
            };
          } catch {
            return d; // keep what we have
          }
        });
        const enriched = await Promise.all(detailPromises);
        setDepartments(enriched);
      } else {
        setDepartments(base);
      }
    } catch {
      setDepartments([]);
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await axios.get(COURSE_ALL_URL);
      setCourses(res.data || []);
    } catch {
      setCourses([]);
    }
  };

  const fetchAcadYears = async () => {
    try {
      const res = await axios.get(ACADYEAR_LIST_URL);
      const arr = Array.isArray(res.data) ? res.data : [];
      arr.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      setAcadYears(arr);
    } catch {
      setAcadYears([]);
    }
  };

  // change handler for generic fields
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Department selection -> fill description & program code (prefer cache; fallback to GET /:id)
  const handleDeptChange = async (e) => {
    const deptId = e.target.value; // keep ID as the value
    const dep = departments.find((d) => String(d.collegedeptid) === String(deptId));

    if (dep && dep.collegedeptdesc) {
      setForm((prev) => ({
        ...prev,
        collegedept: deptId,                                 // store ID for backend
        coursedesc: String(dep.collegedeptdesc || ''),
        courseprgcod: String(dep.colldept_code || '')
      }));
      return;
    }

    // Fallback: fetch details to obtain description/code
    try {
      const res = await axios.get(DEPT_DETAIL_URL(deptId));
      const body = res?.data || {};
      setForm((prev) => ({
        ...prev,
        collegedept: deptId,
        coursedesc: String(body.collegedeptdesc || ''),
        courseprgcod: String(body.colldept_code || '')
      }));
    } catch {
      setForm((prev) => ({
        ...prev,
        collegedept: deptId,
        coursedesc: '',
        courseprgcod: ''
      }));
    }
  };

  // AY selection handler — auto-fill dates
  const handleAYChange = (e) => {
    const chosenId = e.target.value;
    const ay = acadYears.find((a) => String(a.id) === String(chosenId));
    setForm((prev) => ({
      ...prev,
      course_duration: chosenId, // store AY id here
      coursestartdate: ay ? toDateInput(ay.collegeacadyearstartdt) : '',
      courseenddate: ay ? toDateInput(ay.collegeacadyearenddt) : ''
    }));
  };

  // Add/Edit modal handlers
  const openAddModal = () => {
    const nextId = getNextCourseId(courses);
    setForm({ ...getInitialForm(), courseid: nextId });
    setEditing(false);
    setShowModal(true);
    setMsg('');
  };

  const openEditModal = (course) => {
    const ay = acadYears.find((a) => String(a.id) === String(course.course_duration));
    setForm({
      courseid: course.courseid,
      coursedesc: course.coursedesc,
      collegedept: course.collegedept,   // whatever is stored in DB (likely ID)
      courseprgcod: course.courseprgcod || '',
      course_totsemester: course.course_totsemester || '',
      course_duration: course.course_duration || '', // AY id
      coursestartdate: course.coursestartdate
        ? String(course.coursestartdate).substring(0, 10)
        : (ay ? toDateInput(ay.collegeacadyearstartdt) : ''),
      courseenddate: course.courseenddate
        ? String(course.courseenddate).substring(0, 10)
        : (ay ? toDateInput(ay.collegeacadyearenddt) : '')
    });
    setEditing(true);
    setShowModal(true);
    setMsg('');
  };

  const closeModal = () => {
    setShowModal(false);
    setMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    // Common base payload
    const basePayload = {
      coursedesc: form.coursedesc,                  // from dept desc
      collegedept: form.collegedept || null,        // keep sending ID to backend
      courseprgcod: form.courseprgcod || null,      // from dept code (if any)
      acadyearid: form.course_duration || null,
      course_duration: form.course_duration || null,
      coursestartdate: toDateOrNull(form.coursestartdate),
      courseenddate: toDateOrNull(form.courseenddate)
    };

    try {
      if (editing) {
        const payload = {
          ...basePayload,
          courseid: form.courseid,
          course_totsemester: toNumOrNull(form.course_totsemester)
        };
        await axios.put(COURSE_UPDATE_URL(form.courseid), payload);
        setMsg('✅ Course updated successfully!');
      } else {
        const totalSem = Number(form.course_totsemester) || 1;
        const baseId = String(form.courseid || getNextCourseId(courses)).replace(/_S\d{2}$/i, '');

        if (totalSem > 1) {
          const posts = [];
          for (let s = 1; s <= totalSem; s++) {
            const payload = {
              ...basePayload,
              courseid: idForSemester(baseId, s),
              coursedesc: descForSemester(basePayload.coursedesc, s),
              course_totsemester: s
            };
            posts.push(axios.post(COURSE_ADD_URL, payload));
          }
          await Promise.all(posts);
          setMsg(`✅ Created ${totalSem} semester-wise courses from base ID ${baseId}.`);
        } else {
          const payload = {
            ...basePayload,
            courseid: baseId,
            course_totsemester: toNumOrNull(form.course_totsemester) ?? 1
          };
          await axios.post(COURSE_ADD_URL, payload);
          setMsg('✅ Course added successfully!');
        }
      }

      setShowSuccess(true);
      setShowModal(false);
      setEditing(false);
      setForm(getInitialForm());
      fetchCourses();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.detail || err.response?.data?.error || 'Failed to save course'));
    }
    setLoading(false);
  };

  // delete flow
  const requestDelete = (course) => setPendingDelete(course);
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await axios.delete(COURSE_DELETE_URL(pendingDelete.courseid));
      setCourses((prev) => prev.filter((c) => c.courseid !== pendingDelete.courseid));
      setPendingDelete(null);
    } catch {
      alert('Failed to delete course');
    }
  };
  const cancelDelete = () => setPendingDelete(null);

  // search + pagination helpers
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => {
      const id = String(c.courseid ?? '').toLowerCase();
      const desc = String(c.coursedesc ?? '').toLowerCase();
      const dept = String(c.collegedept ?? '').toLowerCase(); // DB may have ID; that’s okay
      const prg = String(c.courseprgcod ?? '').toLowerCase();
      const duration = String(c.course_duration ?? '').toLowerCase(); // AY id shown here
      return (
        id.includes(q) ||
        desc.includes(q) ||
        dept.includes(q) ||
        prg.includes(q) ||
        duration.includes(q)
      );
    });
  }, [courses, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // Reusable Field
  function Field({ label, name, type, value, onChange, min, required = false, readOnly = false }) {
    return (
      <div className="form-row">
        <label className="form-label">{label}</label>
        <input
          className="form-input"
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          min={min}
          required={required}
          readOnly={readOnly}
        />
      </div>
    );
  }

  // Modal
  function CourseModal() {
    if (!showModal) return null;
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
          <button className="modal-x" onClick={closeModal}>×</button>
          <h2 className="modal-heading">{editing ? 'Edit Course' : 'Add Depertment / Program'}</h2>

          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="form-grid form-grid--3">
              {/* ID */}
              <Field
                label="Course ID"
                name="courseid"
                type="text"
                value={form.courseid}
                onChange={handleChange}
                required={!editing}
              />

              {/* Department (show description, value is ID) */}
              <div className="form-row">
                <label className="form-label">Department</label>
                <select
                  className="form-input"
                  name="collegedept"
                  value={form.collegedept}
                  onChange={handleDeptChange}
                  required
                >
                  <option value="">Select Dept</option>
                  {departments.map((dep) => (
                    <option key={dep.collegedeptid} value={dep.collegedeptid}>
                      {dep.collegedeptdesc ?? dep.collegedeptid}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description (read-only, auto-filled from Dept) */}
              <div className="form-row">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  name="coursedesc"
                  value={form.coursedesc}
                  readOnly
                  rows={2}
                  onChange={() => {}}
                />
              </div>

              {/* Program Code (read-only, auto-filled from Dept) */}
              <Field
                label="Program Code"
                name="courseprgcod"
                type="text"
                value={form.courseprgcod}
                onChange={() => {}}
                readOnly
              />

              {/* Total Semesters (or single semester number when adding) */}
              <Field
                label="Total Semesters"
                name="course_totsemester"
                type="number"
                min="0"
                value={form.course_totsemester}
                onChange={handleChange}
              />

              {/* Academic Year (stores into course_duration) */}
              <div className="form-row">
                <label className="form-label">Duration</label>
                <select
                  className="form-input"
                  name="course_duration"
                  value={form.course_duration}
                  onChange={handleAYChange}
                  required
                >
                  <option value="">Select Academic Year ID</option>
                  {acadYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>
                      {ay.id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start & End — auto-filled from AY, editable if needed */}
              <Field
                label="Start Date"
                name="coursestartdate"
                type="date"
                value={form.coursestartdate}
                onChange={handleChange}
                required
              />
              <Field
                label="End Date"
                name="courseenddate"
                type="date"
                value={form.courseenddate}
                onChange={handleChange}
                required
              />
            </div>

            {msg && (
              <div
                className={`modal-desc ${msg.startsWith('✅') ? 'modal-desc--ok' : 'modal-desc--error'}`}
                style={{ textAlign: 'center' }}
              >
                {msg}
              </div>
            )}

            <button type="submit" disabled={loading} className={`btn btn--submit ${loading ? 'is-loading' : ''}`}>
              {loading ? 'Saving...' : (editing ? 'Update Course' : 'Save')}
            </button>
            <button type="button" className="btn btn--close-fullwidth" onClick={closeModal}>
              Close
            </button>
          </form>
        </div>
      </div>
    );
  }

  function DeleteConfirmModal() {
    if (!pendingDelete) return null;
    return (
      <div className="modal-overlay" onClick={cancelDelete}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-x" onClick={cancelDelete}>×</button>
          <div className="modal-title danger">Delete Course?</div>
          <div className="modal-desc">
            Are you sure you want to delete course:{' '}
            <a href="#!" onClick={(e) => e.preventDefault()}>
              {pendingDelete.coursedesc || pendingDelete.courseid}
            </a>{' '}
            ?
          </div>
          <div className="modal-actions">
            <button className="btn btn--danger" onClick={confirmDelete}>Yes, Delete</button>
            <button className="btn btn--secondary" onClick={cancelDelete}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  function SuccessModal() {
    if (!showSuccess) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowSuccess(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-x" onClick={() => setShowSuccess(false)}>×</button>
          <div className="modal-title">Success!</div>
          <div className="modal-desc modal-desc--ok">{msg}</div>
          <div className="modal-actions">
            <button className="btn btn--secondary" onClick={() => setShowSuccess(false)}>OK</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mu-page">
      <div className="mu-container">
        <h1 className="mu-title">Program / Department Setup</h1>

        {/* Toolbar */}
        <div className="mu-toolbar">
          <div className="searchbox">
            <span className="searchbox__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              className="searchbox__input"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn--add" onClick={openAddModal}>
            <span className="btn-plus">+</span> Add
          </button>
        </div>

        {/* Table */}
        {showTable && (
          <div className="mu-tablewrap-outer">
            <div className="mu-tablewrap">

              <div className="mu-tablecard">
                <table className="mu-table">
                  <thead>
                    <tr className="mu-thead-row">
                      <th className="mu-th">ID</th>
                      <th className="mu-th">Description</th>
                      <th className="mu-th">Dept</th>
                      <th className="mu-th">Prg Code</th>
                      <th className="mu-th">Sem</th>
                      <th className="mu-th">Start</th>
                      <th className="mu-th">End</th>
                      <th className="mu-th" style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentItems.length === 0 ? (
                      <tr>
                        <td className="mu-empty" colSpan={11}>
                          {loading ? 'Loading...' : 'No courses found.'}
                        </td>
                      </tr>
                    ) : (
                      currentItems.map((course, idx) => (
                        <tr key={course.courseid || idx}>
                          <td className="mu-td">{course.courseid}</td>
                          <td className="mu-td">{course.coursedesc}</td>
                          {/* Depending on your DB, this may still be an ID for older rows */}
                          <td className="mu-td">{course.collegedept}</td>
                          <td className="mu-td">{course.courseprgcod}</td>
                          <td className="mu-td">{course.course_totsemester}</td>
                          <td className="mu-td">
                            {course.coursestartdate ? String(course.coursestartdate).substring(0,10) : ''}
                          </td>
                          <td className="mu-td">
                            {course.courseenddate ? String(course.courseenddate).substring(0,10) : ''}
                          </td>
                          <td className="mu-td">
                            <button
                              className="btn btn--primary"
                              onClick={() => openEditModal(course)}
                              title="Edit"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--danger"
                              onClick={() => requestDelete(course)}
                              title="Delete"
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

              {/* Pagination */}
              <div className="mu-pagination mu-pagination--chips">
                <div className="mu-pageinfo mu-pageinfo--chips">
                  Showing page {page} of {totalPages} pages
                </div>
                <div className="mu-pagebtns mu-pagebtns--chips">
                  <button
                    className="pagechip"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    title="Previous"
                  >
                    «
                  </button>
                  <span className="pagechip pagechip--active">{page}</span>
                  <button
                    className="pagechip"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    title="Next"
                  >
                    »
                  </button>
                </div>
              </div>
              {/* /pagination */}
            </div>
          </div>
        )}
      </div>

      {CourseModal()}
      {DeleteConfirmModal()}
      {SuccessModal()}
    </div>
  );
}