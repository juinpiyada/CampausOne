// File: SMS-ui/src/pages/Teacher/TeacherDtlsManager.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";
import config from "../../config/middleware_config";

/* ---------------- safe join ---------------- */
const joinUrl = (base, path = "") =>
  path
    ? `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`
    : String(base);

const API_BASE = config.TEACHER_DTLS_ROUTE;
console.log("TEACHER_DTLS_ROUTE", API_BASE); // ← temp debug, optional 
/* ---------------- helpers ---------------- */
const AADHAAR_RE = /^[0-9]{12}$/;
const toStr = (v) => (v === undefined || v === null ? "" : String(v));
const pickArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (raw?.data && Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw?.rows)) return raw.rows;
  const k =
    raw && typeof raw === "object" && Object.keys(raw).find((x) => Array.isArray(raw[x]));
  return k ? raw[k] : [];
};
const niceBytes = (n) => {
  if (typeof n !== "number") return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

const DOC_DESC_OPTIONS = [
  "Picture",
  "Signature",
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

/* ---------------- styles tuned to screenshot ---------------- */
const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f7fb",
    padding: "28px",
    fontFamily:
      "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#0f172a",
  },
  container: { maxWidth: 1150, margin: "0 auto" },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  title: {
    fontWeight: 900,
    fontSize: 28,
    letterSpacing: "0.2px",
  },
  toolbar: { display: "flex", gap: 10, alignItems: "center" },
  search: {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    minWidth: 320,
  },
  addBtn: {
    height: 40,
    padding: "0 16px",
    borderRadius: 12,
    background: "#0f172a",
    color: "#fff",
    fontWeight: 700,
    border: "1px solid #0f172a",
    cursor: "pointer",
  },

  card: {
    background: "#fff",
    border: "1px solid #eaecef",
    borderRadius: 16,
    boxShadow: "0 10px 20px -15px rgba(15,23,42,0.25)",
    overflow: "hidden",
  },

  tableWrap: { overflow: "auto", maxHeight: "64vh" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    padding: "14px 16px",
    fontSize: 12,
    textTransform: "uppercase",
    color: "#6b7280",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid #f1f5f9",
    fontSize: 14,
    color: "#111827",
    whiteSpace: "nowrap",
  },
  pill: {
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: 20,
    fontWeight: 700,
    fontSize: 12,
    border: "1px solid",
  },
  pillHas: {
    background: "#ecfdf5",
    color: "#065f46",
    borderColor: "#a7f3d0",
  },
  pillNull: {
    background: "#f3f4f6",
    color: "#6b7280",
    borderColor: "#e5e7eb",
  },

  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  actionBtn: {
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  actionDanger: { borderColor: "#fecaca", color: "#b91c1c", background: "#fff" },

  footer: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
  },
  small: { fontSize: 12, color: "#6b7280" },
  pageChip: (active) => ({
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #e5e7eb",
    background: active ? "#0f172a" : "#fff",
    color: active ? "#fff" : "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
  }),

  /* modal */
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    zIndex: 50,
  },
  modal: {
    width: "min(96vw, 680px)",
    maxHeight: "82vh",
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #e5e7eb",
    overflow: "auto",
    boxShadow: "0 22px 40px -18px rgba(2,6,23,0.45)",
  },
  modalHead: {
    padding: "14px 16px",
    borderBottom: "1px solid #eef2f7",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    background: "#fff",
  },
  modalTitle: { fontSize: 18, fontWeight: 900 },
  modalBody: { padding: 16, display: "grid", gap: 12 },
  modalFoot: {
    padding: 16,
    borderTop: "1px solid #eef2f7",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    position: "sticky",
    bottom: 0,
    background: "#fff",
  },
  input: {
    height: 38,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
  },
  select: {
    height: 38,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
  },
  label: { fontSize: 13, fontWeight: 800, color: "#374151" },
  ghostBtn: {
    height: 38,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryBtn: {
    height: 38,
    padding: "0 16px",
    borderRadius: 12,
    background: "#0f172a",
    color: "#fff",
    fontWeight: 800,
    border: "1px solid #0f172a",
    cursor: "pointer",
  },
  drag: {
    border: "1.5px dashed #cbd5e1",
    borderRadius: 12,
    padding: 14,
    textAlign: "center",
    background: "#f8fafc",
  },
};

export default function TeacherDtlsManager() {
  /* ---------- teacher id source ---------- */
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navTeacherId = toStr(location.state?.teacherid || "");
  const queryTeacherId = toStr(searchParams.get("teacherid") || "");
  const storedTeacherId = toStr(localStorage.getItem("lastTeacherId") || "");
  const initialTeacherId =
    navTeacherId.trim() || queryTeacherId.trim() || storedTeacherId.trim();

  /* ---------- state ---------- */
  const [rows, setRows] = useState([]);
  const [teacherIdFilter, setTeacherIdFilter] = useState(initialTeacherId);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [fTeacherId, setFTeacherId] = useState(initialTeacherId);
  const [fDesc, setFDesc] = useState("");
  const [fDescCustom, setFDescCustom] = useState("");
  const [fAadhaar, setFAadhaar] = useState("");
  const [fFile, setFFile] = useState(null);

  // map of teacherid -> user id/email to show in table
  const [teacherUserMap, setTeacherUserMap] = useState({});

  const lockedTeacherId = useMemo(
    () => Boolean(teacherIdFilter?.trim()),
    [teacherIdFilter]
  );
  const isEdit = !!editingId;
  const effectiveDesc = fDesc === "__CUSTOM__" ? fDescCustom : fDesc;

  /* ---------- persist filter ---------- */
  useEffect(() => {
    if (teacherIdFilter?.trim()) {
      localStorage.setItem("lastTeacherId", teacherIdFilter.trim());
    }
  }, [teacherIdFilter]);

  /* ---------- load teacher->user map (from MasterTeacher API) ---------- */
  useEffect(() => {
    const route = config.TEACHER_ROUTE;
    if (!route) return;

    axios
      .get(route)
      .then((res) => {
        const list = pickArray(res.data?.teachers ?? res.data ?? []);
        const map = {};
        for (const t of list) {
          const id = toStr(t.teacherid ?? t.id ?? t.teacher_id).trim();
          const userId =
            toStr(t.teacheruserid ?? t.teacheremailid ?? t.email).trim();
          if (id) map[id] = userId || "";
        }
        setTeacherUserMap(map);
      })
      .catch(() => setTeacherUserMap({}));
  }, []);

  /* ---------- load list ---------- */
  const fetchList = async () => {
    try {
      setLoading(true);
      setErr("");
      const params = { limit, offset };
      if (teacherIdFilter.trim()) params.teacherId = teacherIdFilter.trim();
      const { data } = await axios.get(API_BASE, { params });
      setRows(pickArray(data));
    } catch (e) {
      setErr(String(e?.response?.data?.error || e.message || e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset]);
  useEffect(() => {
    setOffset(0);
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherIdFilter]);

  useEffect(() => {
    if (initialTeacherId) setFTeacherId(initialTeacherId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTeacherId]);

  /* ---------- modal helpers ---------- */
  const resetForm = () => {
    setEditingId(null);
    setFTeacherId(teacherIdFilter || "");
    setFDesc("");
    setFDescCustom("");
    setFAadhaar("");
    setFFile(null);
  };
  const openCreate = () => {
    resetForm();
    setOpen(true);
  };
  const openEdit = async (row) => {
    try {
      setLoading(true);
      setErr("");
      const { data } = await axios.get(joinUrl(API_BASE, row.tchr_dtls_id));
      setEditingId(data.tchr_dtls_id);
      setFTeacherId(toStr(data.tchr_teacher_id));
      const descVal = toStr(data.tchr_dtls_desc);
      if (DOC_DESC_OPTIONS.includes(descVal)) {
        setFDesc(descVal);
        setFDescCustom("");
      } else {
        setFDesc("__CUSTOM__");
        setFDescCustom(descVal);
      }
      setFAadhaar(toStr(data.tchr_aadharno || ""));
      setFFile(null);
      setOpen(true);
    } catch (e) {
      setErr(String(e?.response?.data?.error || e.message || e));
    } finally {
      setLoading(false);
    }
  };

  /* ---------- create/update/delete ---------- */
  const handleCreate = async () => {
    const teacherId = (fTeacherId || teacherIdFilter).trim();
    const desc = String(effectiveDesc || "").trim();
    const aadhaar = String(fAadhaar || "").trim();

    if (!teacherId) return alert("Teacher ID is required.");
    if (!desc) return alert("Document description is required.");
    if (aadhaar && !AADHAAR_RE.test(aadhaar)) return alert("Aadhaar must be 12 digits.");

    const fd = new FormData();
    fd.append("tchr_teacher_id", teacherId);
    fd.append("tchr_dtls_desc", desc);
    if (aadhaar) fd.append("tchr_aadharno", aadhaar);
    if (fFile) fd.append("file", fFile);

    try {
      setLoading(true);
      await axios.post(API_BASE, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setOpen(false);
      if (teacherId !== teacherIdFilter) setTeacherIdFilter(teacherId);
      await fetchList();
    } catch (e) {
      alert(
        `Create failed: ${e?.response?.data?.detail || e?.response?.data?.error || e.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    const desc = String(effectiveDesc || "").trim();
    const aadhaar = String(fAadhaar || "").trim();
    if (aadhaar && !AADHAAR_RE.test(aadhaar)) return alert("Aadhaar must be 12 digits.");

    const fd = new FormData();
    if (desc) fd.append("tchr_dtls_desc", desc);
    fd.append("tchr_aadharno", aadhaar); // allow blank to clear
    if (fFile !== null) fd.append("file", fFile);

    try {
      setLoading(true);
      await axios.put(joinUrl(API_BASE, editingId), fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setOpen(false);
      await fetchList();
    } catch (e) {
      alert(
        `Update failed: ${e?.response?.data?.detail || e?.response?.data?.error || e.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete ${row.tchr_dtls_id}?`)) return;
    try {
      setLoading(true);
      await axios.delete(joinUrl(API_BASE, row.tchr_dtls_id));
      await fetchList();
    } catch (e) {
      alert(
        `Delete failed: ${e?.response?.data?.detail || e?.response?.data?.error || e.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  /* ---------- file view/download ---------- */
  // --- in TeacherDtlsManager.jsx ---

const handleDownload = async (row) => {
  try {
    const url = joinUrl(API_BASE, `${row.tchr_dtls_id}/file`);
    const res = await axios.get(url, { responseType: "blob" });

    // Pull filename from Content-Disposition or X-Filename
    const disp = res.headers["content-disposition"] || "";
    const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disp);
    const headerName =
      match?.[1]
        ? decodeURIComponent(match[1])
        : (res.headers["x-filename"] ? decodeURIComponent(res.headers["x-filename"]) : `${row.tchr_dtls_id}`);

    const type = res.headers["content-type"] || "application/octet-stream";
    const blob = new Blob([res.data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = headerName; // <- preserves .pdf/.png/.jpg etc.
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    alert("No file available or download failed.");
  }
};

const handleView = async (row) => {
  try {
    const url = joinUrl(API_BASE, `${row.tchr_dtls_id}/file`);
    const res = await axios.get(url, { responseType: "blob" });
    const type = res.headers["content-type"] || "application/octet-stream";
    const blob = new Blob([res.data], { type });
    const href = URL.createObjectURL(blob);
    window.open(href, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(href), 30000);
  } catch {
    alert("Preview failed or no file present.");
  }
};


  /* ---------- pagination helpers for chips (visual only) ---------- */
  const currentPage = Math.floor(offset / limit) + 1;
  const nextPage = () => setOffset(offset + limit);
  const prevPage = () => setOffset(Math.max(0, offset - limit));

  /* ---------------- render ---------------- */
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
  <div style={styles.title}>Teacher Documents</div>
  <div style={styles.toolbar}>
    <button
      style={styles.addBtn}
      onClick={openCreate}
      disabled={loading}
      title="+ Add"
    >
      + Add
    </button>
  </div>
</div>


        <div style={styles.card}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {/* ID column removed */}
                  <th style={styles.th}>USER ID</th>
                  <th style={styles.th}>TEACHER ID</th>
                  <th style={styles.th}>DESCRIPTION</th>
                  <th style={styles.th}>AADHAAR NO</th>
                  <th style={styles.th}>FILE</th>
                  <th style={styles.th}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const tId = toStr(r.tchr_teacher_id).trim();
                  const userId = teacherUserMap[tId] || "-";
                  return (
                    <tr key={r.tchr_dtls_id} style={{ background: i % 2 ? "#fff" : "#fcfdff" }}>
                      {/* ID cell removed */}
                      <td style={styles.td}>{userId}</td>
                      <td style={styles.td}>{tId}</td>
                      <td style={styles.td}>{r.tchr_dtls_desc}</td>
                      <td style={styles.td}>
                        {r.tchr_aadharno ? r.tchr_aadharno : <span style={{ color: "#94a3b8" }}>NULL</span>}
                      </td>
                      <td style={styles.td}>
                        {Number(r.has_file) ? (
                          <span style={{ ...styles.pill, ...styles.pillHas }}>Has file</span>
                        ) : (
                          <span style={{ ...styles.pill, ...styles.pillNull }}>No file</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actions}>
                          <button className="act-edit" style={styles.actionBtn} onClick={() => openEdit(r)}>
                            Edit
                          </button>
                          <button
                            className="act-del"
                            style={{ ...styles.actionBtn, ...styles.actionDanger }}
                            onClick={() => handleDelete(r)}
                          >
                            Delete
                          </button>
                          <button
                            className="act-view"
                            style={styles.actionBtn}
                            onClick={() => handleView(r)}
                            disabled={!Number(r.has_file)}
                          >
                            View
                          </button>
                          <button
                            className="act-dl"
                            style={styles.actionBtn}
                            onClick={() => handleDownload(r)}
                            disabled={!Number(r.has_file)}
                          >
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && !loading && (
                  <tr>
                    {/* colSpan adjusted from 7 to 6 after removing ID column */}
                    <td style={styles.td} colSpan={6}>
                      No records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={styles.footer}>
            <span style={styles.small}>Showing page</span>
            <span style={styles.pageChip(false)} onClick={prevPage}>«</span>
            <span style={styles.pageChip(true)}>{currentPage}</span>
            <span
              style={styles.pageChip(false)}
              onClick={rows.length < limit ? undefined : nextPage}
            >
              »
            </span>
          </div>
        </div>
      </div>
      {/* Go Back under the table */}
<div
  style={{
    display: "flex",
    justifyContent: "center",
    marginTop: 14,
    marginBottom: 10,
  }}
>
  <button
    onClick={() => {
      // If there is a previous page in browser history, go back to it
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      // Otherwise, hard-redirect to your Master Teacher list page.
      // 🔁 If your route is different, change "/master-teacher" to your actual path.
      window.location.href = "/master-teacher";
    }}
    style={{
      padding: "10px 18px",
      borderRadius: 12,
      border: "1px solid #0f172a",
      background: "#0f172a",
      color: "#fff",
      fontWeight: 800,
      letterSpacing: 0.2,
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
      transition: "transform 120ms ease, box-shadow 120ms ease",
    }}
    onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
    onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
  >
    ← Go Back to Master Teacher
  </button>
</div>

      {/* -------- Modal -------- */}
      {open && (
        <div style={styles.modalBackdrop} onMouseDown={() => setOpen(false)}>
          <div
            style={styles.modal}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={styles.modalHead}>
              <div style={styles.modalTitle}>
                {isEdit ? "Edit Teacher Document" : "Add New Record"}
              </div>
              <button style={styles.ghostBtn} onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {!isEdit && (
                <>
                  <label style={styles.label}>User ID *</label>
                  <input
                    style={styles.input}
                    placeholder="TECH_0001"
                    value={fTeacherId}
                    onChange={(e) => setFTeacherId(e.target.value)}
                    disabled={lockedTeacherId}
                  />
                </>
              )}

              <label style={styles.label}>User Details Description *</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  style={styles.select}
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                >
                  <option value="">Select document</option>
                  {DOC_DESC_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value="__CUSTOM__">Custom…</option>
                </select>
                {fDesc === "__CUSTOM__" && (
                  <input
                    style={{ ...styles.input, flex: 1, minWidth: 200 }}
                    placeholder="Enter custom description"
                    value={fDescCustom}
                    onChange={(e) => setFDescCustom(e.target.value)}
                  />
                )}
              </div>

              <label style={styles.label}>User Aadhaar No (12 digits)</label>
              <input
                style={styles.input}
                placeholder="123456789012"
                value={fAadhaar}
                onChange={(e) => setFAadhaar(e.target.value)}
              />

              <label style={styles.label}>{isEdit ? "Replace File (optional)" : "Upload file"}</label>
              <div
                style={styles.drag}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer?.files?.[0];
                  if (file) setFFile(file);
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Click to browse or drag & drop here
                </div>
                <input type="file" onChange={(e) => setFFile(e.target.files?.[0] || null)} />
                {fFile && (
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    Selected: <b>{fFile.name}</b> ({niceBytes(fFile.size)})
                  </div>
                )}
              </div>
            </div>

            <div style={styles.modalFoot}>
              <button style={styles.ghostBtn} onClick={() => setOpen(false)}>
                Cancel
              </button>
              {isEdit ? (
                <button style={styles.primaryBtn} onClick={handleUpdate} disabled={loading}>
                  Save
                </button>
              ) : (
                <button style={styles.primaryBtn} onClick={handleCreate} disabled={loading}>
                  Create
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}