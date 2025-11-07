// SMS-ui/src/pages/CourseRegistration/CourseRegistrationManager.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css';

/* ---------- Safe URL joiner ---------- */
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

/* ---------- Constants ---------- */
const PAGE_SIZE = 4;

const emptyForm = {
  course_regis_id: '',
  course_studentid: '',
  courseofferingid: '',
  courseterm: '',
  courseisterm: '',
  course_elec_groupid: '',
  courseenrollmentdt: '',
  coursefinalgrade: '',
  courseresultstatus: '',
  courseattper: '',
  coursestatus: ''
};

/* ---------- Parsers (shape-agnostic) ---------- */
const parseRegistrations = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.registrations || data || [];
};
const parseElectives = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.subject_elec)) return data.subject_elec;
  return [];
};
const parseStudents = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.students)) return data.students;
  return [];
};
const parseOfferings = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.offerings)) return data.offerings;
  return [];
};
const parseTerms = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.years)) return data.years;
  if (Array.isArray(data?.acadyears)) return data.acadyears;
  if (Array.isArray(data?.terms)) return data.terms;
  return [];
};

const CourseRegistrationManager = () => {
  /* ---------- Routes from config ---------- */
  const ROUTES = {
    REG: config.COURSE_REGISTRATION_ROUTE,                 
    ELECTIVES: config.SUBJECT_ELECTIVE_ROUTE,              
    STUDENTS_LIST: joinUrl(config.STUDENT_ROUTE, '/list'), 
    OFFERINGS: config.COURSE_OFFERING_ROUTE,               
    ACADYEAR: config.MASTER_ACADYEAR_ROUTE,                
  };

  /* ---------- State ---------- */
  const [registrations, setRegistrations] = useState([]);
  const [electives, setElectives] = useState([]);
  const [students, setStudents] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [terms, setTerms] = useState([]);

  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  /* ---------- Fetchers ---------- */
  const fetchRegistrations = async () => {
    try {
      setLoading(true);
      const res = await axios.get(ROUTES.REG);
      setRegistrations(parseRegistrations(res.data));
    } catch (err) {
      setError('Failed to fetch registrations');
      // console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchElectives = async () => {
    try {
      const res = await axios.get(ROUTES.ELECTIVES);
      setElectives(parseElectives(res.data));
    } catch (err) {
      setElectives([]);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await axios.get(ROUTES.STUDENTS_LIST);
      setStudents(parseStudents(res.data));
    } catch (err) {
      setStudents([]);
    }
  };

  const fetchOfferings = async () => {
    try {
      const res = await axios.get(ROUTES.OFFERINGS);
      setOfferings(parseOfferings(res.data));
    } catch (err) {
      setOfferings([]);
    }
  };

  const fetchTerms = async () => {
    try {
      const res = await axios.get(ROUTES.ACADYEAR);
      setTerms(parseTerms(res.data));
    } catch (err) {
      setTerms([]);
    }
  };

  useEffect(() => {
    fetchRegistrations();
    fetchElectives();
    fetchStudents();
    fetchOfferings();
    fetchTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Handlers ---------- */
  const resetForm = () => setForm(emptyForm);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      if (editing) {
        await axios.put(joinUrl(ROUTES.REG, `/${encodeURIComponent(form.course_regis_id)}`), form);
        setMessage('Registration updated');
      } else {
        await axios.post(ROUTES.REG, form);
        setMessage('Registration created');
      }
      setShowForm(false);
      setEditing(false);
      resetForm();
      fetchRegistrations();
    } catch (err) {
      setError('Failed to save registration');
      // console.error(err);
    }
  };

  const handleEdit = (reg) => {
    setForm(reg);
    setEditing(true);
    setShowForm(true);
    setMessage(''); setError('');
  };

  const handleDelete = async (course_regis_id) => {
    if (!window.confirm('Delete this registration?')) return;
    setMessage(''); setError('');
    try {
      await axios.delete(joinUrl(ROUTES.REG, `/${encodeURIComponent(course_regis_id)}`));
      setRegistrations(list => list.filter(r => r.course_regis_id !== course_regis_id));
      setMessage('Registration deleted');
    } catch (err) {
      setError('Failed to delete registration');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(false);
    resetForm();
    setMessage(''); setError('');
  };

  /* ---------- Filter + Pagination ---------- */
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return registrations;
    return registrations.filter((r) =>
      [
        r.course_regis_id, r.course_studentid, r.courseofferingid, r.courseterm,
        r.courseisterm, r.course_elec_groupid, r.courseenrollmentdt, r.coursefinalgrade,
        r.courseresultstatus, r.courseattper, r.coursestatus,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .some((txt) => txt.includes(s))
    );
  }, [registrations, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  /* ---------- Render ---------- */
    return (
      <div className="mu-page">
        {(message || error) && (
          <div className="toast-wrapper">
            <div className={`toast-box ${error ? 'toast--error' : ''}`}>
              <span className="toast-emoji">{error ? '⚠️' : '✅'}</span>
              <span className="toast-text">{error || message}</span>
              <button className="toast-close" onClick={() => { setMessage(''); setError(''); }}>×</button>
            </div>
          </div>
        )}

        <h1 className="mu-title">Course Registration Manager</h1>

        {/* Toolbar with Search + Add */}
        <div className="mu-toolbar">
          <label className="searchbox" aria-label="Search registrations">
            <span className="searchbox__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" role="img" aria-hidden="true">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="20" y1="20" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              className="searchbox__input"
              type="text"
              placeholder="Search registrations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <button
            className="btn btn--add"
            onClick={() => { setShowForm(true); setEditing(false); resetForm(); setMessage(''); setError(''); }}
          >
            <span className="btn-plus">＋</span> Add
          </button>
        </div>

        {/* Table Card */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">

            {/* Scrollable Table */}
            <div className="mu-tablecard" style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table className="mu-table">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">Registration ID</th>
                    <th className="mu-th">Student</th>
                    <th className="mu-th">Offering</th>
                    <th className="mu-th">Term</th>
                    <th className="mu-th">Is Term</th>
                    <th className="mu-th">Elective Group ID</th>
                    <th className="mu-th">Enrollment Date</th>
                    <th className="mu-th">Final Grade</th>
                    <th className="mu-th">Result Status</th>
                    <th className="mu-th">Attendance (%)</th>
                    <th className="mu-th">Status</th>
                    <th className="mu-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="mu-td mu-empty" colSpan={12}>Loading...</td></tr>
                  ) : pageItems.length === 0 ? (
                    <tr><td className="mu-td mu-empty" colSpan={12}>No records found</td></tr>
                  ) : (
                    pageItems.map((reg) => (
                      <tr key={reg.course_regis_id}>
                        <td className="mu-td">{reg.course_regis_id}</td>
                        <td className="mu-td">{reg.course_studentid}</td>
                        <td className="mu-td">{reg.courseofferingid}</td>
                        <td className="mu-td">{reg.courseterm}</td>
                        <td className="mu-td">{reg.courseisterm}</td>
                        <td className="mu-td">{reg.course_elec_groupid}</td>
                        <td className="mu-td">{reg.courseenrollmentdt}</td>
                        <td className="mu-td">{reg.coursefinalgrade}</td>
                        <td className="mu-td">{reg.courseresultstatus}</td>
                        <td className="mu-td">{reg.courseattper}</td>
                        <td className="mu-td">{reg.coursestatus}</td>
                        <td className="mu-td">
                          <button className="btn btn--primary" onClick={() => handleEdit(reg)}>Edit</button>
                          <button className="btn btn--danger" onClick={() => handleDelete(reg.course_regis_id)}>Delete</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination — chips style, always visible below table */}
            <div className="mu-pagination mu-pagination--chips" style={{ marginTop: '8px' }}>
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

        {/* Add/Edit Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={handleCancel}>
            <form className="modal modal--wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
              <button type="button" className="modal-x" onClick={handleCancel}>×</button>
              <h3 className="modal-heading">{editing ? 'Edit Registration' : 'Add Registration'}</h3>

              <div className="form-grid form-grid--3">
                <div className="form-row">
                  <label className="form-label">Registration ID</label>
                  <input
                    className="form-input"
                    name="course_regis_id"
                    value={form.course_regis_id}
                    onChange={handleChange}
                    disabled={editing}
                    required
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">Student</label>
                  <select
                    className="form-input"
                    name="course_studentid"
                    value={form.course_studentid}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Student</option>
                    {students.map(stu => (
                      <option key={stu.stuid} value={stu.stuid}>
                        {stu.stuname ? `${stu.stuname} (${stu.stuid})` : stu.stuid}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <label className="form-label">Course Offering</label>
                  <select
                    className="form-input"
                    name="courseofferingid"
                    value={form.courseofferingid}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Course Offering</option>
                    {offerings.map(off => (
                      <option key={off.offerid} value={off.offerid}>
                        {off.coursename ? `${off.coursename} (${off.offerid})` : off.offerid}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <label className="form-label">Academic Term</label>
                  <select
                    className="form-input"
                    name="courseterm"
                    value={form.courseterm}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Academic Term</option>
                    {terms.map(term => (
                      <option
                        key={term.id ?? term.acadyearid ?? term.termid ?? `${term.acadyearname || term.termname || 'term'}`}
                        value={term.id ?? term.acadyearid ?? term.termid ?? ''}
                      >
                        {(term.id ?? term.acadyearid ?? term.termid ?? '')}
                        {term.acadyearname ? ` - ${term.acadyearname}` : term.termname ? ` - ${term.termname}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <label className="form-label">Is Term</label>
                  <input
                    className="form-input"
                    name="courseisterm"
                    value={form.courseisterm}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">Elective Group ID</label>
                  <select
                    className="form-input"
                    name="course_elec_groupid"
                    value={form.course_elec_groupid}
                    onChange={handleChange}
                  >
                    <option value="">Select Elective ID</option>
                    {electives.map(elec => (
                      <option key={elec.sub_elec_id} value={elec.sub_elec_id}>
                        {elec.sub_elec_grp_name ? `${elec.sub_elec_grp_name} (${elec.sub_elec_id})` : elec.sub_elec_id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <label className="form-label">Enrollment Date</label>
                  <input
                    className="form-input"
                    type="date"
                    name="courseenrollmentdt"
                    value={form.courseenrollmentdt}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">Final Grade</label>
                  <input
                    className="form-input"
                    name="coursefinalgrade"
                    value={form.coursefinalgrade}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">Result Status</label>
                  <input
                    className="form-input"
                    name="courseresultstatus"
                    value={form.courseresultstatus}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">Attendance (%)</label>
                  <input
                    className="form-input"
                    name="courseattper"
                    value={form.courseattper}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-row">
                  <label className="form-label">Status</label>
                  <input
                    className="form-input"
                    name="coursestatus"
                    value={form.coursestatus}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {!!error && <div className="modal-desc modal-desc--error">{error}</div>}
              {!!message && <div className="modal-desc modal-desc--ok">{message}</div>}

              <div className="modal-actions">
                <button type="submit" className="btn btn--primary">{editing ? 'Update' : 'Add'} Registration</button>
                <button type="button" className="btn btn--secondary" onClick={handleCancel}>Cancel</button>
              </div>

              <button type="button" className="btn btn--close-fullwidth" onClick={handleCancel}>Close</button>
            </form>
          </div>
        )}
      </div>
    );
};

export default CourseRegistrationManager;
