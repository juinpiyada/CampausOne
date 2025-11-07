// SMS-ui/src/pages/studentinformation/StudentInformationManager.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import config, { joinUrl } from "../../config/middleware_config";

/* ======================== API Endpoints (via middleware_config) ======================== */
// Compose a base like: http(s)://host + /api/student_information
const API_ROOT = joinUrl(config.BASE_URL, config.STUDENT_INFORMATION_ROUTE);

const api = {
  base: API_ROOT,
  list: () => joinUrl(API_ROOT, "list"),
  get: (stuid) => joinUrl(API_ROOT, encodeURIComponent(stuid)),
  add: () => joinUrl(API_ROOT, "add"),
  update: (stuid) => joinUrl(API_ROOT, `update/${encodeURIComponent(stuid)}`),
  del: (stuid) => joinUrl(API_ROOT, `delete/${encodeURIComponent(stuid)}`),
};

const asNull = (v) => (v === "" || v === undefined ? null : v);

/* ======================== Reusable Inputs ======================== */
function Field({ label, children, hint, required, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 4,
          color: "#0f172a",
        }}
      >
        {label} {required ? <span style={{ color: "#b91c1c" }}>*</span> : null}
      </label>
      {children}
      {hint ? (
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{hint}</div>
      ) : null}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", disabled = false }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={styles.input}
      disabled={disabled}
    />
  );
}

/** Spinner-free numeric input (no arrows) */
function NumericTextInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      pattern="[0-9]*[.]?[0-9]*"
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        // allow only digits and at most one dot
        if (/^[0-9]*\.?[0-9]*$/.test(v)) onChange(v);
      }}
      placeholder={placeholder}
      style={styles.input}
    />
  );
}

function Select({ value, onChange, options, placeholder = "Select..." }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={styles.input}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>
          {o.label ?? o}
        </option>
      ))}
    </select>
  );
}

/* ======================== Section (small card) ======================== */
function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

/* ======================== Modal ======================== */
function Modal({ title, children, onClose, footer }) {
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div style={{ fontWeight: 700, color: "#111827" }}>{title}</div>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        <div style={styles.modalFooter}>{footer}</div>
      </div>
    </div>
  );
}

/* ======================== Year Options (1950–2025) ======================== */
const YEAR_OPTIONS = Array.from({ length: 2025 - 1950 + 1 }, (_, i) => {
  const y = 1950 + i;
  return { value: String(y), label: String(y) };
});

/* ======================== Defaults ======================== */
const EMPTY_FORM = {
  stuid: "",

  // Class 10
  class10_board: "",
  class10_year_of_passing: "",
  class10_gradepoint: "",
  class10_marks_total: "",

  // Class 12
  class12_board: "",
  class12_year_of_passing: "",
  class12_gradepoint: "",
  class12_marks_total: "",
  class12_stream: "",

  // Diploma (overall + sem 1–6)
  diploma_board: "",
  diploma_year_of_passing: "",
  diploma_overall_gradept: "",

  sem1_gradepoint: "",
  sem2_gradepoint: "",
  sem3_gradepoint: "",
  sem4_gradepoint: "",
  sem5_gradepoint: "",
  sem6_gradepoint: "",
};

/* ======================== Main Component ======================== */
/**
 * Optional props for embedded usage:
 * - embedded: boolean (default false) — when true, hide outer list UI and only use the modal
 * - initialStuid: string — prefill stuid
 * - openImmediately: boolean — open the modal on mount
 * - onRequestClose: function — parent-close callback when embedded
 */
