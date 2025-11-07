// SMS-ui/src/pages/AddCollege.jsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import config from '../config/middleware_config.js';
import '../index.css'; // SMS-ui/src/index.css

// ---- Safe URL joiners ----
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}
function buildApi(...parts) {
  return parts.filter(Boolean).reduce((acc, part) => joinUrl(acc, part), '');
}

// IMPORTANT: Env routes are ABSOLUTE (already include BASE_URL)
const api = (...p) => buildApi(...p);

// ---- Toast (Success/Error) ----
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

// ---- Reusable Fields ----
function Field({
  label,
  name,
  type,
  value,
  onChange,
  disabled,
  className = '',
  pattern,
  maxLength,
  inputMode,
  placeholder,
  title,
}) {
  return (
    <div className={`form-row ${className}`}>
      <label className="form-label">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required
        disabled={disabled}
        className="form-input"
        autoComplete="off"
        pattern={pattern}
        maxLength={maxLength}
        inputMode={inputMode}
        placeholder={placeholder}
        title={title}
      />
    </div>
  );
}
function SelectField({ label, name, value, onChange, options, className = '' }) {
  return (
    <div className={`form-row ${className}`}>
      <label className="form-label">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required
        className="form-input"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ==================== NEW: email normalizer ==================== */
function normalizeEmailLower(email = '') {
  return String(email).trim().toLowerCase();
}
/* =============================================================== */

// ---- Modal Form for Adding/Editing College ----
function CollegeForm({ initial, onClose, onSaved, mode = "add" }) {
  const [form, setForm] = useState(initial || {
    collegeid: '',
    collegename: '',
    collegecode: '',
    collegeaddress: '',
    collegelocation: '',
    collegeaffialatedto: '',
    collegeurl: '',
    collegeemail: '',
    collegephone: '',
    collegestatus: '',
    collegeuserid: '',
    collegegroupid: ''
  });
  const [userList, setUserList] = useState([]);
  const [collegeGroups, setCollegeGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ---- Endpoints ----
  const ADD_COLLEGE_API  = api(config.COLLEGES_ROUTE, 'add-college');
  const EDIT_COLLEGE_API = (id) => api(config.COLLEGES_ROUTE, `edit-college/${id}`);
  const USERS_API        = api(config.MASTER_USER_ROUTE, 'users');
  const GROUPS_API       = api(config.COLLEGE_GROUP_ROUTE, 'list');

  useEffect(() => {
    (async () => {
      try {
        const [usersRes, groupsRes] = await Promise.all([
          axios.get(USERS_API),
          axios.get(GROUPS_API),
        ]);
        setUserList(usersRes?.data?.users ?? usersRes?.data ?? []);
        setCollegeGroups(groupsRes?.data?.groups ?? groupsRes?.data ?? []);
      } catch {
        setUserList([]); setCollegeGroups([]);
      }
    })();
  }, [USERS_API, GROUPS_API]);

  // sanitize & update form
  const handleChange = e => {
    const { name, value } = e.target;
    if (name === 'collegephone') {
      // Keep only digits and clamp to 10 characters
      const digits = value.replace(/\D/g, '').slice(0, 10);
      setForm(f => ({ ...f, collegephone: digits }));
    } else if (name === 'collegeemail') {
      // 🔽 Always force lowercase in the field itself
      setForm(f => ({ ...f, collegeemail: normalizeEmailLower(value) }));
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // --- College URL Validation ---
    const url = form.collegeurl.trim();
    const urlPattern = /^https?:\/\/[^@]+$/;
    if (
      url &&
      (!urlPattern.test(url) ||
        url.includes('@') ||
        url.endsWith('.in') ||
        url.endsWith('.com'))
    ) {
      setError('College URL must start with http:// or https://, must not contain "@" and must not end with .in or .com');
      setLoading(false);
      return;
    }

    // --- Phone Validation: exactly 10 numeric digits ---
    const phone = (form.collegephone || '').trim();
    if (!/^\d{10}$/.test(phone)) {
      setError('Phone must be exactly 10 digits (0–9).');
      setLoading(false);
      return;
    }

    // 🔽 Ensure we *send* lowercase email regardless of field state
    const payload = { ...form, collegeemail: normalizeEmailLower(form.collegeemail) };

    try {
      let res;
      if (mode === 'edit') {
        res = await axios.put(EDIT_COLLEGE_API(form.collegeid), payload);
      } else {
        res = await axios.post(ADD_COLLEGE_API, payload);
      }
      if ((res?.status === 201 && mode === 'add') || (res?.status === 200 && mode === 'edit')) {
        onSaved(mode, res?.data?.college || payload);
        onClose();
      }
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        (err?.request ? "Network error. Check backend & CORS." : 'Unknown error')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal modal--wide">
      <button onClick={onClose} className="modal-x" aria-label="Close">×</button>
      <h2 className="modal-heading">{mode === 'edit' ? 'Edit College' : 'Add Institute'}</h2>

      <form onSubmit={handleSubmit} autoComplete="off">
        {/* 3-column responsive grid for fields (table-like) */}
        <div className="form-grid form-grid--3">
          {/* Row 1 */}
          <Field label="College ID" name="collegeid" type="text" value={form.collegeid} onChange={handleChange} disabled={mode === 'edit'} />
          <Field label="Name" name="collegename" type="text" value={form.collegename} onChange={handleChange} />
          <Field label="Code" name="collegecode" type="text" value={form.collegecode} onChange={handleChange} />

          {/* Row 2 */}
          <Field label="Address" name="collegeaddress" type="text" value={form.collegeaddress} onChange={handleChange} className="span-2" />
          <Field label="Location" name="collegelocation" type="text" value={form.collegelocation} onChange={handleChange} />

          {/* Row 3 */}
          <Field label="Affiliated To" name="collegeaffialatedto" type="text" value={form.collegeaffialatedto} onChange={handleChange} />
          <Field label="URL" name="collegeurl" type="text" value={form.collegeurl} onChange={handleChange} className="span-2" />

          {/* Row 4 */}
          <Field label="Email" name="collegeemail" type="email" value={form.collegeemail} onChange={handleChange} />
          {/* PHONE: digits only, max 10, validated on submit too */}
          <Field
            label="Phone"
            name="collegephone"
            type="tel"
            value={form.collegephone}
            onChange={handleChange}
            pattern="^\d{10}$"
            maxLength={10}
            inputMode="numeric"
            title="Enter exactly 10 digits (0–9)"
          />
          <SelectField
            label="Status"
            name="collegestatus"
            value={form.collegestatus}
            onChange={handleChange}
            options={[
              { value: '', label: 'Select Status' },
              { value: 'Active', label: 'Active' },
              { value: 'Disabled', label: 'Disabled' },
            ]}
          />

          {/* Row 5 */}
          <SelectField
            label="User ID"
            name="collegeuserid"
            value={form.collegeuserid}
            onChange={handleChange}
            options={[{ value: '', label: 'Select User' }, ...userList.map(u => ({ value: u.userid, label: u.userid }))]}
          />
          <SelectField
            label="Group ID"
            name="collegegroupid"
            value={form.collegegroupid}
            onChange={handleChange}
            options={[{ value: '', label: 'Select Group' }, ...collegeGroups.map(g => ({ value: g.groupid, label: `${g.groupdesc} (${g.groupid})` }))]}
            className="span-2"
          />
        </div>

        {error && <div className="modal-desc">{error}</div>}

        <button type="submit" disabled={loading} className={`btn btn--submit ${loading ? 'is-loading' : ''}`}>
          {loading ? (mode === 'edit' ? 'Saving...' : 'Adding...') : (mode === 'edit' ? 'Save Changes' : 'Add College')}
        </button>

        <button onClick={onClose} type="button" className="btn btn--close-fullwidth">
          Close
        </button>
      </form>
    </div>
  );
}

// ---- Confirm Delete Modal ----
function ConfirmDelete({ college, onClose, onDelete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const DELETE_COLLEGE_API = (id) => api(config.COLLEGES_ROUTE, `delete-college/${id}`);

  const handleDelete = async () => {
    setError('');
    setLoading(true);
    try {
      await axios.delete(DELETE_COLLEGE_API(college.collegeid));
      onDelete(college);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete.');
    }
    setLoading(false);
  };

  return (
    <div className="modal">
      <button onClick={onClose} className="modal-x" aria-label="Close">×</button>
      <div className="modal-title danger">Delete College?</div>
      <div className="modal-desc">
        Are you sure you want to delete <br />
        <b>{college.collegename}</b> (<span className="highlight">{college.collegeid}</span>)?
      </div>
      {error && <div className="modal-desc">{error}</div>}
      <div className="modal-actions">
        <button onClick={handleDelete} disabled={loading} className="btn btn--danger">
          {loading ? 'Deleting...' : 'Yes, Delete'}
        </button>
        <button onClick={onClose} className="btn btn--secondary">Cancel</button>
      </div>
    </div>
  );
}

// *** SET ITEMS PER PAGE TO 4 ***
const ITEMS_PER_PAGE = 4;

/* =========================================================
   1) Utility: compute next serial CollegeID like "CID_001"
   ========================================================= */
function getNextCollegeId(list = []) {
  const prefix = 'CID_';
  let maxNum = 0;

  for (const col of list) {
    const id = String(col?.collegeid || '').trim();
    const m = /^CID_(\d+)$/.exec(id);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!Number.isNaN(num) && num > maxNum) maxNum = num;
    }
  }

  const next = String(maxNum + 1).padStart(3, '0');
  return `${prefix}${next}`;
}

// ---- Main Export ----
export default function AddCollege() {
  const [showAdd, setShowAdd] = useState(false);
  const [editData, setEditData] = useState(null);
  const [deleteData, setDeleteData] = useState(null);
  const [collegeList, setCollegeList] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  const VIEW_COLLEGES_API = api(config.COLLEGES_ROUTE, 'view-colleges');

  const fetchColleges = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(VIEW_COLLEGES_API);
      const raw = res?.data?.colleges ?? res?.data ?? [];
      setCollegeList(Array.isArray(raw) ? raw : []);
    } catch {
      setCollegeList([]);
      setError('Failed to load colleges.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchColleges(); }, []); // eslint-disable-line

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: '', message: '' }), 2000);
  };

  const handleSaved = (mode) => {
    fetchColleges();
    if (mode === "add") showToast("success", "College added successfully!");
    else if (mode === "edit") showToast("success", "College updated successfully!");
    else if (mode === "delete") showToast("success", "College deleted successfully!");
  };

  const filteredList = collegeList.filter(col =>
    (col.collegename ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (col.collegeid ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (col.collegeemail ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredList.length / ITEMS_PER_PAGE));
  const pagedList = filteredList.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => { setPage(1); }, [search, collegeList.length]);

  /* =========================================================
     2) After you've loaded `collegeList`
     ========================================================= */
  const nextCollegeId = useMemo(() => getNextCollegeId(collegeList), [collegeList]);

  return (
    <div className="mu-page">
      <Toast {...toast} onClose={() => setToast({ ...toast, show: false })} />

      <div className="mu-container">
        <h2 className="mu-title">INSTITUTE</h2>

        {/* Toolbar: Search + Add */}
        <div className="mu-toolbar">
          <div className="searchbox">
            <span className="searchbox__icon" aria-hidden="true">
              <svg width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              className="searchbox__input"
            />
          </div>

          <button className="btn btn--add" onClick={() => setShowAdd(true)}>
            <span className="btn-plus">+</span>
            Add
          </button>
        </div>

        {/* Table Card */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">

            <div className="mu-tablecard">
              {/* NEW: horizontal scroll wrapper */}
              <div className="mu-hscroll">
                <table className="mu-table mu-table--college">
                  <thead>
                    <tr className="mu-thead-row">
                      <th className="mu-th">ID</th>
                      <th className="mu-th">Name</th>
                      <th className="mu-th">Code</th>
                      <th className="mu-th">Address</th>
                      <th className="mu-th">Location</th>
                      <th className="mu-th">Email</th>
                      <th className="mu-th">Status</th>
                      <th className="mu-th">Phone</th>
                      <th className="mu-th">User</th>
                      <th className="mu-th">Group</th>
                      <th className="mu-th mu-th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedList.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="mu-empty">
                          {loading ? 'Loading...' : 'No colleges found'}
                        </td>
                      </tr>
                    ) : (
                      pagedList.map((college) => (
                        <tr key={college.collegeid}>
                          <td className="mu-td">{college.collegeid}</td>
                          <td className="mu-td">{college.collegename}</td>
                          <td className="mu-td">{college.collegecode}</td>
                          <td className="mu-td">{college.collegeaddress}</td>
                          <td className="mu-td">{college.collegelocation}</td>
                          <td className="mu-td">{college.collegeemail}</td>
                          <td className="mu-td">
                            <span className={`status ${college.collegestatus === 'Active' ? 'status--active' : 'status--inactive'}`}>
                              {college.collegestatus}
                            </span>
                          </td>
                          <td className="mu-td">{college.collegephone}</td>
                          <td className="mu-td">{college.collegeuserid}</td>
                          <td className="mu-td">{college.collegegroupid}</td>
                          <td className="mu-td mu-td-actions">
                            <button className="btn btn--primary" onClick={() => setEditData(college)} title="Edit">Edit</button>
                            <button className="btn btn--danger" onClick={() => setDeleteData(college)} title="Delete">Delete</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination footer */}
            <div className="mu-pagination">
              <span className="mu-pageinfo">Showing page {page} of {totalPages} pages</span>
              <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
            </div>

            {error && <div className="mu-empty">{error}</div>}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()}>
            {/* 3) Use it when opening the Add modal */}
            <CollegeForm
              initial={{ collegeid: nextCollegeId }}
              onClose={() => setShowAdd(false)}
              onSaved={() => handleSaved('add')}
              mode="add"
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editData && (
        <div className="modal-overlay" onClick={() => setEditData(null)}>
          <div onClick={e => e.stopPropagation()}>
            <CollegeForm
              initial={editData}
              onClose={() => setEditData(null)}
              onSaved={() => handleSaved('edit')}
              mode="edit"
            />
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteData && (
        <div className="modal-overlay" onClick={() => setDeleteData(null)}>
          <div onClick={e => e.stopPropagation()}>
            <ConfirmDelete
              college={deleteData}
              onClose={() => setDeleteData(null)}
              onDelete={() => handleSaved('delete')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
