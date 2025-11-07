// src/pages/Whiteboard/White_bord.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import "../../index.css";

/* Safe URL joiner */
function joinUrl(base = "", path = "") {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}/${p}`;
}

const API = config.WHITEBOARD_CMS_ROUTE;
const BASE_URL = config.BASE_URL; 

/* ---------------- Color presets ---------------- */
const NAMED_COLORS = [
  { name: "Black", hex: "#000000" }, { name: "White", hex: "#FFFFFF" },
  { name: "Gray", hex: "#808080" }, { name: "LightGray", hex: "#D3D3D3" },
  { name: "Red", hex: "#FF0000" }, { name: "Maroon", hex: "#800000" },
  { name: "Orange", hex: "#FFA500" }, { name: "Gold", hex: "#FFD700" },
  { name: "Yellow", hex: "#FFFF00" }, { name: "Olive", hex: "#808000" },
  { name: "Green", hex: "#008000" }, { name: "Lime", hex: "#00FF00" },
  { name: "Teal", hex: "#008080" }, { name: "Cyan", hex: "#00FFFF" },
  { name: "Blue", hex: "#0000FF" }, { name: "Navy", hex: "#000080" },
  { name: "Purple", hex: "#800080" }, { name: "Magenta", hex: "#FF00FF" },
  { name: "Indigo", hex: "#4B0082" }, { name: "Brown", hex: "#A52A2A" },
  { name: "Tan", hex: "#D2B48C" }, { name: "Chocolate", hex: "#D2691E" },
];

const isValidHex = (s) => /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(s || "");

/* ======== Font options (store only the primary family name) ======== */
const FONT_STACKS = [
  "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  "Poppins, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  "Roboto, Arial, Helvetica, sans-serif",
  "Noto Sans, Arial, Helvetica, sans-serif",
  "Georgia, 'Times New Roman', Times, serif",
  "'Times New Roman', Times, serif",
  "'Courier New', Courier, monospace",
  "Montserrat, Arial, Helvetica, sans-serif",
  "Lato, Arial, Helvetica, sans-serif",
];
const primaryOf = (stack) => stack.split(",")[0].replace(/['"]/g, "").trim();
const FONT_OPTIONS = FONT_STACKS.map((s) => ({ label: primaryOf(s), value: primaryOf(s) }));
const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32];

/* ---------------- Role helpers ---------------- */
function getAuth() {
  try { return JSON.parse(localStorage.getItem("auth") || "{}"); }
  catch { return {}; }
}
function roleSetOf(user) {
  const set = new Set();
  if (user?.user_role) set.add(String(user.user_role).toLowerCase());
  (user?.roles || []).forEach(r => set.add(String(r).toLowerCase()));
  return set;
}
function isSuperUser(user) {
  const rs = roleSetOf(user);
  return ["super_user", "sms_superadm", "superadmin", "super_admin"].some(k => rs.has(k));
}

/* ---------------- ColorSelector ---------------- */
function ColorSelector({ label, name, value, onChange, popperAlign = "left" }) {
  const [showPop, setShowPop] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowPop(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pickColor = (hex) => { onChange({ target: { name, value: hex } }); setShowPop(false); };
  const current = value && isValidHex(value) ? value : "";

  return (
    <div className="form-row pos-rel" ref={wrapRef}>
      <label className="form-label">{label}</label>
      <div className="row-8">
        <input type="text" name={name} className="form-input" value={value || ""} onChange={onChange} />
        <input type="color" value={current || "#ffffff"} onChange={(e) => pickColor(e.target.value)} className="input-color" />
        <button type="button" className="btn" onClick={() => setShowPop((s) => !s)}>🎨</button>
      </div>
      {showPop && (
        <div className={`color-popper ${popperAlign === "right" ? "align-right" : "align-left"}`}>
          {NAMED_COLORS.map((c) => (
            <button key={c.hex} type="button" onClick={() => pickColor(c.hex)} className="color-picker__item">
              <svg className="color-swatch" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                <rect x="0" y="0" width="22" height="22" rx="6" fill={c.hex} />
              </svg>
              <span className="color-picker__label">{c.name} ({c.hex})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- File uploader ---------------- */
function HeaderImagePicker({ value, onFileChange }) {
  const [preview, setPreview] = useState(value || "");
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Image too large (max 2MB)."); return; }
    onFileChange(file);
    setPreview(URL.createObjectURL(file));
  };
  return (
    <div className="form-row span-3">
      <label className="form-label">Header Image (optional)</label>
      <input type="file" accept="image/*" onChange={onFile} className="form-input" />
      {preview && (
        <div className="wb-preview-row">
          <img src={preview} alt="Header preview" className="wb-header-preview" />
          <button type="button" className="btn btn--danger" onClick={() => { onFileChange(null); setPreview(""); }}>Remove</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Main ---------------- */
export default function WhiteboardManager() {
  const user = useMemo(() => getAuth(), []);
  const canManage = isSuperUser(user); // only SUPER can change themes

  const [themes, setThemes] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [form, setForm] = useState({
    inst_id: "", bg: "", color: "", font_style: "", font_size: "", headerFile: null,
  });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchThemes = async () => {
    const res = await axios.get(joinUrl(API, ""));
    setThemes(res.data.themes || []);
  };
  const fetchColleges = async () => {
    const res = await axios.get(joinUrl(config.COLLEGES_ROUTE, "view-colleges"));
    setColleges(res?.data?.colleges ?? []);
  };
  useEffect(() => { fetchThemes(); fetchColleges(); }, []);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManage) return; // safety
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("inst_id", form.inst_id || "");
      fd.append("bg", form.bg || "");
      fd.append("color", form.color || "");
      fd.append("font_style", form.font_style || ""); // store only primary
      fd.append("font_size", form.font_size || "");
      if (form.headerFile) fd.append("header", form.headerFile);

      // API expects POST for updates (multer-friendly)
      if (editingId) {
        await axios.post(joinUrl(API, `update/${editingId}`), fd, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        await axios.post(joinUrl(API, "create"), fd, { headers: { "Content-Type": "multipart/form-data" } });
      }

      setForm({ inst_id: "", bg: "", color: "", font_style: "", font_size: "", headerFile: null });
      setEditingId(null);
      fetchThemes();
    } finally { setLoading(false); }
  };

  const handleEdit = (t) => {
    if (!canManage) return;
    setForm({
      inst_id: t.inst_id || "",
      bg: t.bg || "",
      color: t.color || "",
      font_style: t.font_style || "",
      font_size: t.font_size || "",
      headerFile: null,
    });
    setEditingId(t.id);
  };

  const handleDelete = async (id) => {
    if (!canManage) return;
    if (!window.confirm("Delete this theme?")) return;
    await axios.delete(joinUrl(API, `delete/${id}`));
    fetchThemes();
  };

  // What themes should the current user see in this page?
  const visibleThemes = useMemo(() => {
    if (canManage) return themes; // super sees all
    const myCollege = String(user?.college_id || user?.collegeid || "").trim();
    return myCollege ? themes.filter(t => String(t.inst_id) === myCollege) : [];
  }, [themes, canManage, user]);

  return (
    <div className="mu-page">
      <div className="mu-container">
        <h2 className="mu-title">🎨 Whiteboard CMS Theme Manager</h2>

        {/* Only SUPER users can see the editor form */}
        {canManage ? (
          <form onSubmit={handleSubmit} className="form-grid form-grid--3 mu-tablecard mb-20">
            {/* Institute selector (SUPER chooses any college) */}
            <div className="form-row">
              <label className="form-label">Institute ID</label>
              <select name="inst_id" className="form-input" value={form.inst_id} onChange={handleChange} required>
                <option value="">Select Institute</option>
                {colleges.map((c) => (
                  <option key={c.collegeid} value={c.collegeid}>{c.collegeid} - {c.collegename}</option>
                ))}
              </select>
            </div>

            <ColorSelector label="Background" name="bg" value={form.bg} onChange={handleChange} />
            <ColorSelector label="Text Color" name="color" value={form.color} onChange={handleChange} popperAlign="right" />

            <div className="form-row">
              <label className="form-label">Font Family</label>
              <select name="font_style" className="form-input" value={form.font_style} onChange={handleChange}>
                <option value="">Select font…</option>
                {FONT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Font Size</label>
              <select name="font_size" className="form-input" value={form.font_size} onChange={handleChange}>
                <option value="">Select size…</option>
                {FONT_SIZES.map((n) => <option key={n} value={n}>{n}px</option>)}
              </select>
            </div>

            <HeaderImagePicker value={form.headerFile} onFileChange={(file) => setForm((prev) => ({ ...prev, headerFile: file }))} />

            <div className="form-row span-3">
              <button type="submit" disabled={loading} className="btn btn--submit">
                {editingId ? "Update Theme" : "Add Theme"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mu-tablecard mb-20">
            <div className="p-12 text-sm">
              <strong>Read-only:</strong> Only SUPER users can create or change themes. You can view your college’s theme below.
            </div>
          </div>
        )}

        {/* Table */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">
            <h3 className="mu-subtitle">Theme List</h3>
            <div className="mu-tablecard">
              <table className="mu-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Institute</th><th>Background</th><th>Color</th>
                    <th>Header Img</th><th>Font</th><th>Size</th>{canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleThemes.length > 0 ? visibleThemes.map((t) => (
                    <tr key={t.id}>
                      <td>{t.id}</td>
                      <td>{t.inst_id}</td>
                      <td>{t.bg || "—"}</td>
                      <td>{t.color || "—"}</td>
                      <td>
                        {t.header ? <img src={`${BASE_URL}/${t.header}`} alt="Header" className="wb-header-thumb" /> : "—"}
                      </td>
                      <td>{t.font_style || "—"}</td>
                      <td>{t.font_size || "—"}</td>
                      {canManage && (
                        <td>
                          <button onClick={() => handleEdit(t)} className="btn btn--primary">✏ Edit</button>
                          <button onClick={() => handleDelete(t.id)} className="btn btn--danger">🗑 Delete</button>
                        </td>
                      )}
                    </tr>
                  )) : (
                    <tr><td colSpan={canManage ? 8 : 7}>No themes found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
