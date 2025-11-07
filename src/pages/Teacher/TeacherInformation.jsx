// SMS-ui/src/pages/Teacher/TeacherInformation.jsx
import React, { useEffect, useState } from "react";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import config, { joinUrl } from "../../config/middleware_config";

/* ======================== API Endpoints ======================== */
const API_ROOT = joinUrl(config.BASE_URL, "/api/teacher-info");
const api = {
  list: () => joinUrl(API_ROOT, "list"),
  getByTeacher: (teacherid) =>
    joinUrl(API_ROOT, `by-teacher/${encodeURIComponent(teacherid)}`),
  get: (teacherid) => joinUrl(API_ROOT, encodeURIComponent(teacherid)),
  add: () => API_ROOT,
  update: (teacherid) => joinUrl(API_ROOT, encodeURIComponent(teacherid)),
  del: (teacherid) => joinUrl(API_ROOT, encodeURIComponent(teacherid)),
};

const VALID_SCALES = ["PCT", "CGPA"];
const asNull = (v) => (v === "" || v === undefined ? null : v);

/** Frontend mirror of your backend validation */
function validateScalePair(scale, value, label) {
  if (!scale || value == null || value === "") return null;
  const num = Number(value);
  if (Number.isNaN(num)) return `${label}: must be a number`;

  if (scale === "PCT" && !(num >= 0 && num <= 100)) {
    return `${label}: with PCT, value must be 0..100`;
  }
  if (scale === "CGPA" && !(num >= 0 && num <= 10)) {
    return `${label}: with CGPA, value must be 0..10`;
  }
  return null;
}

/* ======================== Inline Styles (hover/focus OFF + centered header) ======================== */
const styles = {
  page: {
    padding: 16,
    maxWidth: 1200,
    margin: "0 auto",
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    color: "#0f172a",
  },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 16, textAlign: "center" }, // centered
  toolbar: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
    justifyContent: "center", // centered
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    textAlign: "center",
  },
  // Base input in toolbar
  input: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    width: 260,
    outline: "none",
    boxShadow: "none",
    transition: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
  },
  btnBlue: { background: "#2563eb", color: "#fff" },
  btnGreen: { background: "#16a34a", color: "#fff" },
  btnRed: { background: "#dc2626", color: "#fff" },
  disabled: { opacity: 0.6, cursor: "not-allowed" },
  alertErr: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
  },
  alertOk: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    background: "#dcfce7",
    color: "#166534",
  },
  scrollShell: { height: "72vh", overflowY: "auto", paddingRight: 4 },
  section: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    background: "#fff",
    boxShadow: "0 1px 1px rgba(0,0,0,0.02)",
  },
  sectionTitle: { fontWeight: 700, margin: "4px 0 10px 0" },
  tableWrap: { overflowX: "auto" },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: 740,
  },
  th: {
    textAlign: "left",
    fontSize: 12,
    color: "#334155",
    background: "#f8fafc",
    borderBottom: "1px solid #e5e7eb",
    padding: "10px 12px",
    width: "28%",
    whiteSpace: "nowrap",
  },
  td: {
    borderBottom: "1px solid #f1f5f9",
    padding: "8px 12px",
    verticalAlign: "middle",
  },
  // Inputs inside the table (hover/focus disabled)
  cellInput: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    width: "100%",
    outline: "none",
    boxShadow: "none",
    transition: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
  },
  select: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    width: "100%",
    outline: "none",
    boxShadow: "none",
    transition: "none",
    background: "#fff",
    WebkitAppearance: "none",
    MozAppearance: "none",
  },
};

/** Keep borders flat even on hover (works as “inline CSS” for pseudo states) */
function flattenBorder(e) {
  try {
    const el = e.currentTarget;
    el.style.borderColor = "#cbd5e1";
    el.style.outline = "none";
    el.style.boxShadow = "none";
    el.style.transition = "none";
  } catch {}
}

// Base props for every field: no auto-complete, stop bubbling keys, and hover flattening
const baseFieldProps = {
  autoComplete: "off",
  onKeyDown: (e) => e.stopPropagation(),
  onMouseEnter: flattenBorder,
  onMouseLeave: flattenBorder,
};

// Stable, memoized row so inputs don't get re-mounted
const Row = React.memo(function Row({ label, children }) {
  return (
    <tr>
      <th style={styles.th}>{label}</th>
      <td style={styles.td}>{children}</td>
    </tr>
  );
});

