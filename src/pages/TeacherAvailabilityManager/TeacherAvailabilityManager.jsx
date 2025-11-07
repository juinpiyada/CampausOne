// SMS-ui/src/pages/TeacherAvailability/TeacherAvailabilityManager.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css';

/* ---------- helpers ---------- */
const joinUrl = (base = '', path = '') =>
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

const getDayName = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
};

/* ---------- routes ---------- */
const TEACHERS_API = joinUrl(config.TEACHER_ROUTE);              // e.g. /api/teacher
const AVAIL_API    = joinUrl(config.TEACHER_AVAILABILITY_ROUTE); // e.g. /api/teacher-availability

/* ---------- constants ---------- */
const PAGE_SIZE = 6;

/** ⏱ Slot definitions mirroring DailyRoutine’s slot set (A1–D2). */
const SLOT_DEFS = [
  { code: 'A1', from: '08:00', to: '09:00' },
  { code: 'A2', from: '09:00', to: '10:00' },
  { code: 'B1', from: '10:00', to: '11:00' },
  { code: 'B2', from: '11:00', to: '12:00' },
  { code: 'C1', from: '12:00', to: '13:00' },
  { code: 'C2', from: '13:00', to: '14:00' },
  { code: 'D1', from: '14:00', to: '15:00' },
  { code: 'D2', from: '15:00', to: '16:00' },
];

const initialForm = {
  teaacheravlid: '',
  teacherid: '',
  avldate: '',
  slotcode: '',       // local-only: A1..D2
  slottime: '',       // saved to API => "HH:MM - HH:MM"
  avlflafr: false,
};

