// src/pages/UserDtls/UserDtlsManager.jsx
import React, { useEffect, useMemo, useState, Suspense } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
// ⬇️ NEW: import StudentInformationManager for embedded launch
import StudentInformationManager from "../studentinformation/StudentInformationManager";

/* ------------------------------ CONFIG ------------------------------ */

// Prefer the explicit route; otherwise fallback to BASE_URL + /api/user-dtls
const API_BASE =
  config.USER_DTLS_ROUTE ||
  `${String(config.BASE_URL || "").replace(/\/+$/, "")}/api/user-dtls`;

/** Roles that should see ALL users' details */
const ADMIN_ROLES = new Set(["SMS_SUPERADM", "ADMIN", "SUPERADMIN", "SYSADM"]);

/* ------------------------------ STUDENT ↔ USER MAPPING ------------------------------ */
/** Build a cache of { [stuuserid(email)]: stuid } so we can open StudentInformation by stuid */
let __studentUserMap = null;
async function __ensureStudentMap() {
  if (__studentUserMap) return __studentUserMap;
  try {
    const STUDENT_LIST_URL =
      (config.STUDENT_ROUTE ? String(config.STUDENT_ROUTE).replace(/\/+$/, '') : '') + '/list';
    const resp = await axios.get(STUDENT_LIST_URL);
    const arr = resp?.data?.students || resp?.data || [];
    const map = {};
    for (const s of arr) {
      const uid = String(s?.stuuserid || '').trim();
      const id  = String(s?.stuid || '').trim();
      if (uid && id) map[uid] = id;
    }
    __studentUserMap = map;
    return map;
  } catch (e) {
    console.warn('Failed to build student map', e);
    __studentUserMap = {};
    return __studentUserMap;
  }
}
async function __resolveStuidFromUser(userId) {
  const map = await __ensureStudentMap();
  return map[String(userId || '').trim()] || '';
}