export default function TeacherInformation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [teacherId, setTeacherId] = useState("");
  const [loading, setLoading] = useState(false);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    // 10th
    class10_board: "",
    class10_year_of_passing: "",
    class10_grade_scale: "",
    class10_gradepoint: "",
    class10_marks_total: "",
    // 12th
    class12_board: "",
    class12_stream: "",
    class12_year_of_passing: "",
    class12_grade_scale: "",
    class12_gradepoint: "",
    class12_marks_total: "",
    // diploma
    diploma_branch: "",
    diploma_year_of_passing: "",
    diploma_grade_scale: "",
    diploma_sem1_gp: "",
    diploma_sem2_gp: "",
    diploma_sem3_gp: "",
    diploma_sem4_gp: "",
    diploma_sem5_gp: "",
    diploma_sem6_gp: "",
    // bachelor
    bachelor_degree: "",
    bachelor_department: "",
    bachelor_university: "",
    bachelor_year_of_passing: "",
    bachelor_gradepoint: "",
    bachelor_grade_scale: "",
    // master
    master_degree: "",
    master_department: "",
    master_university: "",
    master_year_of_passing: "",
    master_gradepoint: "",
    master_grade_scale: "",
    // phd
    phd_field: "",
    phd_university: "",
    phd_year_of_passing: "",
  });

  const yearPlaceholder = `e.g. 2012`;
  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  // ---------- helpers to load by id ----------
  const loadFor = async (id) => {
    const tId = String(id || "").trim();
    if (!tId) return;
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const { data } = await axios.get(api.getByTeacher(tId));
      setForm((prev) =>
        Object.keys(prev).reduce(
          (acc, k) => ({ ...acc, [k]: data[k] ?? "" }),
          {}
        )
      );
      setExists(true);
      setMsg("Loaded existing record.");
    } catch (err) {
      if (err?.response?.status === 404) {
        // new
        setExists(false);
        setForm((prev) =>
          Object.fromEntries(Object.keys(prev).map((k) => [k, ""]))
        );
        setMsg("No record found — you can create a new one.");
      } else {
        setError(err?.response?.data?.error || "Load failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- on mount: accept teacher id from state / query / localStorage ----------
  useEffect(() => {
    const navId = location.state?.teacherid || "";
    const queryId = searchParams.get("teacherid") || "";
    const stored = localStorage.getItem("lastTeacherId") || "";
    const init = (navId || queryId || stored).trim();
    if (init) {
      setTeacherId(init);
      localStorage.setItem("lastTeacherId", init);
      // auto-load
      loadFor(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLoad() {
    if (!teacherId.trim()) {
      setError("Enter a Teacher ID to load.");
      return;
    }
    await loadFor(teacherId.trim());
  }

  async function handleSave() {
    setError("");
    setMsg("");

    // quick client validation mirrors backend
    for (const [sKey, vKey, label] of [
      ["class10_grade_scale", "class10_gradepoint", "Class 10 gradepoint"],
      ["class12_grade_scale", "class12_gradepoint", "Class 12 gradepoint"],
      ["bachelor_grade_scale", "bachelor_gradepoint", "Bachelor gradepoint"],
      ["master_grade_scale", "master_gradepoint", "Master gradepoint"],
    ]) {
      const e = validateScalePair(form[sKey], form[vKey], label);
      if (e) {
        setError(e);
        return;
      }
    }
    for (let i = 1; i <= 6; i++) {
      const e = validateScalePair(
        form["diploma_grade_scale"],
        form[`diploma_sem${i}_gp`],
        `Diploma Sem ${i}`
      );
      if (e) {
        setError(e);
        return;
      }
    }

    const payload = { teacherid: teacherId.trim() };
    Object.keys(form).forEach((k) => (payload[k] = asNull(form[k])));

    setLoading(true);
    try {
      if (exists) {
        await axios.put(api.update(teacherId.trim()), payload, {
          headers: { "Content-Type": "application/json" },
        });
        setMsg("Updated successfully.");
      } else {
        await axios.post(api.add(), payload, {
          headers: { "Content-Type": "application/json" },
        });
        setExists(true);
        setMsg("Updated successfully.");
      }
      // persist + jump to details page
      localStorage.setItem("lastTeacherId", teacherId.trim());
      navigate(
        `/teacher-dtls?teacherid=${encodeURIComponent(teacherId.trim())}`,
        {
          state: { teacherid: teacherId.trim(), from: "teacher-info" },
        }
      );
    } catch (err) {
      setError(err?.response?.data?.error || "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setError("");
    setMsg("");
    if (!exists) {
      setError("Nothing to delete.");
      return;
    }
    if (!window.confirm(`Delete record for ${teacherId}?`)) return;
    setLoading(true);
    try {
      await axios.delete(api.del(teacherId.trim()));
      setExists(false);
      setForm((s) => ({
        ...Object.fromEntries(Object.keys(s).map((k) => [k, ""])),
      }));
      setMsg("Deleted.");
    } catch (err) {
      setError(err?.response?.data?.error || "Delete failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Teacher Information</h1>

      {/* Toolbar (centered) */}
      <div style={styles.toolbar}>
        <div>
          <label style={styles.label}>Teacher ID</label>
          <input
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            placeholder="e.g., TECH_001"
            style={styles.input}
            {...baseFieldProps}
          />
        </div>

        <button
          onClick={handleLoad}
          style={{
            ...styles.btn,
            ...styles.btnBlue,
            ...(loading || !teacherId.trim() ? styles.disabled : {}),
          }}
          disabled={loading || !teacherId.trim()}
        >
          {loading ? "Loading..." : "Load"}
        </button>

        <button
          onClick={handleSave}
          style={{
            ...styles.btn,
            ...styles.btnGreen,
            ...(loading || !teacherId.trim() ? styles.disabled : {}),
          }}
          disabled={loading || !teacherId.trim()}
        >
          {exists ? "Update" : "Create & Continue"}
        </button>

        <button
          onClick={handleDelete}
          style={{
            ...styles.btn,
            ...styles.btnRed,
            ...(loading || !teacherId.trim() || !exists
              ? styles.disabled
              : {}),
          }}
          disabled={loading || !teacherId.trim() || !exists}
        >
          Delete
        </button>
      </div>

      {error ? <div style={styles.alertErr}>{error}</div> : null}
      {msg ? <div style={styles.alertOk}>{msg}</div> : null}

      {/* Scrollable content */}
      <div style={styles.scrollShell}>
        {/* ---------- Class 10 ---------- */}
        <section style={styles.section}>
          <div style={styles.sectionTitle}>Class 10</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <tbody>
                <Row label="Board">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.class10_board || ""}
                    onChange={(e) => onChange("class10_board", e.target.value)}
                  />
                </Row>
                <Row label="Year of Passing">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    placeholder={yearPlaceholder}
                    value={form.class10_year_of_passing || ""}
                    onChange={(e) =>
                      onChange("class10_year_of_passing", e.target.value)
                    }
                  />
                </Row>
                <Row label="Grade Scale">
                  <select
                    style={styles.select}
                    {...baseFieldProps}
                    value={form.class10_grade_scale || ""}
                    onChange={(e) =>
                      onChange("class10_grade_scale", e.target.value)
                    }
                  >
                    <option value="">-- select --</option>
                    {VALID_SCALES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Grade Point (PCT 0..100 / CGPA 0..10)">
                  <input
                    type="number"
                    step="0.01"
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.class10_gradepoint || ""}
                    onChange={(e) =>
                      onChange("class10_gradepoint", e.target.value)
                    }
                  />
                </Row>
                <Row label="Marks Total">
                  <input
                    type="number"
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.class10_marks_total || ""}
                    onChange={(e) =>
                      onChange("class10_marks_total", e.target.value)
                    }
                  />
                </Row>
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- Class 12 ---------- */}
        <section style={styles.section}>
          <div style={styles.sectionTitle}>Class 12</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <tbody>
                <Row label="Board">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.class12_board || ""}
                    onChange={(e) => onChange("class12_board", e.target.value)}
                  />
                </Row>
                <Row label="Stream">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.class12_stream || ""}
                    onChange={(e) => onChange("class12_stream", e.target.value)}
                  />
                </Row>
                <Row label="Year of Passing">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    placeholder={yearPlaceholder}
                    value={form.class12_year_of_passing || ""}
                    onChange={(e) =>
                      onChange("class12_year_of_passing", e.target.value)
                    }
                  />
                </Row>
                <Row label="Grade Scale">
                  <select
                    style={styles.select}
                    {...baseFieldProps}
                    value={form.class12_grade_scale || ""}
                    onChange={(e) =>
                      onChange("class12_grade_scale", e.target.value)
                    }
                  >
                    <option value="">-- select --</option>
                    {VALID_SCALES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Grade Point (PCT 0..100 / CGPA 0..10)">
                  <input
                    type="number"
                    step="0.01"
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.class12_gradepoint || ""}
                    onChange={(e) =>
                      onChange("class12_gradepoint", e.target.value)
                    }
                  />
                </Row>
                <Row label="Marks Total">
                  <input
                    type="number"
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.class12_marks_total || ""}
                    onChange={(e) =>
                      onChange("class12_marks_total", e.target.value)
                    }
                  />
                </Row>
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- Diploma ---------- */}
        <section style={styles.section}>
          <div style={styles.sectionTitle}>Diploma</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <tbody>
                <Row label="Branch">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.diploma_branch || ""}
                    onChange={(e) =>
                      onChange("diploma_branch", e.target.value)
                    }
                  />
                </Row>
                <Row label="Year of Passing">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    placeholder={yearPlaceholder}
                    value={form.diploma_year_of_passing || ""}
                    onChange={(e) =>
                      onChange("diploma_year_of_passing", e.target.value)
                    }
                  />
                </Row>
                <Row label="Grade Scale">
                  <select
                    style={styles.select}
                    {...baseFieldProps}
                    value={form.diploma_grade_scale || ""}
                    onChange={(e) =>
                      onChange("diploma_grade_scale", e.target.value)
                    }
                  >
                    <option value="">-- select --</option>
                    {VALID_SCALES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Row>

                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Row
                    key={i}
                    label={`Semester ${i} (PCT 0..100 / CGPA 0..10)`}
                  >
                    <input
                      type="number"
                      step="0.01"
                      style={styles.cellInput}
                      {...baseFieldProps}
                      value={form[`diploma_sem${i}_gp`] || ""}
                      onChange={(e) =>
                        onChange(`diploma_sem${i}_gp`, e.target.value)
                      }
                    />
                  </Row>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- Bachelor ---------- */}
        <section style={styles.section}>
          <div style={styles.sectionTitle}>Bachelor</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <tbody>
                <Row label="Degree">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.bachelor_degree || ""}
                    onChange={(e) =>
                      onChange("bachelor_degree", e.target.value)
                    }
                  />
                </Row>
                <Row label="Department">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.bachelor_department || ""}
                    onChange={(e) =>
                      onChange("bachelor_department", e.target.value)
                    }
                  />
                </Row>
                <Row label="University">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.bachelor_university || ""}
                    onChange={(e) =>
                      onChange("bachelor_university", e.target.value)
                    }
                  />
                </Row>
                <Row label="Year of Passing">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    placeholder={yearPlaceholder}
                    value={form.bachelor_year_of_passing || ""}
                    onChange={(e) =>
                      onChange("bachelor_year_of_passing", e.target.value)
                    }
                  />
                </Row>
                <Row label="Grade Scale">
                  <select
                    style={styles.select}
                    {...baseFieldProps}
                    value={form.bachelor_grade_scale || ""}
                    onChange={(e) =>
                      onChange("bachelor_grade_scale", e.target.value)
                    }
                  >
                    <option value="">-- select --</option>
                    {VALID_SCALES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Grade Point (PCT 0..100 / CGPA 0..10)">
                  <input
                    type="number"
                    step="0.01"
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.bachelor_gradepoint || ""}
                    onChange={(e) =>
                      onChange("bachelor_gradepoint", e.target.value)
                    }
                  />
                </Row>
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- Master ---------- */}
        <section style={styles.section}>
          <div style={styles.sectionTitle}>Masters</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <tbody>
                <Row label="Degree">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.master_degree || ""}
                    onChange={(e) => onChange("master_degree", e.target.value)}
                  />
                </Row>
                <Row label="Department">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.master_department || ""}
                    onChange={(e) =>
                      onChange("master_department", e.target.value)
                    }
                  />
                </Row>
                <Row label="University">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.master_university || ""}
                    onChange={(e) =>
                      onChange("master_university", e.target.value)
                    }
                  />
                </Row>
                <Row label="Year of Passing">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    placeholder={yearPlaceholder}
                    value={form.master_year_of_passing || ""}
                    onChange={(e) =>
                      onChange("master_year_of_passing", e.target.value)
                    }
                  />
                </Row>
                <Row label="Grade Scale">
                  <select
                    style={styles.select}
                    {...baseFieldProps}
                    value={form.master_grade_scale || ""}
                    onChange={(e) =>
                      onChange("master_grade_scale", e.target.value)
                    }
                  >
                    <option value="">-- select --</option>
                    {VALID_SCALES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Grade Point (PCT 0..100 / CGPA 0..10)">
                  <input
                    type="number"
                    step="0.01"
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.master_gradepoint || ""}
                    onChange={(e) =>
                      onChange("master_gradepoint", e.target.value)
                    }
                  />
                </Row>
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- PhD ---------- */}
        <section style={styles.section}>
          <div style={styles.sectionTitle}>PhD</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <tbody>
                <Row label="Field">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.phd_field || ""}
                    onChange={(e) => onChange("phd_field", e.target.value)}
                  />
                </Row>
                <Row label="University">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    value={form.phd_university || ""}
                    onChange={(e) => onChange("phd_university", e.target.value)}
                  />
                </Row>
                <Row label="Year of Passing">
                  <input
                    style={styles.cellInput}
                    {...baseFieldProps}
                    placeholder={yearPlaceholder}
                    value={form.phd_year_of_passing || ""}
                    onChange={(e) =>
                      onChange("phd_year_of_passing", e.target.value)
                    }
                  />
                </Row>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
