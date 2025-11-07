import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import config from "../../config/middleware_config";

/* ------------------------ small helpers ------------------------ */
const joinUrl = (base = "", path = "") => {
  if (!base) return path || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const b = String(base).replace(/\/+$/, "");
  const p = String(path).replace(/^\/+/, "");
  return `${b}/${p}`;
};

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const toISODate = (val) => {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(+d)) return "";
  return d.toISOString().slice(0, 10);
};
const pad = (n, w = 4) => String(n).padStart(w, "0");
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const daysBetween = (a, b) => {
  const A = new Date(a);
  const B = new Date(b);
  if (Number.isNaN(+A) || Number.isNaN(+B)) return 0;
  return Math.floor((B - A) / (1000 * 60 * 60 * 24));
};

/* Local Date helper (DATE ONLY) for <input type="date"> */
const toLocalDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  if (Number.isNaN(+d)) return "";
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

// currency helper
const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

// Safely pick an array from a variety of server shapes
const pickArray = (obj) => {
  if (Array.isArray(obj)) return obj;
  if (!obj || typeof obj !== "object") return [];
  const cands = [
    obj.invoices,
    obj.students,
    obj.feeStructures,
    obj.result,
    obj.rows,
    obj.items,
    obj.data?.invoices,
    obj.data?.students,
    obj.data?.feeStructures,
    obj.data?.result,
    obj.data?.rows,
    obj.data?.items,
    obj.data,
  ];
  for (const c of cands) if (Array.isArray(c)) return c;
  return [];
};

/* -------- Academic Year from admission YEAR (always Y → Y+1) -------- */
function deriveAcademicYearFromDate(admissionDate) {
  if (!admissionDate) return "";
  const match = String(admissionDate).match(/^(\d{4})/);
  if (!match) return "";
  const y = parseInt(match[1], 10);
  if (Number.isNaN(y)) return "";
  return `${y}-${y + 1}`;
}

