import React, { useEffect, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config'; 

// ---- Safe URL joiner (prevents double slashes / duplicated bases)
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // absolute path provided
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

// Build API root and route from env
const BASE = joinUrl(config.BASE_URL || '', config.API_PREFIX || ''); 
const MENU_API = joinUrl(BASE, config.MENU_MASTER_ROUTE || '/menu-master');

const ITEMS_PER_PAGE = 5;

const MenuManager = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [form, setForm] = useState({ menuid: '', menurole: '', menudesc: '', menulink: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const fetchMenuItems = async () => {
    try {
      const res = await axios.get(MENU_API);
      // supports either { menu: [...] } or [...] payloads
      const data = Array.isArray(res.data) ? res.data : (res.data?.menu || []);
      setMenuItems(data);
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // ✅ Auto-generate next Menu ID logic
  const generateNextMenuId = () => {
    if (menuItems.length === 0) return "Menu_001";
    const ids = menuItems
      .map(item => {
        const num = String(item.menuid || "").match(/\d+$/);
        return num ? parseInt(num[0], 10) : 0;
      })
      .filter(n => !isNaN(n));
    const nextNum = (ids.length > 0 ? Math.max(...ids) : 0) + 1;
    return `Menu_${String(nextNum).padStart(3, "0")}`;
  };

  const openAddModal = () => {
    setForm({ menuid: generateNextMenuId(), menurole: '', menudesc: '', menulink: '' });
    setIsEditing(false);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await axios.put(`${MENU_API}/${encodeURIComponent(form.menuid)}`, form);
        setToastMessage('Menu updated successfully');
      } else {
        await axios.post(MENU_API, { ...form, createdat: new Date(), updatedat: new Date() });
        setToastMessage('Menu added successfully');
      }
      fetchMenuItems();
      setShowModal(false);
      setTimeout(() => setToastMessage(''), 3000);
    } catch (error) {
      console.error('Submit error:', error);
    }
  };

  const handleEdit = (item) => {
    setForm(item);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${MENU_API}/${encodeURIComponent(toDelete)}`);
      fetchMenuItems();
      setShowDeleteModal(false);
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const filteredItems = menuItems.filter(item => {
    const id = String(item.menuid ?? '').toLowerCase();
    const role = String(item.menurole ?? '').toLowerCase();
    const desc = String(item.menudesc ?? '').toLowerCase();
    const q = searchTerm.toLowerCase();
    return id.includes(q) || role.includes(q) || desc.includes(q);
  });

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const labelStyle = { fontWeight: 'bold', marginBottom: 4, color: '#374151', fontSize: 14 };
  const thStyle = { padding: '16px 22px', textAlign: 'left', fontWeight: 800, fontSize: 17 };
  const tdStyle = { padding: '15px 22px', fontSize: 16 };
  const inputModalStyle = { padding: '12px 16px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '15px', backgroundColor: '#f9fafb' };

  return (
    <div style={{ padding: '30px', backgroundColor: '#eef3ff', minHeight: '100vh' }}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: '#4ade80', color: '#065f46', padding: '12px 20px', borderRadius: '10px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 1001 }}>
          ✅ {toastMessage}
        </div>
      )}

      <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: '800', color: '#3b0764', marginBottom: '20px' }}>Manage Menus</h2>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e0e7ff', padding: '20px', borderRadius: '20px', maxWidth: 1100, margin: '0 auto 30px' }}>
        <input
          type="text"
          placeholder="🔍 Search"
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          style={{ width: '100%', marginRight: '16px', padding: '14px 20px', borderRadius: '14px', border: 'none', outline: 'none', background: '#fff', fontSize: 16, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
        />
        <button
          onClick={openAddModal}
          style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.5)' }}>
          + Add
        </button>
      </div>

      <div style={{ width: '100%', maxWidth: 1100, background: 'linear-gradient(125deg,#f8fafc 70%, #e0e7ff 100%)', borderRadius: 22, boxShadow: '0 9px 32px rgba(102,102,255,0.11)', padding: '30px 22px 16px 22px', margin: '0 auto' }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: '#3f0071', marginBottom: '22px', paddingLeft: '5px' }}>All Menus</h2>
        <table style={{ width: '100%', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(90deg,#ede9fe,#c7d2fe 70%, #e0e7ff 100%)', color: '#3730a3' }}>
              <th style={{ ...thStyle, borderTopLeftRadius: 16 }}>Menu ID</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Link</th>
              <th style={{ ...thStyle, borderTopRightRadius: 16 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((item, idx) => (
              <tr key={item.menuid} style={{ background: idx % 2 === 0 ? '#f3f0ff' : '#fff' }}>
                <td style={{ ...tdStyle, color: '#1e3a8a', fontWeight: 700 }}>{item.menuid}</td>
                <td style={tdStyle}>{item.menurole}</td>
                <td style={tdStyle}>{item.menudesc}</td>
                <td style={tdStyle}>{item.menulink}</td>
                <td style={tdStyle}>
                  <button style={{ ...inputModalStyle, background: '#6366f1', color: '#fff', fontWeight: 'bold', marginRight: 8 }} onClick={() => handleEdit(item)}>Edit</button>
                  <button style={{ ...inputModalStyle, background: '#ef4444', color: '#fff', fontWeight: 'bold' }} onClick={() => { setToDelete(item.menuid); setShowDeleteModal(true); }}>Delete</button>
                </td>
              </tr>
            ))}
            {paginatedItems.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#818cf8', fontSize: 18, background: '#f3f0ff' }}>
                  No menu items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ marginTop: '22px', textAlign: 'center' }}>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              style={{ padding: '8px 14px', margin: '0 4px', borderRadius: '6px', border: '1px solid #ccc', background: currentPage === i + 1 ? '#ddd' : '#fff', cursor: 'pointer', fontWeight: 'bold' }}>
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Modal for Add/Edit Menu */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={handleSubmit} style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '36px 28px', width: '500px', boxShadow: '0 12px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '18px', position: 'relative' }}>
            <button type="button" onClick={() => setShowModal(false)} style={{ position: 'absolute', top: 10, right: 14, fontWeight: 'bold', fontSize: 20, border: 'none', background: 'transparent', cursor: 'pointer' }}>×</button>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#4338ca' }}>{isEditing ? 'Edit Menu' : 'Add Menu'}</h2>
            <div>
              <div style={labelStyle}>Menu ID</div>
              <input name="menuid" value={form.menuid} onChange={handleChange} required readOnly style={inputModalStyle} />
            </div>
            <div>
              <div style={labelStyle}>Menu Role</div>
              <input name="menurole" value={form.menurole} onChange={handleChange} style={inputModalStyle} />
            </div>
            <div>
              <div style={labelStyle}>Menu Description</div>
              <input name="menudesc" value={form.menudesc} onChange={handleChange} style={inputModalStyle} />
            </div>
            <div>
              <div style={labelStyle}>Menu Link</div>
              <input name="menulink" value={form.menulink} onChange={handleChange} style={inputModalStyle} />
            </div>
            <button type="submit" style={{ ...inputModalStyle, background: '#4f46e5', color: '#fff', fontWeight: 'bold' }}>{isEditing ? 'Update' : 'Submit'}</button>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '34px 28px', width: '420px', borderRadius: '20px', boxShadow: '0 12px 28px rgba(0,0,0,0.25)', textAlign: 'center', position: 'relative' }}>
            <button onClick={() => setShowDeleteModal(false)} style={{ position: 'absolute', top: 10, right: 14, fontWeight: 'bold', fontSize: 20, border: 'none', background: 'transparent', cursor: 'pointer' }}>×</button>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>Confirm Delete</h3>
            <p style={{ fontSize: 16, margin: '14px 0' }}>Are you sure you want to delete <b>{toDelete}</b>?</p>
            <button onClick={handleDelete} style={{ ...inputModalStyle, background: '#ef4444', color: '#fff', fontWeight: 'bold', marginBottom: '12px' }}>Yes, Delete</button>
            <button onClick={() => setShowDeleteModal(false)} style={{ ...inputModalStyle, background: '#f3f4f6' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuManager;