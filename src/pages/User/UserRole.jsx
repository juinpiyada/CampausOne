// SMS-ui/src/pages/User/UserRole.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import "../../index.css";

const PAGE_SIZE = 4;

/* =========================
   Shared: Toast + Pagination + Modal
   ========================= */

function Toast({ show, message, type, onClose }) {
  if (!show) return null;
  return (
    <div className="toast-wrapper">
      <div className={`toast-box ${type === "error" ? "toast--error" : ""}`}>
        <span className="toast-emoji">{type === "error" ? "❌" : "✔️"}</span>
        <span className="toast-text">{message}</span>
        <button className="toast-close" onClick={onClose} aria-label="Close toast">
          ×
        </button>
      </div>
    </div>
  );
}

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
        disabled={currentPage === totalPages || totalPages === 0}
        className="btn-page"
        onClick={() => onChange(Math.min(totalPages || 1, currentPage + 1))}
        aria-label="Next page"
      >
        »
      </button>
    </div>
  );
}

function ModalShell({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={wide ? "modal modal--wide" : "modal"}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        {title ? <h2 className="modal-heading">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  required,
  disabled,
  placeholder,
  className = "",
}) {
  return (
    <div className={`form-row ${className}`}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );
}

function SelectField({ label, name, value, onChange, options, className = "" }) {
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
          <option key={`${name}-${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* =========================
   Helpers
   ========================= */

function formatIndianDateTime(dt) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return dt;
  }
}

/* =========================
   Add/Edit User-Role Form
   ========================= */

function RoleForm({
  mode = "add",
  masterRoles,
  values,
  onRoleDescChange,
  onChange,
  onSubmit,
  loading,
  error,
  onClose,
}) {
  const isEdit = mode === "edit";
  const roleOptions = [
    { value: "", label: "Select Role..." },
    ...masterRoles.map((r) => ({ value: r.role_desc, label: r.role_desc })),
  ];

  return (
    <ModalShell title={isEdit ? "Edit User Role" : "Add User Role"} onClose={onClose} wide>
      <form onSubmit={onSubmit} autoComplete="off">
        <div className="form-grid form-grid--3">
          <Field
            label="User ID"
            name="userid"
            value={values.userid}
            onChange={onChange}
            required
            disabled={isEdit}
            placeholder="e.g., user_001 or email"
          />
          <SelectField
            label="Role"
            name="userroledesc"
            value={values.userroledesc}
            onChange={onRoleDescChange}
            options={roleOptions}
            className="span-2"
          />
          <Field
            label="Role ID"
            name="userrolesid"
            value={values.userrolesid}
            onChange={onChange}
            required
            disabled
            placeholder="Auto-set from Role"
          />
        </div>

        {error ? <div className="modal-desc modal-desc--error">{error}</div> : null}

        <button
          type="submit"
          disabled={loading}
          className={`btn btn--submit ${loading ? "is-loading" : ""}`}
        >
          {loading ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save Changes" : "Add Role")}
        </button>

        <button onClick={onClose} type="button" className="btn btn--close-fullwidth">
          Close
        </button>
      </form>
    </ModalShell>
  );
}

/* =========================
   Delete Confirm
   ========================= */

function ConfirmDelete({ item, onConfirm, onClose, loading, error }) {
  if (!item) return null;
  return (
    <ModalShell onClose={onClose}>
      <div className="modal-title danger">Delete User Role?</div>
      <div className="modal-desc">
        Are you sure you want to delete <br />
        <span className="highlight">
          {item.userid} / {item.userrolesid}
        </span>
        ?
      </div>
      {error ? <div className="modal-desc modal-desc--error">{error}</div> : null}
      <div className="modal-actions">
        <button className="btn btn--danger" onClick={onConfirm} disabled={loading}>
          {loading ? "Deleting..." : "Yes, Delete"}
        </button>
        <button className="btn btn--secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}

/* =========================
   MAIN
   ========================= */

export default function UserRole() {
  const [roles, setRoles] = useState([]);
  const [masterRoles, setMasterRoles] = useState([]);

  const [formData, setFormData] = useState({
    userid: "",
    userrolesid: "",
    userroledesc: "",
  });
  const [editMode, setEditMode] = useState(false);
  const [editKey, setEditKey] = useState(null);

  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState(null);

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetchRoles();
    fetchMasterRoles();
  }, []);

  useEffect(() => {
    if (toast.show) {
      const t = setTimeout(() => setToast({ ...toast, show: false }), 2000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roles.length]);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
  };

  // ---- API calls (unchanged logic) ----
  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await axios.get(config.USER_ROLE_ROUTE);
      setRoles(res?.data?.roles || []);
    } catch {
      setRoles([]);
      showToast("Failed to load roles", "error");
    }
    setLoading(false);
  };

  const fetchMasterRoles = async () => {
    try {
      const res = await axios.get(config.MASTER_ROLE_ROUTE);
      setMasterRoles(Array.isArray(res.data) ? res.data : res?.data?.roles || []);
    } catch {
      setMasterRoles([]);
    }
  };

  // ---- Handlers (keep same logic) ----
  const handleRoleDescChange = (e) => {
    const selectedDesc = e.target.value;
    const found = masterRoles.find((r) => r.role_desc === selectedDesc);
    setFormData((prev) => ({
      ...prev,
      userroledesc: selectedDesc,
      userrolesid: found ? String(found.role_id) : "",
    }));
  };

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const { userid, userrolesid, userroledesc } = formData;
    if (!userid || !userroledesc) {
      showToast("All fields are required", "error");
      return;
    }

    try {
      if (editMode && editKey) {
        await axios.put(
          `${config.USER_ROLE_ROUTE}/${encodeURIComponent(editKey.userid)}/${encodeURIComponent(
            editKey.userrolesid
          )}`,
          { userroledesc, userrolesid }
        );
        showToast("Role updated successfully", "success");
      } else {
        await axios.post(config.USER_ROLE_ROUTE, formData);
        showToast("Role added successfully", "success");
      }
      setShowForm(false);
      setFormData({ userid: "", userrolesid: "", userroledesc: "" });
      setEditMode(false);
      setEditKey(null);
      fetchRoles();
    } catch {
      setFormError("Error submitting form");
      showToast("Error submitting form", "error");
    }
  };

  const openEdit = (role) => {
    setFormData({
      userid: role.userid,
      userrolesid: String(role.userrolesid ?? ""),
      userroledesc: role.userroledesc,
    });
    setEditKey({
      userid: role.userid,
      userrolesid: String(role.userrolesid ?? ""),
    });
    setEditMode(true);
    setShowForm(true);
    setFormError("");
  };

  const openAdd = () => {
    setFormData({ userid: "", userrolesid: "", userroledesc: "" });
    setEditMode(false);
    setEditKey(null);
    setShowForm(true);
    setFormError("");
  };

  const handleDelete = async () => {
    if (!deleteInfo) return;
    setDeleteError("");
    setLoading(true);
    try {
      await axios.delete(
        `${config.USER_ROLE_ROUTE}/${encodeURIComponent(deleteInfo.userid)}/${encodeURIComponent(
          deleteInfo.userrolesid
        )}`
      );
      showToast("Role deleted successfully", "success");
      setDeleteInfo(null);
      fetchRoles();
    } catch {
      setDeleteError("Error deleting role");
      showToast("Error deleting role", "error");
    } finally {
      setLoading(false);
    }
  };

  // ---- Filter + paginate ----
  const filteredRoles = roles.filter(
    (role) =>
      (role.userid || "").toLowerCase().includes(search.toLowerCase()) ||
      (role.userroledesc || "").toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil((filteredRoles.length || 0) / PAGE_SIZE));
  const paginatedRoles = filteredRoles.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <div className="mu-page">
      <Toast
        {...toast}
        onClose={() => setToast((t) => ({ ...t, show: false }))}
      />

      <div className="mu-container">
        <h2 className="mu-title">Manage User Roles</h2>

        {/* Toolbar */}
        <div className="mu-toolbar">
          <div className="searchbox">
            <span className="searchbox__icon" aria-hidden="true">
              <svg
                width="23"
                height="23"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              className="searchbox__input"
              type="text"
              placeholder="Search by user or role"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button className="btn btn--add" onClick={openAdd}>
            <span className="btn-plus">+</span>
            Add
          </button>
        </div>

        {/* Table Card */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">

            <div className="mu-tablecard">
              <div className="mu-hscroll">
                <table className="mu-table mu-table--fixed-roles">
                  <thead>
                    <tr className="mu-thead-row">
                      <th className="mu-th">User ID</th>
                      <th className="mu-th">Role Description</th>
                      <th className="mu-th">Created At</th>
                      <th className="mu-th">Updated At</th>
                      <th className="mu-th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td className="mu-empty" colSpan={5}>
                          Loading...
                        </td>
                      </tr>
                    ) : paginatedRoles.length === 0 ? (
                      <tr>
                        <td className="mu-empty" colSpan={5}>
                          No roles found
                        </td>
                      </tr>
                    ) : (
                      paginatedRoles.map((role, idx) => (
                        <tr key={`${role.userid}-${role.userrolesid}-${idx}`}>
                          <td className="mu-td">{role.userid}</td>
                          <td className="mu-td">{role.userroledesc}</td>
                          <td className="mu-td">{formatIndianDateTime(role.createdat)}</td>
                          <td className="mu-td">{formatIndianDateTime(role.updatedat)}</td>
                          <td className="mu-td">
                            <button
                              className="btn btn--primary"
                              onClick={() => openEdit(role)}
                              title="Edit"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--danger"
                              onClick={() => setDeleteInfo(role)}
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
            </div>

            {/* Pagination footer */}
            <div className="mu-pagination">
              <span className="mu-pageinfo">
                Showing page {currentPage} of {totalPages || 1} pages
              </span>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onChange={setCurrentPage}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <RoleForm
          mode={editMode ? "edit" : "add"}
          masterRoles={masterRoles}
          values={formData}
          onRoleDescChange={handleRoleDescChange}
          onChange={handleChange}
          onSubmit={handleSubmit}
          loading={loading}
          error={formError}
          onClose={() => {
            setShowForm(false);
            setFormError("");
          }}
        />
      )}

      {/* Delete Confirm */}
      {deleteInfo && (
        <ConfirmDelete
          item={deleteInfo}
          onConfirm={handleDelete}
          onClose={() => setDeleteInfo(null)}
          loading={loading}
          error={deleteError}
        />
      )}
    </div>
  );
}