export default function StudentInformationManager({
  embedded = false,
  initialStuid = "",
  openImmediately = false,
  onRequestClose,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(""); // search by stuid
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // stuid when editing
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // stuid
  // NEW: embedded locks & single-record cache
  const [lockedStuid, setLockedStuid] = useState(initialStuid || "");
  const [record, setRecord] = useState(null); // single record for lockedStuid
  const [embeddedLoading, setEmbeddedLoading] = useState(false);
  // NEW: prevent auto-open loop on save
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => String(r.stuid || "").toLowerCase().includes(s));
  }, [rows, q]);

  // Default (standalone) mode: fetch list
  useEffect(() => {
    if (!embedded) fetchList();
  }, [embedded]);

  // Embedded: keep stuid locked and load the single record
  useEffect(() => {
    if (embedded) {
      setLockedStuid(initialStuid || "");
      setHasAutoOpened(false); // reset auto-open when context changes
      if (initialStuid) {
        loadSingleForEmbedded(initialStuid);
      }
    }
  }, [embedded, initialStuid]);

  // Embedded: open modal immediately (add or edit depending on data), but only once
  useEffect(() => {
    if (!(embedded && openImmediately) || hasAutoOpened) return;

    if (record && record.stuid) {
      openEdit(record.stuid);
    } else {
      setEditingId(null);
      setForm((f) => ({ ...EMPTY_FORM, stuid: initialStuid || "" }));
      setModalOpen(true);
    }
    setHasAutoOpened(true);
  }, [embedded, openImmediately, initialStuid, record, hasAutoOpened]);

  async function fetchList() {
    try {
      setLoading(true);
      const res = await axios.get(api.list());
      setRows(res?.data?.student_information || []);
    } catch (e) {
      console.error(e);
      alert("Failed to fetch student_information list.");
    } finally {
      setLoading(false);
    }
  }

  // NEW: load only one student's record in embedded mode
  async function loadSingleForEmbedded(stuId) {
    try {
      setEmbeddedLoading(true);
      const res = await axios.get(api.get(stuId));
      const data = res?.data?.student_information || null;
      setRecord(data && data.stuid ? data : null);
    } catch (e) {
      // if 404 or error, treat as "no record yet"
      setRecord(null);
    } finally {
      setEmbeddedLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  async function openEdit(stuid) {
    try {
      setLoading(true);
      const res = await axios.get(api.get(stuid));
      const data = res?.data?.student_information || {};
      setEditingId(stuid);
      setForm({
        ...EMPTY_FORM,
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? ""])),
        // ensure stuid persists in form
        stuid: stuid,
      });
      setModalOpen(true);
    } catch (e) {
      console.error(e);
      alert("Failed to fetch record for edit.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    const payload = { ...form };

    // In embedded mode, always force stuid to locked value
    if (embedded && lockedStuid) {
      payload.stuid = lockedStuid;
    }

    // stuid required on create (backend enforces)
    if (!editingId && !String(payload.stuid || "").trim()) {
      alert("stuid is required.");
      return;
    }

    // Convert "" → null (let DB accept nullable cleanly)
    for (const k of Object.keys(payload)) {
      payload[k] = asNull(payload[k]);
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await axios.put(api.update(editingId), payload);
        alert("Updated successfully.");
      } else {
        await axios.post(api.add(), payload);
        alert("Added successfully.");
      }
      setModalOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);

      if (!embedded) {
        fetchList();
      } else {
        // refresh the single-record view; keep embedded host open
        await loadSingleForEmbedded(lockedStuid);
      }
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || "Operation failed.";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function doDelete(stuid) {
    try {
      await axios.delete(api.del(stuid));
      alert("Deleted successfully.");
      setConfirmDel(null);
      if (!embedded) {
        fetchList();
      } else if (lockedStuid) {
        await loadSingleForEmbedded(lockedStuid);
      }
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || "Failed to delete.");
    }
  }

  /* ======================== Embedded Mode (Single Student) ======================== */
  if (embedded) {
    return (
      <div style={{ padding: 12 }}>
        {/* Header */}
        {!modalOpen && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              Student Information • <span style={{ color: "#334155" }}>{lockedStuid || "—"}</span>
            </div>
            <div>
              {!record ? (
                <button
                  style={styles.primaryBtn}
                  onClick={() => {
                    setEditingId(null);
                    setForm({ ...EMPTY_FORM, stuid: lockedStuid || initialStuid || "" });
                    setModalOpen(true);
                  }}
                  disabled={!lockedStuid}
                >
                  Add
                </button>
              ) : (
                <button
                  style={styles.secondaryBtn}
                  onClick={() => openEdit(record.stuid)}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        )}

        {/* Single-record summary */}
        {!modalOpen && (
          <div style={styles.card}>
            {embeddedLoading ? (
              <div style={{ padding: 12 }}>Loading…</div>
            ) : !record ? (
              <div style={{ padding: 12, color: "#6b7280" }}>
                No Student Information found for <b>{lockedStuid || "—"}</b>.
              </div>
            ) : (
              <div style={{ padding: 12 }}>
                <div style={{ marginBottom: 12, fontWeight: 600, color: "#0f172a" }}>
                  Current Details
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div><b>Class10</b>: {record.class10_board || "—"} / {record.class10_year_of_passing || "—"} / {record.class10_gradepoint || "—"}</div>
                  <div><b>Class12</b>: {record.class12_board || "—"} / {record.class12_year_of_passing || "—"} / {record.class12_stream || "—"} / {record.class12_gradepoint || "—"}</div>
                  <div><b>Diploma</b>: {record.diploma_board || "—"} / {record.diploma_year_of_passing || "—"} / {record.diploma_overall_gradept || "—"}</div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={styles.smallBtn} onClick={() => openEdit(record.stuid)}>Edit</button>
                  <button style={styles.smallDangerBtn} onClick={() => setConfirmDel(record.stuid)}>Delete</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create / Edit Modal (same form; stuid locked on create) */}
        {modalOpen && (
          <Modal
            title={editingId ? `Edit Student Information • ${editingId}` : "Add Student Information"}
            onClose={() => {
              setModalOpen(false);
              setEditingId(null);
            }}
            footer={
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  style={styles.secondaryBtn}
                  onClick={() => {
                    setModalOpen(false);
                    setEditingId(null);
                  }}
                >
                  Cancel
                </button>
                <button style={styles.primaryBtn} disabled={submitting} onClick={handleSubmit}>
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            }
          >
            {/* stuid: visible but locked during create in embedded mode */}
            {!editingId && (
              <Field label="stuid" required hint="Must match an existing student_master.stuid">
                <TextInput
                  value={form.stuid}
                  onChange={(v) => updateField("stuid", v)}
                  placeholder="e.g., STU-0001"
                  disabled={true}
                />
              </Field>
            )}

            {/* ===== CLASS 10 ===== */}
            <Section title="Class 10">
              <div style={styles.grid2}>
                <Field label="Board">
                  <Select
                    value={form.class10_board}
                    onChange={(v) => updateField("class10_board", v)}
                    options={[
                      { value: "WBBSE", label: "WBBSE" },
                      { value: "CBSE", label: "CBSE" },
                    ]}
                    placeholder="Select Board"
                  />
                </Field>
                <Field label="Year of Passing">
                  <Select
                    value={form.class10_year_of_passing}
                    onChange={(v) => updateField("class10_year_of_passing", v)}
                    options={YEAR_OPTIONS}
                    placeholder="Select year"
                  />
                </Field>
              </div>

              <Field label="Class 10 Value" hint="Enter percentage or CGPA (spinner removed)">
                <NumericTextInput
                  value={form.class10_gradepoint}
                  onChange={(v) => updateField("class10_gradepoint", v)}
                  placeholder="e.g., 85 or 9.2"
                />
              </Field>

              <Field label="Marks Total" hint="Raw total (optional)">
                <NumericTextInput
                  value={form.class10_marks_total}
                  onChange={(v) => updateField("class10_marks_total", v)}
                  placeholder="e.g., 500"
                />
              </Field>
            </Section>

            {/* ===== CLASS 12 ===== */}
            <Section title="Class 12">
              <div style={styles.grid3}>
                <Field label="Board">
                  <Select
                    value={form.class12_board}
                    onChange={(v) => updateField("class12_board", v)}
                    options={[
                      { value: "WBCHSE", label: "WBCHSE" },
                      { value: "CBSE", label: "CBSE" },
                    ]}
                    placeholder="Select Board"
                  />
                </Field>
                <Field label="Year of Passing">
                  <Select
                    value={form.class12_year_of_passing}
                    onChange={(v) => updateField("class12_year_of_passing", v)}
                    options={YEAR_OPTIONS}
                    placeholder="Select year"
                  />
                </Field>
                <Field label="Stream">
                  <Select
                    value={form.class12_stream}
                    onChange={(v) => updateField("class12_stream", v)}
                    options={[
                      { value: "Science", label: "Science" },
                      { value: "Commerce", label: "Commerce" },
                      { value: "Arts", label: "Arts" },
                      { value: "Other", label: "Other" },
                    ]}
                    placeholder="Select stream"
                  />
                </Field>
              </div>

              <Field label="Class 12 Value" hint="Enter percentage or CGPA (spinner removed)">
                <NumericTextInput
                  value={form.class12_gradepoint}
                  onChange={(v) => updateField("class12_gradepoint", v)}
                  placeholder="e.g., 90 or 9.6"
                />
              </Field>

              <Field label="Marks Total" hint="Raw total (optional)">
                <NumericTextInput
                  value={form.class12_marks_total}
                  onChange={(v) => updateField("class12_marks_total", v)}
                  placeholder="e.g., 500"
                />
              </Field>
            </Section>

            {/* ===== DIPLOMA ===== */}
            <Section title="Diploma (if applicable)">
              <div style={styles.grid2}>
                <Field label="Board / Council">
                  <TextInput
                    value={form.diploma_board}
                    onChange={(v) => updateField("diploma_board", v)}
                    placeholder="e.g., WBSCTE / AICTE"
                  />
                </Field>
                <Field label="Year of Passing">
                  <Select
                    value={form.diploma_year_of_passing}
                    onChange={(v) => updateField("diploma_year_of_passing", v)}
                    options={YEAR_OPTIONS}
                    placeholder="Select year"
                  />
                </Field>
              </div>
              <Field label="Overall Grade Point (or %)">
                <NumericTextInput
                  value={form.diploma_overall_gradept}
                  onChange={(v) => updateField("diploma_overall_gradept", v)}
                  placeholder="e.g., 8.2 or 78"
                />
              </Field>

              <div style={styles.grid3}>
                <Field label="Sem 1 GP">
                  <NumericTextInput
                    value={form.sem1_gradepoint}
                    onChange={(v) => updateField("sem1_gradepoint", v)}
                    placeholder="e.g., 7.8"
                  />
                </Field>
                <Field label="Sem 2 GP">
                  <NumericTextInput
                    value={form.sem2_gradepoint}
                    onChange={(v) => updateField("sem2_gradepoint", v)}
                    placeholder="e.g., 8.0"
                  />
                </Field>
                <Field label="Sem 3 GP">
                  <NumericTextInput
                    value={form.sem3_gradepoint}
                    onChange={(v) => updateField("sem3_gradepoint", v)}
                    placeholder="e.g., 8.1"
                  />
                </Field>
              </div>
              <div style={styles.grid3}>
                <Field label="Sem 4 GP">
                  <NumericTextInput
                    value={form.sem4_gradepoint}
                    onChange={(v) => updateField("sem4_gradepoint", v)}
                    placeholder="e.g., 8.3"
                  />
                </Field>
                <Field label="Sem 5 GP">
                  <NumericTextInput
                    value={form.sem5_gradepoint}
                    onChange={(v) => updateField("sem5_gradepoint", v)}
                    placeholder="e.g., 8.4"
                  />
                </Field>
                <Field label="Sem 6 GP">
                  <NumericTextInput
                    value={form.sem6_gradepoint}
                    onChange={(v) => updateField("sem6_gradepoint", v)}
                    placeholder="e.g., 8.6"
                  />
                </Field>
              </div>
            </Section>
          </Modal>
        )}

        {/* Delete Confirm (embedded) */}
        {confirmDel && (
          <Modal
            title="Delete Confirmation"
            onClose={() => setConfirmDel(null)}
            footer={
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button style={styles.secondaryBtn} onClick={() => setConfirmDel(null)}>
                  Cancel
                </button>
                <button style={styles.dangerBtn} onClick={() => doDelete(confirmDel)}>
                  Delete
                </button>
              </div>
            }
          >
            <div>Are you sure you want to delete <b>{confirmDel}</b>?</div>
          </Modal>
        )}
      </div>
    );
  }

  /* ======================== Standalone Mode (List + Table) ======================== */
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div style={styles.h1}>Student Information</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Search by stuid..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={styles.input}
            />
            <button style={styles.primaryBtn} onClick={openCreate}>Add</button>
          </div>
        </div>

        <div style={styles.card}>
          {loading ? (
            <div style={{ padding: 16 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 16, color: "#6b7280" }}>No records</div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>stuid</th>
                    <th style={styles.th}>Class10 Board</th>
                    <th style={styles.th}>Class10 Year</th>
                    <th style={styles.th}>Class10 Value</th>
                    <th style={styles.th}>Class12 Board</th>
                    <th style={styles.th}>Class12 Year</th>
                    <th style={styles.th}>Class12 Stream</th>
                    <th style={styles.th}>Class12 Value</th>
                    <th style={styles.th}>Diploma Board</th>
                    <th style={styles.th}>Diploma Year</th>
                    <th style={styles.th}>Diploma Overall</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.stuid}>
                      <td style={styles.td}>{r.stuid}</td>
                      <td style={styles.td}>{r.class10_board ?? ""}</td>
                      <td style={styles.td}>{r.class10_year_of_passing ?? ""}</td>
                      <td style={styles.td}>{r.class10_gradepoint ?? ""}</td>
                      <td style={styles.td}>{r.class12_board ?? ""}</td>
                      <td style={styles.td}>{r.class12_year_of_passing ?? ""}</td>
                      <td style={styles.td}>{r.class12_stream ?? ""}</td>
                      <td style={styles.td}>{r.class12_gradepoint ?? ""}</td>
                      <td style={styles.td}>{r.diploma_board ?? ""}</td>
                      <td style={styles.td}>{r.diploma_year_of_passing ?? ""}</td>
                      <td style={styles.td}>{r.diploma_overall_gradept ?? ""}</td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={styles.smallBtn} onClick={() => openEdit(r.stuid)}>
                            Edit
                          </button>
                          <button
                            style={styles.smallDangerBtn}
                            onClick={() => setConfirmDel(r.stuid)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create / Edit Modal */}
        {modalOpen && (
          <Modal
            title={editingId ? `Edit Student Information • ${editingId}` : "Add Student Information"}
            onClose={() => {
              setModalOpen(false);
              setEditingId(null);
            }}
            footer={
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  style={styles.secondaryBtn}
                  onClick={() => {
                    setModalOpen(false);
                    setEditingId(null);
                  }}
                >
                  Cancel
                </button>
                <button style={styles.primaryBtn} disabled={submitting} onClick={handleSubmit}>
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            }
          >
            {!editingId && (
              <Field label="stuid" required hint="Must match an existing student_master.stuid">
                <TextInput
                  value={form.stuid}
                  onChange={(v) => updateField("stuid", v)}
                  placeholder="e.g., STU-0001"
                />
              </Field>
            )}

            {/* ===== CLASS 10 ===== */}
            <Section title="Class 10">
              <div style={styles.grid2}>
                <Field label="Board">
                  <Select
                    value={form.class10_board}
                    onChange={(v) => updateField("class10_board", v)}
                    options={[
                      { value: "WBBSE", label: "WBBSE" },
                      { value: "CBSE", label: "CBSE" },
                    ]}
                    placeholder="Select Board"
                  />
                </Field>
                <Field label="Year of Passing">
                  <Select
                    value={form.class10_year_of_passing}
                    onChange={(v) => updateField("class10_year_of_passing", v)}
                    options={YEAR_OPTIONS}
                    placeholder="Select year"
                  />
                </Field>
              </div>

              <Field label="Class 10 Value" hint="Enter percentage or CGPA (spinner removed)">
                <NumericTextInput
                  value={form.class10_gradepoint}
                  onChange={(v) => updateField("class10_gradepoint", v)}
                  placeholder="e.g., 85 or 9.2"
                />
              </Field>

              <Field label="Marks Total" hint="Raw total (optional)">
                <NumericTextInput
                  value={form.class10_marks_total}
                  onChange={(v) => updateField("class10_marks_total", v)}
                  placeholder="e.g., 500"
                />
              </Field>
            </Section>

            {/* ===== CLASS 12 ===== */}
            <Section title="Class 12">
              <div style={styles.grid3}>
                <Field label="Board">
                  <Select
                    value={form.class12_board}
                    onChange={(v) => updateField("class12_board", v)}
                    options={[
                      { value: "WBCHSE", label: "WBCHSE" },
                      { value: "CBSE", label: "CBSE" },
                    ]}
                    placeholder="Select Board"
                  />
                </Field>
                <Field label="Year of Passing">
                  <Select
                    value={form.class12_year_of_passing}
                    onChange={(v) => updateField("class12_year_of_passing", v)}
                    options={YEAR_OPTIONS}
                    placeholder="Select year"
                  />
                </Field>
                <Field label="Stream">
                  <Select
                    value={form.class12_stream}
                    onChange={(v) => updateField("class12_stream", v)}
                    options={[
                      { value: "Science", label: "Science" },
                      { value: "Commerce", label: "Commerce" },
                      { value: "Arts", label: "Arts" },
                      { value: "Other", label: "Other" },
                    ]}
                    placeholder="Select stream"
                  />
                </Field>
              </div>

              <Field label="Class 12 Value" hint="Enter percentage or CGPA (spinner removed)">
                <NumericTextInput
                  value={form.class12_gradepoint}
                  onChange={(v) => updateField("class12_gradepoint", v)}
                  placeholder="e.g., 90 or 9.6"
                />
              </Field>

              <Field label="Marks Total" hint="Raw total (optional)">
                <NumericTextInput
                  value={form.class12_marks_total}
                  onChange={(v) => updateField("class12_marks_total", v)}
                  placeholder="e.g., 500"
                />
              </Field>
            </Section>

            {/* ===== DIPLOMA ===== */}
            <Section title="Diploma (if applicable)">
              <div style={styles.grid2}>
                <Field label="Board / Council">
                  <TextInput
                    value={form.diploma_board}
                    onChange={(v) => updateField("diploma_board", v)}
                    placeholder="e.g., WBSCTE / AICTE"
                  />
                </Field>
                <Field label="Year of Passing">
                  <Select
                    value={form.diploma_year_of_passing}
                    onChange={(v) => updateField("diploma_year_of_passing", v)}
                    options={YEAR_OPTIONS}
                    placeholder="Select year"
                  />
                </Field>
              </div>
              <Field label="Overall Grade Point (or %)">
                <NumericTextInput
                  value={form.diploma_overall_gradept}
                  onChange={(v) => updateField("diploma_overall_gradept", v)}
                  placeholder="e.g., 8.2 or 78"
                />
              </Field>

              <div style={styles.grid3}>
                <Field label="Sem 1 GP">
                  <NumericTextInput
                    value={form.sem1_gradepoint}
                    onChange={(v) => updateField("sem1_gradepoint", v)}
                    placeholder="e.g., 7.8"
                  />
                </Field>
                <Field label="Sem 2 GP">
                  <NumericTextInput
                    value={form.sem2_gradepoint}
                    onChange={(v) => updateField("sem2_gradepoint", v)}
                    placeholder="e.g., 8.0"
                  />
                </Field>
                <Field label="Sem 3 GP">
                  <NumericTextInput
                    value={form.sem3_gradepoint}
                    onChange={(v) => updateField("sem3_gradepoint", v)}
                    placeholder="e.g., 8.1"
                  />
                </Field>
              </div>
              <div style={styles.grid3}>
                <Field label="Sem 4 GP">
                  <NumericTextInput
                    value={form.sem4_gradepoint}
                    onChange={(v) => updateField("sem4_gradepoint", v)}
                    placeholder="e.g., 8.3"
                  />
                </Field>
                <Field label="Sem 5 GP">
                  <NumericTextInput
                    value={form.sem5_gradepoint}
                    onChange={(v) => updateField("sem5_gradepoint", v)}
                    placeholder="e.g., 8.4"
                  />
                </Field>
                <Field label="Sem 6 GP">
                  <NumericTextInput
                    value={form.sem6_gradepoint}
                    onChange={(v) => updateField("sem6_gradepoint", v)}
                    placeholder="e.g., 8.6"
                  />
                </Field>
              </div>
            </Section>
          </Modal>
        )}

        {/* Delete Confirm */}
        {confirmDel && (
          <Modal
            title="Delete Confirmation"
            onClose={() => setConfirmDel(null)}
            footer={
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button style={styles.secondaryBtn} onClick={() => setConfirmDel(null)}>
                  Cancel
                </button>
                <button style={styles.dangerBtn} onClick={() => doDelete(confirmDel)}>
                  Delete
                </button>
              </div>
            }
          >
            <div>Are you sure you want to delete <b>{confirmDel}</b>?</div>
          </Modal>
        )}
      </div>
    </div>
  );
}

/* ======================== Styles ======================== */
const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f8fb",
    padding: 24,
    fontFamily:
      "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#111827",
  },
  container: { maxWidth: 1200, margin: "0 auto" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 12,
  },
  h1: { fontSize: 20, fontWeight: 800, color: "#0f172a" },

  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
    padding: 8,
  },

  input: {
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    outline: "none",
  },

  primaryBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryBtn: {
    background: "#f3f4f6",
    color: "#111827",
    border: "1px solid #e5e7eb",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
  },
  dangerBtn: {
    background: "#dc2626",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
  },
  smallBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  smallDangerBtn: {
    background: "#b91c1c",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },

  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    padding: "10px 12px",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  td: {
    borderBottom: "1px solid #f1f5f9",
    padding: "10px 12px",
    verticalAlign: "top",
    color: "#111827",
  },

  section: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    background: "#fff",
  },
  sectionTitle: {
    fontWeight: 700,
    marginBottom: 8,
    color: "#0f172a",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    background: "#fff",
    width: "min(980px, 100%)",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 20px 40px rgba(2,6,23,0.25)",
    border: "1px solid #e5e7eb",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
  modalBody: {
    padding: 16,
    maxHeight: "70vh",
    overflow: "auto",
  },
  modalFooter: {
    padding: 12,
    borderTop: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
  iconBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
  },
};