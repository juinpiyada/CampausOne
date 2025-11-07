// SMS-ui/src/pages/User/Manageuser.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import "../../index.css";

// Toggle to show/hide the “All User Role Mappings” table
const SHOW_ROLE_MAPPINGS = false;
const SHOW_ADD_BUTTON = false;


// Toast (same look/feel as AddCollege.jsx)
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

// Simple pager (matches AddCollege.jsx)
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
        disabled={currentPage === totalPages}
        className="btn-page"
        onClick={() => onChange(currentPage + 1)}
        aria-label="Next page"
      >
        »
      </button>
    </div>
  );
}

/* =========================
   Helpers & Utilities
   ========================= */

const USERS_PER_PAGE = 4;

// Indian style datetime (kept from your version)
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

// Auto-generate sequential IDs like user_001 based on current userRoles
function generateUserRoleId(userRoles) {
  const prefix = "user_";
  let maxNum = 0;
  (userRoles || []).forEach((r) => {
    const match = /^user_(\d+)$/.exec(r?.userid || "");
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

/* =========================
   Modal Building Blocks
   ========================= */

function ModalShell({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={wide ? "modal modal--wide" : "modal"} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        {title ? <h2 className="modal-heading">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

function Field({ label, name, type = "text", value, onChange, required, disabled, placeholder }) {
  return (
    <div className="form-row">
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

function SelectField({ label, name, value, onChange, options, required }) {
  return (
    <div className="form-row">
      <label className="form-label">{label}</label>
      <select
        className="form-input"
        name={name}
        value={value}
        onChange={onChange}
        required={required}
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
   Add/Edit User Form
   ========================= */

function UserForm({
  isEdit = false,
  roles,
  values,
  onChange,
  onSubmit,
  loading,
  error,
  onClose,
}) {
  return (
    <ModalShell title={isEdit ? "Edit User" : "Add User"} onClose={onClose} wide>
      <form onSubmit={onSubmit} autoComplete="off">
        <div className="form-grid form-grid--3">
          <Field
            label="Email (User ID)"
            name="useremail"
            type="email"
            value={values.useremail}
            onChange={onChange}
            required
            disabled={isEdit}
            placeholder="user@example.com"
          />
          <Field
            label="Password"
            name="userpwd"
            type="password"
            value={values.userpwd}
            onChange={onChange}
            required
            placeholder={isEdit ? "••••••••" : "Create a strong password"}
          />
          <SelectField
            label="Status"
            name="useractive"
            value={values.useractive}
            onChange={onChange}
            required
            options={[
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ]}
          />
          <SelectField
            label="Role"
            name="userroles"
            value={values.userroles}
            onChange={onChange}
            required
            options={[
              { value: "", label: "Select role..." },
              ...roles.map((r) => ({ value: r.role_id, label: r.role_desc })),
            ]}
          />
        </div>

        {error ? <div className="modal-desc modal-desc--error">{error}</div> : null}

        <button type="submit" disabled={loading} className={`btn btn--submit ${loading ? "is-loading" : ""}`}>
          {loading ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save Changes" : "Add User")}
        </button>

        <button onClick={onClose} type="button" className="btn btn--close-fullwidth">
          Close
        </button>
      </form>
    </ModalShell>
  );
}

/* =========================
   Delete Confirm Modal
   ========================= */

function ConfirmDelete({ userId, onConfirm, onClose, loading, error }) {
  return (
    <ModalShell onClose={onClose}>
      <div className="modal-title danger">Delete User?</div>
      <div className="modal-desc">
        Are you sure you want to delete <br />
        <span className="highlight">{userId}</span>?
      </div>
      {error ? <div className="modal-desc modal-desc--error">{error}</div> : null}
      <div className="modal-actions">
        <button className="btn btn--danger" onClick={onConfirm} disabled={loading}>
          {loading ? "Deleting..." : "Yes, Delete"}
        </button>
        <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
      </div>
    </ModalShell>
  );
}

/* =========================
   MAIN: Manage Users
   ========================= */

export default function Manageuser() {
  // Data
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [userRoles, setUserRoles] = useState([]);

  // UI state
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Toast & form errors
  const [toast, setToast] = useState({ show: false, type: "", message: "" });
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [deleteUserId, setDeleteUserId] = useState(null);

  // Form values (Add/Edit)
  const [formValues, setFormValues] = useState({
    useremail: "",
    userpwd: "",
    userroles: "",
    useractive: "true",
  });

  /* -------- Fetchers -------- */

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${config.MASTER_USER_ROUTE}/users`);
      setUsers(res?.data?.users || []);
    } catch {
      setUsers([]);
      fireToast("error", "Failed to load users.");
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await axios.get(config.MASTER_ROLE_ROUTE);
      const data = Array.isArray(res.data) ? res.data : res.data.roles || [];
      setRoles(data);
    } catch {
      setRoles([]);
      fireToast("error", "Failed to load roles.");
    }
  };

  const fetchUserRoles = async () => {
    try {
      const res = await axios.get(config.USER_ROLE_ROUTE);
      const data = Array.isArray(res.data) ? res.data : res.data.roles || [];
      setUserRoles(data);
    } catch {
      setUserRoles([]);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchUserRoles();
  }, []);

  /* -------- Toast -------- */
  const fireToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: "", message: "" }), 2000);
  };

  /* -------- Handlers -------- */

  const onFormChange = (e) => {
    const { name, value } = e.target;
    setFormValues((f) => ({ ...f, [name]: value }));
  };

  const resetForm = () => {
    setFormValues({
      useremail: "",
      userpwd: "",
      userroles: "",
      useractive: "true",
    });
    setFormError("");
  };

  // Add User — store ROLE CODE in master_user.userroles
  const handleAddUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");

    try {
      const role = roles.find((r) => r.role_id === formValues.userroles);
      const roleCode = role ? role.role_id : "";      // CODE (e.g., USR_TCHR)
      const roleDesc = role ? role.role_desc : "Unassigned";

      // create user (store CODE "as is")
      await axios.post(`${config.MASTER_USER_ROUTE}/users`, {
        userid: formValues.useremail,
        userpwd: formValues.userpwd,
        userroles: roleCode,                          // <-- store CODE
        usercreated: new Date().toISOString(),
        userlastlogon: new Date().toISOString(),
        useractive: formValues.useractive === "true",
      });

      // create mapping row in user_roles with auto id (kept behavior)
      const newMappingId = generateUserRoleId(userRoles);
      await axios.post(config.user_ROLE_ROUTE ?? config.USER_ROLE_ROUTE, {
        userid: newMappingId,
        userrolesid: roleCode,
        userroledesc: roleDesc,
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString(),
      });

      setShowAddModal(false);
      resetForm();
      await Promise.all([fetchUsers(), fetchUserRoles()]);
      setPage(1);
      fireToast("success", "User created successfully!");
    } catch (err) {
      setFormError(err?.response?.data?.error || "Error adding user.");
    } finally {
      setLoading(false);
    }
  };

  // Open Edit — tolerate both code or description in existing data
  const openEdit = (u) => {
    setEditUserId(u.userid);
    const matchedRole =
      roles.find((r) => r.role_id === u.userroles) ||
      roles.find((r) => r.role_desc === u.userroles) ||
      null;

    setFormValues({
      useremail: u.userid,
      userpwd: "",
      userroles: matchedRole ? matchedRole.role_id : "",
      useractive: String(!!u.useractive),
    });
    setShowAddModal(false);
    setFormError("");
  };

  // Save Edit — keep CODE in master_user.userroles
// Save Edit — keep CODE in master_user.userroles
const handleEditUser = async (e) => {
  e.preventDefault();
  if (!editUserId) return;
  setLoading(true);
  setFormError("");

  try {
    const role = roles.find((r) => r.role_id === formValues.userroles);
    const roleCode = role ? role.role_id : "";
    const roleDesc = role ? role.role_desc : "Unassigned";

    // 🔒 ensure non-null password on update
    let pwdToSend = formValues.userpwd;
    if (!pwdToSend) {
      // fetch current to preserve it
      try {
        const res = await axios.get(`${config.MASTER_USER_ROUTE}/users/${encodeURIComponent(editUserId)}`);
        pwdToSend = res?.data?.user?.userpwd || 'ChangeMe@123';
      } catch {
        pwdToSend = 'ChangeMe@123';
      }
    }

    await axios.put(`${config.MASTER_USER_ROUTE}/users/${editUserId}`, {
      userpwd: pwdToSend,                // ← never null
      userroles: roleCode,
      userlastlogon: new Date().toISOString(),
      useractive: formValues.useractive === "true",
    });

    // (rest unchanged) create mapping row, refresh, toasts...


      // Append a mapping row (kept behavior)
      const newMappingId = generateUserRoleId(userRoles);
      await axios.post(config.user_ROLE_ROUTE ?? config.USER_ROLE_ROUTE, {
        userid: newMappingId,
        userrolesid: roleCode,
        userroledesc: roleDesc,
        updatedat: new Date().toISOString(),
      });

      setEditUserId(null);
      resetForm();
      await Promise.all([fetchUsers(), fetchUserRoles()]);
      fireToast("success", "User updated successfully!");
    } catch (err) {
      setFormError(err?.response?.data?.error || "Error updating user.");
    } finally {
      setLoading(false);
    }
  };

  // Delete User
  const confirmDeleteUser = (userid) => {
    setDeleteUserId(userid);
    setDeleteError("");
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    setLoading(true);
    setDeleteError("");
    try {
      await axios.delete(`${config.MASTER_USER_ROUTE}/users/${deleteUserId}`);
      // best-effort delete of mapping by same id (safe ignore if 404)
      await axios
        .delete(`${config.USER_ROLE_ROUTE}/${encodeURIComponent(deleteUserId)}`)
        .catch(() => {});
      setDeleteUserId(null);
      await Promise.all([fetchUsers(), fetchUserRoles()]);
      setPage(1);
      fireToast("success", "User deleted successfully!");
    } catch (err) {
      setDeleteError(err?.response?.data?.error || "Failed to delete user.");
    } finally {
      setLoading(false);
    }
  };

  /* -------- Lists & Paging -------- */

  const filteredUsers = useMemo(() => {
    const q = (search || "").toLowerCase();
    return [...users]
      .filter(
        (u) =>
          (u.userid || "").toLowerCase().includes(q) ||
          (u.userroles || "").toLowerCase().includes(q)
      )
      .reverse();
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice((page - 1) * USERS_PER_PAGE, page * USERS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [search, users.length]);

  /* =========================
     RENDER
     ========================= */
  return (
    <div className="mu-page">
      <Toast
        {...toast}
        onClose={() => setToast((t) => ({ ...t, show: false }))}
      />

      <div className="mu-container">
        <h2 className="mu-title">USERS</h2>

        {/* Toolbar: Search + Add */}
        <div className="mu-toolbar">
          <div className="searchbox">
            <span className="searchbox__icon" aria-hidden="true">
              <svg width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              className="searchbox__input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email or role"
            />
          </div>

          {SHOW_ADD_BUTTON && (
  <button
    className="btn btn--add"
    onClick={() => {
      resetForm();
      setShowAddModal(true);
      setEditUserId(null);
    }}
  >
    <span className="btn-plus">+</span>
    Add
  </button>
)}

        </div>

        {/* Table Card */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">

            <div className="mu-tablecard">
              <div className="mu-hscroll">
                <table className="mu-table mu-table--college">
                  <thead>
                    <tr className="mu-thead-row">
                      <th className="mu-th">User Email</th>
                      <th className="mu-th">Role</th>
                      <th className="mu-th">Status</th>
                      <th className="mu-th">Created At</th>
                      <th className="mu-th">Last Logon</th>
                      <th className="mu-th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="mu-empty">
                          {loading ? "Loading..." : "No users found"}
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map((u) => (
                        <tr key={u.userid}>
                          <td className="mu-td mu-td--userid">{u.userid}</td>
                          {/* Show exactly what is stored: this will be codes like USR_TCHR etc. */}
                          <td className="mu-td">{u.userroles}</td>
                          <td className="mu-td">
                            <span className={`status ${u.useractive ? "status--active" : "status--inactive"}`}>
                              {u.useractive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="mu-td">{formatIndianDateTime(u.usercreated)}</td>
                          <td className="mu-td">{formatIndianDateTime(u.userlastlogon)}</td>
                          <td className="mu-td">
                            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                              <button
                                className="btn btn--primary"
                                title="Edit"
                                onClick={() => openEdit(u)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn--danger"
                                title="Delete"
                                onClick={() => confirmDeleteUser(u.userid)}
                              >
                                Delete
                              </button>
                            </div>
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
              <span className="mu-pageinfo">Showing page {page} of {totalPages} pages</span>
              <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </div>
        </div>

        {/* Hidden by flag */}
        {SHOW_ROLE_MAPPINGS && userRoles?.length > 0 && (
          <div className="mu-tablewrap-outer" style={{ marginTop: 16 }}>
            <div className="mu-tablewrap">
              <h2 className="mu-subtitle">All User Role Mappings</h2>
              <div className="mu-tablecard">
                <div className="mu-hscroll">
                  <table className="mu-table mu-table--fixed-roles">
                    <thead>
                      <tr className="mu-thead-row">
                        <th className="mu-th">Mapping ID</th>
                        <th className="mu-th">Role ID</th>
                        <th className="mu-th">Role Desc</th>
                        <th className="mu-th">Created At</th>
                        <th className="mu-th">Updated At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userRoles.map((r) => (
                        <tr key={`${r.userid}-${r.userrolesid}-${r.createdat}`}>
                          <td className="mu-td">{r.userid}</td>
                          <td className="mu-td">{r.userrolesid}</td>
                          <td className="mu-td">{r.userroledesc}</td>
                          <td className="mu-td">{formatIndianDateTime(r.createdat)}</td>
                          <td className="mu-td">{formatIndianDateTime(r.updatedat)}</td>
                        </tr>
                      ))}
                      {userRoles.length === 0 && (
                        <tr>
                          <td className="mu-empty" colSpan={5}>No mappings</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <UserForm
          isEdit={false}
          roles={roles}
          values={formValues}
          onChange={onFormChange}
          onSubmit={handleAddUser}
          loading={loading}
          error={formError}
          onClose={() => {
            setShowAddModal(false);
            resetForm();
          }}
        />
      )}

      {/* Edit Modal */}
      {editUserId && (
        <UserForm
          isEdit
          roles={roles}
          values={formValues}
          onChange={onFormChange}
          onSubmit={handleEditUser}
          loading={loading}
          error={formError}
          onClose={() => {
            setEditUserId(null);
            resetForm();
          }}
        />
      )}

      {/* Delete Confirm */}
      {deleteUserId && (
        <ConfirmDelete
          userId={deleteUserId}
          onConfirm={handleDeleteUser}
          onClose={() => setDeleteUserId(null)}
          loading={loading}
          error={deleteError}
        />
      )}
    </div>
  );
}
