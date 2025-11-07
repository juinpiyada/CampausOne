// SMS-ui/src/pages/cms-fin/CmsPayments.jsx
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import { jsPDF } from "jspdf"; // To generate PDF

export default function CmsPayments() {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]); // kept if you need later
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const [form, setForm] = useState({
    cms_pymts_tran_id: "",
    cms_pymts_inv_id: "",
    cms_pymts_stuid: "",
    cms_pymts_gw_name: "",
    cms_pymts_gw_ord_id: "",
    cms_pymts_amt_pd: "",
    cms_pymts_response_pl: "",
    cms_pymts_callbk_time: "", // ISO-like, bound to datetime-local
  });

  // Human readable labels
  const fieldLabels = {
    cms_pymts_tran_id: "Transaction ID",
    cms_pymts_inv_id: "Invoice ID",
    cms_pymts_stuid: "Student",
    cms_pymts_gw_name: "Payment Gateway",
    cms_pymts_gw_ord_id: "Gateway Order ID",
    cms_pymts_amt_pd: "Amount Paid",
    cms_pymts_response_pl: "Gateway Response",
    cms_pymts_callbk_time: "Callback Time",
  };

  /* ================== Utilities ================== */
  const API_BASE = `${import.meta.env.VITE_BASE_URL}${import.meta.env.VITE_API_PREFIX}`;

  // Robust numeric parse: pick the numeric tail/head if someone stored as string
  const toNumber = (v) => {
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim();
    // Try direct number first
    const n1 = Number(s);
    if (!Number.isNaN(n1)) return n1;
    // Try extract digits (e.g., PYM0007 -> 7)
    const m = s.match(/(\d+)/g);
    if (!m) return NaN;
    const last = m[m.length - 1];
    const n2 = Number(last);
    return Number.isNaN(n2) ? NaN : n2;
  };

  const nextTransactionId = useMemo(() => {
    if (!payments?.length) return 1;
    let max = 0;
    for (const p of payments) {
      const n = toNumber(p?.cms_pymts_tran_id);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return max + 1;
  }, [payments]);

  const nowForDatetimeLocal = () => {
    // Return local datetime suitable for <input type="datetime-local">
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };

  const resetForm = () => {
    setForm({
      cms_pymts_tran_id: "",
      cms_pymts_inv_id: "",
      cms_pymts_stuid: "",
      cms_pymts_gw_name: "",
      cms_pymts_gw_ord_id: "",
      cms_pymts_amt_pd: "",
      cms_pymts_response_pl: "",
      cms_pymts_callbk_time: "",
    });
    setError("");
  };

  /* ================== Fetchers ================== */
  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError("");
      const url = `${API_BASE}/cms-payments`;
      const res = await axios.get(url);
      // Support either { payments: [...] } or direct array
      setPayments(res.data?.payments || res.data || []);
    } catch (err) {
      console.error("Error fetching payments:", err);
      setError("Failed to fetch payments");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${config.STUDENT_ROUTE}/list`);
      setStudents(res.data?.students || res.data || []);
    } catch (err) {
      console.error("Error fetching students:", err);
      setStudents([]);
    }
  };

  const fetchInvoices = async () => {
    try {
      const res = await axios.get(config.FIN_UI_STUDENT_FEE_INVOICE_ROUTE);
      setInvoices(res.data?.invoices || res.data || []);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setInvoices([]);
    }
  };

  const fetchFeeStructures = async () => {
    try {
      const res = await axios.get(config.FIN_UI_FEE_STRUCTURE_ROUTE);
      setFeeStructures(res.data?.feeStructures || res.data || []);
    } catch (err) {
      console.error("Error fetching fee structures:", err);
      setFeeStructures([]);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchStudents();
    fetchInvoices();
    fetchFeeStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================== Handlers ================== */
  const openAddModal = () => {
    // Auto-generate next ID (+1)
    setEditMode(false);
    setSelectedId(null);
    setForm({
      cms_pymts_tran_id: String(nextTransactionId), // <- auto (+1)
      cms_pymts_inv_id: "",
      cms_pymts_stuid: "",
      cms_pymts_gw_name: "",
      cms_pymts_gw_ord_id: "",
      cms_pymts_amt_pd: "",
      cms_pymts_response_pl: "",
      cms_pymts_callbk_time: nowForDatetimeLocal(),
    });
    setShowModal(true);
  };

  const openEditModal = (row) => {
    setEditMode(true);
    setSelectedId(row?.cms_pymts_tran_id);
    setForm({
      cms_pymts_tran_id: String(row?.cms_pymts_tran_id ?? ""),
      cms_pymts_inv_id: row?.cms_pymts_inv_id ?? "",
      cms_pymts_stuid: row?.cms_pymts_stuid ?? "",
      cms_pymts_gw_name: row?.cms_pymts_gw_name ?? "",
      cms_pymts_gw_ord_id: row?.cms_pymts_gw_ord_id ?? "",
      cms_pymts_amt_pd: row?.cms_pymts_amt_pd ?? "",
      cms_pymts_response_pl: row?.cms_pymts_response_pl ?? "",
      // try to convert server timestamp to local datetime-local format if possible
      cms_pymts_callbk_time: row?.cms_pymts_callbk_time
        ? new Date(row.cms_pymts_callbk_time).toISOString().slice(0, 16)
        : nowForDatetimeLocal(),
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    // Normalize amount to only allow valid number text
    if (name === "cms_pymts_amt_pd" && type === "number") {
      setForm((prev) => ({ ...prev, [name]: value }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.cms_pymts_tran_id || !form.cms_pymts_inv_id || !form.cms_pymts_stuid) {
      setError("Transaction ID, Invoice ID, and Student ID are required");
      return;
    }

    try {
      const payload = {
        ...form,
        // Ensure numeric amount if provided
        cms_pymts_amt_pd:
          form.cms_pymts_amt_pd === "" || form.cms_pymts_amt_pd === null
            ? null
            : Number(form.cms_pymts_amt_pd),
        // Convert datetime-local to ISO (backend-friendly) if needed
        cms_pymts_callbk_time: form.cms_pymts_callbk_time
          ? new Date(form.cms_pymts_callbk_time).toISOString()
          : null,
      };

      if (editMode && selectedId) {
        await axios.put(`${API_BASE}/cms-payments/${encodeURIComponent(selectedId)}`, payload);
      } else {
        await axios.post(`${API_BASE}/cms-payments`, payload);
      }

      setShowModal(false);
      setEditMode(false);
      setSelectedId(null);
      resetForm();
      fetchPayments();
    } catch (err) {
      console.error("Save failed:", err);
      setError(editMode ? "Failed to update payment" : "Failed to add payment");
    }
  };

  /* ================== PDF Download ================== */
  const downloadPaymentDetails = (payment) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const L = 48;
    let y = 60;
    const gap = 24;

    doc.setFontSize(16);
    doc.text("Payment Receipt", L, y);
    y += gap + 8;

    doc.setFontSize(12);
    const lines = [
      `Transaction ID: ${payment.cms_pymts_tran_id ?? "-"}`,
      `Invoice ID: ${payment.cms_pymts_inv_id ?? "-"}`,
      `Student: ${payment.cms_pymts_stuid ?? "-"}`,
      `Payment Gateway: ${payment.cms_pymts_gw_name ?? "-"}`,
      `Gateway Order ID: ${payment.cms_pymts_gw_ord_id ?? "-"}`,
      `Amount Paid: ${payment.cms_pymts_amt_pd ?? "-"}`,
      `Gateway Response: ${payment.cms_pymts_response_pl ?? "-"}`,
      `Callback Time: ${
        payment.cms_pymts_callbk_time
          ? new Date(payment.cms_pymts_callbk_time).toLocaleString()
          : "-"
      }`,
      `Created At: ${
        payment.createdat ? new Date(payment.createdat).toLocaleString() : "-"
      }`,
    ];

    lines.forEach((t) => {
      doc.text(t, L, (y += gap));
    });

    doc.save(`payment_${payment.cms_pymts_tran_id || "receipt"}.pdf`);
  };

  /* ================== UI ================== */
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Payments Management</h2>
        <div className="flex items-center gap-3">
          {loading && <span className="text-sm text-gray-500">Loading…</span>}
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            onClick={openAddModal}
          >
            + Add Payment
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-lg border border-gray-200">
        <table className="w-full text-sm text-left text-gray-700">
          <thead className="bg-gray-100">
            <tr>
              {Object.values(fieldLabels).map((label) => (
                <th key={label} className="px-4 py-2">
                  {label}
                </th>
              ))}
              <th className="px-4 py-2">Created At</th>
              <th className="px-4 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center p-4 text-gray-500">
                  No payments found
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={String(p.cms_pymts_tran_id)} className="border-t hover:bg-gray-50">
                  {Object.keys(fieldLabels).map((key) => (
                    <td key={key} className="px-4 py-2">
                      {key === "cms_pymts_callbk_time"
                        ? p[key]
                          ? new Date(p[key]).toLocaleString()
                          : "-"
                        : p[key] ?? "-"}
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    {p.createdat ? new Date(p.createdat).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-2 flex gap-2 justify-center">
                    <button
                      className="px-3 py-1 bg-blue-500 text-white rounded"
                      onClick={() => downloadPaymentDetails(p)}
                      title="Download receipt PDF"
                    >
                      Download
                    </button>
                    <button
                      className="px-3 py-1 bg-emerald-500 text-white rounded"
                      onClick={() => openEditModal(p)}
                      title="Edit"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-2/3 max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {editMode ? "Edit Payment" : "Add Payment"}
              </h3>
              <button
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => {
                  setShowModal(false);
                  if (!editMode) resetForm();
                }}
              >
                ✕
              </button>
            </div>

            {error && <p className="text-red-500 mb-2">{error}</p>}

            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              {/* Transaction ID (Auto, read-only) */}
              <div className="flex flex-col">
                <label className="text-gray-700 mb-1">{fieldLabels.cms_pymts_tran_id}</label>
                <input
                  type="text"
                  name="cms_pymts_tran_id"
                  value={form.cms_pymts_tran_id}
                  readOnly
                  className="border rounded-lg px-3 py-2 bg-gray-100"
                />
                {!editMode && (
                  <span className="text-xs text-gray-500 mt-1">
                    Auto-generated (+1) from the latest transaction.
                  </span>
                )}
              </div>

              {/* Invoice ID */}
              <div className="flex flex-col">
                <label className="text-gray-700 mb-1">{fieldLabels.cms_pymts_inv_id}</label>
                <select
                  name="cms_pymts_inv_id"
                  value={form.cms_pymts_inv_id}
                  onChange={handleChange}
                  required
                  className="border rounded-lg px-3 py-2"
                >
                  <option value="">Select Invoice</option>
                  {invoices.map((inv) => (
                    <option key={inv.cms_stu_inv_id} value={inv.cms_stu_inv_id}>
                      {inv.cms_stu_inv_id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Student */}
              <div className="flex flex-col">
                <label className="text-gray-700 mb-1">{fieldLabels.cms_pymts_stuid}</label>
                <select
                  name="cms_pymts_stuid"
                  value={form.cms_pymts_stuid}
                  onChange={handleChange}
                  required
                  className="border rounded-lg px-3 py-2"
                >
                  <option value="">Select Student</option>
                  {students.map((s) => (
                    <option key={s.stuid} value={s.stuid}>
                      {s.stuname ? `${s.stuname} (${s.stuid})` : s.stuid}
                    </option>
                  ))}
                </select>
              </div>

              {/* Gateway Name */}
              <div className="flex flex-col">
                <label className="text-gray-700 mb-1">{fieldLabels.cms_pymts_gw_name}</label>
                <input
                  type="text"
                  name="cms_pymts_gw_name"
                  value={form.cms_pymts_gw_name}
                  onChange={handleChange}
                  placeholder="e.g., Razorpay, PayU"
                  className="border rounded-lg px-3 py-2"
                />
              </div>

              {/* Gateway Order ID */}
              <div className="flex flex-col">
                <label className="text-gray-700 mb-1">{fieldLabels.cms_pymts_gw_ord_id}</label>
                <input
                  type="text"
                  name="cms_pymts_gw_ord_id"
                  value={form.cms_pymts_gw_ord_id}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2"
                />
              </div>

              {/* Amount Paid */}
              <div className="flex flex-col">
                <label className="text-gray-700 mb-1">{fieldLabels.cms_pymts_amt_pd}</label>
                <input
                  type="number"
                  name="cms_pymts_amt_pd"
                  value={form.cms_pymts_amt_pd}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  className="border rounded-lg px-3 py-2"
                />
              </div>

              {/* Gateway Response */}
              <div className="flex flex-col">
                <label className="text-gray-700 mb-1">{fieldLabels.cms_pymts_response_pl}</label>
                <input
                  type="text"
                  name="cms_pymts_response_pl"
                  value={form.cms_pymts_response_pl}
                  onChange={handleChange}
                  placeholder="status=SUCCESS, etc."
                  className="border rounded-lg px-3 py-2"
                />
              </div>

              {/* Callback Time */}
              <div className="flex flex-col">
                <label className="text-gray-700 mb-1">{fieldLabels.cms_pymts_callbk_time}</label>
                <input
                  type="datetime-local"
                  name="cms_pymts_callbk_time"
                  value={form.cms_pymts_callbk_time}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2"
                />
              </div>

              <div className="col-span-2 flex justify-end gap-3 mt-4">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">
                  {editMode ? "Update" : "Save"}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-400 text-white rounded"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
