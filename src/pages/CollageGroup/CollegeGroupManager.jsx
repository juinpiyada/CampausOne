import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css';

// ---- Safe URL joiner (prevents double/missing slashes)
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

// Build API URLs from config
const API = joinUrl(config.COLLEGE_GROUP_ROUTE);              
const USERS_API = joinUrl(config.MASTER_USER_ROUTE, 'users'); 

const PAGE_SIZE = 4;

const initialForm = {
  groupid: '',
  groupdesc: '',
  groupcorporateaddress: '',
  groupcity: '',
  grouppin: '',
  groupcountry: '',
  groupemailid: '',
  grouprole: '',
  group_user_id: '',
};

function normalizeUsers(arr = []) {
  return arr
    .map(u => ({
      userid: String(u.userid ?? u.user_id ?? u.id ?? ''),
      username:
        u.username ??
        u.user_name ??
        u.name ??
        u.email ??
        String(u.userid ?? u.user_id ?? u.id ?? ''),
    }))
    .filter(u => u.userid);
}

/* ===== NEW: lowercase email normalizer ===== */
function normalizeEmailLower(email = '') {
  return String(email).trim().toLowerCase();
}
/* ========================================== */

const CollegeGroupManager = () => {
  const [form, setForm] = useState(initialForm);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);

  // NEW: delete confirmation state (for the popup)
  const [confirmDel, setConfirmDel] = useState({ open: false, id: null, label: '' });

  const fetchGroups = async () => {
    try {
      const res = await axios.get(joinUrl(API, 'list'));
      const raw = res?.data?.groups ?? res?.data ?? [];
      setGroups(Array.isArray(raw) ? raw : []);
    } catch {
      setGroups([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get(USERS_API);
      const raw = res?.data?.users ?? res?.data ?? [];
      setUsers(normalizeUsers(Array.isArray(raw) ? raw : []));
    } catch {
      setUsers([]);
    }
  };

  const fetchCountries = async () => {
    // Placeholder for fetching country list (e.g., API call or predefined list)
    const countryList = [
      { code: 'IN', name: 'India' },
      { code: 'US', name: 'United States' },
      { code: 'UK', name: 'United Kingdom' },
      // Add more countries as needed
    ];
    setCountries(countryList);
  };

  const fetchCities = async (countryCode) => {
    // Placeholder for fetching cities based on selected country
    const cityList = {
      IN: ['New Delhi', 'Mumbai', 'Kolkata'],
      US: ['New York', 'Los Angeles', 'Chicago'],
      UK: ['London', 'Manchester', 'Birmingham'],
    };

    setCities(cityList[countryCode] || []);
  };

  useEffect(() => {
    fetchGroups();
    fetchUsers();
    fetchCountries();
  }, []);

  useEffect(() => {
    if (form.groupcountry) {
      fetchCities(form.groupcountry);
    }
  }, [form.groupcountry]);

  const resetForm = () => setForm(initialForm);

  // Email Validation Function (no longer restricted to .in or .com)
  const validateEmail = (email) => {
    // We lowercase before calling this, so case-sensitive regex is fine
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  // ---- AUTO-GENERATE GROUPID ----
  const generateNextGroupId = () => {
    if (!groups || groups.length === 0) return 'Group_001';
    let maxNum = 0;
    groups.forEach(g => {
      const match = String(g.groupid).match(/^Group_(\d{3,})$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = (maxNum + 1).toString().padStart(3, '0');
    return `Group_${nextNum}`;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setMessage('');

    // 🔽 Always lower-case email before validate & send
    const emailLower = normalizeEmailLower(form.groupemailid);

    if (!form.groupid || !form.groupdesc) {
      setError('Group ID and Description are required');
      return;
    }
    if (!/^\d{6}$/.test(form.grouppin)) {
      setError('PIN code must be a 6-digit number');
      return;
    }
    if (!validateEmail(emailLower)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      if (editing) {
        await axios.put(joinUrl(API, `update/${form.groupid}`), {
          ...form,
          groupemailid: emailLower, // ensure lowercase to DB
        });
        setMessage('Group updated');
      } else {
        // On submit (for create) — generates and sends with POST
        const newId = generateNextGroupId();
        const payload = { ...form, groupid: newId, groupemailid: emailLower }; // ensure lowercase to DB
        await axios.post(joinUrl(API, 'add'), payload);
        setMessage(`Group added with ID ${newId}`);
      }
      setShowForm(false);
      setEditing(false);
      resetForm();
      fetchGroups();
    } catch {
      setError('Failed to submit');
    }
  };

  const handleEdit = (g) => {
    setForm({
      ...g,
      // normalize email to lowercase when loading into the form
      groupemailid: normalizeEmailLower(g.groupemailid || ''),
      group_user_id:
        g.group_user_id !== undefined && g.group_user_id !== null
          ? String(g.group_user_id)
          : '',
    });
    setEditing(true);
    setShowForm(true);
    setMessage('');
    setError('');
  };

  // CHANGED: clicking Delete now opens the confirmation popup (no window.confirm)
  const handleDelete = (id, label = '') => {
    setConfirmDel({ open: true, id, label });
  };

  // NEW: proceed with deletion after confirming
  const confirmDeleteNow = async () => {
    if (!confirmDel?.id) return;
    try {
      await axios.delete(joinUrl(API, `delete/${confirmDel.id}`));
      setGroups(gs => gs.filter(x => String(x.groupid) !== String(confirmDel.id)));
      setMessage('Group deleted');
    } catch {
      setError('Delete failed');
    } finally {
      setConfirmDel({ open: false, id: null, label: '' });
    }
  };

  const closeConfirm = () => setConfirmDel({ open: false, id: null, label: '' });

  const handleCancel = () => {
    setShowForm(false);
    setEditing(false);
    resetForm();
    setError('');
    setMessage('');
  };

  // Filter + pagination
  const filteredGroups = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return groups;
    return groups.filter(g =>
      [
        g.groupid,
        g.groupdesc,
        g.groupcorporateaddress,
        g.groupcity,
        g.grouppin,
        g.groupcountry,
        g.groupemailid,
        g.grouprole,
        g.group_user_id,
      ]
        .map(v => String(v ?? '').toLowerCase())
        .some(txt => txt.includes(s))
    );
  }, [groups, query]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = filteredGroups.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

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

      <h1 className="mu-title">GROUP OF INSTITUTE</h1>

      {/* Toolbar with Search + Add button */}
      <div className="mu-toolbar">
        <label className="searchbox" aria-label="Search groups">
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
        {/* When opening the Add form (pre-fills a new ID) */}
        <button
          className="btn btn--add"
          onClick={() => {
            setEditing(false);
            setMessage('');
            setError('');
            const newId = generateNextGroupId();
            setForm({ ...initialForm, groupid: newId });
            setShowForm(true);
          }}
        >
          <span className="btn-plus">＋</span> Add
        </button>
      </div>

      {/* Table Card */}
      <div className="mu-tablewrap-outer">
        <div className="mu-tablewrap">

          <div className="mu-tablecard" style={{ overflow: 'visible' }}>
            <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
              <table className="mu-table">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">Group ID</th>
                    <th className="mu-th">Description</th>
                    <th className="mu-th">Address</th>
                    <th className="mu-th">City</th>
                    <th className="mu-th">PIN</th>
                    <th className="mu-th">Country</th>
                    <th className="mu-th">Email ID</th>
                    <th className="mu-th">Role</th>
                    <th className="mu-th">User ID</th>
                    <th className="mu-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td className="mu-td mu-empty" colSpan={10}>No groups found.</td>
                    </tr>
                  ) : (
                    pageItems.map(g => (
                      <tr key={g.groupid}>
                        <td className="mu-td">{g.groupid}</td>
                        <td className="mu-td">{g.groupdesc}</td>
                        <td className="mu-td" title={g.groupcorporateaddress}>{g.groupcorporateaddress}</td>
                        <td className="mu-td">{g.groupcity}</td>
                        <td className="mu-td">{g.grouppin}</td>
                        <td className="mu-td">{g.groupcountry}</td>
                        <td className="mu-td" title={g.groupemailid}>{g.groupemailid}</td>
                        <td className="mu-td">{g.grouprole}</td>
                        <td className="mu-td">{g.group_user_id}</td>
                        <td className="mu-td">
                          <button className="btn btn--primary" onClick={() => handleEdit(g)}>Edit</button>
                          <button
                            className="btn btn--danger"
                            onClick={() => handleDelete(g.groupid, g.groupemailid || g.groupdesc || String(g.groupid))}
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

            {/* Screenshot-style pagination */}
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

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={handleCancel}>
          <form className="modal modal--wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <button type="button" className="modal-x" onClick={handleCancel}>×</button>
            <h3 className="modal-heading">{editing ? 'Edit Group' : 'Add Group of Institute'}</h3>

            <div className="form-grid form-grid--3">
              <div className="form-row">
                <label className="form-label">Group ID</label>
                <input
                  className="form-input"
                  name="groupid"
                  value={form.groupid}
                  onChange={e => setForm(f => ({ ...f, groupid: e.target.value }))}
                  disabled={editing}
                  required
                />
              </div>

              <div className="form-row">
                <label className="form-label">Description</label>
                <input
                  className="form-input"
                  name="groupdesc"
                  value={form.groupdesc}
                  onChange={e => setForm(f => ({ ...f, groupdesc: e.target.value }))}
                  required
                />
              </div>

              <div className="form-row">
                <label className="form-label">Corporate Address</label>
                <input
                  className="form-input"
                  name="groupcorporateaddress"
                  value={form.groupcorporateaddress}
                  onChange={e => setForm(f => ({ ...f, groupcorporateaddress: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">PIN</label>
                <input
                  className="form-input"
                  name="grouppin"
                  value={form.grouppin}
                  onChange={e => setForm(f => ({ ...f, grouppin: e.target.value }))}
                  maxLength="6"
                  pattern="\d{6}"
                  required
                />
              </div>

              <div className="form-row">
                <label className="form-label">Country</label>
                <select
                  className="form-input"
                  name="groupcountry"
                  value={form.groupcountry}
                  onChange={e => setForm(f => ({ ...f, groupcountry: e.target.value }))}
                  required
                >
                  <option value="">Select Country</option>
                  {countries.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label className="form-label">City</label>
                <select
                  className="form-input"
                  name="groupcity"
                  value={form.groupcity}
                  onChange={e => setForm(f => ({ ...f, groupcity: e.target.value }))}
                >
                  <option value="">Select City</option>
                  {cities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">Email ID</label>
                <input
                  className="form-input"
                  name="groupemailid"
                  value={form.groupemailid}
                  onChange={e => setForm(f => ({ ...f, groupemailid: normalizeEmailLower(e.target.value) }))}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Role</label>
                <select
                  className="form-input"
                  name="grouprole"
                  value={form.grouprole}
                  onChange={e => setForm(f => ({ ...f, grouprole: e.target.value }))}
                >
                  <option value="">Select Role</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">User ID</label>
                <select
                  className="form-input"
                  name="group_user_id"
                  value={String(form.group_user_id ?? '')}
                  onChange={e => setForm(f => ({ ...f, group_user_id: e.target.value }))}
                >
                  <option value="">Select User</option>
                  {users.map(u => (
                    <option key={u.userid} value={String(u.userid)}>{u.userid} — {u.username}</option>
                  ))}
                </select>
              </div>
            </div>

            {!!error && <div className="modal-desc modal-desc--error">{error}</div>}
            {!!message && <div className="modal-desc modal-desc--ok">{message}</div>}

            <div className="modal-actions">
              <button type="submit" className="btn btn--primary">{editing ? 'Update' : 'Add'} Group</button>
              <button type="button" className="btn btn--secondary" onClick={handleCancel}>Cancel</button>
            </div>

            <button type="button" className="btn btn--close-fullwidth" onClick={handleCancel}>Close</button>
          </form>
        </div>
      )}

      {/* NEW: Delete confirm popup (matches your screenshot) */}
      {confirmDel.open && (
        <div className="confirm-overlay" onClick={closeConfirm}>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <button className="confirm-x" onClick={closeConfirm}>×</button>
            <div className="confirm-title">Delete Group?</div>
            <div className="confirm-desc">Are you sure you want to delete:</div>
            <div className="confirm-user">
              {confirmDel.label || String(confirmDel.id)}
            </div>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-yes" onClick={confirmDeleteNow}>Yes, Delete</button>
              <button className="confirm-btn confirm-cancel" onClick={closeConfirm}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollegeGroupManager;