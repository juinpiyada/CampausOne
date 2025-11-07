// src/pages/Leave/LeaveApplicationManager.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import config, { joinUrl as joinBase } from "../../config/middleware_config";
import "../../index.css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

/* ---------- API (from config) ---------- */
const joinUrl = (base = "", path = "") => joinBase(base, path);
const API_BASE  = config.LEAVE_APPLICATION_ROUTE; 
const API_LIST  = joinUrl(API_BASE, "list");
const API_ADD   = joinUrl(API_BASE, "add");
const API_UPDATE = (id) => joinUrl(API_BASE, joinUrl("update", String(id)));
const API_DELETE = (id) => joinUrl(API_BASE, joinUrl("delete", String(id)));

/* ---------- utils ---------- */
const asDateOrEmpty = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};
const asBool = (v) =>
  (typeof v === "boolean" ? v : String(v ?? "").toLowerCase() === "true");

const emptyModel = {
  applicant_name: "",
  designation: "",
  department: "",
  cl_from: "",
  cl_to: "",
  cl_reason: "",
  od_from: "",
  od_to: "",
  od_reason: "",
  comp_from: "",
  comp_to: "",
  comp_in_lieu_from: "",
  comp_in_lieu_to: "",
  comp_for: "",
  comp_details: "",
  classes_adjusted: "",
  hod_countersigned: false,
  principal_signed: false,
};
// --- role helpers (same logic used in Dashboard) ---
function readAuth() {
  try { return JSON.parse(localStorage.getItem('auth') || '{}'); }
  catch { return {}; }
}
function normalizeRoles(user = {}) {
  const pool = [];
  if (user.user_role) pool.push(String(user.user_role));
  if (user.role) pool.push(String(user.role));
  if (user.userroledesc) pool.push(String(user.userroledesc));
  if (user.userrolesid) pool.push(String(user.userrolesid));
  if (user.userroles) {
    if (Array.isArray(user.userroles)) pool.push(...user.userroles.map(String));
    else pool.push(String(user.userroles));
  }
  if (Array.isArray(user.roles)) pool.push(...user.roles.map(String));
  return new Set(
    pool.flatMap(r => String(r).split(/[,\s]+/))
        .map(t => t.trim().toLowerCase())
        .filter(Boolean)
  );
}
const hasAny = (set, ...keys) => keys.some(k => set.has(k.toLowerCase()));

/* ---------- toast ---------- */
function useToast() {
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 2500);
  };
  return { toast, setToast, showToast };
}

/* ---------- PDF helper (1-page fit) ---------- */
async function downloadPdfForRow(row) {
  const d = (x) => (x ? asDateOrEmpty(x) : "—");
  const s = (x) => (x ? String(x) : "—");
  const yes = (b) => (asBool(b) ? "Yes" : "No");

  // Build an offscreen HTML layout that looks good, then snapshot via html2canvas.
  const wrap = document.createElement("div");
  wrap.style.width = "900px"; // Design width; will be scaled to A4
  wrap.style.padding = "20px 24px";
  wrap.style.boxSizing = "border-box";
  wrap.style.fontFamily = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  wrap.style.color = "#0f172a";
  wrap.style.background = "#ffffff";

  // Header (gradient)
  const header = document.createElement("div");
  header.style.background = "linear-gradient(90deg, #0f172a, #1f2937 60%, #334155)";
  header.style.color = "#fff";
  header.style.borderRadius = "12px";
  header.style.padding = "16px 18px";
  header.style.marginBottom = "14px";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const hLeft = document.createElement("div");
  const hTitle = document.createElement("div");
  hTitle.textContent = `Leave Application ${row?.id ? `#${row.id}` : ""}`;
  hTitle.style.fontWeight = "700";
  hTitle.style.fontSize = "18px";

  const hSub = document.createElement("div");
  hSub.textContent = `${s(row.applicant_name)}  •  ${s(row.designation)}  •  ${s(row.department)}`;
  hSub.style.opacity = "0.9";
  hSub.style.fontSize = "12px";
  hLeft.appendChild(hTitle);
  hLeft.appendChild(hSub);

  const hRight = document.createElement("div");
  hRight.textContent = `Generated on ${new Date().toLocaleString()}`;
  hRight.style.fontSize = "11px";
  hRight.style.opacity = "0.95";

  header.appendChild(hLeft);
  header.appendChild(hRight);
  wrap.appendChild(header);

  // helper to build a section card
  const section = (title, rowsArr) => {
    const card = document.createElement("div");
    card.style.border = "1px solid #e5e7eb";
    card.style.borderRadius = "10px";
    card.style.marginBottom = "10px";
    card.style.overflow = "hidden";

    const head = document.createElement("div");
    head.textContent = title;
    head.style.background = "#f1f5f9";
    head.style.fontWeight = "600";
    head.style.fontSize = "12px";
    head.style.padding = "8px 12px";
    card.appendChild(head);

    const tbl = document.createElement("table");
    tbl.style.width = "100%";
    tbl.style.borderCollapse = "collapse";
    tbl.style.fontSize = "11px";

    rowsArr.forEach(([label, value]) => {
      const tr = document.createElement("tr");

      const tdL = document.createElement("td");
      tdL.textContent = label;
      tdL.style.padding = "8px 12px";
      tdL.style.borderTop = "1px solid #eef2f7";
      tdL.style.width = "220px";
      tdL.style.fontWeight = "600";
      tdL.style.background = "#fafbfc";

      const tdV = document.createElement("td");
      tdV.textContent = value;
      tdV.style.padding = "8px 12px";
      tdV.style.borderTop = "1px solid #eef2f7";

      tr.appendChild(tdL);
      tr.appendChild(tdV);
      tbl.appendChild(tr);
    });

    card.appendChild(tbl);
    return card;
  };

  // Applicant
  wrap.appendChild(
    section("Applicant Details", [
      ["Applicant Name", s(row.applicant_name)],
      ["Designation", s(row.designation)],
      ["Department", s(row.department)],
    ])
  );

  // CL
  wrap.appendChild(
    section("Casual Leave (CL)", [
      ["From → To", `${d(row.cl_from)} → ${d(row.cl_to)}`],
      ["Reason", s(row.cl_reason)],
    ])
  );

  // OD
  wrap.appendChild(
    section("On Duty (OD)", [
      ["From → To", `${d(row.od_from)} → ${d(row.od_to)}`],
      ["Reason", s(row.od_reason)],
    ])
  );

  // Comp Off
  wrap.appendChild(
    section("Compensatory Off", [
      ["From → To", `${d(row.comp_from)} → ${d(row.comp_to)}`],
      ["In-lieu From → To", `${d(row.comp_in_lieu_from)} → ${d(row.comp_in_lieu_to)}`],
      ["Comp For", s(row.comp_for)],
      ["Details", s(row.comp_details)],
    ])
  );

  // Remarks
  wrap.appendChild(
    section("Classes Adjusted / Remarks", [["Remarks", s(row.classes_adjusted)]])
  );

  // Approvals
  wrap.appendChild(
    section("Approvals", [
      ["HOD Countersigned", yes(row.hod_countersigned)],
      ["Principal Signed", yes(row.principal_signed)],
    ])
  );

  // Timestamps
  const meta = document.createElement("div");
  meta.style.fontSize = "11px";
  meta.style.margin = "6px 0 10px 2px";
  meta.style.color = "#334155";
  meta.textContent = `Submitted: ${
    row?.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"
  }   •   Last updated: ${
    row?.updated_at ? new Date(row.updated_at).toLocaleString() : "—"
  }`;
  wrap.appendChild(meta);

  // Signature row: three boxes, ticks appear when approved
  const sigRow = document.createElement("div");
  sigRow.style.display = "grid";
  sigRow.style.gridTemplateColumns = "repeat(3, 1fr)";
  sigRow.style.gap = "12px";

  const mkSig = (label, tick) => {
    const box = document.createElement("div");
    box.style.border = "1px solid #cbd5e1";
    box.style.borderRadius = "10px";
    box.style.height = "80px";
    box.style.position = "relative";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.background = "#fff";

    if (tick) {
      const t = document.createElement("div");
      t.textContent = "✓";
      t.style.position = "absolute";
      t.style.fontSize = "34px";
      t.style.fontWeight = "800";
      t.style.color = "#1e8c3c";
      t.style.opacity = "0.95";
      box.appendChild(t);
    }

    const lab = document.createElement("div");
    lab.textContent = label;
    lab.style.position = "absolute";
    lab.style.bottom = "-18px";
    lab.style.left = "50%";
    lab.style.transform = "translateX(-50%)";
    lab.style.fontSize = "11px";
    lab.style.fontWeight = "700";
    lab.style.color = "#0f172a";
    sigRow.appendChild(box);

    const holder = document.createElement("div");
    holder.style.position = "relative";
    holder.appendChild(box);
    holder.appendChild(lab);
    return holder;
  };

  sigRow.appendChild(mkSig("Applicant Signature", false));
  sigRow.appendChild(mkSig("HOD Signature", asBool(row.hod_countersigned)));
  sigRow.appendChild(mkSig("Principal Signature", asBool(row.principal_signed)));
  wrap.appendChild(sigRow);

  // Mount offscreen for capture
  wrap.style.position = "fixed";
  wrap.style.left = "-99999px";
  wrap.style.top = "0";
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(wrap, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    // Create PDF and fit image to one page with margins
    const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36; // 0.5 inch roughly
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;

    const imgW = canvas.width;
    const imgH = canvas.height;

    const scale = Math.min(maxW / imgW, maxH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;

    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    const imgData = canvas.toDataURL("image/png");
    doc.addImage(imgData, "PNG", x, y, drawW, drawH, "", "FAST");

    // Footer page number (always 1 of 1 now)
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Page 1 of 1", pageW - margin, pageH - 12, { align: "right" });
    doc.setTextColor(0);

    const fname = `Leave_Application_${row?.id ?? "NA"}.pdf`;
    doc.save(fname);
  } finally {
    document.body.removeChild(wrap);
  }
}

/* ---------- page ---------- */
export default function LeaveApplicationManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast, showToast, setToast } = useToast();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const [deleteId, setDeleteId] = useState(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const resp = await axios.get(API_LIST);
      const arr = resp?.data?.applications ?? [];
      setRows(Array.isArray(arr) ? arr : []);
    } catch {
      showToast("Failed to load leave applications", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const auth = readAuth();
    const roleSet = normalizeRoles(auth);
    const admin = hasAny(
      roleSet,
      'admin','super_user','sms_superadm','superadmin','super_admin',
    );
    setIsAdmin(admin);
  }, []);

  const [isApprover, setIsApprover] = useState(false);

