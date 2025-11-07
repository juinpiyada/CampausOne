// src/pages/finance/Scholarships.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config";
import "../../sms-fin.css";
import {
  FaEdit, FaTrash, FaSave, FaPlus,
  FaFileAlt, FaTimes
} from "react-icons/fa";

/* ---------------- Small helpers (aligned with FeeStructureManager) ---------------- */
const toISODate = (v) => (v ? String(v).slice(0, 10) : "");

function extractYear(dateLike) {
  if (!dateLike) return null;
  const m = String(dateLike).match(/^(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return Number.isNaN(y) ? null : y;
}

function deriveAcademicYearFromAdmission(admissionDateLike) {
  const y = extractYear(admissionDateLike);
  if (!y) return "";
  return `${y}-${y + 1}`;
}

function normalizeSemester(val) {
  if (val === null || val === undefined) return "";
  const m = String(val).match(/(\d{1,2})/);
  if (!m) return "";
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n)) return "";
  return n >= 1 && n <= 8 ? String(n) : "";
}

function pickSemesterFromStudent(s) {
  const candidates = [
    s.stucurrentsem, s.current_semester, s.currentsemester,
    s.semester_no, s.semester, s.sem
  ];
  const found = candidates.find(
    (x) => x !== undefined && x !== null && String(x).trim() !== ""
  );
  return found ? normalizeSemester(found) : "";
}

function normalizeStudent(s) {
  const stuid =
    s.stuid ?? s.studentid ?? s.student_id ?? s.id ?? s.stu_id ?? "";
  const stuname =
    s.stuname ?? s.studentname ?? s.student_name ?? s.name ?? s.fullname ?? s.full_name ?? "";
  const stu_course_id =
    s.stu_course_id ?? s.courseid ?? s.programId ?? s.program_id ?? s.prg_id ?? "";
  const admission =
    s.stuadmissiondt ?? s.stu_admission_dt ?? s.stuadmissiondate ??
    s.admissiondt ?? s.admission_date ?? s.admissionDate ??
    s.joining_date ?? s.stujoiningdate ?? s.joinDate ?? "";

  return {
    stuid: String(stuid || "").trim(),
    stuname: String(stuname || "").trim(),
    stu_course_id: String(stu_course_id || "").trim(),
    admissionDate: admission,
    semester: pickSemesterFromStudent(s),
    _raw: s,
  };
}

function safeEqCI(a, b) {
  return String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
}

/* Build a friendly label: Name (ID) — Program [Sem X] */
function studentOptionLabel(s, courseNameById) {
  const progName = courseNameById[s.stu_course_id] || s.stu_course_id || "Program N/A";
  const semLabel = s.semester ? ` [Sem ${s.semester}]` : "";
  return `${s.stuname} (${s.stuid}) — ${progName}${semLabel}`;
}

