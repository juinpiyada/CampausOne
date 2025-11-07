// SMS-ui/src/pages/MasterRole.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config.js";
import "../../index.css"; // SMS-ui/src/index.css

// ---- Safe URL joiner (works with absolute env URLs) ----
function joinUrl(base = "", path = "") {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // absolute 'path' wins
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}/${p}`;
}

const API_BASE = config.MASTER_ROLE_ROUTE; 
const PAGE_SIZE = 4;

const initialForm = {
  role_ID: "",
  role_DESC: "",
};

export default function MasterRole() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(initialForm);
  const [showModal, setShowModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);

  // delete confirm modal target
  const [deleteTarget, setDeleteTarget] = useState(null); // { role_id, role_desc }

  // message -> shown via toast UI
  const [message, setMessage] = useState("");
  const isError = message && !/success|updated|added|deleted/i.test(message);

  // simple search
  const [search, setSearch] = useState("");

  // pagination
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 2000);
    return () => clearTimeout(t);
  }, [message]);

  // reset to page 1 when filtering or list size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roles.length]);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_BASE);
      const data = Array.isArray(res.data) ? res.data : (res.data?.roles ?? []);
      setRoles(data);
    } catch (err) {
      setMessage("Error fetching roles");
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAdd = () => {
    setForm(initialForm);
    setEditingRoleId(null);
    setShowModal(true);
    setMessage("");
  };

  // Use role.role_id and role.role_desc (backend casing)
  const handleEdit = (role) => {
    setForm({
      role_ID: role.role_id,
      role_DESC: role.role_desc,
    });
    setEditingRoleId(role.role_id);
    setShowModal(true);
    setMessage("");
  };

  const openDelete = (role) => {
    setDeleteTarget({ role_id: role.role_id, role_desc: role.role_desc });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      await axios.delete(joinUrl(API_BASE, String(deleteTarget.role_id)));
      setMessage("Role deleted successfully.");
      setDeleteTarget(null);
      fetchRoles();
    } catch (err) {
      setMessage("Error deleting role.");
    }
    setLoading(false);
  };

  const cancelDelete = () => setDeleteTarget(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (!form.role_ID || !form.role_DESC) {
      setMessage("Role ID and Description are required.");
      setLoading(false);
      return;
    }
    try {
      if (editingRoleId) {
        // Update: PUT {API_BASE}/{id} with { role_DESC }
        await axios.put(joinUrl(API_BASE, String(editingRoleId)), {
          role_DESC: form.role_DESC,
        });
        setMessage("Role updated successfully.");
      } else {
        // Create: POST {API_BASE} with { role_ID, role_DESC }
        await axios.post(API_BASE, form);
        setMessage("Role added successfully.");
      }
      setShowModal(false);
      setForm(initialForm);
      setEditingRoleId(null);
      fetchRoles();
    } catch (err) {
      setMessage("Operation failed. " + (err.response?.data?.error || ""));
    }
    setLoading(false);
  };

  const filteredRoles = roles.filter(
    (r) =>
      String(r.role_id || "").toLowerCase().includes(search.toLowerCase()) ||
      String(r.role_desc || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredRoles.length / PAGE_SIZE) || 0;
  const paginatedRoles = filteredRoles.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <div className="mu-page">
      {/* Toast */}
      {message && (
        <div className="toast-wrapper">
          <div className={`toast-box ${isError ? "toast--error" : ""}`}>
            <span className="toast-emoji">{isError ? "⚠️" : "✅"}</span>
            <span className="toast-text">{message}</span>
            <button
              onClick={() => setMessage("")}
              className="toast-close"
              aria-label="Close toast"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="mu-container">
        <h2 className="mu-title">Master Role Management</h2>

        {/* Toolbar (search + add) */}
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
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="searchbox__input"
            />
          </div>

          <button onClick={handleAdd} className="btn btn--add">
            <span className="btn-plus">+</span>
            Add
          </button>
        </div>

        {/* Table card */}
        <div className="mu-tablewrap-outer">
          <div className="mu-tablewrap">
            <h3 className="mu-subtitle"></h3>

            <div className="mu-tablecard">
              <table className="mu-table mu-table--fixed-masterroles">
                <thead>
                  <tr className="mu-thead-row">
                    <th className="mu-th">Role ID</th>
                    <th className="mu-th">Role Description</th>
                    <th className="mu-th">Created At</th>
                    <th className="mu-th">Updated At</th>
                    <th className="mu-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="mu-empty">
                        Loading...
                      </td>
                    </tr>
                  ) : paginatedRoles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="mu-empty">
                        No roles found.
                      </td>
                    </tr>
                  ) : (
                    paginatedRoles.map((role) => {
                      const created =
                        role.createdat ?? role.created_at ?? role.createdAt ?? "";
                      const updated =
                        role.updatedat ?? role.updated_at ?? role.updatedAt ?? "";
                      return (
                        <tr key={role.role_id}>
                          <td className="mu-td">{role.role_id}</td>
                          <td className="mu-td">{role.role_desc}</td>
                          <td className="mu-td">{created}</td>
                          <td className="mu-td">{updated}</td>
                          <td className="mu-td">
                            <button
                              className="btn btn--primary"
                              onClick={() => handleEdit(role)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--danger"
                              onClick={() => openDelete(role)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="mu-pagination">
                <span className="mu-pageinfo">
                  {`Showing page ${totalPages === 0 ? 0 : currentPage} of ${totalPages} pages`}
                </span>
                <div className="mu-pagebtns">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="btn-page"
                    aria-label="Previous page"
                  >
                    &laquo;
                  </button>
                  <span className="badge-page">
                    {totalPages === 0 ? 0 : currentPage}
                  </span>
                  <button
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="btn-page"
                    aria-label="Next page"
                  >
                    &raquo;
                  </button>
                </div>
              </div>
            </div>

            {/* (Keep behavior otherwise intact) */}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <button
              className="modal-x"
              title="Close"
              aria-label="Close"
              onClick={() => setShowModal(false)}
            >
              ×
            </button>
            <h3 className="modal-heading">
              {editingRoleId ? "Edit Role" : "Add Role"}
            </h3>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label className="form-label">Role ID</label>
                <input
                  name="role_ID"
                  value={form.role_ID}
                  onChange={handleChange}
                  placeholder="Role ID"
                  required
                  disabled={!!editingRoleId}
                  className="form-input"
                  autoComplete="off"
                />
              </div>

              <div className="form-row">
                <label className="form-label">Role Description</label>
                <input
                  name="role_DESC"
                  value={form.role_DESC}
                  onChange={handleChange}
                  placeholder="Role Description"
                  required
                  className="form-input"
                  autoComplete="off"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`btn btn--submit ${loading ? "is-loading" : ""}`}
              >
                {editingRoleId ? "Update Role" : "Add Role"}
              </button>
            </form>

            <button
              onClick={() => setShowModal(false)}
              className="btn btn--close-fullwidth"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal (screenshot style) */}
      {deleteTarget && (
        <div className="confirm-overlay">
          <div className="confirm">
            <button
              className="confirm-x"
              title="Close"
              aria-label="Close"
              onClick={cancelDelete}
            >
              ×
            </button>

            <div className="confirm-title">Delete Role?</div>

            <div className="confirm-desc">
              Are you sure you want to delete role:
            </div>

            <a href="#!" className="confirm-user">
              {deleteTarget.role_id}
            </a>

            <div className="confirm-actions">
              <button
                className="btn confirm-btn btn--danger"
                onClick={confirmDelete}
                disabled={loading}
              >
                Yes, Delete
              </button>
              <button
                className="btn confirm-btn btn--secondary"
                onClick={cancelDelete}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
