import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import '../../index.css';

/* ---------- utils ---------- */
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

/* API endpoints */
const API          = joinUrl(config.CLASS_ROOM_ROUTE);
const COLLEGES_API = joinUrl(config.COLLEGES_ROUTE, 'view-colleges');
const DEPTS_API    = joinUrl(config.MASTER_DEPTS_ROUTE);

const CLASSROOMS_PER_PAGE = 4;

/* Default address + safe fallback coords (Kolkata center) */
const DEFAULT_ADDRESS =
  'Dakshin Gobindapur Rd, Dakshin Gobindopur, Rajpur Sonarpur, Jaynagar, West Bengal 700145';
const DEFAULT_LAT  = 22.5726;
const DEFAULT_LONG = 88.3639;

/* ---------- main ---------- */
export default function ClassroomManager() {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [deleteLabel, setDeleteLabel] = useState('');

  const initialForm = {
    classroomid: '',
    classroomcollege: '',
    classroomdept: '',
    classroomcode: '',
    classroomname: '',     // auto-filled for API
    classroomtype: '',     // auto-filled for API
    classroomcapacity: '',
    classroomisavailable: false,
    classroomprojector: false,
    classfloornumber: '',
    classroomlat: '',
    classroomlong: '',
    classroomloc: ''
  };
  const [formData, setFormData] = useState(initialForm);
  const [editId, setEditId] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 2500);
  };

  const fetchClassrooms = async () => {
    try {
      const res = await axios.get(API);
      const raw = res?.data?.classrooms ?? res?.data ?? [];
      setClassrooms(Array.isArray(raw) ? raw : []);
    } catch {
      setClassrooms([]);
      showToast('Failed to load classrooms', 'error');
    }
  };
  useEffect(() => { fetchClassrooms(); }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classrooms;
    return classrooms.filter(cls =>
      [
        cls.classroomid,
        cls.classroomcollege,
        cls.classroomdept,
        cls.classroomcode,
        cls.classroomcapacity,
        cls.classfloornumber,
        cls.classroomlat,
        cls.classroomlong,
        cls.classroomloc
      ].map(x => String(x ?? '').toLowerCase()).join(' ').includes(q)
    );
  }, [classrooms, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / CLASSROOMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * CLASSROOMS_PER_PAGE, page * CLASSROOMS_PER_PAGE);
  useEffect(() => { setPage(1); }, [search]);

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };
  const resetForm = () => { setFormData(initialForm); setEditId(null); };

  /* ---------- payload builder & validation ---------- */
  const buildPayload = (raw) => {
    const trim = (v) => String(v ?? '').trim();

    const payload = {
      classroomid: trim(raw.classroomid),
      classroomcollege: trim(raw.classroomcollege),
      classroomdept: trim(raw.classroomdept),
      classroomcode: trim(raw.classroomcode),
      classroomname: trim(raw.classroomname),
      classroomtype: trim(raw.classroomtype),
      classroomcapacity: raw.classroomcapacity === '' ? '' : Number(raw.classroomcapacity),
      classroomisavailable: !!raw.classroomisavailable,
      classroomprojector: !!raw.classroomprojector,
      classfloornumber: raw.classfloornumber === '' ? '' : Number(raw.classfloornumber),
      classroomlat: trim(raw.classroomlat),
      classroomlong: trim(raw.classroomlong),
      classroomloc: trim(raw.classroomloc),
    };

    if (!payload.classroomname) payload.classroomname = payload.classroomcode || `${payload.classroomdept || 'Room'}`;
    if (!payload.classroomtype) payload.classroomtype = 'General';

    if (!payload.classroomid) throw new Error('Classroom ID is required.');
    if (!payload.classroomcollege) throw new Error('Please select a College.');
    if (!payload.classroomdept) throw new Error('Please select a Department.');
    if (!payload.classroomcode) throw new Error('Code is required.');
    if (payload.classroomcapacity !== '' && Number.isNaN(payload.classroomcapacity)) throw new Error('Capacity must be a number.');
    if (payload.classfloornumber !== '' && Number.isNaN(payload.classfloornumber)) throw new Error('Floor No. must be a number.');
    if (payload.classroomlat !== '' && Number.isNaN(Number(payload.classroomlat))) throw new Error('Latitude must be numeric or left blank.');
    if (payload.classroomlong !== '' && Number.isNaN(Number(payload.classroomlong))) throw new Error('Longitude must be numeric or left blank.');
    if (payload.classroomlat !== '')  payload.classroomlat  = Number(payload.classroomlat);
    if (payload.classroomlong !== '') payload.classroomlong = Number(payload.classroomlong);

    return payload;
  };

  /* ---------- add ---------- */
  const handleAddOpen = () => {
    resetForm();
    // Prefill all three immediately so the user sees values even if geocoding is slow
    setFormData(prev => ({
      ...prev,
      classroomid: generateClassroomId(),
      classroomloc: DEFAULT_ADDRESS,
      classroomlat: String(DEFAULT_LAT),
      classroomlong: String(DEFAULT_LONG)
    }));
    setShowAddModal(true);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = buildPayload(formData);
      await axios.post(API, payload);
      setShowAddModal(false);
      resetForm();
      await fetchClassrooms();
      setPage(1);
      showToast('Classroom added successfully', 'success');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error adding classroom';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ---------- edit ---------- */
  const handleEditOpen = (cls) => {
    setFormData({
      classroomid: cls.classroomid ?? '',
      classroomcollege: cls.classroomcollege ?? '',
      classroomdept: cls.classroomdept ?? '',
      classroomcode: cls.classroomcode ?? '',
      classroomname: cls.classroomname ?? '',
      classroomtype: cls.classroomtype ?? '',
      classroomcapacity: cls.classroomcapacity ?? '',
      classroomisavailable: !!cls.classroomisavailable,
      classroomprojector: !!cls.classroomprojector,
      classfloornumber: cls.classfloornumber ?? '',
      classroomlat: cls.classroomlat ?? '',
      classroomlong: cls.classroomlong ?? '',
      classroomloc: cls.classroomloc ?? ''
    });
    setEditId(cls.classroomid);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editId) return;
    setLoading(true);
    try {
      const payload = buildPayload(formData);
      await axios.put(joinUrl(API, String(editId)), payload);
      setShowEditModal(false);
      resetForm();
      await fetchClassrooms();
      showToast('Classroom updated successfully', 'success');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error updating classroom';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ---------- delete ---------- */
  const promptDelete = (cls) => {
    setDeleteId(cls.classroomid);
    setDeleteLabel(`${cls.classroomcode || cls.classroomid}`);
  };
  const confirmDelete = async () => {
    if (!deleteId) return;
    setLoading(true);
    try {
      await axios.delete(joinUrl(API, String(deleteId)));
      setDeleteId(null);
      setDeleteLabel('');
      await fetchClassrooms();
      setPage(1);
      showToast('Classroom deleted successfully', 'success');
    } catch (err) {
      const msg = err?.response?.data?.error || 'Error deleting classroom';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };
  const cancelDelete = () => { setDeleteId(null); setDeleteLabel(''); };

  const generateClassroomId = () => {
    const n = classrooms.length + 1;
    return `CLASSROOM_ID_${String(n).padStart(3, '0')}`;
  };

  return (
    <div className="mu-page classroom-slim">
      {toast.show && (
        <div className="toast-wrapper">
          <div className={`toast-box ${toast.type === 'error' ? 'toast--error' : 'toast--success'}`}>
            <span className="toast-emoji">{toast.type === 'error' ? '⚠️' : '✅'}</span>
            <span className="toast-text">{toast.message}</span>
            <button onClick={() => setToast({ show: false, message: '', type: '' })} className="toast-close" aria-label="Close">×</button>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay">
          <div className="modal">
            <button onClick={cancelDelete} className="modal-x" title="Close" aria-label="Close">×</button>
            <div className="modal-title danger">Delete Classroom?</div>
            <div className="modal-desc">
              Are you sure you want to delete:<br />
              <span className="highlight">{deleteLabel}</span> ?
            </div>
            <div className="modal-actions">
              <button onClick={confirmDelete} disabled={loading} className="btn btn--danger">
                {loading ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button onClick={cancelDelete} disabled={loading} className="btn btn--secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="mu-container">
        <h2 className="mu-title">ROOM</h2>

        <div className="mu-toolbar">
          <div className="searchbox">
            <span className="searchbox__icon" aria-hidden="true">
              <svg width="23" height="23" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </span>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="searchbox__input"
            />
          </div>

          <button onClick={handleAddOpen} className="btn btn--add">
            <span className="btn-plus">+</span> Add
          </button>
        </div>

        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">
            <div className="mu-tablecard">
              <table className="mu-table">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">ID</th>
                    <th className="mu-th">College</th>
                    <th className="mu-th">Dept</th>
                    <th className="mu-th">Code</th>
                    <th className="mu-th">Capacity</th>
                    <th className="mu-th">Floor</th>
                    <th className="mu-th">Available</th>
                    <th className="mu-th">Projector</th>
                    <th className="mu-th">Lat</th>
                    <th className="mu-th">Long</th>
                    <th className="mu-th">Loc</th>
                    <th className="mu-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((cls) => (
                    <tr key={cls.classroomid}>
                      <td className="mu-td mu-td--userid">{cls.classroomid}</td>
                      <td className="mu-td">{cls.classroomcollege}</td>
                      <td className="mu-td">{cls.classroomdept}</td>
                      <td className="mu-td">{cls.classroomcode}</td>
                      <td className="mu-td">{cls.classroomcapacity}</td>
                      <td className="mu-td">{cls.classfloornumber}</td>
                      <td className="mu-td">
                        <span className={`status ${cls.classroomisavailable ? 'status--active' : 'status--inactive'}`}>
                          {cls.classroomisavailable ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="mu-td">
                        <span className={`status ${cls.classroomprojector ? 'status--active' : 'status--inactive'}`}>
                          {cls.classroomprojector ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="mu-td">{cls.classroomlat}</td>
                      <td className="mu-td">{cls.classroomlong}</td>
                      <td className="mu-td">{cls.classroomloc}</td>
                      <td className="mu-td">
                        <button onClick={() => handleEditOpen(cls)} className="btn btn--primary">Edit</button>
                        <button onClick={() => promptDelete(cls)} className="btn btn--danger">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={12} className="mu-empty">No classrooms found</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="mu-pagination">
                <span className="mu-pageinfo">Showing page <b>{page}</b> of <b>{totalPages}</b> pages</span>
                <div className="mu-pagebtns">
                  <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="btn-page" aria-label="Previous page">«</button>
                  <span className="badge-page">{page}</span>
                  <button disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="btn-page" aria-label="Next page">»</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showAddModal && (
          <Modal title="Add Classroom" onClose={() => setShowAddModal(false)} showCross wide>
            <ClassroomForm
              onSubmit={handleAddSubmit}
              formData={formData}
              onChange={handleFormChange}
              loading={loading}
              isEdit={false}
            />
          </Modal>
        )}

{showEditModal && (
  <Modal title="Edit Classroom" onClose={() => setShowEditModal(false)} showCross wide>
    <ClassroomForm
      onSubmit={handleEditSubmit}
      formData={formData}
      onChange={handleFormChange}
      loading={loading}
      isEdit
    />
  </Modal>
)}

      </div>
    </div>
  );
}

/* ---------- modal wrapper (supports `wide`) ---------- */
function Modal({ title, onClose, children, showCross, wide = false }) {
  const modalStyle = wide ? { maxWidth: '1100px', width: '90vw' } : undefined;
  return (
    <div className="modal-overlay">
      <div className="modal" style={modalStyle}>
        {showCross && (
          <button onClick={onClose} className="modal-x" title="Close" aria-label="Close">×</button>
        )}
        <h3 className="modal-heading">{title}</h3>
        {children}
        <button onClick={onClose} className="btn btn--close-fullwidth">Close</button>
      </div>
    </div>
  );
}

/* ---------- Add/Edit Form (4 per row + auto-fill & geocode) ---------- */
function ClassroomForm({ onSubmit, formData, onChange, loading, isEdit }) {
  const [collegeList, setCollegeList] = useState([]);
  const [deptList, setDeptList] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const geoTimer = useRef(null);
  const lastGeoFor = useRef('');

  const updateField = (name, value) => {
    onChange({ target: { name, value, type: 'text' } });
  };

  // dropdowns
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get(COLLEGES_API);
        const raw = res?.data?.colleges ?? res?.data ?? [];
        if (alive) setCollegeList(Array.isArray(raw) ? raw : []);
      } catch { if (alive) setCollegeList([]); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get(DEPTS_API);
        const raw = Array.isArray(res?.data) ? res.data : (res?.data?.departments ?? res?.data ?? []);
        const list = (raw || []).map(d => ({
          id: d.collegedeptid ?? d.id ?? '',
          desc: d.collegedeptdesc ?? d.description ?? d.name ?? '',
          code: d.colldept_code ?? d.code ?? ''
        }));
        if (alive) setDeptList(list);
      } catch { if (alive) setDeptList([]); }
    })();
    return () => { alive = false; };
  }, []);

  // ensure default location present in Add form
  useEffect(() => {
    if (!isEdit && !formData.classroomloc) {
      updateField('classroomloc', DEFAULT_ADDRESS);
      updateField('classroomlat', String(DEFAULT_LAT));
      updateField('classroomlong', String(DEFAULT_LONG));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // geocode address -> lat/long (overwrite the defaults when successful)
  useEffect(() => {
    const q = (formData.classroomloc || '').trim();
    if (!q || q === lastGeoFor.current) return;

    if (geoTimer.current) clearTimeout(geoTimer.current);
    geoTimer.current = setTimeout(async () => {
      setGeoLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const data = await resp.json();
        if (Array.isArray(data) && data[0]) {
          const { lat, lon } = data[0];
          updateField('classroomlat', String(lat));
          updateField('classroomlong', String(lon));
          lastGeoFor.current = q;
        }
        // if not found, we keep the prefilled defaults
      } catch {
        // ignore; keep defaults
      } finally {
        setGeoLoading(false);
      }
    }, 200);

    return () => { if (geoTimer.current) clearTimeout(geoTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.classroomloc]);

  return (
    <form onSubmit={onSubmit}>
      <div
        className="form-grid form-grid--3"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}
      >
        <div className="form-row">
          <label className="form-label">Classroom ID</label>
          <input
            className="form-input"
            type="text"
            name="classroomid"
            value={formData.classroomid}
            onChange={onChange}
            disabled={isEdit}
            required
            autoComplete="off"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Code</label>
          <input
            className="form-input"
            type="text"
            name="classroomcode"
            value={formData.classroomcode}
            onChange={onChange}
            autoComplete="off"
          />
        </div>

        <div className="form-row">
          <label className="form-label">College</label>
          <select
            className="form-input"
            name="classroomcollege"
            value={formData.classroomcollege}
            onChange={onChange}
          >
            <option value="">Select College</option>
            {collegeList.map(c => (
              <option key={c.collegeid} value={c.collegename}>
                {c.collegename} ({c.collegeid})
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">Department</label>
          <select
            className="form-input"
            name="classroomdept"
            value={formData.classroomdept}
            onChange={onChange}
          >
            <option value="">Select Department</option>
            {deptList.map(d => (
              <option key={d.id} value={d.desc}>
                {d.desc}{d.code ? ` (${d.code})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
  <label className="form-label" htmlFor="classroomcapacity">Capacity</label>
  <input
    id="classroomcapacity"
    className="form-input"
    type="number"
    name="classroomcapacity"
    value={formData.classroomcapacity ?? ""}
    placeholder="e.g., 30"
    inputMode="numeric"
    autoComplete="off"
    min={1}
    step={1}
    onKeyDown={(e) => {
      // block non-integer / sign / exponent keys
      if (['e','E','+','-','.'].includes(e.key)) e.preventDefault();
    }}
    onWheel={(e) => e.currentTarget.blur()} // stops mouse wheel changes
    onChange={onChange}
    onBlur={(e) => {
      const n = Number(e.target.value);
      if (!Number.isFinite(n) || n < 1) {
        // snap to 1 if empty/invalid/less than 1
        onChange({ target: { name: 'classroomcapacity', value: '1' } });
      } else {
        onChange({ target: { name: 'classroomcapacity', value: String(Math.floor(n)) } });
      }
    }}
  />
</div>


        <div className="form-row">
  <label className="form-label" htmlFor="classfloornumber">Floor No.</label>
  <input
    id="classfloornumber"
    className="form-input"
    type="number"
    name="classfloornumber"
    value={formData.classfloornumber ?? ""}
    placeholder="e.g., 1"
    inputMode="numeric"
    autoComplete="off"
    min={1}
    step={1}
    onKeyDown={(e) => {
      if (['e','E','+','-','.'].includes(e.key)) e.preventDefault(); // block non-integers/signs
    }}
    onWheel={(e) => e.currentTarget.blur()} // prevent scroll changes
    onChange={onChange}
    onBlur={(e) => {
      const n = Number(e.target.value);
      const next = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
      onChange({ target: { name: 'classfloornumber', value: String(next) } });
    }}
  />
</div>

        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">
            Location (Text) <small style={{ opacity: 0.7 }}>{geoLoading ? ' (auto…)' : ' (auto)'}</small>
          </label>
          <input
            className="form-input"
            type="text"
            name="classroomloc"
            value={formData.classroomloc}
            onChange={onChange}
            readOnly={!isEdit}
            autoComplete="off"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Latitude <small style={{ opacity: 0.7 }}>(auto)</small></label>
          <input className="form-input" type="text" name="classroomlat" value={formData.classroomlat} readOnly />
        </div>

        <div className="form-row">
          <label className="form-label">Longitude <small style={{ opacity: 0.7 }}>(auto)</small></label>
          <input className="form-input" type="text" name="classroomlong" value={formData.classroomlong} readOnly />
        </div>

        <div className="form-row">
          <label className="form-label">Available</label>
          <input
            className="form-input"
            type="checkbox"
            name="classroomisavailable"
            checked={!!formData.classroomisavailable}
            onChange={onChange}
          />
        </div>

        <div className="form-row">
          <label className="form-label">Projector</label>
          <input
            className="form-input"
            type="checkbox"
            name="classroomprojector"
            checked={!!formData.classroomprojector}
            onChange={onChange}
          />
        </div>
      </div>

      <button type="submit" disabled={loading} className={`btn btn--submit ${loading ? 'is-loading' : ''}`}>
        {loading ? 'Saving...' : (isEdit ? 'Update Classroom' : 'Add Classroom')}
      </button>
    </form>
  );
}