/* ------------ Auto-generate next Student ID (STU_ID_001, ...) ------------ */
function getNextStudentId(list = []) {
  let maxNum = 0;
  for (const s of list) {
    const id = String(s?.stuid || "").trim();
    const m = /^STU_ID_(\d+)$/.exec(id);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!Number.isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  const next = String(maxNum + 1).padStart(3, "0");
  return `STU_ID_${next}`;
}

/* -------------------- normalizers (robust to shapes) -------------------- */
function normalizeStudent(s) {
  const id =
    s.stuid ??
    s.studentid ??
    s.student_id ??
    s.id ??
    s.stu_id ??
    "";

  const name =
    s.stuname ??
    s.studentname ??
    s.student_name ??
    s.name ??
    s.fullname ??
    s.full_name ??
    "";

  const adm =
    s.stuadmissiondt ??
    s.stu_admission_dt ??
    s.stuadmissiondate ??
    s.admissiondt ??
    s.admission_date ??
    s.admissionDate ??
    s.joining_date ??
    s.stujoiningdate ??
    s.joinDate ??
    "";

  // Program TOTAL fees (do NOT include 'seemfees' here)
  const programTotalRaw =
    s.semfees ?? s.sem_fees ??
    s.total_fees ?? s.totalfees ?? s.fees_total ?? s.program_total ?? s.prg_total ??
    s.course_total ?? s.degree_total ?? s.total_amount ?? s.total_amt ??
    s.tuition_total ?? s.overall_fees ?? 0;

  // current semester fields
  const currSemRaw =
    s.stu_curr_semester ??
    s.stucurrentsem ??
    s.current_semester ??
    s.currentsemester ??
    s.semester_no ??
    s.semester ??
    s.sem ??
    1;

  // program / course id fields - normalize to uppercase for consistent matching
  const courseId = (
    s.stu_course_id ??
    s.courseid ??
    s.programId ??
    s.program_id ??
    s.prg_id ??
    s.course_id ??
    s.degree_id ??
    ""
  ).toString().toUpperCase().trim();

  // Outstanding/due fields
  const dueRaw =
    s.due_amount ?? s.fees_due ?? s.balance_due ?? s.semfees_due ?? s.remaining_fees ?? s.outstanding ?? s.balance ?? 0;

  // Explicit "seemfees" from Student Master (read-only)
  const seemfeesRaw =
    s.seemfees ?? s.current_sem_fee ?? s.current_sem_amount ?? 0;

  // Scholarship fees
  const scholarshipRaw =
    s.scholrshipfees ?? s.scholarship ?? s.scholarship_amount ?? 0;

  // Extract semester fees from specific columns (sem1, sem2, sem3, etc.)
  const semesterFees = {};
  
  // Check for semester fee columns up to sem12
  for (let i = 1; i <= 12; i++) {
    const semKey = `sem${i}`;
    if (s[semKey] !== undefined && s[semKey] !== null) {
      semesterFees[semKey] = toNum(s[semKey], 0);
    }
  }
  
  // Also check for alternative naming patterns
  for (let i = 1; i <= 12; i++) {
    const semKey = `semester_${i}_fee`;
    if (s[semKey] !== undefined && s[semKey] !== null) {
      semesterFees[`sem${i}`] = toNum(s[semKey], 0);
    }
  }
  
  // Check for semester_fees object
  if (s.semester_fees && typeof s.semester_fees === 'object') {
    for (let i = 1; i <= 12; i++) {
      const semKey = `sem${i}`;
      if (s.semester_fees[semKey] !== undefined && s.semester_fees[semKey] !== null) {
        semesterFees[semKey] = toNum(s.semester_fees[semKey], 0);
      }
    }
  }
  
  // Check for semester_fees array
  if (Array.isArray(s.semester_fees)) {
    s.semester_fees.forEach((fee, index) => {
      if (fee && fee.semester && fee.amount) {
        const semNum = parseInt(fee.semester);
        if (!isNaN(semNum) && semNum >= 1 && semNum <= 12) {
          semesterFees[`sem${semNum}`] = toNum(fee.amount, 0);
        }
      }
    });
  }
  
  // Log for debugging
  if (Object.keys(semesterFees).length > 0) {
    console.log(`Student ${id} semester fees:`, semesterFees);
  }

  // Extract balance from the student record
  const balanceRaw = s.balance ?? 0;

  return {
    stuid: String(id || "").trim(),
    stuname: String(name || "").trim(),
    stuadmissiondt: adm,
    semfees: toNum(programTotalRaw, 0),                 // Program TOTAL
    stu_curr_semester: Number.isFinite(Number(currSemRaw)) ? Number(currSemRaw) : 1,
    stu_course_id: courseId,
    fees_due: toNum(dueRaw, 0),             // Outstanding
    seemfees_value: toNum(seemfeesRaw, 0),  // Read-only seemfees
    scholrshipfees: toNum(scholarshipRaw, 0), // Scholarship amount
    // Add semester-specific fees
    semesterFees: semesterFees,
    // Add balance
    balance: toNum(balanceRaw, 0),
  };
}

function normalizeInvoice(x) {
  const toBool = (v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    const s = String(v || "").toLowerCase();
    return s === "true" || s === "paid" || s === "yes" || s === "y" || s === "1" || s === "completed";
  };

  return {
    cms_stu_inv_id:
      x.cms_stu_inv_id ??
      x.invoice_id ??
      x.invoiceId ??
      x.inv_id ??
      x.id ??
      "",
    cms_stu_id:
      x.cms_stu_id ??
      x.student_id ??
      x.stuid ??
      x.studentId ??
      "",
    cms_term_id:
      x.cms_term_id ??
      x.term_id ??
      x.term ??
      x.academic_year ??
      x.acad_year ??
      x.year ??
      "",
    cms_fee_head:
      x.cms_fee_head ??
      x.fee_head ??
      x.category ??
      x.fee_type ??
      "",
    cms_fee_amt:
      x.cms_fee_amt ??
      x.fee_amount ??
      x.amount ??
      x.total ??
      null,
    cms_due_dt:
      x.cms_due_dt ??
      x.due_date ??
      x.due ??
      x.deadline ??
      "",
    cmc_fee_is_paid: toBool(x.cmc_fee_is_paid ?? x.paid ?? x.status ?? false),
    cmc_fee_paiddt:
      x.cmc_fee_paiddt ??
      x.payment_date ??
      x.paid_on ??
      "",
    cmc_fee_pymt_mode:
      x.cmc_fee_pymt_mode ??
      x.payment_mode ??
      x.mode ??
      "",
    cmc_fee_trans_id:
      x.cmc_fee_trans_id ??
      x.transaction_id ??
      x.txn_id ??
      "",
    cmc_stu_fee_remarks:
      x.cmc_stu_fee_remarks ??
      x.remarks ??
      x.note ??
      "",
    // NEW doc fields
    tdoc: x.tdoc ?? "",
    ndoc: x.ndoc ?? "",
  };
}

/* ------------------------ subcomponents ------------------------ */
const Th = ({ children, className = "" }) => (
  <th className={`px-4 py-2 text-left text-xs font-semibold text-gray-600 ${className}`}>{children}</th>
);
const Td = ({ children, mono = false, className = "" }) => (
  <td className={`px-4 py-2 truncate ${mono ? "font-mono" : ""} ${className}`}>{children}</td>
);
const Field = ({ label, name, value, onChange, readOnly = false, type = "text", placeholder }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      name={name}
      value={value ?? ""}
      onChange={onChange}
      readOnly={readOnly}
      type={type}
      placeholder={placeholder}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${readOnly ? "bg-gray-50" : ""}`}
    />
  </div>
);
const Toast = ({ show, type, text }) => {
  if (!show) return null;
  const bg = type === "error" ? "bg-rose-600" : type === "warn" ? "bg-amber-500" : "bg-emerald-600";
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999]">
      <div className={`${bg} text-white px-4 py-2 rounded-lg shadow-lg text-sm`}>{text}</div>
    </div>
  );
};

/* ------------------------ main component ------------------------ */
export default function CmsFeeInvoice() {
  const API_URL = config.FIN_UI_STUDENT_FEE_INVOICE_ROUTE;
  const FEE_STRUCT_URL = config.FIN_UI_FEE_STRUCTURE_ROUTE;
  const STUDENT_LIST_URL = `${import.meta.env.VITE_STUDENT_ROUTE}/list`;
  const PROGRAM_ROUTE = `${import.meta.env.VITE_PROGRAM_ROUTE}/list`;
  const PROGRAM_DESCRIPTION_ROUTE = `${import.meta.env.VITE_API_BASE_URL}/programdescription`; // New endpoint
  const STUDENT_AY_URL = 'http://localhost:9090/api/student-ay'; // New endpoint for student academic year

  // Balance endpoint base (same router as invoices)
  const BAL_GET = (stuid) => joinUrl(API_URL, `student/${encodeURIComponent(stuid)}/balance`);
  const BAL_PUT = joinUrl(API_URL, "student/balance");

  const NA_TERM = "NA";

  // ALLOWED DOC TYPES (mirror backend)
  const TDOC_OPTIONS = [
    { value: "", label: "Select" },
    { value: "AADHAAR", label: "Aadhaar" },
    { value: "PAN", label: "PAN" },
    { value: "PASSPORT", label: "Passport" },
    { value: "DRIVING_LICENSE", label: "Driving License" },
    { value: "VOTER_ID", label: "Voter ID" },
    { value: "OTHER", label: "Other" },
  ];

  // Payment Mode helpers
  const MODE_UPI = "Online(UPI)";
  const MODE_NEFT = "Online(NEFT)";
  const MODE_CASH_CHEQUE_DEPT = "Cheque/Dept";
  const MODE_CASH = "Cash";

  const requiresTxnId = (mode) =>
    mode === MODE_UPI || mode === MODE_NEFT || mode === MODE_CASH_CHEQUE_DEPT;

  const txnIdPlaceholder = (mode) => {
    if (mode === MODE_CASH_CHEQUE_DEPT) return "Enter the cheque/dept number & date";
    if (mode === MODE_UPI) return "Enter UPI transaction/reference ID";
    if (mode === MODE_NEFT) return "Enter NEFT/IMPS reference number";
    return "Transaction / Reference ID";
  };

  // data
  const [invoices, setInvoices] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeStructuresAll, setFeeStructuresAll] = useState([]); // fallback cache
  const [programs, setPrograms] = useState({}); // program descriptions
  const [studentAY, setStudentAY] = useState({}); // student academic year data

  // balances cache (stuid -> number)
  const [balances, setBalances] = useState({});
  const [balancesLoading, setBalancesLoading] = useState(false);

  // ui state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // pagination
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  // modal/form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [formData, setFormData] = useState(emptyForm(NA_TERM));
  const [docError, setDocError] = useState("");

  // include previous due as added line (optional)
  const [includePrevDue, setIncludePrevDue] = useState(false);
  const [extraDueAmt, setExtraDueAmt] = useState(0);
  const [lateFine, setLateFine] = useState(0);

  // student-derived helpers
  const [currentSemester, setCurrentSemester] = useState("");   // from student table
  const [selectedSemester, setSelectedSemester] = useState(""); // user-chosen (defaults to currentSemester)
  const effectiveSemester = selectedSemester || currentSemester;

  const [totalFees, setTotalFees] = useState(0);
  const [totalFeesSource, setTotalFeesSource] = useState("student");
  const [programId, setProgramId] = useState("");
  const [studentDue, setStudentDue] = useState(0);
  const [studentSeemfees, setStudentSeemfees] = useState(0);
  const [studentScholarship, setStudentScholarship] = useState(0); // New state for scholarship

  // State to store the specific semester fee from student master
  const [semesterFee, setSemesterFee] = useState(0);
  
  // State to store all semester fees from student master
  const [allSemesterFees, setAllSemesterFees] = useState({});
  
  // State for loading and error handling for semester fees
  const [semesterFeesLoading, setSemesterFeesLoading] = useState(false);
  const [semesterFeesError, setSemesterFeesError] = useState("");

  // Single-student Balance (for modal view / rule for 2nd+ semesters)
  const [studentBalance, setStudentBalance] = useState(0);
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState("");

  // fee structure (auto amount)
  const [structLoading, setStructLoading] = useState(false);
  const [structError, setStructError] = useState("");
  const [currentSemAmount, setCurrentSemAmount] = useState(0);
  const [structSnapshot, setStructSnapshot] = useState(null);

  // Fee components state
  const [feeComponents, setFeeComponents] = useState([
    { id: 'admission', label: 'Admission Fee', amount: 0, selected: false },
    { id: 'tuition', label: 'Tuition Fee', amount: 0, selected: false },
    { id: 'library', label: 'Library Book Bank Facility', amount: 0, selected: false },
    { id: 'activities', label: 'Student Activities Fee', amount: 0, selected: false },
    { id: 'skills', label: 'Skills Development Fee', amount: 0, selected: false },
    { id: 'laptop', label: 'Laptop', amount: 0, selected: false },
    { id: 'scholarship', label: 'Scholarship', amount: 0, selected: false, isDeduction: true },
    { id: 'registration', label: 'Registration Fee', amount: 0, selected: false },
    { id: 'exam', label: 'Examination Fee', amount: 0, selected: false },
    { id: 'previousDue', label: 'Previous Due', amount: 0, selected: false },
    { id: 'lateFine', label: 'Late Fine', amount: 0, selected: false },
    { id: 'concession', label: 'Concession', amount: 0, selected: false, isDeduction: true }
  ]);

  // toast
  const [toast, setToast] = useState({ show: false, type: "success", text: "" });
  const showToast = (text, type = "success") => {
    setToast({ show: true, type, text });
    setTimeout(() => setToast({ show: false, type, text: "" }), 2800);
  };

  // mounted flag
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      document.body.style.overflow = "";
    };
  }, []);

  // lock/unlock scroll on modal
  useEffect(() => {
    document.body.style.overflow = isModalOpen ? "hidden" : "";
  }, [isModalOpen]);

  // Calculate displaySeemfees - now using the specific semester fee from student master
  const displaySeemfees = useMemo(() => {
    return semesterFee;
  }, [semesterFee]);

  // Effect to automatically set the amount payable to the calculated semester fee
  useEffect(() => {
    if (isModalOpen) {
      setFormData(prev => ({
        ...prev,
        cms_fee_amt: displaySeemfees
      }));
    }
  }, [displaySeemfees, isModalOpen]);

  // Effect to automatically update tuition fee component when displaySeemfees changes
  useEffect(() => {
    if (isModalOpen) {
      setFeeComponents(prev => {
        const tuitionIndex = prev.findIndex(comp => comp.id === 'tuition');
        if (tuitionIndex !== -1) {
          const updated = [...prev];
          updated[tuitionIndex] = {
            ...updated[tuitionIndex],
            amount: displaySeemfees,
            selected: true
          };
          return updated;
        }
        return prev;
      });
    }
  }, [displaySeemfees, isModalOpen]);

  // Fee components total calculation
  const componentTotal = useMemo(() => {
    return feeComponents.reduce((total, comp) => {
      if (!comp.selected) return total;
      return comp.isDeduction ? total - comp.amount : total + comp.amount;
    }, 0);
  }, [feeComponents]);

  // Update base amount when component total changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      cms_fee_amt: componentTotal
    }));
  }, [componentTotal]);

  // Handle component selection
  const handleComponentSelect = (id, selected) => {
    setFeeComponents(prev => 
      prev.map(comp => 
        comp.id === id ? { ...comp, selected } : comp
      )
    );
  };

  // Handle component amount change
  const handleComponentAmountChange = (id, amount) => {
    setFeeComponents(prev => 
      prev.map(comp => 
        comp.id === id ? { ...comp, amount: Number(amount) || 0 } : comp
      )
    );
  };

  // Helper function to get the tuition fee amount
  const getTuitionAmount = (feeComponents) => {
    const tuitionComponent = feeComponents.find(comp => comp.id === 'tuition' && comp.selected);
    return tuitionComponent ? tuitionComponent.amount : 0;
  };

  /* ------------------------- fetchers ------------------------- */
  const fetchStudents = async () => {
    try {
      // Try multiple possible endpoints for student data
      const possibleEndpoints = [
        `${config.STUDENT_ROUTE}/list`,
        `${config.STUDENT_ROUTE}`,
        `${import.meta.env.VITE_STUDENT_ROUTE}/list`,
        `${import.meta.env.VITE_STUDENT_ROUTE}`,
        'http://localhost:9090/api/students',
        'http://localhost:9090/api/student/list'
      ];
      
      let response = null;
      let lastError = null;
      
      // Try each endpoint until one works
      for (const endpoint of possibleEndpoints) {
        try {
          console.log(`Trying student endpoint: ${endpoint}`);
          response = await axios.get(endpoint, {
            headers: {
              'Content-Type': 'application/json',
              // Add any auth headers if needed
              // 'Authorization': `Bearer ${token}`
            }
          });
          
          if (response && response.data) {
            console.log(`Successfully fetched students from: ${endpoint}`);
            break;
          }
        } catch (err) {
          console.warn(`Failed to fetch from ${endpoint}:`, err.message);
          lastError = err;
        }
      }
      
      if (!response || !response.data) {
        throw lastError || new Error("Failed to fetch student data from all endpoints");
      }
      
      // Handle different response structures
      let studentData = response.data;
      
      // If response has a data property, use that
      if (studentData.data && Array.isArray(studentData.data)) {
        studentData = studentData.data;
      }
      
      // If response is not an array, try to extract array from it
      if (!Array.isArray(studentData)) {
        studentData = pickArray(studentData);
      }
      
      console.log("Raw student data:", studentData);
      
      // Normalize the student data
      const list = studentData.map(normalizeStudent);
      console.log("Normalized student data:", list);
      
      setStudents(Array.isArray(list) ? list : []);
      
      // Log semester fees for debugging
      list.forEach(student => {
        if (student.semesterFees && Object.keys(student.semesterFees).length > 0) {
          console.log(`Student ${student.stuid} semester fees:`, student.semesterFees);
        }
      });
      
    } catch (err) {
      console.error("Error fetching students:", err);
      showToast(`Failed to fetch students: ${err.message}`, "error");
      setStudents([]);
    }
  };

  const fetchInvoices = async () => {
    try {
      const res = await axios.get(API_URL);
      const arr = pickArray(res.data).map(normalizeInvoice);
      setInvoices(arr);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setInvoices([]);
    }
  };

  // Fetch programs to get descriptions
  const fetchPrograms = async () => {
    try {
      // Fetch program list
      const programRes = await axios.get(PROGRAM_ROUTE);
      const programList = pickArray(programRes.data);
      
      // Fetch program descriptions
      const descRes = await axios.get(PROGRAM_DESCRIPTION_ROUTE);
      const descriptionList = pickArray(descRes.data);
      
      // Create a mapping from program ID to description from the descriptionList
      const descriptionMap = {};
      descriptionList.forEach(desc => {
        // Adjust field names as per your database schema
        const progId = desc.program_id || desc.id || desc.code;
        const progDesc = desc.description || desc.name || desc.title;
        
        if (progId) {
          descriptionMap[String(progId).toUpperCase()] = progDesc;
        }
      });
      
      const programMap = {};
      
      programList.forEach(prog => {
        // Try multiple possible field names for the program ID
        const progId = 
          prog.id || 
          prog.program_id || 
          prog.course_id || 
          prog.program_code || 
          prog.code || 
          prog.short_code;
        
        // Get program name from program list or description table
        let progName = 
          prog.name || 
          prog.program_name || 
          prog.programName || 
          prog.title || 
          prog.course_name || 
          prog.courseName || 
          prog.display_name || 
          prog.displayName || 
          prog.description || 
          prog.label || 
          prog.short_name || 
          prog.shortName || 
          prog.full_name || 
          prog.fullName || 
          prog.long_name || 
          prog.longName || 
          prog.official_name || 
          prog.program_title || 
          prog.course_title || 
          progId; // Fallback to ID if no name found
        
        // Override with description from programdescription table if available
        if (progId && descriptionMap[progId.toUpperCase()]) {
          progName = descriptionMap[progId.toUpperCase()];
        }
        
        if (progId) {
          programMap[String(progId).toUpperCase()] = progName;
        }
      });
      
      console.log("Program mapping:", programMap);
      setPrograms(programMap);
    } catch (err) {
      console.error("Error fetching programs:", err);
      setPrograms({});
    }
  };

  // Fetch student academic year data
  const fetchStudentAY = async () => {
    try {
      const res = await axios.get(STUDENT_AY_URL);
      const data = res.data;
      
      // Convert the data to a map for easy lookup
      const ayMap = {};
      if (Array.isArray(data)) {
        data.forEach(item => {
          // Assuming the response has student_id and academic_year fields
          const studentId = item.student_id || item.stuid || item.id;
          const academicYear = item.academic_year || item.ay || item.year;
          
          if (studentId && academicYear) {
            ayMap[String(studentId)] = String(academicYear);
          }
        });
      } else if (data && typeof data === 'object') {
        // If it's an object with student IDs as keys
        Object.keys(data).forEach(key => {
          ayMap[String(key)] = String(data[key]);
        });
      }
      
      console.log("Student AY mapping:", ayMap);
      setStudentAY(ayMap);
    } catch (err) {
      console.error("Error fetching student academic year data:", err);
      setStudentAY({});
    }
  };

  // Pull all fee structures (for fallback computations)
  const fetchFeeStructuresAll = async () => {
    try {
      const res = await axios.get(FEE_STRUCT_URL);
      const all = pickArray(res.data);
      setFeeStructuresAll(Array.isArray(all) ? all : []);
    } catch (err) {
      console.error("Error fetching all fee structures:", err);
      setFeeStructuresAll([]);
    }
  };

  const ensureFeeStructCache = async () => {
    if (!feeStructuresAll || feeStructuresAll.length === 0) {
      await fetchFeeStructuresAll();
    }
  };

  // Helper functions to extract values from fee structure items
  const getProgramFromItem = (item) => {
    if (!item) return "";
    return (
      item.program_id ||
      item.prg_id ||
      item.course_id ||
      item.stu_course_id ||
      item.program ||
      item.course ||
      item.prg ||
      ""
    );
  };

  const getAmountFromItem = (item) => {
    if (!item) return 0;
    return (
      item.amount ||
      item.fee_amount ||
      item.cms_fee_amt ||
      item.fee ||
      item.cost ||
      item.price ||
      0
    );
  };

  const getSemNumberFromItem = (item) => {
    if (!item) return "";
    return (
      item.semester ||
      item.sem ||
      item.sem_number ||
      item.semester_number ||
      item.term ||
      item.term_number ||
      ""
    );
  };

  // Compute total fees from fee-structure cache by Program (sum across ALL semesters & heads)
  const computeProgramTotalFromCache = (prgId) => {
    if (!prgId) return 0;
    let total = 0;
    for (const fs of feeStructuresAll) {
      const prog = String(getProgramFromItem(fs) || "").trim().toUpperCase();
      if (prog && prog === String(prgId).trim().toUpperCase()) {
        const n = getAmountFromItem(fs);
        if (Number.isFinite(Number(n))) total += Number(n);
      }
    }
    return Number(total.toFixed(2));
  };

  // Function to fetch semester fee directly from student data
  const fetchSemesterFeeFromStudent = (studentId, semesterNumber) => {
    const student = studentsNorm.find((s) => String(s.stuid) === String(studentId));
    if (!student || !student.semesterFees) {
      console.log(`No semester fees found for student ${studentId}`);
      return 0;
    }
    
    const semFeeKey = `sem${semesterNumber}`;
    const feeAmount = toNum(student.semesterFees[semFeeKey], 0);
    
    console.log(`Fetching semester fee for student ${studentId}, semester ${semesterNumber}: ${feeAmount}`);
    
    return feeAmount;
  };

  // Updated fetchFeeStructureForStudent to prioritize student master data
  const fetchFeeStructureForStudent = async (stuId, semNumber, prgId, opts = { dontOverrideIfHasAmount: false }) => {
    if (!stuId || !semNumber) return;
    
    // First try to get the semester fee directly from student data
    const directFee = fetchSemesterFeeFromStudent(stuId, semNumber);
    
    if (directFee > 0) {
      console.log(`Found semester fee for student ${stuId}, semester ${semNumber}: ${directFee}`);
      
      if (mountedRef.current) {
        setCurrentSemAmount(directFee);
        setSemesterFee(directFee); // Make sure to update this state
        setStructSnapshot({
          mode: "student-master",
          pickedSemester: semNumber,
          pickedProgram: prgId,
          source: "student-master",
        });
      }
      return;
    }
    
    // Only fall back to API if we don't have the semester fees in student master
    //setStructLoading(true);
    //setStructError("Semester fees not found in student master. Trying fee structure API...");
    
    try {
      const res = await axios.get(FEE_STRUCT_URL, {
        params: {
          stuid: stuId,
          student_id: stuId,
          semester: semNumber,
          sem: semNumber,
          current_semester: semNumber,
        },
      });
      const items = pickArray(res.data);
      let best = null;

      for (const it of items) {
        const sem = getSemNumberFromItem(it);
        if (sem && Number(sem) === Number(semNumber)) {
          best = it;
          break;
        }
      }
      if (!best) best = items.find((it) => Number.isFinite(getAmountFromItem(it))) || null;

      if (best) {
        const amt = Number(getAmountFromItem(best) || 0);
        if (mountedRef.current) {
          setCurrentSemAmount(Number.isFinite(amt) ? amt : 0);
          setSemesterFee(Number.isFinite(amt) ? amt : 0);
          setStructSnapshot({
            mode: "direct-api",
            pickedSemester: getSemNumberFromItem(best) || semNumber,
            pickedProgram: getProgramFromItem(best) || prgId || "",
            rawCount: items.length,
          });
        }
        return;
      }
      
      // If API also fails, try fallback
      await ensureFeeStructCache();
      fallbackFeeAmount(prgId, semNumber, true);
    } catch (err) {
      console.error("Fee structure API error:", err);
      setStructError("Could not fetch fee structure from API.");
      await ensureFeeStructCache();
      fallbackFeeAmount(prgId, semNumber, true);
    } finally {
      if (mountedRef.current) setStructLoading(false);
    }
  };

  const fallbackFeeAmount = (prgId, semNumber, updateState = false) => {
    if (!prgId || !semNumber) return 0;
    const list = Array.isArray(feeStructuresAll) ? feeStructuresAll : [];
    const matches = list.filter((it) => {
      const prog = getProgramFromItem(it);
      const sem = getSemNumberFromItem(it);
      return prog && prgId && String(prog).trim().toUpperCase() === String(prgId).trim().toUpperCase() && Number(sem) === Number(semNumber);
    });

    const total = matches.reduce((sum, it) => {
      const n = Number(getAmountFromItem(it));
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);

    if (updateState && mountedRef.current) {
      setCurrentSemAmount(total);
      setSemesterFee(total);
      setStructSnapshot({
        mode: "fallback-cache",
        pickedSemester: Number(semNumber),
        pickedProgram: prgId,
        rawCount: list.length,
        matchedCount: matches.length,
      });
    }
    return total;
  };

  // initial load
  useEffect(() => {
    (async () => {
      await Promise.all([
        fetchStudents(), 
        fetchInvoices(), 
        fetchFeeStructuresAll(), 
        fetchPrograms(),
        fetchStudentAY()
      ]);
    })();
  }, []);

  /* ------------------------- derived data ------------------------- */
  const studentsNorm = useMemo(() => {
    const base = Array.isArray(students) ? students : [];
    const out = [];
    for (const s of base) {
      if (!s.stuid) s.stuid = getNextStudentId(out);
      out.push(s);
    }
    out.sort(
      (a, b) =>
        String(a.stuname || "").localeCompare(String(b.stuname || "")) ||
        String(a.stuid).localeCompare(String(b.stuid))
    );
    return out;
  }, [students]);

  const studentsById = useMemo(() => {
    const m = {};
    for (const s of studentsNorm) m[s.stuid] = s;
    return m;
  }, [studentsNorm]);

  const selectedStudent = useMemo(
    () => studentsNorm.find((s) => String(s.stuid) === String(formData.cms_stu_id)) || null,
    [studentsNorm, formData.cms_stu_id]
  );

  // AY is ALWAYS "YYYY-(YYYY+1)" from the student's admission YEAR (or NA if none)
  // Try to get AY from studentAY API first, then fall back to derived AY
  const derivedAY = useMemo(() => {
    // First try to get AY from the studentAY API
    if (formData.cms_stu_id && studentAY[formData.cms_stu_id]) {
      return studentAY[formData.cms_stu_id];
    }
    
    // Fall back to derived AY from admission date
    const ay = selectedStudent?.stuadmissiondt
      ? deriveAcademicYearFromDate(selectedStudent.stuadmissiondt)
      : "";
    return ay || NA_TERM;
  }, [selectedStudent, formData.cms_stu_id, studentAY]);

  /* ---------------------- First-Sem Lock hooks ---------------------- */
  const isFirstSem = useMemo(() => Number(effectiveSemester) === 1, [effectiveSemester]);

  // If a 1st-sem invoice already exists (or student progressed), treat 1st-sem as locked
  const firstSemLockInfo = useMemo(() => {
    if (!formData.cms_stu_id || !isFirstSem) return { locked: false, amount: 0, invId: null };

    const hasRemarkSem1 = (inv) =>
      String(inv.cmc_stu_fee_remarks || "").toLowerCase().includes("semester: 1");

    const byStu = invoices.filter((i) => String(i.cms_stu_id) === String(formData.cms_stu_id));

    const explicit = byStu.find(hasRemarkSem1);
    const stu = studentsById[formData.cms_stu_id];
    const beyondSem1 = Number(stu?.stu_curr_semester || 1) > 1;
    const anyInvoice = byStu[0] || null;

    if (explicit) {
      return {
        locked: true,
        amount: Number(explicit.cms_fee_amt || 0),
        invId: explicit.cms_stu_inv_id || null,
      };
    }
    if (beyondSem1 && anyInvoice) {
      return {
        locked: true,
        amount: Number(anyInvoice.cms_fee_amt || 0),
        invId: anyInvoice.cms_stu_inv_id || null,
      };
    }
    return { locked: false, amount: 0, invId: null };
  }, [formData.cms_stu_id, isFirstSem, invoices, studentsById]);

  /* ---------------------- Balance helpers ---------------------- */
  const fetchStudentBalance = async (stuId) => {
    if (!stuId) return;
    setBalLoading(true);
    setBalError("");
    try {
      const res = await axios.get(BAL_GET(stuId));
      const bal = Number(res?.data?.balance ?? 0);
      setStudentBalance(Number.isFinite(bal) ? bal : 0);
    } catch (e) {
      console.error("Balance fetch error:", e?.response?.data || e);
      setBalError("Could not fetch balance.");
      setStudentBalance(0);
    } finally {
      setBalLoading(false);
    }
  };

  const updateStudentMasterBalance = async (stuId, value) => {
    if (!stuId) return false;
    try {
      // First try the dedicated balance endpoint
      try {
        const res = await axios.put(
          BAL_PUT,
          { stuid: stuId, balance: Number(value) },
          { headers: { "Content-Type": "application/json" } }
        );
        if (String(res.status).startsWith("2")) {
          setBalances((prev) => ({ ...prev, [stuId]: Number(value) }));
          return true;
        }
      } catch (balanceErr) {
        console.warn("Balance endpoint failed, trying student update endpoint:", balanceErr?.response?.data || balanceErr);
      }
      
      // If balance endpoint fails, try updating the student directly
      const studentUpdateEndpoints = [
        `${config.STUDENT_ROUTE}/update`,
        `${config.STUDENT_ROUTE}/${encodeURIComponent(stuId)}`,
        `${config.STUDENT_ROUTE}/set-balance`,
      ];
      
      const payloads = [
        { stuid: stuId, balance: Number(value) },
        { stuid: stuId, fees_due: Number(value) },
        { student_id: stuId, balance: Number(value) },
        { id: stuId, balance: Number(value) },
      ];
      
      for (const url of studentUpdateEndpoints) {
        for (const body of payloads) {
          try {
            const res = await axios.put(url, body, { headers: { "Content-Type": "application/json" } });
            if (String(res.status).startsWith("2")) {
              setBalances((prev) => ({ ...prev, [stuId]: Number(value) }));
              return true;
            }
          } catch {}
        }
      }
      
      return false;
    } catch (e) {
      console.error("Balance update error:", e?.response?.data || e);
      return false;
    }
  };

  // Best-effort: fetch balances for all students to show in table
  const fetchAllBalances = async (ids = []) => {
    if (!ids.length) return;
    setBalancesLoading(true);
    const chunkSize = 20;
    const map = {};
    try {
      for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const results = await Promise.all(
          slice.map(async (sid) => {
            try {
              const r = await axios.get(BAL_GET(sid));
              const bal = Number(r?.data?.balance ?? NaN);
              return [sid, Number.isFinite(bal) ? bal : null];
            } catch {
              return [sid, null];
            }
          })
        );
        for (const [sid, bal] of results) {
          if (bal !== null) map[sid] = bal;
        }
      }
      if (mountedRef.current) setBalances(map);
    } finally {
      if (mountedRef.current) setBalancesLoading(false);
    }
  };

  // whenever students list is ready, load balances (once — by count)
  useEffect(() => {
    const ids = studentsNorm.map((s) => s.stuid).filter(Boolean);
    if (ids.length) fetchAllBalances(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentsNorm.length]);

  // When student changes, pull AY, semester, etc. then fetch sem amount & balance
  const handleStudentChange = async (e) => {
    const value = e.target.value;
    const s = studentsNorm.find((st) => String(st.stuid) === String(value));

    // Try to get AY from studentAY API first, then fall back to derived AY
    const ay = studentAY[value] || (s?.stuadmissiondt ? deriveAcademicYearFromDate(s.stuadmissiondt) : NA_TERM);
    const cs = s?.stu_curr_semester ? String(s.stu_curr_semester) : "";
    // Normalize program ID to uppercase for consistent matching
    const prg = (s?.stu_course_id || "").toString().toUpperCase();

    // Program TOTAL (prefer Student Master)
    let tf = toNum(s?.semfees, 0);
    let source = "student";
    if (!tf || tf <= 0) {
      await ensureFeeStructCache();
      tf = computeProgramTotalFromCache(prg);
      source = "program-sum";
    }

    // Outstanding & seemfees from Student Master
    const dueFromMaster = toNum(s?.fees_due, 0);
    const seemfeesFromMaster = toNum(s?.seemfees_value, 0);
    const scholarshipFromMaster = toNum(s?.scholrshipfees, 0); // Get scholarship amount

    // Store all semester fees from student master
    setAllSemesterFees(s?.semesterFees || {});
    
    // Debug logging
    console.log("Student semester fees:", s?.semesterFees);
    console.log("Current semester:", cs);

    setCurrentSemester(cs);
    setSelectedSemester(cs); // default invoice semester to student's current
    setProgramId(prg);
    setTotalFees(tf);
    setTotalFeesSource(source);
    setStudentDue(dueFromMaster);
    setStudentSeemfees(seemfeesFromMaster);
    setStudentScholarship(scholarshipFromMaster); // Set scholarship state

    setFormData((prev) => ({
      ...prev,
      cms_stu_id: value,
      cms_term_id: ay || NA_TERM,
    }));

    setIncludePrevDue(false);
    setExtraDueAmt(dueFromMaster || 0);
    setLateFine(0);

    // Get the specific semester fee for the current semester
    const semFeeKey = `sem${cs}`;
    const specificSemFee = toNum(s?.semesterFees?.[semFeeKey], 0);
    setSemesterFee(specificSemFee);
    setCurrentSemAmount(specificSemFee);
    
    console.log("Current semester fee:", specificSemFee);

    // Balance (needed for 2nd+ semester rule)
    await fetchStudentBalance(value);
  };

  const handleSemesterSelect = async (e) => {
    const sem = e.target.value;
    setSelectedSemester(sem);
    
    // Get the specific semester fee for the selected semester from student master
    if (formData.cms_stu_id) {
      // Directly fetch the semester fee from student data
      const semFee = fetchSemesterFeeFromStudent(formData.cms_stu_id, sem);
      setSemesterFee(semFee);
      setCurrentSemAmount(semFee);
      
      // Debug logging
      console.log("Selected semester:", sem);
      console.log("Semester fee:", semFee);
      
      // Update the tuition fee component with the new semester fee
      setFeeComponents(prev => {
        const tuitionIndex = prev.findIndex(comp => comp.id === 'tuition');
        if (tuitionIndex !== -1) {
          const updated = [...prev];
          updated[tuitionIndex] = {
            ...updated[tuitionIndex],
            amount: semFee,
            selected: true
          };
          return updated;
        }
        return prev;
      });
      
      // Set the current semester amount from student master
      setStructSnapshot({
        mode: "student-master",
        pickedSemester: sem,
        pickedProgram: programId,
        source: "student-master",
      });
    }
  };

  // If semester selector changes, refresh FS amount (unless user has overridden)
  useEffect(() => {
    if (!formData.cms_stu_id || !effectiveSemester || !programId) return;
    fetchFeeStructureForStudent(
      formData.cms_stu_id,
      effectiveSemester,
      programId,
      { dontOverrideIfHasAmount: false }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSemester]);

  // ---- Amount composition (base + optional due + scholarship) ----
  const basePayable = Number(formData.cms_fee_amt || 0);
  const addedDue = includePrevDue ? Number(extraDueAmt || 0) + Number(lateFine || 0) : 0;
  const scholarshipAmt = Number(studentScholarship || 0);
  const finalPayable = Number((basePayable + addedDue).toFixed(2));

  /* ---------------- Calculation per your rule ----------------
     - Sem 1 (first-time): due = Total Fees (Student Master) - scholarship - payment
     - Sem 2+ (locked):    due = Current Balance (Student Master) - payment
  ------------------------------------------------------------*/
  const dueAfterThisPayment = useMemo(() => {
    const semNum = Number(effectiveSemester || 0);
    const isSem1 = semNum === 1;
    const treatAsLocked = !isSem1 || firstSemLockInfo.locked;

    const baseForDue = treatAsLocked 
      ? Number(studentBalance || 0) 
      : (Number(totalFees || 0) - Number(studentScholarship || 0));
      
    // Only subtract the tuition fee amount (not the total of all components)
    const tuitionAmount = getTuitionAmount(feeComponents);
    const due = baseForDue - tuitionAmount;
    return due > 0 ? Number(due.toFixed(2)) : 0;
  }, [effectiveSemester, firstSemLockInfo.locked, studentBalance, totalFees, studentScholarship, feeComponents]);

  // Remarks auto-update
  useEffect(() => {
    if (!formData.cms_stu_id) return;

    const tuitionAmount = getTuitionAmount(feeComponents);
    const baseA = `Semester: ${effectiveSemester || "-"}; Amount (Sem ${effectiveSemester || "-"}) = ₹${tuitionAmount.toFixed(2)}`;
    const addBit = includePrevDue
      ? `; + Due Added (incl. fine) = ₹${Number(addedDue || 0).toFixed(2)}; Final = ₹${finalPayable.toFixed(2)}`
      : "";
    const scholarshipBit = studentScholarship > 0 
      ? `; Scholarship Applied: ₹${Number(studentScholarship || 0).toFixed(2)}` 
      : "";
    const finalText = `${baseA}${scholarshipBit}${addBit}; Due after payment: ₹${dueAfterThisPayment.toFixed(2)} (Semester Fee: ₹${Number(semesterFee || 0).toFixed(2)})`;

    setFormData((prev) => ({
      ...prev,
      cmc_stu_fee_remarks: finalText,
    }));
  }, [
    formData.cms_stu_id,
    effectiveSemester,
    feeComponents,
    studentScholarship,
    includePrevDue,
    extraDueAmt,
    finalPayable,
    semesterFee,
    dueAfterThisPayment,
  ]);

  // Auto-fill/clear Payment Date when Payment Completed toggled (DATE ONLY)
  const handlePaidToggle = (e) => {
    const checked = !!e.target.checked;
    const currentDate = new Date();
    setFormData((prev) => ({
      ...prev,
      cmc_fee_is_paid: checked,
      cmc_fee_paiddt: checked ? toLocalDate(currentDate) : "",
    }));
  };

  // Handle payment mode changes with show/hide of txn id
  const handlePaymentModeChange = (e) => {
    const mode = e.target.value;
    setFormData((prev) => {
      const needs = requiresTxnId(mode);
      return {
        ...prev,
        cmc_fee_pymt_mode: mode,
        cmc_fee_trans_id: needs ? prev.cmc_fee_trans_id : "",
      };
    });
  };

  // DOC validation helpers
  const RE_ALNUM = /^[A-Za-z0-9]+$/;
  const RE_AADHAAR = /^\d{12}$/;
  const RE_PAN = /^[A-Z]{5}\d{4}[A-Z]$/;

  const validateDoc = (tdoc, ndoc) => {
    if (!tdoc && !ndoc) return "";
    if (tdoc && !ndoc) return "Enter Document Number.";
    if (ndoc && !RE_ALNUM.test(ndoc)) return "Document Number must be alphanumeric.";
    if (tdoc === "AADHAAR" && ndoc && !RE_AADHAAR.test(ndoc)) return "Aadhaar must be exactly 12 digits.";
    if (tdoc === "PAN" && ndoc && !RE_PAN.test(ndoc)) return "PAN must match AAAAA9999A.";
    if (tdoc && !["AADHAAR", "PAN"].includes(tdoc) && ndoc && (ndoc.length < 4 || ndoc.length > 32)) {
      return "Document Number must be 4–32 characters for this type.";
    }
    return "";
  };

  // table data
  const filteredInvoices = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const list = !q
      ? invoices
      : invoices.filter((inv) => {
          const a = inv.cms_stu_id?.toString().toLowerCase() ?? "";
          const b = inv.cms_fee_head?.toLowerCase() ?? "";
          const c = inv.cms_stu_inv_id?.toLowerCase() ?? "";
          const d = inv.tdoc?.toLowerCase() ?? "";
          const e = inv.ndoc?.toLowerCase() ?? "";
          return a.includes(q) || b.includes(q) || c.includes(q) || d.includes(q) || e.includes(q);
        });
    // Sort by due date (newest first), then by invoice id desc
    return list.slice().sort((x, y) => {
      const xd = new Date(toISODate(x.cms_due_dt) || 0).getTime();
      const yd = new Date(toISODate(y.cms_due_dt) || 0).getTime();
      if (xd > yd) return -1;
      if (xd < yd) return 1;
      return String(y.cms_stu_inv_id).localeCompare(String(x.cms_stu_inv_id));
    });
  }, [invoices, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredInvoices.slice(start, start + pageSize);
  }, [filteredInvoices, pageSize, safePage]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  /* ---------------------- Student Master updates ---------------------- */

  const updateStudentMasterDue = async (stuId, dueValue) => {
    if (!stuId) return false;
    const endpoints = [
      `${config.STUDENT_ROUTE}/update-fees`,
      `${config.STUDENT_ROUTE}/update`,
      `${config.STUDENT_ROUTE}/${encodeURIComponent(stuId)}`,
      `${config.STUDENT_ROUTE}/set-fees`,
    ];

    const payloads = [
      { stuid: stuId, due_amount: dueValue },
      { stuid: stuId, fees_due: dueValue },
      { stuid: stuId, balance_due: dueValue },
      { stuid: stuId, semfees_due: dueValue },
      { stuid: stuId, remaining_fees: dueValue },
      { stuid: stuId, outstanding: dueValue },
    ];

    for (const url of endpoints) {
      for (const body of payloads) {
        try {
          try {
            const r = await axios.patch(url, body, { headers: { "Content-Type": "application/json" } });
            if (String(r.status).startsWith("2")) return true;
          } catch {}
          try {
            const r = await axios.put(url, body, { headers: { "Content-Type": "application/json" } });
            if (String(r.status).startsWith("2")) return true;
          } catch {}
          try {
            const r = await axios.post(url, body, { headers: { "Content-Type": "application/json" } });
            if (String(r.status).startsWith("2")) return true;
          } catch {}
        } catch {}
      }
    }
    return false;
  };


// New: settle a semester (zero semN and reduce balance server-side)
const settleSemester = async (stuId, semNum, amt) => {
  if (!stuId || !Number.isFinite(semNum)) return false;
  try {
    const url = `${config.STUDENT_ROUTE}/settle-semester`; // backend Part 1 route
    const res = await axios.post(
      url,
      { stuid: String(stuId), semester: Number(semNum), amount: Number(amt) },
      { headers: { "Content-Type": "application/json" } }
    );
    return String(res.status).startsWith("2");
  } catch (e) {
    console.warn("settleSemester failed:", e?.response?.data || e);
    return false;
  }
};



  const updateStudentSemester = async (stuId, nextSem) => {
    if (!stuId || !nextSem) return false;
    const endpoints = [
      `${config.STUDENT_ROUTE}/update`,
      `${config.STUDENT_ROUTE}/${encodeURIComponent(stuId)}`,
      `${config.STUDENT_ROUTE}/set-semester`,
    ];
    const payloads = [
      { stuid: stuId, stu_curr_semester: Number(nextSem) },
      { stuid: stuId, current_semester: Number(nextSem) },
      { stuid: stuId, semester_no: Number(nextSem) },
      { stuid: stuId, sem: Number(nextSem) },
    ];

    for (const url of endpoints) {
      for (const body of payloads) {
        try {
          try {
            const r = await axios.patch(url, body, { headers: { "Content-Type": "application/json" } });
            if (String(r.status).startsWith("2")) return true;
          } catch {}
          try {
            const r = await axios.put(url, body, { headers: { "Content-Type": "application/json" } });
            if (String(r.status).startsWith("2")) return true;
          } catch {}
          try {
            const r = await axios.post(url, body, { headers: { "Content-Type": "application/json" } });
            if (String(r.status).startsWith("2")) return true;
          } catch {}
        } catch {}
      }
    }
    return false;
  };

  /* ---------------------- 6-month auto-next-sem invoice ---------------------- */

  const getAmountForSem = async (stuId, semNumber, prgId) => {
    // First try to get from student master
    const student = studentsNorm.find((s) => String(s.stuid) === String(stuId));
    if (student && student.semesterFees) {
      const semFeeKey = `sem${semNumber}`;
      const feeAmount = toNum(student.semesterFees[semFeeKey], 0);
      if (feeAmount > 0) return feeAmount;
    }
    
    // Fall back to API if not found in student master
    try {
      const res = await axios.get(FEE_STRUCT_URL, {
        params: { 
          stuid: stuId, 
          semester: semNumber, 
          sem: semNumber, 
          current_semester: semNumber, 
          program_id: prgId, 
          prg_id: prgId 
        },
      });
      const items = pickArray(res.data);
      const exact = items.find((it) => Number(getSemNumberFromItem(it)) === Number(semNumber));
      const pick = exact || items.find((it) => Number.isFinite(getAmountFromItem(it)));
      if (pick) {
        const n = Number(getAmountFromItem(pick));
        if (Number.isFinite(n)) return n;
      }
    } catch {}
    await ensureFeeStructCache();
    const list = feeStructuresAll.filter(
      (it) =>
        String(getProgramFromItem(it)).trim().toUpperCase() === String(prgId).trim().toUpperCase() &&
        Number(getSemNumberFromItem(it)) === Number(semNumber)
    );
    return list.reduce((s, it) => {
      const n = Number(getAmountFromItem(it));
      return Number.isFinite(n) ? s + n : 0;
    }, 0);
  };

  const getLatestRelevantDateForStudent = (stuId) => {
    const items = invoices
      .filter((i) => String(i.cms_stu_id) === String(stuId))
      .map((i) => ({
        paid: i.cmc_fee_paiddt ? toISODate(i.cmc_fee_paiddt) : null,
        due: i.cms_due_dt ? toISODate(i.cms_due_dt) : null,
      }));

    let latest = null;
    for (const it of items) {
      const d = it.paid || it.due;
      if (d && (!latest || new Date(d) > new Date(latest))) latest = d;
    }
    return latest;
  };

  const maybeGenerateNextSemesterInvoice = async (stuId) => {
    const student = studentsNorm.find((s) => String(s.stuid) === String(stuId));
    if (!student) return;

    const lastDate = getLatestRelevantDateForStudent(stuId) || toISODate(student.stuadmissiondt) || toISODate(new Date());
    const today = toISODate(new Date());
    const diffDays = daysBetween(lastDate, today);

    if (diffDays < 182) return;

    const curr = Number(student.stu_curr_semester || 1);
    const nextSem = curr + 1;

    // Get the specific semester fee from student master first
    const semFeeKey = `sem${nextSem}`;
    const amt = toNum(student?.semesterFees?.[semFeeKey], 0);
    
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast("Next semester amount not found; invoice not generated.", "error");
      return;
    }

    const maxNum = invoices
      .map((inv) => {
        const n = String(inv.cms_stu_inv_id || "").match(/\d+$/)?.[0];
        return n ? parseInt(n, 10) : 0;
      })
      .reduce((a, b) => Math.max(a, b), 0);
    const nextInvId = `INV-${pad(maxNum + 1)}`;

    // Try to get AY from studentAY API first, then fall back to derived AY
    const ay = studentAY[stuId] || deriveAcademicYearFromDate(student.stuadmissiondt) || NA_TERM;

    const payload = {
      cms_stu_inv_id: nextInvId,
      cms_stu_id: stuId,
      cms_term_id: ay,
      cms_fee_head: "Tuition Fee",
      cms_fee_amt: Number(amt),
      cms_due_dt: null,
      cmc_fee_is_paid: false,
      cmc_fee_paiddt: null, // DATE string when paid; null here
      cmc_fee_pymt_mode: "",
      cmc_fee_trans_id: "",
      cmc_stu_fee_remarks: `Auto-generated for Semester ${nextSem} (6-month rule).`,
      tdoc: null,
      ndoc: null,
    };

    try {
      await axios.post(API_URL, payload, { headers: { "Content-Type": "application/json" } });
      showToast(`Next semester invoice generated (Sem ${nextSem}).`);
      await fetchInvoices();
    } catch (err) {
      console.error("Auto-generate next-sem invoice failed:", err?.response?.data || err);
      showToast("Could not auto-generate next-semester invoice.", "error");
    }

    const bumped = await updateStudentSemester(stuId, nextSem);
    if (bumped) {
      setStudents((prev) =>
        prev.map((s) =>
          String(s.stuid) === String(stuId) ? { ...s, stu_curr_semester: nextSem } : s
        )
      );
    }
  };

  /* ---------------------- form helpers ---------------------- */
  function emptyForm(NA_VAL = "NA") {
    return {
      cms_stu_inv_id: "",
      cms_stu_id: "",
      cms_term_id: NA_VAL,
      cms_fee_head: "",
      cms_fee_amt: "",
      cms_due_dt: "",
      cmc_fee_is_paid: false,
      cmc_fee_paiddt: "", // DATE ONLY
      cmc_fee_pymt_mode: "",
      cmc_fee_trans_id: "",
      cmc_stu_fee_remarks: "",
      // NEW doc fields
      tdoc: "",
      ndoc: "",
    };
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Document number/client-side normalization
    if (name === "tdoc") {
      const nextTdoc = value;
      setFormData((prev) => {
        let nextNdoc = prev.ndoc || "";
        if (nextTdoc === "PAN" && nextNdoc) nextNdoc = nextNdoc.toUpperCase().replace(/[^A-Za-z0-9]/g, "");
        if (nextTdoc === "AADHAAR" && nextNdoc) nextNdoc = nextNdoc.replace(/[^0-9]/g, "").slice(0, 12);
        return { ...prev, tdoc: nextTdoc, ndoc: nextNdoc };
      });
      setDocError(validateDoc(value, formData.ndoc));
      return;
    }
    if (name === "ndoc") {
      setFormData((prev) => {
        let v = String(value || "");
        if (prev.tdoc === "PAN") v = v.toUpperCase();
        v = v.replace(/[^A-Za-z0-9]/g, "");
        if (prev.tdoc === "AADHAAR") v = v.replace(/[^0-9]/g, "").slice(0, 12);
        return { ...prev, ndoc: v };
      });
      setDocError(validateDoc(formData.tdoc, String(value || "")));
      return;
    }

    if (name === "cmc_fee_pymt_mode") {
      handlePaymentModeChange(e);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? !!checked : value,
    }));
  };

  const resetForm = () => {
    setFormData(emptyForm(NA_TERM));
    setCurrentSemester("");
    setSelectedSemester("");
    setTotalFees(0);
    setTotalFeesSource("student");
    setProgramId("");
    setCurrentSemAmount(0);
    setStructSnapshot(null);
    setStudentDue(0);
    setStudentSeemfees(0);
    setStudentScholarship(0);
    setStudentBalance(0);
    setSemesterFee(0); // Reset semester fee
    setAllSemesterFees({}); // Reset all semester fees
    setDocError("");
    setIncludePrevDue(false);
    setExtraDueAmt(0);
    setLateFine(0);
    setEditInvoice(null);
    setIsModalOpen(false);
    setFeeComponents(prev => 
      prev.map(comp => ({ ...comp, selected: false, amount: 0 }))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // guard: if paid is checked, require payment mode and auto-set DATE if empty
    let fd = { ...formData };

    // Document validations
    const docMsg = validateDoc(fd.tdoc, fd.ndoc);
    if (docMsg) {
      setDocError(docMsg);
      showToast(docMsg, "error");
      return;
    }

    if (fd.cmc_fee_is_paid) {
      if (!fd.cmc_fee_pymt_mode) {
        showToast("Select a Payment Mode for completed payments.", "error");
        return;
      }
      if (requiresTxnId(fd.cmc_fee_pymt_mode) && !String(fd.cmc_fee_trans_id || "").trim()) {
        showToast("Enter the required reference/transaction number.", "error");
        return;
      }
      if (!fd.cmc_fee_paiddt) {
        const currentDate = new Date();
        fd.cmc_fee_paiddt = toLocalDate(currentDate);
      }
    } else {
      fd.cmc_fee_paiddt = "";
      fd.cmc_fee_trans_id = "";
    }

    if (!requiresTxnId(fd.cmc_fee_pymt_mode)) {
      fd.cmc_fee_trans_id = "";
    }

    // FINAL amount to store on invoice (base + optional added due)
    const payload = {
      ...fd,
      cms_term_id: derivedAY || NA_TERM,
      cms_fee_amt: Number.isFinite(finalPayable) ? finalPayable : (fd.cms_fee_amt === "" ? null : Number(fd.cms_fee_amt)),
      cms_due_dt: fd.cms_due_dt || null,
      cmc_fee_paiddt: fd.cmc_fee_paiddt || null,
      cmc_fee_is_paid: !!fd.cmc_fee_is_paid,
    };

    try {
      if (editInvoice) {
        await axios.put(joinUrl(API_URL, fd.cms_stu_inv_id), payload, {
          headers: { "Content-Type": "application/json" },
        });
        showToast("Invoice updated.");
      } else {
        await axios.post(API_URL, payload, {
          headers: { "Content-Type": "application/json" },
        });
        showToast("Invoice created.");
      }

      // ---------- Compute due using your rule ----------
const semNum = Number(effectiveSemester || 0);
const isSem1 = semNum === 1;
const treatAsLocked = !isSem1 || firstSemLockInfo.locked;

const baseForDue = treatAsLocked
  ? Number(studentBalance || 0)              // 2nd+ (or already locked 1st): subtract from BALANCE
  : (Number(totalFees || 0) - Number(studentScholarship || 0)); // first-time 1st sem: subtract from TOTAL FEES - SCHOLARSHIP

// Only subtract the tuition fee amount (not the total of all components)
const tuitionAmount = getTuitionAmount(feeComponents);
const dueNow = Number((baseForDue - tuitionAmount).toFixed(2));
const sanitizedDue = Math.max(0, dueNow);

// Update Student Master due (for display + consistency)
const dueUpdated = await updateStudentMasterDue(payload.cms_stu_id, sanitizedDue);
setStudentDue(sanitizedDue);

if (!dueUpdated) {
  console.warn("⚠️ Could not update Student Master due via known endpoints.");
}

// >>> NEW: if this invoice is PAID, settle the semester on the server
// This zeros sem{N} and atomically reduces 'balance' by the semester amount.
if (payload.cmc_fee_is_paid && semNum > 0) {
  await settleSemester(payload.cms_stu_id, semNum, tuitionAmount);
}

// Always refresh the authoritative balance from backend (after possible settle)
await fetchStudentBalance(payload.cms_stu_id);

// (Removed the manual balance PUT via updateStudentMasterBalance(...)
//  because the server now owns balance math during settlement.)

await fetchStudents();

      await fetchInvoices();

      resetForm();
      await maybeGenerateNextSemesterInvoice(payload.cms_stu_id);
    } catch (err) {
      console.error("❌ Error saving invoice:", err?.response?.data || err.message);
      const msg = err?.response?.data?.error || "Failed to save invoice.";
      showToast(msg, "error");
    }
  };

  const handleEdit = (invoice) => {
    const studentForInv = studentsNorm.find((s) => String(s.stuid) === String(invoice.cms_stu_id));
    // Try to get AY from studentAY API first, then fall back to derived AY
    const ay = studentAY[invoice.cms_stu_id] || 
               (studentForInv?.stuadmissiondt
                ? deriveAcademicYearFromDate(studentForInv.stuadmissiondt)
                : (invoice.cms_term_id || NA_TERM));

    let tf = toNum(studentForInv?.semfees, 0);
    let source = "student";
    if (!tf || tf <= 0) {
      tf = computeProgramTotalFromCache(studentForInv?.stu_course_id || "");
      source = "program-sum";
    }

    const csNow = studentForInv?.stu_curr_semester ? String(studentForInv.stu_curr_semester) : "";

    // Get the specific semester fee
    const semFeeKey = `sem${csNow}`;
    const specificSemFee = toNum(studentForInv?.semesterFees?.[semFeeKey], 0);
    
    // Store all semester fees from student master
    setAllSemesterFees(studentForInv?.semesterFees || {});

    setCurrentSemester(csNow);
    setSelectedSemester(csNow); // default to current when opening editor
    setTotalFees(tf);
    setTotalFeesSource(source);
    setProgramId(studentForInv?.stu_course_id || "");
    setStudentDue(toNum(studentForInv?.fees_due, 0));
    setStudentSeemfees(toNum(studentForInv?.seemfees_value, 0));
    setStudentScholarship(toNum(studentForInv?.scholrshipfees, 0)); // Set scholarship from student
    setSemesterFee(specificSemFee); // Set the specific semester fee

    setIncludePrevDue(false);
    setExtraDueAmt(toNum(studentForInv?.fees_due, 0));
    setLateFine(toNum(studentForInv?.fees_due, 0));

    const currentDate = new Date();
    const autoPaidDate = invoice.cmc_fee_is_paid
      ? (toISODate(invoice.cmc_fee_paiddt) || toLocalDate(currentDate))
      : toISODate(invoice.cmc_fee_paiddt);

    setEditInvoice(invoice);
    setFormData({
      cms_stu_inv_id: invoice.cms_stu_inv_id || "",
      cms_stu_id: invoice.cms_stu_id || "",
      cms_term_id: ay || NA_TERM,
      cms_fee_head: invoice.cms_fee_head || "",
      cms_fee_amt: invoice.cms_fee_amt ?? "",
      cms_due_dt: toISODate(invoice.cms_due_dt),
      cmc_fee_is_paid: !!invoice.cmc_fee_is_paid,
      cmc_fee_paiddt: autoPaidDate, // DATE ONLY
      cmc_fee_pymt_mode: invoice.cmc_fee_pymt_mode || "",
      cmc_fee_trans_id: invoice.cmc_fee_trans_id || "",
      cmc_stu_fee_remarks: invoice.cmc_stu_fee_remarks || "",
      tdoc: invoice.tdoc || "",
      ndoc: invoice.ndoc || "",
    });
    setDocError("");

    // Set tuition fee component when editing
    setFeeComponents(prev => 
      prev.map(comp => 
        comp.id === 'tuition' 
          ? { ...comp, selected: true, amount: displaySeemfees } 
          : comp
      )
    );

    if (invoice.cms_stu_id) {
      fetchFeeStructureForStudent(
        invoice.cms_stu_id,
        csNow,
        studentForInv?.stu_course_id,
        { dontOverrideIfHasAmount: false }
      );
      fetchStudentBalance(invoice.cms_stu_id);
    }
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    const maxNum = invoices
      .map((inv) => {
        const n = String(inv.cms_stu_inv_id || "").match(/\d+$/)?.[0];
        return n ? parseInt(n, 10) : 0;
      })
      .reduce((a, b) => Math.max(a, b), 0);

    const nextId = `INV-${pad(maxNum + 1)}`;

    setEditInvoice(null);
    setCurrentSemester("");
    setSelectedSemester("");
    setTotalFees(0);
    setTotalFeesSource("student");
    setProgramId("");
    setCurrentSemAmount(0);
    setStructSnapshot(null);
    setStudentDue(0);
    setStudentSeemfees(0);
    setStudentScholarship(0);
    setStudentBalance(0);
    setSemesterFee(0); // Reset semester fee
    setAllSemesterFees({}); // Reset all semester fees
    setDocError("");
    setIncludePrevDue(false);
    setExtraDueAmt(0);
    setLateFine(0);
    
    // Set tuition fee component when adding new invoice
    setFeeComponents(prev => 
      prev.map(comp => 
        comp.id === 'tuition' 
          ? { ...comp, selected: true, amount: displaySeemfees } 
          : comp
      )
    );
    
    setFormData({
      ...emptyForm(NA_TERM),
      cms_stu_inv_id: nextId,
    });
    setIsModalOpen(true);
  };

  /* ------------------------- helpers ------------------------- */
  const getStudentName = (id) => {
    const s = studentsById[id];
    return s ? `${s.stuname} (${s.stuid})` : id || "—";
  };
  const getTermName = (id) => (id ? String(id) : NA_TERM);
  const getDisplayBalance = (stuid) => {
    if (stuid in balances && balances[stuid] !== null && balances[stuid] !== undefined) {
      return Number(balances[stuid] || 0);
    }
    const s = studentsById[stuid];
    return Number(s?.balance || 0);
  };

  // Get program description by ID
  const getProgramDescription = (progId) => {
    if (!progId) return "—";
    
    // Try to find the program in the mapping
    const description = programs[progId] || programs[progId.toUpperCase()] || programs[progId.toLowerCase()];
    
    // If we found a description that's not just the ID, return it
    if (description && description !== progId) {
      return description;
    }
    
    // If we still have a code-like value, try to make it more readable
    if (typeof progId === 'string') {
      // Try to extract from common patterns
      const match = progId.match(/^([A-Z]{2,4})_(\d{3})(?:_[A-Z0-9]+)?$/);
      if (match) {
        const [, prefix, number] = match;
        // Common program code patterns
        const codePatterns = {
          'CRS_001': 'B.Tech CSE',
          'CRS_003': 'B.Tech ECE',
          'CRS_007': 'B.Tech ME',
          'CRS_009': 'MBA',
          'CRS_013': 'B.Tech CE',
          'CRS_028': 'B.Tech EEE',
          'CRS_310': 'B.Tech AIDS',
          'CRS_101': 'Diploma ME',
          'CRS_102': 'Diploma CST',
          'CRS_103': 'Diploma ETC',
          'CRS_104': 'Diploma CE',
          'CRS_105': 'Diploma EE',
          'PROG_001': 'Bachelor of Computer Applications',
          'PROG_002': 'Master of Computer Applications',
          'PROG_003': 'Bachelor of Technology',
          'PROG_004': 'Master of Technology',
          'PROG_005': 'Bachelor of Business Administration',
          'PROG_006': 'Master of Business Administration',
        };
        
        const codeKey = `${prefix}_${number}`;
        if (codePatterns[codeKey]) {
          return codePatterns[codeKey];
        }
      }
      
      // If it's a code format like "CRS-001", return a generic name
      if (/^[A-Z]{2,4}-\d{3}$/.test(progId)) {
        return "Program";
      }
    }
    
    return description || progId || "—";
  };

  const ordinal = (n) => {
    const map = {1:"1st",2:"2nd",3:"3rd",4:"4th",5:"5th",6:"6th",7:"7th",8:"8th"};
    return map[n] || String(n);
  };

  // Helper to extract semester from remarks
  const extractSemesterFromRemarks = (remarks) => {
    if (!remarks) return null;
    const match = remarks.match(/Semester:\s*(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  };

/* ------------------ PRINT: real invoice section (improved) ------------------ */
const buildInvoiceHTML = ({
  invId,
  stuName,
  stuId,
  prog,
  ay,
  feeHead,
  baseAmount,
  showAddedDue = false,
  addedDue = 0,
  totalAmount,
  dueDt,
  paidOn,
  payMode,
  txnId,
  statusPaid,
  semesterTxt,
  remarks,
  dueAfter,
  scholarship = 0,
  feeComponents = []
}) => {
  const fmtMoney = (n) =>
    (isFinite(n) ? new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) : "0.00");

  const baseAmt = Number(baseAmount || 0);
  const addAmt = Number(addedDue || 0);
  const total = Number((totalAmount ?? (baseAmt + (showAddedDue ? addAmt : 0))) || 0);
  const dueAfterSafe = typeof dueAfter === "number" ? Math.max(0, dueAfter) : null;
  const scholarshipAmt = Number(scholarship || 0);

  // Get program description with enhanced fallback
  let programLabel = getProgramDescription(prog);
  
  // If we still have a code-like value, try to make it more readable
  if (programLabel === prog && typeof prog === 'string') {
    // Convert codes like "CRS_001_S01" to "CRS-001"
    programLabel = prog.replace(/_/g, '-');
    
    // If it's still not readable, just show "Program"
    if (/^[A-Z]{2,4}-\d{3}/.test(programLabel)) {
      programLabel = "Program";
    }
  }

  // Build component rows - ensure all components are displayed
  let componentRows = '';
  
  // First, add all selected components
  if (feeComponents && feeComponents.length > 0) {
    feeComponents.forEach(comp => {
      if (comp.selected) {
        componentRows += `
          <tr>
            <td>${comp.label}</td>
            <td class="right">${comp.isDeduction ? '-' : ''}₹ ${fmtMoney(comp.amount)}</td>
          </tr>
        `;
      }
    });
  } else {
    // If no components are provided, try to extract from remarks or use default components
    // This is a fallback for invoices printed from the table
    componentRows += `
      <tr>
        <td>${feeHead || "Fee Payment"}</td>
        <td class="right">₹ ${fmtMoney(baseAmt)}</td>
      </tr>
    `;
    
    // Add scholarship if applicable
    if (scholarshipAmt > 0) {
      componentRows += `
        <tr>
          <td>Scholarship</td>
          <td class="right">-₹ ${fmtMoney(scholarshipAmt)}</td>
        </tr>
      `;
    }
    
    // Add additional due if applicable
    if (showAddedDue && addAmt > 0) {
      componentRows += `
        <tr>
          <td>Additional Due (incl. fine)</td>
          <td class="right">₹ ${fmtMoney(addAmt)}</td>
        </tr>
      `;
    }
  }

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Format amount in words
  const amountInWords = (amount) => {
    // Simple implementation for amount in words
    const num = Math.floor(amount);
    if (num === 0) return "Zero";
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    
    const convertLessThanThousand = (num) => {
      let result = '';
      
      if (num >= 100) {
        result += ones[Math.floor(num / 100)] + ' Hundred ';
        num %= 100;
      }
      
      if (num >= 20) {
        result += tens[Math.floor(num / 10)] + ' ';
        num %= 10;
      }
      
      if (num >= 10) {
        result += teens[num - 10] + ' ';
        num = 0;
      }
      
      if (num > 0) {
        result += ones[num] + ' ';
      }
      
      return result.trim();
    };
    
    if (num >= 100000) {
      return convertLessThanThousand(Math.floor(num / 100000)) + ' Lakh ' + convertLessThanThousand(num % 100000);
    } else if (num >= 1000) {
      return convertLessThanThousand(Math.floor(num / 1000)) + ' Thousand ' + convertLessThanThousand(num % 1000);
    } else {
      return convertLessThanThousand(num);
    }
  };

  const totalInWords = amountInWords(total) + " Rupees Only";

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Fee Receipt ${invId}</title>
<style>
  @page {
    size: A5 landscape;
    margin: 1mm;
  }
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f8f9fa;
    color: #333;
    line-height: 1.1;
    font-size: 7px;
  }
  
  .page-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  
  .receipt-row {
    display: flex;
    flex: 1;
    justify-content: space-between;
    gap: 4px;
    padding: 2px;
  }
  
  .receipt {
    width: 32%;
    background-color: white;
    border-radius: 3px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    padding: 5px;
    font-size: 6px;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }
  
  .receipt::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background: linear-gradient(90deg, #4f46e5, #7c3aed);
  }
  
  .header {
    text-align: center;
    padding-bottom: 4px;
    margin-bottom: 4px;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .header h1 {
    margin: 0 0 2px 0;
    font-size: 9px;
    font-weight: 700;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.2px;
  }
  
  .header p {
    margin: 1px 0;
    font-size: 5px;
    color: #64748b;
  }
  
  .receipt-title {
    text-align: center;
    font-size: 8px;
    font-weight: 700;
    margin: 3px 0;
    color: #4f46e5;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    position: relative;
    display: inline-block;
    width: 100%;
  }
  
  .receipt-title::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 25%;
    width: 50%;
    height: 1px;
    background-color: #4f46e5;
  }
  
  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 2px;
    font-size: 6px;
  }
  
  .info-row > div:first-child {
    color: #64748b;
    font-weight: 500;
  }
  
  .info-row > div:last-child {
    font-weight: 600;
    color: #1e293b;
  }
  
  .section {
    margin-bottom: 4px;
  }
  
  .section-title {
    font-weight: 700;
    margin-bottom: 2px;
    color: #1e293b;
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    position: relative;
    padding-left: 4px;
  }
  
  .section-title::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 50%;
    background-color: #4f46e5;
    border-radius: 1px;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 3px;
    font-size: 6px;
  }
  
  th, td {
    padding: 2px 1px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }
  
  th {
    background-color: #f8fafc;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    font-size: 5px;
    letter-spacing: 0.2px;
  }
  
  .right {
    text-align: right;
  }
  
  .total-row {
    font-weight: 700;
    background-color: #f8fafc;
  }
  
  .total-row td {
    border-bottom: 1px solid #e5e7eb;
    color: #1e293b;
  }
  
  .amount-in-words {
    font-style: italic;
    margin-top: 2px;
    font-size: 5px;
    color: #64748b;
    padding: 2px;
    background-color: #f8fafc;
    border-radius: 2px;
  }
  
  .footer {
    margin-top: 4px;
    padding-top: 3px;
    border-top: 1px solid #e5e7eb;
    font-size: 4px;
    color: #64748b;
  }
  
  .signature {
    margin-top: 6px;
    display: flex;
    justify-content: space-between;
  }
  
  .signature-box {
    width: 50px;
    text-align: center;
    padding-top: 2px;
    font-size: 5px;
    color: #64748b;
    position: relative;
  }
  
  .signature-box::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 0.5px;
    background-color: #94a3b8;
  }
  
  .status-badge {
    display: inline-block;
    padding: 1px 3px;
    border-radius: 8px;
    font-size: 5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.2px;
  }
  
  .status-paid {
    background-color: #dcfce7;
    color: #166534;
  }
  
  .status-pending {
    background-color: #fef3c7;
    color: #92400e;
  }
  
  @media print {
    body { 
      background-color: white; 
    }
    .receipt { 
      box-shadow: none; 
    }
  }
</style>
</head>
<body>
  <div class="page-container">
    <div class="receipt-row">
      <!-- First Receipt Copy -->
      <div class="receipt">
        <div class="header">
          <h1>${config?.COLLEGE_NAME || "SWAMI VIVEKANANDA INSTITUTE OF TECHNOLOGY"}</h1>
          <p>${config?.COLLEGE_ADDRESS || "Dakshin Gobindapur Rd, Dakshin Gobindopur, Rajpur Sonarpur, Jaynagar, West Bengal 700145"}</p>
          <p>Phone: ${config?.COLLEGE_PHONE || "033 2437 9913"}</p>
        </div>

        <div class="receipt-title">FEE RECEIPT (Bank Copy)</div>
        
        <div class="info-row">
          <div>Receipt No:</div>
          <div>${invId}</div>
        </div>
        
        <div class="info-row">
          <div>Date:</div>
          <div>${formatDate(new Date())}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Student Details</div>
          <div class="info-row">
            <div>Name:</div>
            <div>${stuName || "—"}</div>
          </div>
          <div class="info-row">
            <div>ID:</div>
            <div>${stuId || "—"}</div>
          </div>
          <div class="info-row">
            <div>Course:</div>
            <div>${programLabel}</div>
          </div>
          <div class="info-row">
            <div>Batch:</div>
            <div>${ay || "—"}</div>
          </div>
          <div class="info-row">
            <div>Semester:</div>
            <div>${semesterTxt || "—"}</div>
          </div>
          <div class="info-row">
            <div>Status:</div>
            <div><span class="status-badge ${statusPaid ? "status-paid" : "status-pending"}">${statusPaid ? "PAID" : "PENDING"}</span></div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Payment Details</div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${componentRows}
              <tr class="total-row">
                <td>Total</td>
                <td class="right">₹ ${fmtMoney(total)}</td>
              </tr>
            </tbody>
          </table>
          <div class="amount-in-words"><strong>Amount in Words:</strong> ${totalInWords}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Payment Information</div>
          <div class="info-row">
            <div>Payment Mode:</div>
            <div>${payMode || "—"}</div>
          </div>
          <div class="info-row">
            <div>Transaction ID:</div>
            <div>${txnId || "—"}</div>
          </div>
          <div class="info-row">
            <div>Due Date:</div>
            <div>${formatDate(dueDt) || "—"}</div>
          </div>
          <div class="info-row">
            <div>Paid On:</div>
            <div>${formatDate(paidOn) || (statusPaid ? formatDate(new Date()) : "—")}</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Remarks</div>
          <div>${remarks || "-"}</div>
        </div>
        
        <div class="footer">
          <div><strong>Contact:</strong> ${config?.COLLEGE_PHONE || "033 2437 9913"}</div>
          <div><strong>Email:</strong> ${config?.COLLEGE_EMAIL || "info@svist.edu"}</div>
          <div><strong>Website:</strong> ${config?.COLLEGE_WEBSITE || "www.svist.edu"}</div>
        </div>
        
        <div class="signature">
          <div class="signature-box">Student Signature</div>
          <div class="signature-box">Authorized Signature</div>
        </div>
      </div>
      
      <!-- Second Receipt Copy -->
      <div class="receipt">
        <div class="header">
          <h1>${config?.COLLEGE_NAME || "SWAMI VIVEKANANDA INSTITUTE OF TECHNOLOGY"}</h1>
          <p>${config?.COLLEGE_ADDRESS || "Dakshin Gobindapur Rd, Dakshin Gobindopur, Rajpur Sonarpur, Jaynagar, West Bengal 700145"}</p>
          <p>Phone: ${config?.COLLEGE_PHONE || "033 2437 9913"}</p>
        </div>

        <div class="receipt-title">FEE RECEIPT (Student Copy)</div>
        
        <div class="info-row">
          <div>Receipt No:</div>
          <div>${invId}</div>
        </div>
        
        <div class="info-row">
          <div>Date:</div>
          <div>${formatDate(new Date())}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Student Details</div>
          <div class="info-row">
            <div>Name:</div>
            <div>${stuName || "—"}</div>
          </div>
          <div class="info-row">
            <div>ID:</div>
            <div>${stuId || "—"}</div>
          </div>
          <div class="info-row">
            <div>Course:</div>
            <div>${programLabel}</div>
          </div>
          <div class="info-row">
            <div>Batch:</div>
            <div>${ay || "—"}</div>
          </div>
          <div class="info-row">
            <div>Semester:</div>
            <div>${semesterTxt || "—"}</div>
          </div>
          <div class="info-row">
            <div>Status:</div>
            <div><span class="status-badge ${statusPaid ? "status-paid" : "status-pending"}">${statusPaid ? "PAID" : "PENDING"}</span></div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Payment Details</div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${componentRows}
              <tr class="total-row">
                <td>Total</td>
                <td class="right">₹ ${fmtMoney(total)}</td>
              </tr>
            </tbody>
          </table>
          <div class="amount-in-words"><strong>Amount in Words:</strong> ${totalInWords}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Payment Information</div>
          <div class="info-row">
            <div>Payment Mode:</div>
            <div>${payMode || "—"}</div>
          </div>
          <div class="info-row">
            <div>Transaction ID:</div>
            <div>${txnId || "—"}</div>
          </div>
          <div class="info-row">
            <div>Due Date:</div>
            <div>${formatDate(dueDt) || "—"}</div>
          </div>
          <div class="info-row">
            <div>Paid On:</div>
            <div>${formatDate(paidOn) || (statusPaid ? formatDate(new Date()) : "—")}</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Remarks</div>
          <div>${remarks || "-"}</div>
        </div>
        
        <div class="footer">
          <div><strong>Contact:</strong> ${config?.COLLEGE_PHONE || "033 2437 9913"}</div>
          <div><strong>Email:</strong> ${config?.COLLEGE_EMAIL || "info@svist.edu"}</div>
          <div><strong>Website:</strong> ${config?.COLLEGE_WEBSITE || "www.svist.edu"}</div>
        </div>
        
        <div class="signature">
          <div class="signature-box">Student Signature</div>
          <div class="signature-box">Authorized Signature</div>
        </div>
      </div>
      
      <!-- Third Receipt Copy -->
      <div class="receipt">
        <div class="header">
          <h1>${config?.COLLEGE_NAME || "SWAMI VIVEKANANDA INSTITUTE OF TECHNOLOGY"}</h1>
          <p>${config?.COLLEGE_ADDRESS || "Dakshin Gobindapur Rd, Dakshin Gobindopur, Rajpur Sonarpur, Jaynagar, West Bengal 700145"}</p>
          <p>Phone: ${config?.COLLEGE_PHONE || "033 2437 9913"}</p>
        </div>

        <div class="receipt-title">FEE RECEIPT (Office Copy)</div>
        
        <div class="info-row">
          <div>Receipt No:</div>
          <div>${invId}</div>
        </div>
        
        <div class="info-row">
          <div>Date:</div>
          <div>${formatDate(new Date())}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Student Details</div>
          <div class="info-row">
            <div>Name:</div>
            <div>${stuName || "—"}</div>
          </div>
          <div class="info-row">
            <div>ID:</div>
            <div>${stuId || "—"}</div>
          </div>
          <div class="info-row">
            <div>Course:</div>
            <div>${programLabel}</div>
          </div>
          <div class="info-row">
            <div>Batch:</div>
            <div>${ay || "—"}</div>
          </div>
          <div class="info-row">
            <div>Semester:</div>
            <div>${semesterTxt || "—"}</div>
          </div>
          <div class="info-row">
            <div>Status:</div>
            <div><span class="status-badge ${statusPaid ? "status-paid" : "status-pending"}">${statusPaid ? "PAID" : "PENDING"}</span></div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Payment Details</div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${componentRows}
              <tr class="total-row">
                <td>Total</td>
                <td class="right">₹ ${fmtMoney(total)}</td>
              </tr>
            </tbody>
          </table>
          <div class="amount-in-words"><strong>Amount in Words:</strong> ${totalInWords}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Payment Information</div>
          <div class="info-row">
            <div>Payment Mode:</div>
            <div>${payMode || "—"}</div>
          </div>
          <div class="info-row">
            <div>Transaction ID:</div>
            <div>${txnId || "—"}</div>
          </div>
          <div class="info-row">
            <div>Due Date:</div>
            <div>${formatDate(dueDt) || "—"}</div>
          </div>
          <div class="info-row">
            <div>Paid On:</div>
            <div>${formatDate(paidOn) || (statusPaid ? formatDate(new Date()) : "—")}</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Remarks</div>
          <div>${remarks || "-"}</div>
        </div>
        
        <div class="footer">
          <div><strong>Contact:</strong> ${config?.COLLEGE_PHONE || "033 2437 9913"}</div>
          <div><strong>Email:</strong> ${config?.COLLEGE_EMAIL || "info@svist.edu"}</div>
          <div><strong>Website:</strong> ${config?.COLLEGE_WEBSITE || "www.svist.edu"}</div>
        </div>
        
        <div class="signature">
          <div class="signature-box">Student Signature</div>
          <div class="signature-box">Authorized Signature</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    window.onload = () => {
      window.print();
      setTimeout(() => window.close(), 300);
    };
  </script>
</body>
</html>`.trim();
};

  // Print using the current modal state (keeps Added Due logic)
  const printInvoice = () => {
    const stuObj = selectedStudent || {};
    const progId = (programId || stuObj?.stu_course_id || "").toString().toUpperCase();
    
    const html = buildInvoiceHTML({
      invId: formData.cms_stu_inv_id || "—",
      stuName: stuObj?.stuname || "—",
      stuId: stuObj?.stuid || formData.cms_stu_id || "—",
      prog: progId,
      ay: derivedAY || "NA",
      feeHead: formData.cms_fee_head || "—",
      baseAmount: Number(formData.cms_fee_amt || 0),
      showAddedDue: addedDue > 0,
      addedDue,
      totalAmount: finalPayable,
      dueDt: toISODate(formData.cms_due_dt) || "—",
      paidOn: toISODate(formData.cmc_fee_paiddt) || (formData.cmc_fee_is_paid ? toISODate(new Date()) : "—"),
      payMode: formData.cmc_fee_pymt_mode || "—",
      txnId: requiresTxnId(formData.cmc_fee_pymt_mode) ? (formData.cmc_fee_trans_id || "—") : "—",
      statusPaid: !!formData.cmc_fee_is_paid,
      semesterTxt: effectiveSemester ? `${ordinal(Number(effectiveSemester))} Semester` : "—",
      remarks: formData.cmc_stu_fee_remarks || "-",
      dueAfter: dueAfterThisPayment,
      scholarship: studentScholarship,
      feeComponents: feeComponents.filter(c => c.selected)
    });

    const w = window.open("", "_blank");
    if (!w) { showToast("Please allow pop-ups to print the invoice.", "error"); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Print a specific invoice directly from the table
  const printInvoiceFromRecord = (inv) => {
    const stuObj = studentsById[inv.cms_stu_id] || {};
    
    // Extract semester from remarks instead of using student's current semester
    const semesterFromRemarks = extractSemesterFromRemarks(inv.cmc_stu_fee_remarks);
    const semesterTxt = semesterFromRemarks ? `${ordinal(semesterFromRemarks)} Semester` : "—";
    
    // Best-effort: show current known balance as "due after" snapshot
    const currentBal = getDisplayBalance(inv.cms_stu_id);
    const dueAfter = Math.max(0, Number(currentBal) - Number(inv.cms_fee_amt || 0));
    
    const progId = (stuObj?.stu_course_id || "").toString().toUpperCase();

    const html = buildInvoiceHTML({
      invId: inv.cms_stu_inv_id || "—",
      stuName: stuObj?.stuname || "—",
      stuId: inv.cms_stu_id || "—",
      prog: progId,
      ay: studentAY[inv.cms_stu_id] || deriveAcademicYearFromDate(stuObj?.stuadmissiondt) || inv.cms_term_id || "NA",
      feeHead: inv.cms_fee_head || "—",
      baseAmount: Number(inv.cms_fee_amt || 0),
      showAddedDue: false,
      addedDue: 0,
      totalAmount: Number(inv.cms_fee_amt || 0),
      dueDt: toISODate(inv.cms_due_dt) || "—",
      paidOn: toISODate(inv.cmc_fee_paiddt) || (inv.cmc_fee_is_paid ? toISODate(new Date()) : "—"),
      payMode: inv.cmc_fee_pymt_mode || "—",
      txnId: requiresTxnId(inv.cmc_fee_pymt_mode) ? (inv.cmc_fee_trans_id || "—") : "—",
      statusPaid: !!inv.cmc_fee_is_paid,
      semesterTxt,
      remarks: inv.cmc_stu_fee_remarks || "-",
      dueAfter,
      scholarship: stuObj?.scholrshipfees || 0,
      feeComponents: [] // No components for table records
    });

    const w = window.open("", "_blank");
    if (!w) { showToast("Please allow pop-ups to print the invoice.", "error"); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  /* ------------- Student Searchable Selector (NEW) ------------- */
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");

  const filteredStudentsForPicker = useMemo(() => {
    const q = String(studentQuery || "").trim().toLowerCase();
    if (!q) return studentsNorm.slice(0, 50);
    const res = studentsNorm.filter(
      (s) =>
        String(s.stuname || "").toLowerCase().includes(q) ||
        String(s.stuid || "").toLowerCase().includes(q)
    );
    return res.slice(0, 100);
  }, [studentQuery, studentsNorm]);

  const pickStudentById = async (stuid) => {
    if (!stuid) return;
    await handleStudentChange({ target: { value: stuid } });
    setStudentPickerOpen(false);
    setStudentQuery("");
  };

  /* --------------------------- UI --------------------------- */
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fee Invoice Management</h1>
            <p className="text-gray-600 mt-1">Manage student fee invoices and payments</p>
          </div>
          <button
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2z"
                clipRule="evenodd"
              />
            </svg>
            Add Invoice
          </button>
        </div>

        {/* Search + page size */}
        <div className="bg-white rounded-lg shadow mb-4 p-3 flex items-center gap-3">
          <div className="flex items-center flex-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by Invoice/Student/Fee/Doc Type/Number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full py-1 px-2 text-sm text-gray-700 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{balancesLoading ? "Loading balances…" : "Rows:"}</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border rounded-md text-sm px-2 py-1"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <Th>ID</Th>
                  <Th>Student</Th>
                  <Th>Term</Th>
                  <Th>Fee Head</Th>
                  <Th className="w-24">Amount</Th>
                  <Th>Due</Th>
                  <Th>Paid On</Th>
                  <Th>Doc Type</Th>
                  <Th>Doc No.</Th>
                  <Th>Remarks</Th>
                  <Th>Balance</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100 text-xs">
                {pageRows.length > 0 ? (
                  pageRows.map((inv) => {
                    const key = inv.cms_stu_inv_id || `${inv.cms_stu_id}::${inv.cms_fee_head}::${inv.cms_due_dt || ""}`;
                    const balVal = getDisplayBalance(inv.cms_stu_id);
                    const student = studentsById[inv.cms_stu_id] || {};
                    return (
                      <tr key={key} className="hover:bg-gray-50">
                        <Td mono>{inv.cms_stu_inv_id || "—"}</Td>
                        <Td>{getStudentName(inv.cms_stu_id)}</Td>
                        <Td>{getTermName(inv.cms_term_id)}</Td>
                        <Td>{inv.cms_fee_head || "—"}</Td>
                        <Td>₹{inv.cms_fee_amt ?? "-"}</Td>
                        <Td>{toISODate(inv.cms_due_dt) || "-"}</Td>
                        <Td>{toISODate(inv.cmc_fee_paiddt) || "-"}</Td>
                        <Td>{inv.tdoc || "-"}</Td>
                        <Td>{inv.ndoc || "-"}</Td>
                        <Td className="whitespace-pre-wrap">{inv.cmc_stu_fee_remarks || "-"}</Td>
                        <Td>₹{Number(balVal || 0).toFixed(2)}</Td>
                        <Td>
                          <span
                            className={`px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full ${
                              inv.cmc_fee_is_paid ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {inv.cmc_fee_is_paid ? "Paid" : "Pending"}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-3">
                            <button onClick={() => handleEdit(inv)} className="text-indigo-600 hover:text-indigo-900">
                              Edit
                            </button>
                            <button
                              onClick={() => printInvoiceFromRecord(inv)}
                              className="text-gray-600 hover:text-gray-900"
                              title="Print this invoice"
                            >
                              Print
                            </button>
                          </div>
                        </Td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="13" className="px-4 py-8 text-center text-sm text-gray-500">
                      No invoices found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* footer */}
          <div className="px-4 py-3 flex items-center justify-between text-sm text-gray-600">
            <div>
              Showing {pageRows.length} of {filteredInvoices.length} (total {invoices.length})
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              >
                Prev
              </button>
              <span>
                Page <b>{safePage}</b> / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editInvoice ? "Edit Invoice" : "Add New Invoice"}
                </h2>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600" title="Close">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* LEFT: Fee Components */}
                  <div className="lg:col-span-1 space-y-4">
                    <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-blue-900">Fee Components</div>
                        <button
                          type="button"
                          onClick={() => {
                            setFeeComponents(prev => 
                              prev.map(comp => ({ ...comp, selected: false, amount: 0 }))
                            );
                          }}
                          className="text-xs px-2 py-1 rounded border border-blue-300 hover:bg-blue-100"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="text-blue-900/90 space-y-1">
                        <div className="flex justify-between">
                          <span>Student:</span>
                          <b>{getStudentName(formData.cms_stu_id) || "—"}</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Program:</span>
                          <b>{getProgramDescription(programId)}</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Student's Current Sem:</span>
                          <b>{currentSemester || "—"}</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Invoice Semester:</span>
                          <b>{effectiveSemester || "—"}</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Amount (Sem {effectiveSemester || "—"}):</span>
                          <b>{money(displaySeemfees)}</b>
                        </div>
                      </div>

                      {/* Fee Components Section */}
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <div className="font-semibold text-blue-900 mb-2">Fee Components</div>
                        <div className="space-y-2">
                          {feeComponents.map(comp => (
                            <div key={comp.id} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`comp-${comp.id}`}
                                checked={comp.selected}
                                onChange={(e) => handleComponentSelect(comp.id, e.target.checked)}
                                className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                              />
                              <label htmlFor={`comp-${comp.id}`} className="text-sm flex-1">
                                {comp.label}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={comp.amount}
                                onChange={(e) => handleComponentAmountChange(comp.id, e.target.value)}
                                className="w-24 border rounded px-2 py-1 text-right text-sm"
                                disabled={!comp.selected}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-blue-200 flex justify-between font-semibold">
                          <span>Total:</span>
                          <span>{money(componentTotal)}</span>
                        </div>
                      </div>

                      {structError && <div className="text-xs text-rose-600">{structError}</div>}
                      {structSnapshot && (
                        <div className="text-[11px] text-blue-800/70">
                          Mode: {structSnapshot.mode}; Sem: {structSnapshot.pickedSemester ?? "—"}; Prog: {structSnapshot.pickedProgram || "—"}; Items: {structSnapshot.rawCount}
                          {structSnapshot.matchedCount !== undefined ? ` (matched ${structSnapshot.matchedCount})` : ""}
                        </div>
                      )}
                      <p className="text-[11px] text-blue-800/70">
                        Select fee components to include in this invoice. The total will be calculated automatically.
                      </p>
                    </div>

                    {/* Calculation Section */}
                    <div className="bg-gray-50 rounded-lg border p-4 space-y-2 text-sm">
                      <div className="font-semibold text-gray-900 mb-1">Calculation</div>
                      <div className="text-gray-700 space-y-2">
                        <div className="flex justify-between items-center">
                          <span>Total Fees</span>
                          <div className="flex items-center gap-2">
                            <b>{money(totalFees || 0)}</b>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                              {totalFeesSource === "student" ? "student" : "program-sum"}
                            </span>
                          </div>
                        </div>

                        {/* SEMESTER FEE SECTION */}
                        <div className="pt-2 border-t border-gray-200">
                          <div className="font-medium text-gray-900 mb-2">Semester Fee Details</div>
                          <div className="flex justify-between">
                            <span>Selected Semester:</span>
                            <b>{effectiveSemester || "—"}</b>
                          </div>
                          <div className="flex justify-between">
                            <span>Semester Fee (from Student Master):</span>
                            <b>{money(semesterFee || 0)}</b>
                          </div>
                          <div className="flex justify-between">
                            <span>Scholarship Amount:</span>
                            <b>-{money(studentScholarship || 0)}</b>
                          </div>
                          <div className="flex justify-between font-medium pt-1 border-t border-gray-200">
                            <span>Fee after Scholarship:</span>
                            <b>{money((semesterFee || 0))}</b>
                          </div>
                        </div>

                        {/* Selected Components */}
                        <div className="pt-2 border-t border-gray-200">
                          <div className="font-medium text-gray-900 mb-2">Selected Components</div>
                          <div className="space-y-1">
                            {feeComponents.filter(c => c.selected).map(comp => (
                              <div key={comp.id} className="flex justify-between">
                                <span>{comp.label}</span>
                                <span className={comp.isDeduction ? "text-red-600" : ""}>
                                  {comp.isDeduction ? "-" : ""}{money(comp.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between font-medium pt-1 border-t border-gray-200 mt-1">
                            <span>Component Total:</span>
                            <span>{money(componentTotal)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <input
                            id="includePrevDue"
                            type="checkbox"
                            checked={includePrevDue}
                            onChange={(e) => setIncludePrevDue(!!e.target.checked)}
                          />
                          <label htmlFor="includePrevDue">Add Late Fine / Previous Due</label>
                        </div>

                        <Field
                          label="Amount Payable (₹) — Base (current sem fee)"
                          name="cms_fee_amt"
                          type="number"
                          value={formData.cms_fee_amt}
                          onChange={handleChange}
                          required
                          readOnly={true}  // Always read-only
                        />

                        {includePrevDue && (
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col">
                              <label className="text-gray-700 mb-1">Additional Due Amount</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={extraDueAmt}
                                onChange={(e) => setExtraDueAmt(Number(e.target.value || 0))}
                                className="w-40 border rounded px-2 py-1 text-right"
                              />
                            </div>

                            <div className="flex flex-col">
                              <label className="text-gray-700 mb-1">Late Fine</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={lateFine}
                                onChange={(e) => setLateFine(Number(e.target.value || 0))}
                                className="w-40 border rounded px-2 py-1 text-right"
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between">
                          <span>Amount Payable (base)</span>
                          <b>{money(basePayable)}</b>
                        </div>

                        {includePrevDue && (
                          <div className="flex justify-between">
                            <span>+ Due Added</span>
                            <b>{money(extraDueAmt || 0)}</b>
                          </div>
                        )}

                        <div className="flex justify-between border-t pt-2">
                          <span>Final Amount to Invoice</span>
                          <b>{money(finalPayable)}</b>
                        </div>

                        <div className="flex justify-between">
                          <span>Due after this payment</span>
                          <b>{money(dueAfterThisPayment)}</b>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Sem 1 (first time): we subtract from Total Fees - Scholarship. For Sem 2+ (or if Sem 1 is already billed), we subtract from the current Balance.
                        <br />
                        <strong>Note:</strong> Late fine is added to the invoice amount but not subtracted from the remaining balance.
                      </p>
                      {balError && <div className="text-xs text-rose-600">{balError}</div>}
                    </div>
                  </div>

                  {/* RIGHT: Form fields */}
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Invoice ID */}
                    <Field label="Invoice ID" readOnly name="cms_stu_inv_id" value={formData.cms_stu_inv_id} />

                    {/* Student (Searchable selector) */}
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={formData.cms_stu_id ? getStudentName(formData.cms_stu_id) : ""}
                          placeholder="Select a student..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        />
                        <button
                          type="button"
                          onClick={() => setStudentPickerOpen((s) => !s)}
                          className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                          title="Search student"
                        >
                          Search
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Academic Year auto-generates from admission year (Y → Y+1).
                      </p>

                      {/* Inline selector panel */}
                      {studentPickerOpen && (
                        <div className="mt-2 border rounded-lg bg-white shadow-sm p-2">
                          <div className="flex items-center gap-2 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <input
                              value={studentQuery}
                              onChange={(e) => setStudentQuery(e.target.value)}
                              placeholder="Type name or ID…"
                              className="flex-1 px-2 py-1 text-sm border rounded-md"
                            />
                            <button
                              type="button"
                              className="text-xs px-2 py-1 border rounded-md hover:bg-gray-50"
                              onClick={() => setStudentQuery("")}
                            >
                              Clear
                            </button>
                          </div>
                          <div className="max-h-64 overflow-y-auto">
                            {filteredStudentsForPicker.length ? (
                              <ul className="divide-y divide-gray-100">
                                {filteredStudentsForPicker.map((s) => (
                                  <li key={s.stuid}>
                                    <button
                                      type="button"
                                      className="w-full text-left px-2 py-2 hover:bg-indigo-50 rounded-md"
                                      onClick={() => pickStudentById(s.stuid)}
                                    >
                                      <div className="text-sm font-medium text-gray-900">{s.stuname}</div>
                                      <div className="text-xs text-gray-600">
                                        {s.stuid} • Adm: {toISODate(s.stuadmissiondt) || "NA"} • Sem: {s.stu_curr_semester ?? "—"}
                                      </div>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-xs text-gray-500 px-2 py-4">No matches</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Academic Year (auto, read-only) */}
                    <Field label="Academic Year" name="cms_term_id" value={derivedAY} onChange={() => {}} readOnly />

                    {/* Semester selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Semester for this invoice</label>
                      <select
                        value={effectiveSemester || ""}
                        onChange={handleSemesterSelect}
                        className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select</option>
                        {/* Dynamically generate semester options based on available semester fees */}
                        {Object.keys(allSemesterFees).length > 0 ? (
                          Object.keys(allSemesterFees)
                            .sort((a, b) => {
                              // Extract semester number and sort numerically
                              const aNum = parseInt(a.replace('sem', ''));
                              const bNum = parseInt(b.replace('sem', ''));
                              return aNum - bNum;
                            })
                            .map(sem => {
                              const semNum = sem.replace('sem', '');
                              return (
                                <option key={sem} value={semNum}>
                                  {ordinal(parseInt(semNum))} Semester {currentSemester && String(semNum)===String(currentSemester) ? "(Current)" : ""}
                                </option>
                              );
                            })
                        ) : (
                          // Fallback to default options if no semester fees are available
                          [1,2,3,4,5,6,7,8].map(n => (
                            <option key={n} value={n}>
                              {ordinal(n)} Semester {currentSemester && String(n)===String(currentSemester) ? "(Current)" : ""}
                            </option>
                          ))
                        )}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Defaults to student's current semester ({currentSemester || "—"}).
                      </p>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        name="cms_fee_head"
                        value={formData.cms_fee_head}
                        onChange={handleChange}
                        required
                        className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select</option>
                        <option value="Tuition Fee">Tuition Fee</option>
                        <option value="Hostel Fee">Hostel Fee</option>
                        <option value="Mess Fee">Mess Fee</option>
                        <option value="Exam Fee">Exam Fee</option>
                        <option value="Registration Fee">Registration Fee</option>
                        <option value="Others/Miscellaneous">Others/Miscellaneous</option>
                      </select>
                    </div>

                    {/* Amount Payable (BASE) */}
                    <Field
                      label="Amount Payable (₹) — Base (current sem fee)"
                      name="cms_fee_amt"
                      type="number"
                      value={formData.cms_fee_amt}
                      onChange={handleChange}
                      required
                      readOnly={true}  // Always read-only
                    />

                    {/* Due Date */}
                    <Field
                      label="Due Date"
                      name="cms_due_dt"
                      type="date"
                      value={formData.cms_due_dt}
                      onChange={handleChange}
                    />

                    {/* Status */}
                    <div className="flex items-center">
                      <input
                        id="cmc_fee_is_paid"
                        type="checkbox"
                        name="cmc_fee_is_paid"
                        checked={!!formData.cmc_fee_is_paid}
                        onChange={handlePaidToggle}
                        className="h-5 w-5 text-indigo-600 border-gray-300 rounded"
                      />
                      <label htmlFor="cmc_fee_is_paid" className="ml-2 text-sm">
                        Payment Completed
                      </label>
                    </div>

                    {/* Payment Date (auto, DATE ONLY) */}
                    <Field
                      label="Payment Date (auto)"
                      name="cmc_fee_paiddt"
                      type="date"
                      value={formData.cmc_fee_paiddt}
                      onChange={() => {}}
                      readOnly
                    />

                    {/* Payment Mode */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                      <select
                        name="cmc_fee_pymt_mode"
                        value={formData.cmc_fee_pymt_mode}
                        onChange={handleChange}
                        className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select</option>
                        <option value={MODE_UPI}>{MODE_UPI}</option>
                        <option value={MODE_NEFT}>{MODE_NEFT}</option>
                        <option value={MODE_CASH_CHEQUE_DEPT}>{MODE_CASH_CHEQUE_DEPT}</option>
                        <option value={MODE_CASH}>{MODE_CASH}</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Required when "Payment Completed" is checked.
                      </p>
                    </div>

                    {/* Transaction / Reference ID — conditional */}
                    {requiresTxnId(formData.cmc_fee_pymt_mode) && (
                      <Field
                        label="Reference / Transaction ID"
                        name="cmc_fee_trans_id"
                        value={formData.cmc_fee_trans_id}
                        onChange={handleChange}
                        type="text"
                        required={!!formData.cmc_fee_is_paid}
                        placeholder={txnIdPlaceholder(formData.cmc_fee_pymt_mode)}
                      />
                    )}

                    {/* Document Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                      <select
                        name="tdoc"
                        value={formData.tdoc}
                        onChange={handleChange}
                        className="w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {TDOC_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Optional. If provided, number must match the chosen type.
                      </p>
                    </div>

                    {/* Document Number */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Number</label>
                      <input
                        name="ndoc"
                        value={formData.ndoc}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder={
                          formData.tdoc === "AADHAAR" ? "12 digits" :
                          formData.tdoc === "PAN" ? "AAAAA9999A" :
                          "Alphanumeric (4–32)"
                        }
                      />
                      {docError ? (
                        <p className="text-xs text-rose-600 mt-1">{docError}</p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          {formData.tdoc === "PAN" ? "Will be uppercased automatically." :
                           formData.tdoc === "AADHAAR" ? "Digits only; exactly 12." :
                           "Alphanumeric only."}
                        </p>
                      )}
                    </div>

                    {/* Remarks */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                      <textarea
                        name="cmc_stu_fee_remarks"
                        value={formData.cmc_stu_fee_remarks}
                        onChange={handleChange}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Total Fees: {money(totalFees || 0)} | Scholarship: {money(studentScholarship || 0)} | 
                        Semester Fee: {money(semesterFee || 0)} | 
                        seemfees (read-only): {money(studentSeemfees || 0)} | Outstanding: {money(studentDue || 0)} | 
                        Balance: {money(studentBalance || 0)} | Base Amount (Sem {effectiveSemester || "—"}): {money(basePayable)}
                        {includePrevDue ? ` | Due Added (incl. fine): ${money(addedDue || 0)}` : ""} | 
                        Final Amount: {money(finalPayable)} | Due after payment: {money(dueAfterThisPayment)}
                      </p>
                    </div>

                    {/* --- PREVIEW & PRINT --- */}
                    <div className="md:col-span-2">
                      <div className="border rounded-xl p-4 bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-sm text-gray-500">Invoice Preview</div>
                            <div className="font-semibold text-gray-900">{formData.cms_stu_inv_id || "—"}</div>
                          </div>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              formData.cmc_fee_is_paid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {formData.cmc_fee_is_paid ? "Paid" : "Pending"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                          <div>Student: <b>{getStudentName(formData.cms_stu_id) || "—"}</b></div>
                          <div>AY: <b>{derivedAY}</b></div>
                          <div>Semester: <b>{effectiveSemester || "—"}</b></div>
                          <div>Program: <b>{getProgramDescription(programId)}</b></div>
                          <div>Category: <b>{formData.cms_fee_head || "—"}</b></div>
                          <div>Base Amount: <b>{money(basePayable)}</b></div>
                          {studentScholarship > 0 && (
                            <div>Scholarship Applied: <b>{money(studentScholarship)}</b></div>
                          )}
                          {includePrevDue && <div>Added Due: <b>{money(extraDueAmt || 0)}</b></div>}
                          <div>Total: <b>{money(finalPayable)}</b></div>
                          <div>Due after payment: <b>{money(dueAfterThisPayment)}</b></div>
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <button
                            type="button"
                            className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                            onClick={printInvoice}
                          >
                            Print Preview
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                          >
                            {editInvoice ? "Save Changes" : "Create Invoice"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <Toast show={toast.show} type={toast.type} text={toast.text} />
    </div>
  );
}