export default function Scholarships() {
  const [scholarships, setScholarships] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [terms, setTerms] = useState([]);
  const [courses, setCourses] = useState([]);

  const [formData, setFormData] = useState({
    cms_schol_id: "",
    cms_schol_stuid: "",
    cms_schol_term_id: "",          // auto-filled
    cms_schol_fee_head: "",
    cms_stu_schol_amt: "",
    cms_schol_reason: "",
    cms_schol_apprved_by: "",
    cms_schol_reason_custom: ""
  });

  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const API_URL = config.FIN_UI_STUDENT_SCHOLARSHIP_ROUTE;

  /* ---------------- Fetch Helpers ---------------- */
  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${config.STUDENT_ROUTE}/list`);
      const list = res.data?.students || res.data || [];
      setStudents(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error fetching students:", err);
      setStudents([]);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await axios.get(`${config.TEACHER_ROUTE}`);
      const list = res.data?.teachers || res.data || [];
      setTeachers(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error fetching teachers:", err);
      setTeachers([]);
    }
  };

  const fetchTerms = async () => {
    try {
      const res = await axios.get(`${config.MASTER_ACADYEAR_ROUTE}`);
      const list = res.data?.terms || res.data || [];
      setTerms(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error fetching terms:", err);
      setTerms([]);
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await axios.get(`${config.COURSE_ROUTE}/list`);
      setCourses(res.data?.courses || []);
    } catch (err) {
      console.error("Error fetching courses:", err);
      setCourses([]);
    }
  };

  const fetchScholarships = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_URL);
      setScholarships(
        res.data && Array.isArray(res.data.scholarships)
          ? res.data.scholarships
          : []
      );
    } catch (err) {
      console.error("Error fetching scholarships:", err);
      setScholarships([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScholarships();
    fetchStudents();
    fetchTeachers();
    fetchTerms();
    fetchCourses();
  }, []);

  /* ---------------- Derived / normalized data ---------------- */
  const studentsNorm = useMemo(
    () => (Array.isArray(students) ? students.map(normalizeStudent) : []),
    [students]
  );

  // Map courseId -> name to show friendly labels in Student dropdown
  const courseNameById = useMemo(() => {
    const m = {};
    (courses || []).forEach((c) => {
      if (c?.courseid) m[String(c.courseid)] = c.coursedesc || "";
    });
    return m;
  }, [courses]);

  // Terms normalization: allow { id }, { acad_year }, or plain string
  const termIdList = useMemo(() => {
    return (terms || []).map((t) => {
      if (typeof t === "string") return t;
      return t?.id || t?.acad_year || "";
    }).filter(Boolean);
  }, [terms]);

  // Student select options
  const studentOptions = useMemo(() => {
    const opts = studentsNorm.map((s) => ({
      value: s.stuid,
      label: studentOptionLabel(s, courseNameById),
    }));
    // nice sorting by name
    opts.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return opts;
  }, [studentsNorm, courseNameById]);

  // Quick student lookup map by id
  const studentById = useMemo(() => {
    const m = {};
    for (const s of studentsNorm) m[s.stuid] = s;
    return m;
  }, [studentsNorm]);

  /* ---------------- Form Handlers ---------------- */
  const handleChange = (e) => {
    const { name, value } = e.target;

    // When student changes: auto-fill Academic Year (cms_schol_term_id).
    if (name === "cms_schol_stuid") {
      const s = studentById[value];
      let autoAY = "";
      if (s) {
        const guessAY = deriveAcademicYearFromAdmission(s.admissionDate);
        // Prefer a value that exists in Terms; else use the derived guess.
        const match = termIdList.find((t) => safeEqCI(t, guessAY));
        autoAY = match || guessAY || "";
      }

      setFormData((prev) => ({
        ...prev,
        cms_schol_stuid: value,
        cms_schol_term_id: autoAY, // always set (no manual selector now)
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let payload = { ...formData };
    if (payload.cms_schol_reason === "Others" && payload.cms_schol_reason_custom) {
      payload.cms_schol_reason = payload.cms_schol_reason_custom;
    }
    delete payload.cms_schol_reason_custom;

    try {
      if (editId) {
        await axios.put(`${API_URL}/${editId}`, payload);
      } else {
        await axios.post(API_URL, payload);
      }
      resetForm();
      setIsModalOpen(false);
      fetchScholarships();
    } catch (err) {
      console.error("Error saving scholarship:", err);
      alert(
        err?.response?.data?.error ||
        err?.response?.data?.details ||
        "Failed to save scholarship"
      );
    }
  };

  const handleEdit = (sch) => {
    setEditId(sch.cms_schol_id);
    setFormData({
      cms_schol_id: sch.cms_schol_id || "",
      cms_schol_stuid: sch.cms_schol_stuid || "",
      cms_schol_term_id: sch.cms_schol_term_id || "",
      cms_schol_fee_head: sch.cms_schol_fee_head || "",
      cms_stu_schol_amt: sch.cms_stu_schol_amt || "",
      cms_schol_reason: sch.cms_schol_reason || "",
      cms_schol_apprved_by: sch.cms_schol_apprved_by || "",
      cms_schol_reason_custom: ""
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this scholarship?")) return;
    try {
      await axios.delete(`${API_URL}/${id}`);
      fetchScholarships();
    } catch (err) {
      console.error("Error deleting scholarship:", err);
      alert(
        err?.response?.data?.error ||
        err?.response?.data?.details ||
        "Failed to delete scholarship"
      );
    }
  };

  const resetForm = () => {
    setFormData({
      cms_schol_id: "",
      cms_schol_stuid: "",
      cms_schol_term_id: "",
      cms_schol_fee_head: "",
      cms_stu_schol_amt: "",
      cms_schol_reason: "",
      cms_schol_apprved_by: "",
      cms_schol_reason_custom: ""
    });
    setEditId(null);
  };

  // Auto-generate ID with +1
  const openAddModal = () => {
    let newNum = 1;
    if (Array.isArray(scholarships) && scholarships.length > 0) {
      const maxNum = scholarships
        .map((s) => parseInt(String(s.cms_schol_id || "").replace(/\D/g, ""), 10) || 0)
        .reduce((a, b) => Math.max(a, b), 0);
      newNum = maxNum + 1;
    }
    setFormData({
      cms_schol_id: `SCH-${newNum}`,
      cms_schol_stuid: "",
      cms_schol_term_id: "",
      cms_schol_fee_head: "",
      cms_stu_schol_amt: "",
      cms_schol_reason: "",
      cms_schol_apprved_by: "",
      cms_schol_reason_custom: ""
    });
    setEditId(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditId(null);
  };

  /* ---------------- Helpers for table display ---------------- */
  const getStudentName = (id) => {
    const s = studentById[String(id)];
    return s ? `${s.stuname} (${s.stuid})` : id;
  };

  const getTeacherName = (id) => {
    const t = teachers.find((th) => String(th.teacherid) === String(id));
    return t ? `${t.teachername} (${t.teacherid})` : id;
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10 flex flex-col md:flex-row justify-between items-center">
          <div className="text-center md:text-left mb-6 md:mb-0">
            <h1 className="text-4xl font-bold text-indigo-800 mb-2">Scholarship Management</h1>
            <p className="text-lg text-indigo-600">Manage student scholarships and financial aid</p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-300 transform hover:-translate-y-0.5"
          >
            <FaPlus />
            Add Scholarship
          </button>
        </div>

        {/* Scholarships Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
              <FaFileAlt className="text-indigo-600" />
              Scholarship Records
            </h2>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Academic Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approved By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(scholarships) && scholarships.length > 0 ? (
                    scholarships.map((sch) => (
                      <tr key={sch.cms_schol_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm">{sch.cms_schol_id}</td>
                        <td className="px-6 py-4 text-sm">{getStudentName(sch.cms_schol_stuid)}</td>
                        <td className="px-6 py-4 text-sm">{sch.cms_schol_term_id || "-"}</td>
                        <td className="px-6 py-4 text-sm">{sch.cms_schol_fee_head}</td>
                        <td className="px-6 py-4 text-sm">₹{sch.cms_stu_schol_amt}</td>
                        <td className="px-6 py-4 text-sm">{sch.cms_schol_reason}</td>
                        <td className="px-6 py-4 text-sm">{getTeacherName(sch.cms_schol_apprved_by)}</td>
                        <td className="px-6 py-4 text-sm">
                          <button onClick={() => handleEdit(sch)} className="text-yellow-600 hover:text-yellow-800 mr-2" title="Edit"><FaEdit /></button>
                          <button onClick={() => handleDelete(sch.cms_schol_id)} className="text-red-600 hover:text-red-800" title="Delete"><FaTrash /></button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="px-6 py-12 text-center text-gray-500">No scholarships found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
                <FaPlus className="text-indigo-600" />
                {editId ? "Edit Scholarship" : "Add New Scholarship"}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <FaTimes className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ID (Auto) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Scholarship ID</label>
                  <input
                    type="text"
                    name="cms_schol_id"
                    value={formData.cms_schol_id}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
                  />
                </div>

                {/* Student (updated selector like FeeStructureManager style) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Student</label>
                  <select
                    name="cms_schol_stuid"
                    value={formData.cms_schol_stuid}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select Student</option>
                    {studentOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Academic Year auto-fills from the student’s admission year (prefers a value present in Terms).
                  </p>
                </div>

                {/* Academic Year (READ-ONLY, auto-filled) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Academic Year (auto)
                  </label>
                  <input
                    type="text"
                    value={formData.cms_schol_term_id || ""}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
                    placeholder="Auto-filled after selecting Student"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <select
                    name="cms_schol_fee_head"
                    value={formData.cms_schol_fee_head}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select Category</option>
                    <option value="Tuition Fee">Tuition Fee</option>
                    <option value="Hostel Fee">Hostel Fee</option>
                    <option value="Mess Fee">Mess Fee</option>
                    <option value="Exam Fee">Exam Fee</option>
                    <option value="Registration Fee">Registration Fee</option>
                    <option value="Others/Miscellaneous">Others/Miscellaneous</option>
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Amount (₹)</label>
                  <input
                    type="number"
                    name="cms_stu_schol_amt"
                    value={formData.cms_stu_schol_amt}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Reason</label>
                  <select
                    name="cms_schol_reason"
                    value={
                      ["Merit Based", "ST/SC/OBC", "Minority", "Others"].includes(formData.cms_schol_reason)
                        ? formData.cms_schol_reason
                        : ""
                    }
                    onChange={(e) => {
                      setFormData({ ...formData, cms_schol_reason: e.target.value, cms_schol_reason_custom: "" });
                    }}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select Reason</option>
                    <option value="Merit Based">Merit Based</option>
                    <option value="ST/SC/OBC">ST/SC/OBC</option>
                    <option value="Minority">Minority</option>
                    <option value="Others">Others</option>
                  </select>

                  {/* Custom input only when "Others" is selected */}
                  {formData.cms_schol_reason === "Others" && (
                    <input
                      type="text"
                      placeholder="Enter The Reason"
                      value={formData.cms_schol_reason_custom}
                      onChange={(e) =>
                        setFormData({ ...formData, cms_schol_reason_custom: e.target.value })
                      }
                      className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  )}
                </div>

                {/* Approved By */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Approved By</label>
                  <select
                    name="cms_schol_apprved_by"
                    value={formData.cms_schol_apprved_by}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select Teacher</option>
                    {teachers.map((t) => (
                      <option key={t.teacherid} value={t.teacherid}>
                        {t.teachername} ({t.teacherid})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-3 border rounded-lg text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg flex items-center gap-2"
                >
                  <FaSave /> {editId ? "Update Scholarship" : "Add Scholarship"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
