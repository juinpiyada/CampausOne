import React, { useState, useEffect, useRef } from "react";
import {
  FaDownload,
  FaFileAlt,
  FaUniversity,
  FaUserGraduate,
  FaCalendarAlt,
  FaRupeeSign,
} from "react-icons/fa";
import axios from "axios";
import config from "../../config/middleware_config"; // Your config file with API base URL

export default function DemandLetterGenerator() {
  const [form, setForm] = useState({
    studentName: "",
    studentId: "",
    course: "",
    academicYear: "",
    feeHead: "",
    feeAmount: "",
    dueDate: "",
  });

  const [students, setStudents] = useState([]);
  const [generated, setGenerated] = useState(false);

  // Ref to the printable area
  const printRef = useRef(null);

  // ---- College Header Constants ----
  const COLLEGE = {
    logoSrc: "/public/images/logo.png", // <-- public/public/images/logo.png in project structure
    name: "Swami Vivekananda Institute of Science & Technology",
    address:
      "Address: Dakshin Gobindapur Rd, Dakshin Gobindopur, Rajpur Sonarpur, Jaynagar, West Bengal 700145",
    campus: "Campus: Urban",
    founded: "Founded: 2008",
    affiliations: "Affiliations: AICTE, NAAC",
    totalEnrollment: "Total enrollment: 1,714 (2025)",
    phone: "Phone: 033 2437 9913",
  };

  // Inject print CSS once
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-print-style", "demand-letter");
    style.innerHTML = `
      @media print {
        @page { size: A4; margin: 15mm; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* Show only the print area */
        body * { visibility: hidden; }
        #printArea, #printArea * { visibility: visible; }
        #printArea {
          position: absolute; left: 0; top: 0; width: 100%;
        }
        /* Remove card look in print */
        .print-card {
          box-shadow: none !important;
          border: none !important;
          padding: 0 !important;
          background: white !important;
        }
        /* Hide buttons/controls in print */
        .no-print { display: none !important; }
        /* Tidy typography for print */
        .print-title { font-size: 18pt !important; }
        .print-subtitle { font-size: 11pt !important; }
        .print-text { font-size: 11pt !important; line-height: 1.5 !important; }

        /* Ensure logo renders nicely on print */
        .print-logo { display: block; margin: 0 auto 8px auto; max-height: 70px; width: auto; }
        .print-header-name { font-size: 16pt !important; font-weight: 700 !important; }
        .print-header-meta { font-size: 10pt !important; color: #1f2937 !important; } /* gray-800 */
        .print-hr { border: 0; height: 1px; background: #e5e7eb; margin: 8px 0 14px 0; } /* gray-200 */
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existing = document.querySelector('style[data-print-style="demand-letter"]');
      if (existing) existing.remove();
    };
  }, []);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const res = await axios.get(`${config.STUDENT_ROUTE}/list`);
        setStudents(res.data?.students ?? res.data ?? []);
      } catch (err) {
        console.error("Error fetching students:", err);
        setStudents([]);
      }
    };
    fetchStudents();
  }, []);

  // Helpers
  const formatINR = (val) => {
    if (val === null || val === undefined || val === "") return "";
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    // Print-friendly: DD MMM YYYY
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Fetch student details by ID (name, course, admission date, etc.)
  const handleStudentSelect = async (e) => {
    const studentId = e.target.value;
    if (!studentId) return;

    try {
      const response = await axios.get(`${config.STUDENT_ROUTE}/${studentId}`);
      const studentData = response.data?.student ?? response.data;
      if (studentData) {
        const admissionYear = new Date(studentData.stuadmissiondt).getFullYear();
        const academicYear = `${admissionYear}-${admissionYear + 1}`;

        setForm((prev) => ({
          ...prev,
          studentId: studentData.stuid,
          studentName: studentData.stuname,
          course: studentData.stu_course_id,
          academicYear,
        }));
      } else {
        console.error("Student data not found.");
      }
    } catch (err) {
      if (err.response?.status === 404) {
        console.error("Student not found (404)");
      } else {
        console.error("Error fetching student details:", err);
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleGenerate = (e) => {
    e.preventDefault();
    setGenerated(true);
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    // Ensure layout is rendered before print
    requestAnimationFrame(() => window.print());
  };

  // POST new demand letter
  const handlePostToDB = async () => {
    try {
      const response = await axios.post(config.VITE_DEMAND_LETTERS_ROUTE, {
        student_id: form.studentId,
        course_id: form.course,
        fee_head: form.feeHead,
        fee_amount: form.feeAmount,
        due_date: form.dueDate,
        academic_year: form.academicYear,
      });
      if (response.status === 201) {
        alert("Demand letter posted to DB successfully!");
      }
    } catch (error) {
      console.error("Error posting demand letter to DB:", error);
      alert("Error posting demand letter to DB.");
    }
  };

  // PUT update (if you later add editing)
  const handleUpdate = async () => {
    try {
      const response = await axios.put(
        `${config.VITE_DEMAND_LETTERS_ROUTE}/${form.demand_id}`,
        {
          student_id: form.studentId,
          course_id: form.course,
          fee_head: form.feeHead,
          fee_amount: form.feeAmount,
          due_date: form.dueDate,
          academic_year: form.academicYear,
        }
      );
      if (response.status === 200) {
        alert("Demand letter updated successfully!");
      }
    } catch (error) {
      console.error("Error updating demand letter:", error);
      alert("Error updating demand letter.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-6 print-card">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center mb-6 no-print">
          <FaFileAlt className="text-blue-600 mr-2" /> Demand Letter Generator
        </h1>

        {/* Form */}
        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 no-print">
          {/* Student Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <FaUserGraduate className="text-gray-500 mr-2" /> Student Name
            </label>
            <select
              name="studentId"
              value={form.studentId}
              onChange={handleStudentSelect}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Student</option>
              {students.length > 0 ? (
                students.map((stu) => (
                  <option key={stu.stuid} value={stu.stuid}>
                    {stu.stuname}
                  </option>
                ))
              ) : (
                <option disabled>No students found</option>
              )}
            </select>
          </div>

          {/* Student ID (auto-filled, read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
            <input
              type="text"
              name="studentId"
              value={form.studentId}
              readOnly
              className="w-full border rounded-lg p-2 bg-gray-100"
            />
          </div>

          {/* Student Name (auto-filled) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Student Name</label>
            <input
              type="text"
              name="studentName"
              value={form.studentName}
              readOnly
              className="w-full border rounded-lg p-2 bg-gray-100"
            />
          </div>

          {/* Course */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <FaUniversity className="text-gray-500 mr-2" /> Course
            </label>
            <input
              type="text"
              name="course"
              value={form.course}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Academic Year (auto-filled) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
            <input
              type="text"
              name="academicYear"
              value={form.academicYear}
              readOnly
              className="w-full border rounded-lg p-2 bg-gray-100"
            />
          </div>

          {/* Category (Fee Head) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              name="feeHead"
              value={form.feeHead}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select</option>
              <option value="Tuition Fee">Tuition Fee</option>
              {/* <option value="Hostel Fee">Hostel Fee</option>
              <option value="Mess Fee">Mess Fee</option>
              <option value="Exam Fee">Exam Fee</option>
              <option value="Registration Fee">Registration Fee</option>
              <option value="Others/Miscellaneous">Others/Miscellaneous</option> */}
            </select>
          </div>

          {/* Fee Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <FaRupeeSign className="text-gray-500 mr-2" /> Fee Amount
            </label>
            <input
              type="number"
              name="feeAmount"
              value={form.feeAmount}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              required
              min="0"
              step="1"
            />
          </div>

          {/* Due Date */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <FaCalendarAlt className="text-gray-500 mr-2" /> Due Date
            </label>
            <input
              type="date"
              name="dueDate"
              value={form.dueDate}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </form>

        {/* Generate Button */}
        <div className="flex justify-end space-x-3 mb-6 no-print">
          <button
            onClick={handleGenerate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            <FaFileAlt className="mr-2" /> Generate Letter
          </button>
        </div>

        {/* Generated Letter Preview (Print Area) */}
        {generated && (
          <div ref={printRef} id="printArea" className="border rounded-lg p-6 bg-white">
            {/* ===== College Header / Letterhead ===== */}
            <div className="text-center mb-4">
              {/* Logo */}
              <img
                src={COLLEGE.logoSrc}
                alt="College Logo"
                className="print-logo"
                style={{ display: "block", margin: "0 auto 8px auto", maxHeight: 70 }}
                onError={(e) => {
                  // Fallback if logo path is incorrect
                  e.currentTarget.style.display = "none";
                }}
              />

              {/* College Name */}
              <div className="print-header-name">{COLLEGE.name}</div>

              {/* Meta lines */}
              <div className="print-header-meta mt-1">
                {COLLEGE.address}
              </div>
              <div className="print-header-meta">
                {COLLEGE.campus} | {COLLEGE.founded} | {COLLEGE.director}
              </div>
              <div className="print-header-meta">
                {COLLEGE.affiliations} | {COLLEGE.totalEnrollment}
              </div>
              <div className="print-header-meta">
                {COLLEGE.phone}
              </div>

              <hr className="print-hr" />
            </div>

            {/* ===== Document Title ===== */}
            <div className="text-center mb-4">
              <div className="font-bold text-xl print-title underline">DEMAND LETTER</div>
              {/* <div className="text-gray-600 print-subtitle">Accounts Department</div> */}
            </div>

            {/* ===== Body ===== */}
            <div className="print-text">
              <p className="mb-2">
                <strong>Student Name:</strong> {form.studentName}
              </p>
              <p className="mb-2">
                <strong>Student ID:</strong> {form.studentId}
              </p>
              <p className="mb-2">
                <strong>Course:</strong> {form.course}
              </p>
              <p className="mb-2">
                <strong>Academic Year:</strong> {form.academicYear}
              </p>
              <p className="mb-2">
                <strong>Fee Head:</strong> {form.feeHead}
              </p>
              <p className="mb-2">
                <strong>Fee Amount:</strong> {formatINR(form.feeAmount)}
              </p>
              <p className="mb-4">
                <strong>Due Date:</strong> {formatDate(form.dueDate)}
              </p>

              <p className="mt-4">
                Dear {form.studentName},
                <br />
                This is a reminder that a payment of <strong>{formatINR(form.feeAmount)}</strong>{" "}
                towards <strong>{form.feeHead}</strong> for Academic Year {form.academicYear} is
                due on <strong>{formatDate(form.dueDate)}</strong>. Kindly make the payment on or
                before the due date to avoid penalties.
              </p>

              <p className="mt-6">
                Sincerely,
                <br />
                <strong>Dr Sonali Ghosh</strong>
                <br/>
                <strong>Principal,SVIST</strong>
                
              </p>
            </div>

            {/* Print button (hidden during print) */}
            <div className="flex justify-end mt-6 no-print">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
              >
                <FaDownload className="mr-2" /> Download / Print
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