useEffect(() => {
  const auth = readAuth();
  const roleSet = normalizeRoles(auth);

  // who can edit approvals
  const approver = hasAny(
    roleSet,
    'hod','principal','approver','supervisor','admin','super_user','sms_superadm','superadmin','super_admin'
  );

  setIsApprover(approver);
}, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.id,
        r.applicant_name,
        r.designation,
        r.department,
        r.cl_reason,
        r.od_reason,
        r.comp_for,
        r.comp_details,
        r.classes_adjusted,
      ]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase())
        .join(" ")
        .includes(q)
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search]);

  const openAdd = () => {
    setEditRow(null);
    setShowAddModal(true);
  };
  const openEdit = (row) => {
    setEditRow(row);
    setShowEditModal(true);
  };

  const handleDelete = (row) => setDeleteId(row?.id);
  const confirmDelete = async () => {
    if (!deleteId) return;
    setLoading(true);
    try {
      await axios.delete(API_DELETE(deleteId));
      showToast("Deleted successfully");
      setDeleteId(null);
      await fetchList();
    } catch (e) {
      const msg = e?.response?.data?.error || "Failed to delete";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const total = rows.length;
  const approved = rows.filter(
    (r) => r.hod_countersigned && r.principal_signed
  ).length;
  const pending = total - approved;

  return (
    <div className="mu-page">
      {/* toast */}
      {toast.show && (
        <div className="toast-wrapper">
          <div
            className={`toast-box ${
              toast.type === "error" ? "toast--error" : "toast--success"
            }`}
          >
            <span className="toast-emoji">
              {toast.type === "error" ? "⚠️" : "✅"}
            </span>
            <span className="toast-text">{toast.message}</span>
            <button
              onClick={() => setToast({ show: false, message: "", type: "" })}
              className="toast-close"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* delete confirm */}
      {deleteId && (
        <Modal
          title="Delete application?"
          onClose={() => setDeleteId(null)}
          showCross
        >
          <div className="modal-desc">
            Are you sure you want to delete application <b>#{deleteId}</b>?
          </div>
          <div className="modal-actions">
            <button
              onClick={confirmDelete}
              disabled={loading}
              className="btn btn--danger"
            >
              {loading ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              onClick={() => setDeleteId(null)}
              disabled={loading}
              className="btn btn--secondary"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      <div className="mu-container">
        <div
          className="flex"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <h2 className="mu-title">Leave Applications</h2>
          <div className="inline-flex gap-2">
            <button
              className="btn btn--secondary"
              onClick={fetchList}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            {/* Hide +New if admin */}
            {!isAdmin && (
              <button className="btn btn--add" onClick={openAdd}>
                <span className="btn-plus">+</span> New
              </button>
            )}
          </div>
        </div>

        {/* stats */}
        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            margin: "12px 0 20px",
          }}
        >
          <Stat label="Total" value={total} />
          <Stat label="Approved" value={approved} />
          <Stat label="Pending" value={pending} />
        </div>

        {/* toolbar */}
        <div className="mu-toolbar">
          <div className="searchbox">
            <span className="searchbox__icon" aria-hidden="true">
              <svg width="23" height="23" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="searchbox__input"
            />
          </div>
        </div>

        {/* table */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">
            <div className="mu-tablecard">
              <table className="mu-table">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">#</th>
                    <th className="mu-th">Applicant</th>
                    <th className="mu-th">Designation / Dept</th>
                    <th className="mu-th">CL</th>
                    <th className="mu-th">OD</th>
                    <th className="mu-th">Comp Off</th>
                    <th className="mu-th">Remarks</th>
                    <th className="mu-th">Approvals</th>
                    <th className="mu-th">Updated</th>
                    <th className="mu-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="mu-empty" colSpan={10}>
                        Loading…
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    paginated.map((r) => (
                      <tr key={r.id}>
                        <td className="mu-td">#{r.id}</td>
                        <td className="mu-td">{r.applicant_name || "-"}</td>
                        <td className="mu-td">
                          <div>{r.designation || "-"}</div>
                          <div className="text-xs" style={{ opacity: 0.7 }}>
                            {r.department || "-"}
                          </div>
                        </td>

                        {/* CL */}
                        <td className="mu-td text-xs">
                          {r.cl_from || r.cl_to ? (
                            <div>
                              {asDateOrEmpty(r.cl_from)} →{" "}
                              {asDateOrEmpty(r.cl_to)}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* OD */}
                        <td className="mu-td text-xs">
                          {r.od_from || r.od_to ? (
                            <>
                              <div>
                                {asDateOrEmpty(r.od_from)} →{" "}
                                {asDateOrEmpty(r.od_to)}
                              </div>
                              {r.od_reason && (
                                <div
                                  className="text-xs"
                                  style={{ opacity: 0.8 }}
                                >
                                  "{r.od_reason}"
                                </div>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Comp */}
                        <td className="mu-td text-xs">
                          {r.comp_from || r.comp_to ? (
                            <>
                              <div>
                                {asDateOrEmpty(r.comp_from)} →{" "}
                                {asDateOrEmpty(r.comp_to)}
                              </div>
                              {(r.comp_in_lieu_from || r.comp_in_lieu_to) && (
                                <div
                                  className="text-xs"
                                  style={{ opacity: 0.8 }}
                                >
                                  In-lieu: {asDateOrEmpty(r.comp_in_lieu_from)}{" "}
                                  → {asDateOrEmpty(r.comp_in_lieu_to)}
                                </div>
                              )}
                              {r.comp_for && (
                                <div
                                  className="text-xs"
                                  style={{ opacity: 0.8 }}
                                >
                                  For: {r.comp_for}
                                </div>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Remarks */}
                        <td className="mu-td text-xs" title={r.classes_adjusted || ""}>
                          {r.classes_adjusted ? 
                            (r.classes_adjusted.length > 30 ? 
                              r.classes_adjusted.substring(0, 30) + "..." : 
                              r.classes_adjusted) 
                            : "—"}
                        </td>

                        <td className="mu-td">
                          <span
                            className={`status ${
                              r.hod_countersigned
                                ? "status--active"
                                : "status--inactive"
                            }`}
                          >
                            HOD {r.hod_countersigned ? "✔" : "—"}
                          </span>{" "}
                          <span
                            className={`status ${
                              r.principal_signed
                                ? "status--active"
                                : "status--inactive"
                            }`}
                          >
                            Principal {r.principal_signed ? "✔" : "—"}
                          </span>
                        </td>

                        <td className="mu-td text-xs">
                          {r.updated_at
                            ? new Date(r.updated_at).toLocaleString()
                            : r.submitted_at
                            ? new Date(r.submitted_at).toLocaleString()
                            : "—"}
                        </td>

                        <td className="mu-td">
                          <button
                            className="btn btn--primary"
                            onClick={() => openEdit(r)}
                          >
                            Edit
                          </button>
                          {/* Hide Delete if admin */}
                          {!isAdmin && (
                            <button
                              className="btn btn--danger"
                              onClick={() => handleDelete(r)}
                            >
                              Delete
                            </button>
                          )}
                          <button
                            className="btn btn--secondary"
                            onClick={() => downloadPdfForRow(r)}
                            title="Download PDF for this application"
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}

                  {!loading && paginated.length === 0 && (
                    <tr>
                      <td className="mu-empty" colSpan={10}>
                        No records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* pagination */}
              <div className="mu-pagination">
                <span className="mu-pageinfo">
                  Showing page <b>{page}</b> of <b>{totalPages}</b>
                </span>
                <div className="mu-pagebtns">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="btn-page"
                    aria-label="Previous page"
                  >
                    «
                  </button>
                  <span className="badge-page">{page}</span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="btn-page"
                    aria-label="Next page"
                  >
                    »
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add */}
        {showAddModal && (
          <Modal
            title="New Leave Application"
            onClose={() => setShowAddModal(false)}
            showCross
            wide
          >
            <LeaveForm
              initial={emptyModel}
              isAdmin={isAdmin}
              isApprover={isApprover}
              onCancel={() => setShowAddModal(false)}
              onSaved={async (payload) => {
                try {
                  await axios.post(API_ADD, payload);
                  setShowAddModal(false);
                  showToast("Application created");
                  await fetchList();
                } catch (e) {
                  const msg = e?.response?.data?.error || "Failed to create";
                  showToast(msg, "error");
                }
              }}
            />
          </Modal>
        )}

        {/* Edit */}
        {showEditModal && (
          <Modal
            title={`Edit Application #${editRow?.id}`}
            onClose={() => setShowEditModal(false)}
            showCross
            wide
          >
            <LeaveForm
              initial={{
                ...emptyModel,
                ...editRow,
                cl_from: asDateOrEmpty(editRow?.cl_from),
                cl_to: asDateOrEmpty(editRow?.cl_to),
                od_from: asDateOrEmpty(editRow?.od_from),
                od_to: asDateOrEmpty(editRow?.od_to),
                comp_from: asDateOrEmpty(editRow?.comp_from),
                comp_to: asDateOrEmpty(editRow?.comp_to),
                comp_in_lieu_from: asDateOrEmpty(editRow?.comp_in_lieu_from),
                comp_in_lieu_to: asDateOrEmpty(editRow?.comp_in_lieu_to),
                hod_countersigned: asBool(editRow?.hod_countersigned),
                principal_signed: asBool(editRow?.principal_signed),
              }}
              isAdmin={isAdmin}
              isApprover={isApprover}
              onCancel={() => setShowEditModal(false)}
              onSaved={async (payload) => {
                try {
                  await axios.put(API_UPDATE(editRow.id), payload);
                  setShowEditModal(false);
                  showToast("Application updated");
                  await fetchList();
                } catch (e) {
                  const msg = e?.response?.data?.error || "Failed to update";
                  showToast(msg, "error");
                }
              }}
            />
          </Modal>
        )}
      </div>
    </div>
  );
}

/* ---------- sub components ---------- */
function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide" style={{ opacity: 0.7 }}>
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Modal({ title, onClose, children, showCross, wide = false }) {
  const modalStyle = wide ? { maxWidth: "1100px", width: "90vw" } : undefined;
  return (
    <div className="modal-overlay">
      <div className="modal" style={modalStyle}>
        {showCross && (
          <button
            onClick={onClose}
            className="modal-x"
            title="Close"
            aria-label="Close"
          >
            ×
          </button>
        )}
        <h3 className="modal-heading">{title}</h3>
        {children}
        <button onClick={onClose} className="btn btn--close-fullwidth">
          Close
        </button>
      </div>
    </div>
  );
}

/* ---------- fully-editable form with admin locks ---------- */
function LeaveForm({ initial, onSaved, isAdmin = false, isApprover = false }) {

  const normalizeInit = (src) => ({
    applicant_name: String(src?.applicant_name ?? ""),
    designation: String(src?.designation ?? ""),
    department: String(src?.department ?? ""),

    cl_from: asDateOrEmpty(src?.cl_from),
    cl_to: asDateOrEmpty(src?.cl_to),
    cl_reason: String(src?.cl_reason ?? ""),

    od_from: asDateOrEmpty(src?.od_from),
    od_to: asDateOrEmpty(src?.od_to),
    od_reason: String(src?.od_reason ?? ""),

    comp_from: asDateOrEmpty(src?.comp_from),
    comp_to: asDateOrEmpty(src?.comp_to),
    comp_in_lieu_from: asDateOrEmpty(src?.comp_in_lieu_from),
    comp_in_lieu_to: asDateOrEmpty(src?.comp_in_lieu_to),
    comp_for: String(src?.comp_for ?? ""),
    comp_details: String(src?.comp_details ?? ""),

    classes_adjusted: String(src?.classes_adjusted ?? ""),

    hod_countersigned: asBool(src?.hod_countersigned),
    principal_signed: asBool(src?.principal_signed),
  });

  const [model, setModel] = useState(normalizeInit(initial));
  const [step, setStep] = useState(0);
  const bodyRef = useRef(null);

  // --- ADMIN LOCKS: admin can only edit Approvals (step 5) ---
  const ADMIN_LOCK_KEYS = new Set([
    "applicant_name",
    "designation",
    "department",
    "cl_from","cl_to","cl_reason",
    "od_from","od_to","od_reason",
    "comp_from","comp_to","comp_in_lieu_from","comp_in_lieu_to",
    "comp_for","comp_details",
    "classes_adjusted",
  ]);
  const isLockedStep = (s) => isAdmin && s >= 0 && s <= 4; // lock steps 0..4
  const lockInputProps = (s) => (isLockedStep(s) ? { disabled: true, readOnly: true } : {});

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const up = (patch) =>
    setModel((m) => {
      // If admin, strip any locked-key changes from the patch
      if (isAdmin) {
        const safe = { ...patch };
        Object.keys(safe).forEach((k) => {
          if (ADMIN_LOCK_KEYS.has(k)) delete safe[k];
        });
        patch = safe;
      }
      if (!isApprover) {
      const safe = { ...patch };
      delete safe.hod_countersigned;
      delete safe.principal_signed;
      patch = safe;
    }

      const n = { ...m, ...patch };
      const s = (v) => (v == null ? "" : String(v));
      return {
        ...n,
        applicant_name: s(n.applicant_name),
        designation: s(n.designation),
        department: s(n.department),
        cl_from: asDateOrEmpty(n.cl_from),
        cl_to: asDateOrEmpty(n.cl_to),
        cl_reason: s(n.cl_reason),
        od_from: asDateOrEmpty(n.od_from),
        od_to: asDateOrEmpty(n.od_to),
        od_reason: s(n.od_reason),
        comp_from: asDateOrEmpty(n.comp_from),
        comp_to: asDateOrEmpty(n.comp_to),
        comp_in_lieu_from: asDateOrEmpty(n.comp_in_lieu_from),
        comp_in_lieu_to: asDateOrEmpty(n.comp_in_lieu_to),
        comp_for: s(n.comp_for),
        comp_details: s(n.comp_details),
        classes_adjusted: s(n.classes_adjusted),
        hod_countersigned: asBool(n.hod_countersigned),
        principal_signed: asBool(n.principal_signed),
      };
    });

  const STEPS = [
    "Applicant",
    "Casual Leave (CL)",
    "On Duty (OD)",
    "Compensatory Off",
    "Remarks",
    "Approvals",
  ];

  const atLeastOneRange =
    (model.cl_from && model.cl_to) ||
    (model.od_from && model.od_to) ||
    (model.comp_from && model.comp_to);

  const formValid =
    model.applicant_name.trim().length > 0 && atLeastOneRange;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!formValid && !isAdmin) {
          alert(
            "Provide applicant name and at least one valid date range (CL or OD or Comp)."
          );
          return;
        }
        const fullPayload = {
          applicant_name: model.applicant_name.trim(),
          designation: model.designation.trim(),
          department: model.department.trim(),
          cl_from: model.cl_from || null,
          cl_to: model.cl_to || null,
          cl_reason: model.cl_reason.trim() || null,
          od_from: model.od_from || null,
          od_to: model.od_to || null,
          od_reason: model.od_reason.trim() || null,
          comp_from: model.comp_from || null,
          comp_to: model.comp_to || null,
          comp_in_lieu_from: model.comp_in_lieu_from || null,
          comp_in_lieu_to: model.comp_in_lieu_to || null,
          comp_for: model.comp_for.trim() || null,
          comp_details: model.comp_details.trim() || null,
          classes_adjusted: model.classes_adjusted.trim() || null,
          hod_countersigned: !!model.hod_countersigned,
          principal_signed: !!model.principal_signed,
        };

        const payload = isAdmin ? { ...fullPayload } : fullPayload;
        await onSaved(payload);
      }}
    >
      {/* Stepper */}
      <div className="flex gap-2" style={{ flexWrap: "wrap", marginBottom: 8 }}>
        {["Applicant", "CL", "OD", "Comp", "Remarks", "Approvals"].map(
          (label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={`badge-page ${i === step ? "active" : ""}`}
              style={{
                borderRadius: 999,
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                background: i === step ? "#0f172a" : "#f1f5f9",
                color: i === step ? "#fff" : "#111827",
              }}
            >
              {i + 1}. {label}
            </button>
          )
        )}
      </div>

      <div
        ref={bodyRef}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ padding: 12, maxHeight: "65vh", overflowY: "auto" }}
      >
        {step === 0 && (
          <Section title="Applicant Details" hint="* required">
            <div
              className="form-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <div className="form-row">
                <label className="form-label">
                  Applicant Name <span style={{ color: "#d33" }}>*</span>
                </label>
                <input
                  className="form-input"
                  value={model.applicant_name}
                  onChange={(e) => up({ applicant_name: e.target.value })}
                  placeholder="Full name"
                  {...lockInputProps(step)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">Designation</label>
                <input
                  className="form-input"
                  value={model.designation}
                  onChange={(e) => up({ designation: e.target.value })}
                  placeholder="Assistant Professor"
                  {...lockInputProps(step)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">Department</label>
                <input
                  className="form-input"
                  value={model.department}
                  onChange={(e) => up({ department: e.target.value })}
                  placeholder="CSE / ECE / ..."
                  {...lockInputProps(step)}
                />
              </div>
            </div>
          </Section>
        )}

        {step === 1 && (
          <Section title="Casual Leave (CL)">
            <div
              className="form-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}
            >
              <div className="form-row">
                <label className="form-label">From</label>
                <input
                  className="form-input"
                  type="date"
                  value={model.cl_from}
                  onChange={(e) => up({ cl_from: e.target.value })}
                  {...lockInputProps(step)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">To</label>
                <input
                  className="form-input"
                  type="date"
                  value={model.cl_to}
                  onChange={(e) => up({ cl_to: e.target.value })}
                  {...lockInputProps(step)}
                />
              </div>
            </div>
          </Section>
        )}

        {step === 2 && (
          <Section title="On Duty (OD)" hint="Optional">
            <div
              className="form-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}
            >
              <div className="form-row">
                <label className="form-label">From</label>
                <input
                  className="form-input"
                  type="date"
                  value={model.od_from}
                  onChange={(e) => up({ od_from: e.target.value })}
                  {...lockInputProps(step)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">To</label>
                <input
                  className="form-input"
                  type="date"
                  value={model.od_to}
                  onChange={(e) => up({ od_to: e.target.value })}
                  {...lockInputProps(step)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">Reason</label>
                <input
                  className="form-input"
                  value={model.od_reason}
                  onChange={(e) => up({ od_reason: e.target.value })}
                  placeholder="Reason for OD"
                  {...lockInputProps(step)}
                />
              </div>
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section title="Compensatory Off" hint="Optional">
            <div
              className="form-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}
            >
              <div
                className="form-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}
              >
                <div className="form-row">
                  <label className="form-label">From</label>
                  <input
                    className="form-input"
                    type="date"
                    value={model.comp_from}
                    onChange={(e) => up({ comp_from: e.target.value })}
                    {...lockInputProps(step)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">To</label>
                  <input
                    className="form-input"
                    type="date"
                    value={model.comp_to}
                    onChange={(e) => up({ comp_to: e.target.value })}
                    {...lockInputProps(step)}
                  />
                </div>
              </div>

              <div
                className="form-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}
              >
                <div className="form-row">
                  <label className="form-label">In-lieu From</label>
                  <input
                    className="form-input"
                    type="date"
                    value={model.comp_in_lieu_from}
                    onChange={(e) => up({ comp_in_lieu_from: e.target.value })}
                    {...lockInputProps(step)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">In-lieu To</label>
                  <input
                    className="form-input"
                    type="date"
                    value={model.comp_in_lieu_to}
                    onChange={(e) => up({ comp_in_lieu_to: e.target.value })}
                    {...lockInputProps(step)}
                  />
                </div>
              </div>

              <div className="form-row">
                <label className="form-label">Comp For</label>
                <input
                  className="form-input"
                  value={model.comp_for}
                  onChange={(e) => up({ comp_for: e.target.value })}
                  placeholder="Event / Duty"
                  {...lockInputProps(step)}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Details</label>
                <textarea
                  className="form-input"
                  value={model.comp_details}
                  onChange={(e) => up({ comp_details: e.target.value })}
                  placeholder="Additional notes"
                  rows={3}
                  {...lockInputProps(step)}
                />
              </div>
            </div>
          </Section>
        )}

        {step === 4 && (
          <Section title="Classes Adjusted / Remarks">
            <textarea
              className="form-input"
              value={model.classes_adjusted}
              onChange={(e) => up({ classes_adjusted: e.target.value })}
              placeholder="Mention class adjustments or remarks"
              rows={3}
              {...lockInputProps(step)}
            />
          </Section>
        )}

        {step === 5 && (
  <Section title="Approvals">
    <div className="flex" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Toggle
        label="HOD Countersigned"
        checked={!!model.hod_countersigned}
        onChange={(v) => up({ hod_countersigned: v })}
        disabled={!isApprover}
      />
      <Toggle
        label="Principal Signed"
        checked={!!model.principal_signed}
        onChange={(v) => up({ principal_signed: v })}
        disabled={!isApprover}
      />
    </div>
  </Section>
)}

      </div>

      <div className="flex" style={{ justifyContent: "space-between", paddingTop: 12 }}>
        <span className="text-xs" style={{ opacity: 0.7 }}>
          Step {step + 1} of 6
        </span>
        <div className="inline-flex gap-8">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          {step < 5 ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setStep((s) => Math.min(5, s + 1))}
            >
              Next
            </button>
          ) : (
            <button type="submit" className="btn btn--submit">
              Save
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

/* ---------- small bits ---------- */
function Section({ title, hint, children }) {
  return (
    <section style={{ padding: 6 }}>
      <div
        className="flex"
        style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}
      >
        <h4 style={{ margin: 0 }}>{title}</h4>
        {hint && (
          <span className="text-xs" style={{ opacity: 0.7 }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange, disabled = false }) {
  return (
    <label className="flex" style={{ alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => !disabled && onChange?.(e.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}