/* ------------------------------ STYLES ------------------------------ */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f8fb",
    padding: "24px",
    fontFamily:
      "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#111827",
  },
  container: { maxWidth: "1100px", margin: "0 auto" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  title: { fontSize: "28px", fontWeight: 800, letterSpacing: "0.2px" },
  toolbar: { display: "flex", gap: "8px", alignItems: "center" },
  searchInput: {
    height: "38px",
    padding: "0 12px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    outline: "none",
    width: "260px",
    background: "#fff",
  },
  addBtn: {
    height: "38px",
    padding: "0 14px",
    borderRadius: "10px",
    border: "1px solid transparent",
    cursor: "pointer",
    background: "#111827",
    color: "#fff",
    fontWeight: 600,
  },
  badgeRow: { marginBottom: 10, display: "flex", gap: 10, alignItems: "center" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#374151",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 16px rgba(17, 24, 39, 0.06)",
    padding: "16px",
  },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  theadTh: {
    textAlign: "left",
    fontSize: "12px",
    textTransform: "uppercase",
    color: "#6b7280",
    letterSpacing: "0.6px",
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    position: "sticky",
    top: 0,
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "middle",
    fontSize: "14px",
    color: "#111827",
    background: "#fff",
  },
  chip: (ok) => ({
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    background: ok ? "#ecfdf5" : "#fef2f2",
    color: ok ? "#065f46" : "#991b1b",
    border: `1px solid ${ok ? "#10b981" : "#ef4444"}`,
  }),
  rowBtns: { display: "flex", gap: "8px" },
  btn: (variant = "primary") => {
    const base = {
      height: "32px",
      padding: "0 10px",
      borderRadius: "8px",
      border: "1px solid transparent",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: 600,
    };
    switch (variant) {
      case "danger":
        return {
          ...base,
          background: "#fee2e2",
          color: "#991b1b",
          borderColor: "#fecaca",
        };
      case "secondary":
        return {
          ...base,
          background: "#f3f4f6",
          color: "#111827",
          borderColor: "#e5e7eb",
        };
      case "ghost":
        return {
          ...base,
          background: "transparent",
          color: "#374151",
          borderColor: "#d1d5db",
        };
      default:
        return { ...base, background: "#111827", color: "#fff" };
    }
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "14px",
  },
  pageBtns: { display: "flex", gap: "6px" },
  pageBtn: (active) => ({
    minWidth: "36px",
    height: "36px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: active ? "#111827" : "#fff",
    color: active ? "#fff" : "#111827",
    cursor: "pointer",
    fontWeight: 700,
  }),
  empty: { textAlign: "center", padding: "24px", color: "#6b7280", fontWeight: 600 },

  // Modal
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(17, 24, 39, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    zIndex: 50,
  },
  modal: {
    width: "min(980px, 100%)",
    background: "#fff",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 10px 35px rgba(17, 24, 39, 0.2)",
    padding: "18px",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  modalTitle: { fontSize: "18px", fontWeight: 800 },
  xBtn: {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: "20px",
    lineHeight: "0",
  },

  // NEW: scrollable form body
  formScroll: {
    overflowY: "auto",
    maxHeight: "60vh",
    paddingRight: "8px",
    WebkitOverflowScrolling: "touch",
  },

  formGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" },
  formRow: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "12px", color: "#6b7280", fontWeight: 700, letterSpacing: "0.3px" },
  input: {
    height: "38px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "0 12px",
    outline: "none",
    background: "#fff",
  },
  modalFooter: { display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "14px", alignItems: "center" },
  status: { textAlign: "center", marginTop: "10px", fontWeight: 800 },

  // Viewer modal
  viewerModal: {
    width: "min(1100px, 100%)",
    maxHeight: "92vh",
    background: "#fff",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 12px 45px rgba(17, 24, 39, 0.25)",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  viewerBody: {
    flex: 1,
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    overflow: "hidden",
    background: "#f9fafb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerObject: { width: "100%", height: "75vh" },
  viewerImg: { maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", display: "block" },
  viewerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewerActions: { display: "flex", gap: "8px" },
};

/* ------------------------------ HELPERS ------------------------------ */

function getSafeStorage(k) {
  try {
    return sessionStorage.getItem(k) || localStorage.getItem(k) || "";
  } catch {
    return "";
  }
}

/** Figure out who is logged in (try several common keys) */
function resolveCurrentUserId() {
  if (config.CURRENT_USER_ID) return String(config.CURRENT_USER_ID).trim();
  const candidates = [
    "logged_in_userid",
    "auth_userid",
    "user_email",
    "user",
    "userid",
    "user_dtls_prefill_userid",
  ];
  for (const key of candidates) {
    const v = getSafeStorage(key);
    if (v && /\S/.test(v)) return String(v).trim();
  }
  return "";
}

/** Parse roles (CSV or single string) and check admin */
function resolveIsAdmin() {
  const raw =
    getSafeStorage("auth_roles") ||
    getSafeStorage("roles") ||
    getSafeStorage("user_roles") ||
    "";
  const parts = String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.some((r) => ADMIN_ROLES.has(r));
}

// ---------- Base64 helpers ----------
function detectMimeFromBase64(b64 = "") {
  const head = b64.slice(0, 16);
  if (head.startsWith("JVBERi0")) return "application/pdf";
  if (head.startsWith("iVBOR")) return "image/png";
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("R0lG")) return "image/gif";
  if (head.startsWith("UklGR")) return "image/webp";
  if (head.startsWith("UEsDB") || head.startsWith("UEs")) return "application/zip";
  return "application/octet-stream";
}
function makeBlobUrl(b64, mime) {
  const byteCharacters = atob(b64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++)
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mime || "application/octet-stream" });
  return URL.createObjectURL(blob);
}
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
const DESC_OPTIONS = [
  "Picture - 5 MB",
  "Signature - 40 KB",
  "ABC ID",
  "Aadhaar Card",
  "10+ Certificate",
  "10+ Marksheet",
  "12+ Certificate",
  "12+ Marksheet",
  "Graduation Certificate",
  "Graduation Marksheet",
  "Post Graduation Certificate",
  "Post Graduation Marksheet",
  "Doctorate Certificate",
];
function getNextUserDtlsId(list = []) {
  let max = 0;
  for (const r of list) {
    const id = String(r?.usr_dtls_id || "").trim();
    const m = /^UD_(\d+)$/.exec(id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  const next = String(max + 1).padStart(3, "0");
  return `UD_${next}`;
}
const mimeToExt = (mime = "") => {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "application/zip":
      return "zip";
    default:
      return "bin";
  }
};

/* ------------------------------ SIGNATURE STORAGE FOR PDF ACCESS ------------------------------ */

// Global signature storage for cross-component access
window.userSignatureStorage = window.userSignatureStorage || new Map();

// Helper function to store signature data
const storeSignatureData = (userId, signatureBase64) => {
  if (signatureBase64) {
    window.userSignatureStorage.set(userId, signatureBase64);
  } else {
    window.userSignatureStorage.delete(userId);
  }
};

// Helper function to get signature data (for PDF generation)
export const getStoredSignatureData = (userId) => {
  return window.userSignatureStorage.get(userId) || null;
};

/* ------------------------------ COMPONENT ------------------------------ */

export default function UserDtlsManager() {
  // Who am I?
  const [currentUserId] = useState(() => resolveCurrentUserId());
  const [isAdmin] = useState(() => resolveIsAdmin());

  // Data/UI
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  const [form, setForm] = useState({
    usr_dtls_id: "",
    usr_usr_id: "",
    usr_dtls_desc: "",
    usr_dtls_file_base64: "",
    clear_file: false,
    usr_aadharno: "",
    usr_abc_id: "",
    usr_signature_file_base64: "", // For signature upload (UI + preview)
    clear_signature: false,        // For clearing signature (UI)
  });

  // Viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerMime, setViewerMime] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerErr, setViewerErr] = useState("");

  // Pagination
  const PAGE_SIZE = 6;
  const [page, setPage] = useState(1);

  // NEW: Add-more-information checkbox + embedded student-info modal control
  const [addMoreInfo, setAddMoreInfo] = useState(false);
  const [openStudentInfo, setOpenStudentInfo] = useState(false);
  const [studentInfoId, setStudentInfoId] = useState("");

  // Fetch list
  const loadList = async () => {
    try {
      const res = await axios.get(`${API_BASE}/list`);
      setItems(res.data?.user_dtls || []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  // Enforce per-user view (non-admin only)
  const ownedItems = useMemo(() => {
    if (isAdmin) return items;
    if (!currentUserId) return [];
    return (items || []).filter((r) => String(r.usr_usr_id || "") === currentUserId);
  }, [items, isAdmin, currentUserId]);

  // Search within allowed set
  const filtered = useMemo(() => {
    const base = ownedItems;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      [
        r.usr_dtls_id,
        r.usr_usr_id,
        r.usr_dtls_desc,
        r.has_file ? "file" : "nofile",
        r.usr_aadharno,
        r.usr_abc_id,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .some((s) => s.includes(q))
    );
  }, [ownedItems, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const resetForm = () => {
    setForm({
      usr_dtls_id: "",
      usr_usr_id: "",
      usr_dtls_desc: "",
      usr_dtls_file_base64: "",
      clear_file: false,
      usr_aadharno: "",
      usr_abc_id: "",
      usr_signature_file_base64: "",
      clear_signature: false,
    });
    setAddMoreInfo(false); // NEW: reset
  };

  // Add
  const openAdd = () => {
    const nextId = getNextUserDtlsId(items);
    const prefillUser = isAdmin ? (currentUserId || "") : (currentUserId || "");
    setForm({
      usr_dtls_id: nextId,
      usr_usr_id: prefillUser,
      usr_dtls_desc: "",
      usr_dtls_file_base64: "",
      clear_file: false,
      usr_aadharno: "",
      usr_abc_id: "",
      usr_signature_file_base64: "",
      clear_signature: false,
    });
    setEditing(false);
    setEditId(null);
    setShowModal(true);
    setStatus("");
    setAddMoreInfo(false);
  };

  // Edit
  const openEdit = (row) => {
    const owner = String(row?.usr_usr_id || "");
    if (!isAdmin && owner !== currentUserId) {
      alert("You can only edit your own records.");
      return;
    }
    setForm({
      usr_dtls_id: row.usr_dtls_id,
      usr_usr_id: row.usr_usr_id || "",
      usr_dtls_desc: row.usr_dtls_desc || "",
      usr_dtls_file_base64: "",
      clear_file: false,
      usr_aadharno: row.usr_aadharno || "",
      usr_abc_id: row.usr_abc_id || "",
      usr_signature_file_base64: "",
      clear_signature: false,
    });
    setEditing(true);
    setEditId(row.usr_dtls_id);
    setShowModal(true);
    setStatus("");
    setAddMoreInfo(false);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(false);
    setEditId(null);
    resetForm();
    setStatus("");
  };

  const onChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === "file" && files?.[0]) {
      toBase64(files[0]).then((b64) => {
        if (name === "usr_signature_file") {
          setForm((p) => ({ 
            ...p, 
            usr_signature_file_base64: b64 
          }));
          // Store signature data globally for PDF access
          storeSignatureData(form.usr_usr_id || currentUserId, b64);
        } else {
          setForm((p) => ({ ...p, usr_dtls_file_base64: b64, clear_file: false }));
        }
      });
    } else {
      if (!isAdmin && name === "usr_usr_id") return;
      setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      setStatus(editing ? "Updating..." : "Submitting...");

      if (!editing) {
        const enforcedUser = isAdmin ? (form.usr_usr_id || currentUserId || null) : (currentUserId || null);
        if (!enforcedUser) {
          setStatus("⛔ Unable to determine your user ID.");
          return;
        }
        
        // Store signature data if provided
        if (form.usr_signature_file_base64) {
          storeSignatureData(enforcedUser, form.usr_signature_file_base64);
        }
        
        const payload = {
          usr_dtls_id: form.usr_dtls_id,
          usr_usr_id: enforcedUser,
          usr_dtls_desc: form.usr_dtls_desc,
          usr_dtls_file_base64: form.usr_dtls_file_base64 || undefined,
          usr_aadharno: form.usr_aadharno || null,
          usr_abc_id: form.usr_abc_id || null,
        };
        await axios.post(`${API_BASE}/add`, payload);
        setStatus("✅ Created");

        // NEW: open embedded StudentInformation if requested
        if (addMoreInfo) {
          try {
            const st = await __resolveStuidFromUser(enforcedUser);
            setStudentInfoId(st || '');
          } catch {}
          setOpenStudentInfo(true);
        }
      } else {
        const owner = isAdmin ? (form.usr_usr_id || currentUserId || "") : (currentUserId || "");
        const row = items.find((x) => x.usr_dtls_id === editId);
        if (!isAdmin && String(row?.usr_usr_id || "") !== owner) {
          setStatus("⛔ You can only update your own records.");
          return;
        }

        // Update signature data if provided
        if (form.usr_signature_file_base64) {
          storeSignatureData(owner, form.usr_signature_file_base64);
        } else if (form.clear_signature) {
          storeSignatureData(owner, null);
        }

        const payload = {};
        if (isAdmin && typeof form.usr_usr_id !== "undefined") {
          payload.usr_usr_id = form.usr_usr_id;
        }
        if (typeof form.usr_dtls_desc !== "undefined")
          payload.usr_dtls_desc = form.usr_dtls_desc;

        if (form.clear_file === true) {
          payload.clear_file = true;
        } else if (form.usr_dtls_file_base64) {
          payload.usr_dtls_file_base64 = form.usr_dtls_file_base64;
        }

        if (typeof form.usr_aadharno !== "undefined")
          payload.usr_aadharno = form.usr_aadharno || null;
        if (typeof form.usr_abc_id !== "undefined")
          payload.usr_abc_id = form.usr_abc_id || null;

        await axios.put(`${API_BASE}/update/${encodeURIComponent(editId)}`, payload);
        setStatus("✅ Updated");

        // NEW: open embedded StudentInformation if requested (use owner)
        if (addMoreInfo) {
          try {
            const st = await __resolveStuidFromUser(owner);
            setStudentInfoId(st || '');
          } catch {}
          setOpenStudentInfo(true);
        }
      }

      closeModal();
      await loadList();
    } catch (err) {
      setStatus(
        "⛔ " +
          (err?.response?.data?.error ||
            err?.message ||
            (editing ? "Failed to update" : "Failed to create"))
      );
    }
  };

  const remove = async (id) => {
    const row = items.find((x) => x.usr_dtls_id === id);
    if (!row) return;
    if (!isAdmin && String(row.usr_usr_id || "") !== currentUserId) {
      alert("You can only delete your own records.");
      return;
    }

    const ok = window.confirm(`Delete record ${id}?`);
    if (!ok) return;
    try {
      await axios.delete(`${API_BASE}/delete/${encodeURIComponent(id)}`);
      await loadList();
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || "Failed to delete record");
    }
  };

  const canAccessId = (id) => {
    if (isAdmin) return true;
    const row = items.find((x) => x.usr_dtls_id === id);
    return row && String(row.usr_usr_id || "") === currentUserId;
  };

  const downloadFile = async (id) => {
    try {
      if (!canAccessId(id)) {
        alert("You can only access your own files.");
        return;
      }
      const res = await axios.get(`${API_BASE}/id/${encodeURIComponent(id)}`);
      const b64 = res.data?.user_dtls?.usr_dtls_file_base64;
      if (!b64) return alert("No file on this record.");

      const mime = detectMimeFromBase64(b64) || "application/octet-stream";
      const ext = mimeToExt(mime);

      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++)
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}_file.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || "Download failed");
    }
  };

  const closeViewer = () => {
    if (viewerUrl) {
      try {
        URL.revokeObjectURL(viewerUrl);
      } catch {}
    }
    setViewerOpen(false);
    setViewerUrl("");
    setViewerMime("");
    setViewerTitle("");
    setViewerErr("");
  };

  const viewDocument = async (id) => {
    if (!canAccessId(id)) {
      alert("You can only view your own files.");
      return;
    }
    setViewerErr("");
    setViewerTitle(id);
    try {
      const res = await axios.get(`${API_BASE}/id/${encodeURIComponent(id)}`);
      const b64 = res.data?.user_dtls?.usr_dtls_file_base64;
      if (!b64) {
        setViewerErr("No file found for this record.");
        setViewerOpen(true);
        return;
      }
      const mime = detectMimeFromBase64(b64);
      const url = makeBlobUrl(b64, mime);
      setViewerMime(mime);
      setViewerUrl(url);
      setViewerOpen(true);
    } catch (err) {
      setViewerErr(err?.response?.data?.error || err?.message || "Failed to load file");
      setViewerOpen(true);
    }
  };

  const isImage = (m) => /^image\//.test(m);
  const isPdf = (m) => m === "application/pdf";

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div style={styles.title}>Student Details</div>
          <div style={styles.toolbar}>
            <input
              style={styles.searchInput}
              placeholder="Search by id / user / desc / aadhaar / abc / file…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <button style={styles.addBtn} onClick={openAdd}>
              + Add
            </button>
          </div>
        </div>

        {/* Who-am-I badges */}
        <div style={styles.badgeRow}>
          <span style={styles.badge}>
            Role: <b>{isAdmin ? "Admin" : "User"}</b>
          </span>
          {!isAdmin && (
            <span style={styles.badge}>
              Viewing records for: <b>{currentUserId || "UNKNOWN"}</b>
            </span>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.theadTh}>ID</th>
                  <th style={styles.theadTh}>User ID</th>
                  <th style={styles.theadTh}>Description</th>
                  <th style={styles.theadTh}>Aadhaar No</th>
                  <th style={styles.theadTh}>ABC ID</th>
                  <th style={styles.theadTh}>File</th>
                  <th style={styles.theadTh}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.usr_dtls_id}>
                    <td style={styles.td}>{r.usr_dtls_id}</td>
                    <td style={styles.td}>
                      {r.usr_usr_id || <i style={{ color: "#9ca3af" }}>NULL</i>}
                    </td>
                    <td style={styles.td}>{r.usr_dtls_desc}</td>
                    <td style={styles.td}>
                      {r.usr_aadharno || <i style={{ color: "#9ca3af" }}>NULL</i>}
                    </td>
                    <td style={styles.td}>
                      {r.usr_abc_id || <i style={{ color: "#9ca3af" }}>NULL</i>}
                    </td>
                    <td style={styles.td}>
                      <span style={styles.chip(r.has_file)}>
                        {r.has_file ? "Has file" : "No file"}
                      </span>
                    </td>
                    <td style={{ ...styles.td }}>
                      <div style={styles.rowBtns}>
                        <button
                          style={styles.btn("secondary")}
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          style={styles.btn("danger")}
                          onClick={() => remove(r.usr_dtls_id)}
                        >
                          Delete
                        </button>
                        <button
                          style={styles.btn("ghost")}
                          onClick={() => viewDocument(r.usr_dtls_id)}
                          disabled={!r.has_file}
                          title={r.has_file ? "View file" : "No file to view"}
                        >
                          View
                        </button>
                        <button
                          style={styles.btn("ghost")}
                          onClick={() => downloadFile(r.usr_dtls_id)}
                          disabled={!r.has_file}
                          title={r.has_file ? "Download file" : "No file to download"}
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td style={styles.empty} colSpan={7}>
                      {isAdmin
                        ? "No records found."
                        : currentUserId
                        ? "No records found for your account."
                        : "You are not signed in – unable to determine your records."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={styles.pagination}>
            <div style={{ color: "#6b7280", fontWeight: 600 }}>
              Showing page {currentPage} of {totalPages}
            </div>
            <div style={styles.pageBtns}>
              <button
                style={styles.pageBtn(false)}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                «
              </button>
              <button style={styles.pageBtn(true)} disabled>
                {currentPage}
              </button>
              <button
                style={styles.pageBtn(false)}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                »
              </button>
            </div>
          </div>

          {status && <div style={styles.status}>{status}</div>}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={styles.overlay} onClick={closeModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>
                {editing ? "Edit Record" : "Add New Record"}
              </div>
              <button style={styles.xBtn} onClick={closeModal}>
                ×
              </button>
            </div>

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Scrollable body */}
              <div style={styles.formScroll}>
                <div style={styles.formGrid}>
                  {/* usr_dtls_id */}
                  <div style={styles.formRow}>
                    <label style={styles.label}>User Details ID</label>
                    <input
                      style={styles.input}
                      type="text"
                      name="usr_dtls_id"
                      value={form.usr_dtls_id}
                      onChange={onChange}
                      placeholder="UD_001"
                      disabled
                    />
                  </div>

                  {/* usr_usr_id */}
                  <div style={styles.formRow}>
                    <label style={styles.label}>User ID</label>
                    <input
                      style={styles.input}
                      type="text"
                      name="usr_usr_id"
                      value={form.usr_usr_id}
                      onChange={onChange}
                      placeholder="user@example.com"
                      disabled={!isAdmin}
                    />
                  </div>

                  {/* Description */}
                  <div style={{ ...styles.formRow, gridColumn: "span 2" }}>
                    <label style={styles.label}>User Details Description</label>
                    <select
                      name="usr_dtls_desc"
                      value={form.usr_dtls_desc}
                      onChange={onChange}
                      style={styles.input}
                      required
                    >
                      <option value="">Select document</option>
                      {DESC_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Aadhaar */}
                  <div style={styles.formRow}>
                    <label style={styles.label}>User Aadhar No (12 digits)</label>
                    <input
                      style={styles.input}
                      type="text"
                      name="usr_aadharno"
                      value={form.usr_aadharno}
                      onChange={onChange}
                      placeholder="123456789012"
                      inputMode="numeric"
                      maxLength={12}
                      pattern="\d{12}"
                      title="Exactly 12 digits"
                    />
                  </div>

                  {/* ABC ID */}
                  <div style={styles.formRow}>
                    <label style={styles.label}>User ABC ID</label>
                    <input
                      style={styles.input}
                      type="text"
                      name="usr_abc_id"
                      value={form.usr_abc_id}
                      onChange={onChange}
                      placeholder="ABC12345"
                      maxLength={20}
                      title="Up to 20 characters"
                    />
                  </div>

                  {/* File upload */}
                  <div style={{ ...styles.formRow, gridColumn: "span 4" }}>
                    <label style={styles.label}>Upload file</label>
                    {(() => {
                      const desc = String(form?.usr_dtls_desc || "");
                      const isPhoto = /picture/i.test(desc);
                      const isSign = /signature/i.test(desc);
                      const isId = /(aadhaar|abc id)/i.test(desc);
                      const isCert = /(certificate|marksheet|graduation|post graduation|doctorate)/i.test(desc);

                      let accept = "*/*";
                      if (isPhoto || isSign) accept = "image/*";
                      else if (isCert || isId) accept = ".pdf,image/*";

                      let hint = "Attach a relevant document.";
                      if (isPhoto) hint = "Upload a clear passport-style photo (JPG/PNG). ≤ 5 MB.";
                      else if (isSign) hint = "Upload a clean signature scan (JPG/PNG). ≤ 40 KB.";
                      else if (isId) hint = "Upload as PDF or a clear image (front & back if applicable).";
                      else if (isCert) hint = "Prefer a single PDF. Clear images (JPG/PNG) are also okay.";

                      const b64 = form?.usr_dtls_file_base64 || "";
                      const mime = detectMimeFromBase64(b64);
                      const isImgPreview = /^image\//.test(mime);

                      const dropzoneStyle = {
                        border: "2px dashed #cbd5e1",
                        borderRadius: "12px",
                        background: "#f9fafb",
                        padding: "14px",
                        cursor: "pointer",
                        transition: "border-color 0.2s, background 0.2s",
                      };

                      const handleFilePick = async (file) => {
                        if (!file) return;
                        const kb = Math.round(file.size / 1024);
                        if (isPhoto && kb > 400) alert("Heads up: Photo is larger than ~400 KB.");
                        if (isSign && kb > 150) alert("Heads up: Signature is larger than ~150 KB.");
                        const b64str = await toBase64(file);
                        setForm((p) => ({ ...p, usr_dtls_file_base64: b64str, clear_file: false }));
                      };

                      return (
                        <>
                          <input
                            id="ud_file_input"
                            type="file"
                            accept={accept}
                            style={{ display: "none" }}
                            onChange={(e) => handleFilePick(e.target.files?.[0])}
                          />

                          <div
                            role="button"
                            tabIndex={0}
                            style={dropzoneStyle}
                            onClick={() => document.getElementById("ud_file_input")?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.currentTarget.style.borderColor = "#94a3b8";
                              e.currentTarget.style.background = "#f1f5f9";
                            }}
                            onDragLeave={(e) => {
                              e.currentTarget.style.borderColor = "#cbd5e1";
                              e.currentTarget.style.background = "#f9fafb";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.currentTarget.style.borderColor = "#cbd5e1";
                              e.currentTarget.style.background = "#f9fafb";
                              const file = e.dataTransfer.files?.[0];
                              handleFilePick(file);
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div
                                aria-hidden
                                style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: 12,
                                  border: "1px solid #e5e7eb",
                                  background: "#fff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 800,
                                  color: "#111827",
                                }}
                              >
                                ↑
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 800, color: "#111827" }}>
                                  {b64 ? "File selected – click to replace" : "Click to browse or drag & drop here"}
                                </div>
                                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                                  {hint}
                                </div>
                                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                                  Accepted: <b>{accept === "*/*" ? "Any" : accept}</b>
                                </div>
                              </div>
                              <button
                                type="button"
                                style={styles.btn("secondary")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  document.getElementById("ud_file_input")?.click();
                                }}
                              >
                                Browse files
                              </button>
                            </div>

                            <div style={{ marginTop: 10 }}>
                              {!b64 ? (
                                <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>
                                  No file chosen yet.
                                </div>
                              ) : isImgPreview ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <img
                                    alt="preview"
                                    src={makeBlobUrl(b64, mime)}
                                    style={{
                                      width: 96,
                                      height: 96,
                                      objectFit: "cover",
                                      borderRadius: 12,
                                      border: "1px solid #e5e7eb",
                                      background: "#fff",
                                    }}
                                  />
                                  <div style={{ fontSize: 12, color: "#374151" }}>
                                    Image preview shown. Make sure it's sharp and well-lit.
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: "#374151" }}>
                                  File attached.{" "}
                                  {mime === "application/pdf" ? "PDF detected." : `Type: ${mime || "unknown"}.`}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ color: "#6b7280", fontSize: "12px", marginTop: 6 }}>
                            Tip: Choose the <b>"User Details Description"</b> first to get the best file guidance above.
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Signature upload (UI only) */}
                  <div style={{ ...styles.formRow, gridColumn: "span 4" }}>
                    <label style={{ ...styles.label, color: "#1e40af" }}>Signature Upload</label>
                    <div
                      style={{
                        border: "2px dashed #3b82f6",
                        borderRadius: "12px",
                        background: "#eff6ff",
                        padding: "14px",
                        marginTop: "6px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          aria-hidden
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            border: "1px solid #dbeafe",
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            color: "#1e40af",
                          }}
                        >
                          ✏️
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color: "#1e3a8a" }}>Upload Signature</div>
                          <div style={{ fontSize: 12, color: "#1e40af", marginTop: 4 }}>
                            Upload a clear signature scan (JPG/PNG). Recommended size: ≤ 40 KB.
                          </div>
                        </div>

                        <input
                          id="signature_file_input"
                          name="usr_signature_file"
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              toBase64(file).then((b64) => {
                                setForm((p) => ({ ...p, usr_signature_file_base64: b64, clear_signature: false }));
                                // Store signature data globally for PDF access
                                storeSignatureData(form.usr_usr_id || currentUserId, b64);
                              });
                            }
                          }}
                        />

                        <button
                          type="button"
                          style={{ ...styles.btn("primary"), background: "#3b82f6" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            document.getElementById("signature_file_input")?.click();
                          }}
                        >
                          Upload Signature
                        </button>
                      </div>

                      {form.usr_signature_file_base64 && (() => {
                        const mime = detectMimeFromBase64(form.usr_signature_file_base64);
                        return /^image\//.test(mime) ? (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "10px",
                              background: "#dbeafe",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                            }}
                          >
                            <img
                              alt="signature preview"
                              src={makeBlobUrl(form.usr_signature_file_base64, mime)}
                              style={{
                                maxHeight: "80px",
                                maxWidth: "200px",
                                objectFit: "contain",
                                border: "1px solid #93c5fd",
                                background: "#fff",
                                padding: "4px",
                                borderRadius: "4px",
                              }}
                            />
                            <div>
                              <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: "14px" }}>
                                Signature Preview
                              </div>
                              <div style={{ fontSize: "12px", color: "#3b82f6" }}>(UI only)</div>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* Clear file (only in edit) */}
                  {editing && (
                    <div style={{ ...styles.formRow, gridColumn: "span 2" }}>
                      <label style={styles.label}>Clear file (set to NULL)</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="checkbox"
                          name="clear_file"
                          checked={!!form.clear_file}
                          onChange={(e) => setForm((p) => ({ ...p, clear_file: e.target.checked }))}
                        />
                        <span style={{ color: "#6b7280", fontSize: "12px" }}>
                          Tick to remove the existing file on save
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Clear signature (UI only; only in edit) */}
                  {editing && (
                    <div style={{ ...styles.formRow, gridColumn: "span 2" }}>
                      <label style={{ ...styles.label, color: "#1e40af" }}>Clear signature</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="checkbox"
                          name="clear_signature"
                          checked={!!form.clear_signature}
                          onChange={(e) => setForm((p) => ({ ...p, clear_signature: e.target.checked }))}
                        />
                        <span style={{ color: "#6b7280", fontSize: "12px" }}>
                          Tick to remove the existing signature on save (UI only)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* NEW: Add More Information (Student Info) toggle + Submit */}
              <div style={styles.modalFooter}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#374151", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={addMoreInfo}
                    onChange={(e) => setAddMoreInfo(e.target.checked)}
                  />
                  <span><b>Add more information</b> (Student Information)</span>
                </label>

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" style={styles.btn("secondary")} onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" style={styles.btn("primary")}>
                    {editing ? "Update" : "Create"}
                  </button>
                </div>
              </div>
            </form>

            {status && <div style={styles.status}>{status}</div>}
          </div>
        </div>
      )}

      {/* Viewer Modal */}
      {viewerOpen && (
        <div style={styles.overlay} onClick={closeViewer}>
          <div style={styles.viewerModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.viewerHeader}>
              <div style={{ ...styles.modalTitle, fontSize: "16px" }}>
                Viewing: <span style={{ color: "#4b5563" }}>{viewerTitle}</span>
              </div>
              <div style={styles.viewerActions}>
                {viewerUrl && (
                  <a href={viewerUrl} download={`${viewerTitle}_file`} style={styles.btn("secondary")}>
                    Download
                  </a>
                )}
                <button style={styles.xBtn} onClick={closeViewer}>
                  ×
                </button>
              </div>
            </div>

            <div style={styles.viewerBody}>
              {viewerErr ? (
                <div style={{ color: "#991b1b", fontWeight: 700 }}>{viewerErr}</div>
              ) : isPdf(viewerMime) ? (
                <object data={viewerUrl} type="application/pdf" style={styles.viewerObject}>
                  <div style={{ padding: 16, textAlign: "center" }}>
                    PDF preview not supported in this browser.
                    <div>
                      <a href={viewerUrl} download={`${viewerTitle}.pdf`}>Download instead</a>
                    </div>
                  </div>
                </object>
              ) : isImage(viewerMime) ? (
                <img alt="preview" src={viewerUrl} style={styles.viewerImg} />
              ) : (
                <div style={{ padding: 16, color: "#6b7280" }}>Unsupported file type.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NEW: Embedded Student Information modal (opens after save when checkbox was ticked) */}
      {openStudentInfo && (
        <div style={styles.overlay} onClick={() => setOpenStudentInfo(false)}>
          <div style={{ ...styles.modal, width: "min(1100px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>Student Information</div>
              <button style={styles.xBtn} onClick={() => setOpenStudentInfo(false)}>×</button>
            </div>
            <div style={{ overflow: "auto" }}>
              <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
                <StudentInformationManager
                  embedded
                  initialStuid={studentInfoId}
                  openImmediately
                  onRequestClose={() => setOpenStudentInfo(false)}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
