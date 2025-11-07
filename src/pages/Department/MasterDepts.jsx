import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css'; // use your styles

// ---- Safe URL joiner (prevents double slashes / duplicated bases)
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

// ---- Normalize colleges (handles array or {colleges: [...]}, and varied key names)
function normalizeColleges(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.colleges ?? []);
  return (arr || []).map((c) => {
    const id =
      c.collegeid ?? c.id ?? c.college_id ?? c.COLLEGEID ?? c.COLLEGE_ID ?? '';
    const name =
      c.collegename ?? c.name ?? c.college_name ?? c.COLLEGENAME ?? c.COLLEGE_NAME ?? id;
    return { collegeid: String(id ?? ''), collegename: String(name ?? '') };
  });
}

/* =========================================================
   Toast (same pattern as AddCollege.jsx)
   ========================================================= */
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

/* =========================================================
   Reusable Inputs (kept your look)
   ========================================================= */
function Field({ label, name, value, onChange, disabled, className = '', type = 'text', ...rest }) {
  return (
    <div className={`form-row ${className}`}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={
          name === 'collegedeptid' ||
          name === 'collegeid' ||
          name === 'colldept_code' ||
          name === 'collegedeptdesc'
        }
        autoComplete="off"
        {...rest}
      />
    </div>
  );
}
function SelectField({ label, name, value, onChange, options, className = '' }) {
  return (
    <div className={`form-row ${className}`}>
      <label className="form-label">{label}</label>
      <select
        className="form-input"
        name={name}
        value={value}
        onChange={onChange}
        required
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

/* =========================================================
   Add/Edit Department Modal (matches AddCollege.jsx structure)
   ========================================================= */
function DeptForm({ initial, colleges, mode = 'add', onClose, onSaved, deptsRoute }) {
  const [form, setForm] = useState(
    initial || {
      collegedeptid: '',
      collegeid: '',
      colldept_code: '',
      collegedeptdesc: '',
      colldepthod: '',
      colldepteaail: '',
      colldeptphno: '',
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const EDIT_URL = (id) => joinUrl(deptsRoute, `/${encodeURIComponent(id)}`);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // restrict phone to digits and 10 length
    if (name === 'colldeptphno') {
      const digits = value.replace(/\D/g, '').slice(0, 10);
      setForm((f) => ({ ...f, colldeptphno: digits }));
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Required fields
    if (!form.collegedeptid || !form.collegeid || !form.colldept_code || !form.collegedeptdesc) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    // Phone: exactly 10 digits
    if (!/^\d{10}$/.test(form.colldeptphno || '')) {
      setError('Phone number must be 10 digits and numerical.');
      setLoading(false);
      return;
    }

// ✅ Email: must contain a single '@' and end with .org / .net / *.uk
function validateEmailAllowOrgNetUk(email) {
  const v = String(email ?? '').trim();
  if (!v) return true; // empty is allowed here — remove if you want it required

  // Exactly one '@', no spaces
  if (!/^[^\s@]+@[^\s@]+$/.test(v)) return false;

  // Ends with .org, .net, or any *.uk (e.g., .uk, .co.uk, .ac.uk)
  return /\.(org|net|[a-z0-9-]+\.uk)$/i.test(v);
}

const value = (form.colldepteaail ?? '').trim();
if (value && !validateEmailAllowOrgNetUk(value)) {
  setError("Email must end with .org, .net, or a .uk domain (e.g., name@domain.org / name@domain.net / name@domain.co.uk).");
  setLoading(false);
  return;
}


    try {
      if (mode === 'edit') {
        await axios.put(EDIT_URL(form.collegedeptid), { ...form });
      } else {
        await axios.post(deptsRoute, { ...form });
      }
      onSaved(mode, form);
      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          (err?.request ? 'Network error. Check backend & CORS.' : 'Unknown error')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal modal--wide">
      <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
      <h2 className="modal-heading">{mode === 'edit' ? 'Edit Department' : 'Add Department'}</h2>

      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="form-grid form-grid--3">
          <Field
            label="Department ID"
            name="collegedeptid"
            value={form.collegedeptid}
            onChange={handleChange}
            disabled={mode === 'edit'}
          />
          <SelectField
            label="College"
            name="collegeid"
            value={form.collegeid}
            onChange={handleChange}
            options={[{ value: '', label: 'Select College' }, ...colleges.map((c) => ({
              value: c.collegeid,
              label: `${c.collegename} (${c.collegeid})`,
            }))]}
          />
          <Field
            label="Dept Code"
            name="colldept_code"
            value={form.colldept_code}
            onChange={handleChange}
          />
          <Field
            className="span-3"
            label="Description"
            name="collegedeptdesc"
            value={form.collegedeptdesc}
            onChange={handleChange}
          />
          <Field
            label="HOD"
            name="colldepthod"
            value={form.colldepthod}
            onChange={handleChange}
          />
          <Field
  label="Email"
  name="colldepteaail"
  type="email"
  value={form.colldepteaail}
  onChange={handleChange}
  placeholder="name@domain.org / name@domain.net / name@domain.co.uk"
  title="Must contain '@' and end with .org, .net, or a .uk domain (e.g., .co.uk)"
  // Optional: HTML pattern (frontend hint; JS validation below is the source of truth)
  pattern="^[^@\s]+@[^@\s]+\.(org|net|(?:[A-Za-z0-9-]+\.)*uk)$"
  onBlur={(e) => {
    const v = (e.target.value ?? '').trim();
    if (v && !validateEmailAllowOrgNetUk(v)) {
      setError("Email must end with .org, .net, or a .uk domain (e.g., name@domain.org / name@domain.net / name@domain.co.uk).");
    }
  }}
/>

          <Field
            label="Phone"
            name="colldeptphno"
            type="tel"
            value={form.colldeptphno}
            onChange={handleChange}
            pattern="^\d{10}$"
            maxLength={10}
            inputMode="numeric"
            title="Enter exactly 10 digits (0–9)"
          />
        </div>

        {error && <div className="modal-desc modal-desc--error">{error}</div>}

        <button
          type="submit"
          className={`btn btn--submit ${loading ? 'is-loading' : ''}`}
          disabled={loading}
        >
          {loading ? (mode === 'edit' ? 'Saving...' : 'Adding...') : (mode === 'edit' ? 'Save Changes' : 'Add Department')}
        </button>

        <button type="button" className="btn btn--close-fullwidth" onClick={onClose}>
          Close
        </button>
      </form>
    </div>
  );
}

/* =========================================================
   Confirm Delete Modal (matches AddCollege.jsx style)
   ========================================================= */
function ConfirmDelete({ dept, onClose, onDeleted, deptsRoute }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const EDIT_URL = (id) => joinUrl(deptsRoute, `/${encodeURIComponent(id)}`);

  const handleDelete = async () => {
    setError('');
    setLoading(true);
    try {
      await axios.delete(EDIT_URL(dept.collegedeptid));
      onDeleted(dept);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
      <div className="modal-title danger">Delete Department?</div>
      <div className="modal-desc">
        Are you sure you want to delete <br />
        <b>{dept.collegedeptdesc || 'this department'}</b>{' '}
        (<span className="highlight">{dept.collegedeptid}</span>)?
      </div>
      {error && <div className="modal-desc modal-desc--error">{error}</div>}
      <div className="modal-actions">
        <button onClick={handleDelete} disabled={loading} className="btn btn--danger">
          {loading ? 'Deleting...' : 'Yes, Delete'}
        </button>
        <button onClick={onClose} className="btn btn--secondary">Cancel</button>
      </div>
    </div>
  );
}

const PAGE_SIZE = 4;

// ---- Main Departments Component ----
export default function MasterDepts() {
  const [departments, setDepartments] = useState([]);
  const [colleges, setColleges] = useState([]);

  // NEW: pop-up states (same pattern as AddCollege.jsx)
  const [showAdd, setShowAdd] = useState(false);
  const [editData, setEditData] = useState(null);
  const [deleteData, setDeleteData] = useState(null);

  // NEW: holds the prefilled initial for Add popup
  const [addInitial, setAddInitial] = useState(null);

  // keep your other states
  const [loading, setLoading] = useState(false);      // only for list fetch/UX
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Toast (success notifications like AddCollege.jsx)
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: '', message: '' }), 2000);
  };

  // Build routes from config
  const ROUTES = {
    DEPTS: config.MASTER_DEPTS_ROUTE, 
  };

  // ---------- effects ----------
  // Colleges
  useEffect(() => {
    const COLLEGES_URL = `${config.BASE_URL}/master-college/view-colleges`;
    axios
      .get(COLLEGES_URL)
      .then((res) => {
        const raw = res?.data?.colleges ?? res?.data;
        setColleges(normalizeColleges(raw));
      })
      .catch(() => setColleges([]));
  }, []);

  // Departments
  const fetchDepartments = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get(ROUTES.DEPTS);
      setDepartments(
        Array.isArray(res.data) ? res.data : res.data?.departments || []
      );
    } catch {
      setDepartments([]);
      setError('Failed to load departments.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reset to first page on search change
  useEffect(() => {
    setPage(1);
  }, [query]);

  // filtered + paginated lists
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => {
      const id = String(d.collegedeptid ?? '').toLowerCase();
      const collegeid = String(d.collegeid ?? '').toLowerCase();
      const code = String(d.colldept_code ?? '').toLowerCase();
      const desc = String(d.collegedeptdesc ?? '').toLowerCase();
      const hod = String(d.colldepthod ?? '').toLowerCase();
      return (
        id.includes(q) ||
        collegeid.includes(q) ||
        code.includes(q) ||
        desc.includes(q) ||
        hod.includes(q)
      );
    });
  }, [departments, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // keep page in range if list shrinks
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // success callback from modals
  const handleSaved = (mode) => {
    fetchDepartments();
    if (mode === 'add') showToast('success', 'Department added successfully!');
    if (mode === 'edit') showToast('success', 'Department updated successfully!');
    if (mode === 'delete') showToast('success', 'Department deleted successfully!');
  };

  // --- helper to display college description ---
  const getCollegeName = (id) => {
    const c = colleges.find((clg) => clg.collegeid === String(id));
    return c ? c.collegename : id;
  };

  /* ---------------------------------------------------------
     MERGED: Auto-generate next Department ID for Add popup
     --------------------------------------------------------- */
  const generateNextDeptId = () => {
    if (departments.length === 0) return 'DEPT_001';
    const ids = departments
      .map((d) => d.collegedeptid)
      .filter((id) => /^DEPT_\d+$/.test(id))
      .map((id) => parseInt(id.replace('DEPT_', ''), 10));
    const maxId = ids.length > 0 ? Math.max(...ids) : 0;
    const nextId = maxId + 1;
    return `DEPT_${String(nextId).padStart(3, '0')}`;
  };

  const handleAddClick = () => {
    setAddInitial({
      collegedeptid: generateNextDeptId(),
      collegeid: '',
      colldept_code: '',
      collegedeptdesc: '',
      colldepthod: '',
      colldepteaail: '',
      colldeptphno: '',
    });
    setShowAdd(true);
    setError('');
    setToast((t) => ({ ...t, show: false }));
  };

  // >>> Hide/Show Add button here <<<
  const SHOW_ADD_BUTTON = false;

  return (
    <div className="mu-page">
      <Toast {...toast} onClose={() => setToast({ ...toast, show: false })} />

      <div className="mu-container">
        <h1 className="mu-title">DEPARTMENT / PROGRAM</h1>

        {/* Toolbar: search + (hidden) add */}
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

          {SHOW_ADD_BUTTON && (
            <button className="btn btn--add" onClick={handleAddClick}>
              <span className="btn-plus">+</span> Add
            </button>
          )}
        </div>

        {/* Table */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">

            <div className="mu-tablecard" style={{ overflow: 'visible' }}>
              <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                <table className="mu-table">
                  <thead>
                    <tr className="mu-thead-row">
                      <th className="mu-th">Dept ID</th>
                      <th className="mu-th">College</th>
                      <th className="mu-th">Code</th>
                      <th className="mu-th">Description</th>
                      <th className="mu-th">HOD</th>
                      <th className="mu-th">Email</th>
                      <th className="mu-th">Phone</th>
                      <th className="mu-th" style={{ textAlign: 'center' }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentItems.length === 0 ? (
                      <tr>
                        <td className="mu-empty" colSpan={8}>
                          {loading ? 'Loading...' : 'No departments found'}
                        </td>
                      </tr>
                    ) : (
                      currentItems.map((dept) => (
                        <tr key={dept.collegedeptid}>
                          <td className="mu-td">{dept.collegedeptid}</td>
                          <td className="mu-td">{getCollegeName(dept.collegeid)}</td>
                          <td className="mu-td">{dept.colldept_code}</td>
                          <td className="mu-td">{dept.collegedeptdesc}</td>
                          <td className="mu-td">{dept.colldepthod}</td>
                          <td className="mu-td">{dept.colldepteaail}</td>
                          <td className="mu-td">{dept.colldeptphno}</td>
                          <td className="mu-td">
                            <button
                              className="btn btn--primary"
                              onClick={() => setEditData(dept)}
                              title="Edit"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--danger"
                              onClick={() => setDeleteData(dept)}
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
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    title="Previous"
                  >
                    «
                  </button>
                  <span className="pagechip pagechip--active">{page}</span>
                  <button
                    className="pagechip"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
        </div>
        {/* /table */}
      </div>

      {/* Add Modal (kept; unreachable without button) */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <DeptForm
              mode="add"
              initial={addInitial || { collegedeptid: generateNextDeptId() }}
              colleges={colleges}
              onClose={() => setShowAdd(false)}
              onSaved={() => handleSaved('add')}
              deptsRoute={ROUTES.DEPTS}
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editData && (
        <div className="modal-overlay" onClick={() => setEditData(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <DeptForm
              mode="edit"
              initial={editData}
              colleges={colleges}
              onClose={() => setEditData(null)}
              onSaved={() => handleSaved('edit')}
              deptsRoute={ROUTES.DEPTS}
            />
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteData && (
        <div className="modal-overlay" onClick={() => setDeleteData(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <ConfirmDelete
              dept={deleteData}
              onClose={() => setDeleteData(null)}
              onDeleted={() => handleSaved('delete')}
              deptsRoute={ROUTES.DEPTS}
            />
          </div>
        </div>
      )}
    </div>
  );
}