export default function TeacherAvailabilityManager() {
  /* ---------- state ---------- */
  const [availabilities, setAvailabilities] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  /* ---------- fetchers ---------- */
  const fetchTeachers = async () => {
    try {
      const res = await axios.get(TEACHERS_API);
      setTeachers(pickArray(res.data));
    } catch {
      setTeachers([]);
    }
  };

  const fetchAvailabilities = async () => {
    setLoading(true);
    try {
      const res = await axios.get(AVAIL_API);
      setAvailabilities(pickArray(res.data));
    } catch {
      setError('Failed to fetch teacher availability');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
    fetchAvailabilities();
  }, []);

  /* ---------- ID generator ---------- */
  const generateNextId = () => {
    if (!availabilities || availabilities.length === 0) return 'TECH_AVAL_001';
    const ids = availabilities
      .map((a) => a.teaacheravlid)
      .filter((id) => typeof id === 'string' && id.startsWith('TECH_AVAL_'));
    if (ids.length === 0) return 'TECH_AVAL_001';
    const maxNum = Math.max(
      ...ids.map((id) => {
        const num = parseInt(id.replace('TECH_AVAL_', ''), 10);
        return Number.isNaN(num) ? 0 : num;
      })
    );
    return `TECH_AVAL_${String(maxNum + 1).padStart(3, '0')}`;
  };

  /* ---------- handlers ---------- */
  const resetForm = () => setForm(initialForm);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  /** When user selects a slot code, auto-set slottime "HH:MM - HH:MM". */
  const handleSlotChange = (e) => {
    const slotcode = e.target.value;
    const def = SLOT_DEFS.find((s) => s.code === slotcode);
    setForm((f) => ({
      ...f,
      slotcode,
      slottime: def ? `${def.from} - ${def.to}` : '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      if (editing) {
        await axios.put(joinUrl(AVAIL_API, form.teaacheravlid), {
          teaacheravlid: form.teaacheravlid,
          teacherid: form.teacherid,
          avldate: form.avldate,
          slottime: form.slottime,
          avlflafr: form.avlflafr,
        });
        setMessage('Availability updated');
      } else {
        await axios.post(AVAIL_API, {
          teaacheravlid: form.teaacheravlid,
          teacherid: form.teacherid,
          avldate: form.avldate,
          slottime: form.slottime,
          avlflafr: form.avlflafr,
        });
        setMessage('Availability added');
      }
      setShowForm(false);
      setEditing(false);
      resetForm();
      fetchAvailabilities();
    } catch {
      setError('Failed to save availability');
    }
  };

  const inferSlotFromTime = (slottime = '') => {
    const m = String(slottime).match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (!m) return '';
    const [_, from, to] = m;
    const hit = SLOT_DEFS.find((s) => s.from === from && s.to === to);
    return hit?.code || '';
  };

  const handleEdit = (row) => {
    const slotcode = inferSlotFromTime(row.slottime);
    setForm({
      teaacheravlid: row.teaacheravlid || '',
      teacherid: row.teacherid || '',
      avldate: row.avldate || '',
      slotcode,
      slottime: row.slottime || '',
      avlflafr: !!row.avlflafr,
    });
    setEditing(true);
    setShowForm(true);
    setMessage(''); setError('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this availability?')) return;
    setMessage(''); setError('');
    try {
      await axios.delete(joinUrl(AVAIL_API, id));
      setAvailabilities((list) => list.filter((r) => r.teaacheravlid !== id));
      setMessage('Availability deleted');
    } catch {
      setError('Failed to delete availability');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(false);
    resetForm();
    setMessage(''); setError('');
  };

  const handleAddClick = () => {
    const nextId = generateNextId();
    setForm({ ...initialForm, teaacheravlid: nextId });
    setEditing(false);
    setShowForm(true);
    setMessage(''); setError('');
  };

  /* ---------- filter + pagination ---------- */
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return availabilities;
    return availabilities.filter((r) =>
      [r.teaacheravlid, r.teacherid, r.avldate, r.slottime, (r.avlflafr ? 'yes' : 'no')]
        .map((v) => String(v ?? '').toLowerCase())
        .some((txt) => txt.includes(s))
    );
  }, [availabilities, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  /* ---------- render ---------- */
  const dayOfWeek = getDayName(form.avldate);

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

      <h1 className="mu-title">Teacher Availability</h1>

      {/* Toolbar */}
      <div className="mu-toolbar">
        <label className="searchbox" aria-label="Search availability">
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

        <button className="btn btn--add" onClick={handleAddClick}>
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
                  <th className="mu-th">Availability ID</th>
                  <th className="mu-th">Teacher</th>
                  <th className="mu-th">Date</th>
                  <th className="mu-th">Slot</th>
                  <th className="mu-th">Available</th>
                  <th className="mu-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="mu-td mu-empty" colSpan={6}>Loading...</td></tr>
                ) : pageItems.length === 0 ? (
                  <tr><td className="mu-td mu-empty" colSpan={6}>No records found</td></tr>
                ) : (
                  pageItems.map((row) => {
                    const t = teachers.find((x) => x.teacherid === row.teacherid);
                    const slotcode = inferSlotFromTime(row.slottime);
                    return (
                      <tr key={row.teaacheravlid}>
                        <td className="mu-td">{row.teaacheravlid}</td>
                        <td className="mu-td">
                          {t ? <span className="mu-td--userid">{t.teachername}</span> : row.teacherid}
                        </td>
                        <td className="mu-td">{row.avldate}</td>
                        <td className="mu-td">
                          {slotcode ? `${slotcode} (${row.slottime})` : row.slottime}
                        </td>
                        <td className="mu-td">
                          <span className={`status ${row.avlflafr ? 'status--active' : 'status--inactive'}`}>
                            {row.avlflafr ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="mu-td">
                          <button className="btn btn--primary" onClick={() => handleEdit(row)}>Edit</button>
                          <button className="btn btn--danger" onClick={() => handleDelete(row.teaacheravlid)}>Delete</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination (chips style) */}
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
            <h3 className="modal-heading">{editing ? 'Edit Availability' : 'Add Availability'}</h3>

            <div className="form-grid form-grid--3">
              <div className="form-row">
                <label className="form-label">Availability ID</label>
                <input className="form-input" name="teaacheravlid" value={form.teaacheravlid} readOnly disabled required />
              </div>

              <div className="form-row">
                <label className="form-label">Teacher</label>
                <select
                  className="form-input"
                  name="teacherid"
                  value={form.teacherid}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Select Teacher --</option>
                  {teachers.map((t) => (
                    <option key={t.teacherid ?? t.id} value={t.teacherid ?? t.id}>
                      {(t.teachername ?? t.name)
                        ? `${t.teachername ?? t.name} (${t.teacherid ?? t.id})`
                        : (t.teacherid ?? t.id)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">Date</label>
                <input
                  className="form-input"
                  type="date"
                  name="avldate"
                  value={form.avldate}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row">
                <label className="form-label">Day of Week</label>
                <input
                  className="form-input"
                  value={dayOfWeek || 'Auto-calculated'}
                  readOnly
                  disabled
                />
              </div>

              <div className="form-row">
                <label className="form-label">Slot</label>
                <select
                  className="form-input"
                  name="slotcode"
                  value={form.slotcode}
                  onChange={handleSlotChange}
                  required
                >
                  <option value="">Select Slot</option>
                  {SLOT_DEFS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {`${s.code} (${s.from} - ${s.to})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">Time</label>
                <input
                  className="form-input"
                  name="slottime"
                  value={form.slottime}
                  placeholder="Auto-set from slot"
                  readOnly
                />
              </div>

              <div className="form-row">
                <label className="form-label">Available</label>
                <div>
                  <input
                    type="checkbox"
                    id="avlflafr"
                    name="avlflafr"
                    checked={form.avlflafr}
                    onChange={handleChange}
                  />{' '}
                  <label htmlFor="avlflafr">Available for Faculty/Arrangement?</label>
                </div>
              </div>
            </div>

            {!!error && <div className="modal-desc modal-desc--error">{error}</div>}
            {!!message && <div className="modal-desc modal-desc--ok">{message}</div>}

            <div className="modal-actions">
              <button type="submit" className="btn btn--primary">{editing ? 'Update' : 'Add'} Availability</button>
              <button type="button" className="btn btn--secondary" onClick={handleCancel}>Cancel</button>
            </div>

            <button type="button" className="btn btn--close-fullwidth" onClick={handleCancel}>Close</button>
          </form>
        </div>
      )}
    </div>
  );
}
