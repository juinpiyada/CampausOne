import React, { useEffect, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';
import './AttendanceManager.css';

// ---- Safe URL joiner (prevents double/missing slashes)
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

// ===== API endpoints via config =====
const ROUTINE_API = joinUrl(config.DAILY_ROUTINE_ROUTE);                 // e.g. /api/daily-routine
const STUDENT_API = joinUrl(config.STUDENT_ROUTE, 'list');               // e.g. /api/student/list
const TEACHER_API = joinUrl(config.TEACHER_ROUTE);                       // e.g. /api/teacher
const COURSE_OFFERING_API = joinUrl(config.COURSE_OFFERING_ROUTE);       // e.g. /api/course-offering
const ATTENDANCE_API = joinUrl(config.COLLEGE_ATTENDANCE_ROUTE, 'submit'); // e.g. /api/CollegeAttendenceManager/submit
const SUBJECT_API = joinUrl(config.SUBJECT_ROUTE, 'list');               // e.g. /api/subject/list  ✅ (new)

// ---------- helper to resolve subject description by id ----------
function subjectDescFromLists(subjId, subjects) {
  if (!subjId) return '';
  const s = (subjects || []).find(
    x =>
      String(x.subjectid) === String(subjId) ||
      String(x.subject_code) === String(subjId) ||
      String(x.subjectname) === String(subjId)
  );
  return s
    ? (s.subjectname || s.subjectdesc || s.subject_description || s.subject_code || String(subjId))
    : String(subjId);
}

// ---------- local safe YYYY-MM-DD formatter (avoids TZ dupes) ----------
function fmtYmdLocal(d) {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, '0');
  const day = String(dd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- Date calculation helpers for reports ----------
function getDateRange(type, baseDate = new Date()) {
  const start = new Date(baseDate);
  const end = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  switch (type) {
    case 'daily': {
      return { start: fmtYmdLocal(start), end: fmtYmdLocal(end) };
    }
    case 'weekly': {
      // Get start of week (Monday) and end of week (Sunday)
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
      start.setDate(diff);
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      return { start: fmtYmdLocal(start), end: fmtYmdLocal(end) };
    }
    case 'monthly': {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      return { start: fmtYmdLocal(start), end: fmtYmdLocal(end) };
    }
    case 'yearly': {
      // Academic year (assuming July to June)
      const month = start.getMonth();
      const year = start.getFullYear();
      if (month >= 6) { // July onwards
        start.setFullYear(year, 6, 1); // July 1st
        end.setFullYear(year + 1, 5, 30); // June 30th next year
      } else {
        start.setFullYear(year - 1, 6, 1); // Previous July 1st
        end.setFullYear(year, 5, 30); // June 30th this year
      }
      return { start: fmtYmdLocal(start), end: fmtYmdLocal(end) };
    }
    default:
      return { start: fmtYmdLocal(start), end: fmtYmdLocal(end) };
  }
}

const AttendanceManager = () => {
  const [routines, setRoutines] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [courseOfferings, setCourseOfferings] = useState([]);
  const [subjects, setSubjects] = useState([]); // ✅ master list for descriptions

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return fmtYmdLocal(today);
  });
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedCourseOffering, setSelectedCourseOffering] = useState('');
  const [selectedAcadYear, setSelectedAcadYear] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [selectedTiming, setSelectedTiming] = useState('');
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [submitMsg, setSubmitMsg] = useState('');

  const [acadYearOptions, setAcadYearOptions] = useState([]);
  const [sectionOptions, setSectionOptions] = useState([]);
  const [timingOptions, setTimingOptions] = useState([]);
  const [teacherOptions, setTeacherOptions] = useState([]);

  // Report extraction states
  const [reportType, setReportType] = useState('daily'); // daily, weekly, monthly, yearly
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [showReportSection, setShowReportSection] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);

  // Load all base data on mount
  useEffect(() => {
    setLoading(true);
    setErr('');
    Promise.all([
      axios.get(ROUTINE_API),
      axios.get(STUDENT_API),
      axios.get(TEACHER_API),
      axios.get(COURSE_OFFERING_API),
      axios.get(SUBJECT_API),                // ✅ get subject master
    ])
      .then(([routineRes, studentRes, teacherRes, courseOfferingRes, subjectRes]) => {
        const rRaw = routineRes?.data?.routines ?? routineRes?.data ?? [];
        setRoutines(Array.isArray(rRaw) ? rRaw : []);

        const sRaw = studentRes?.data?.students ?? studentRes?.data ?? [];
        setStudents(Array.isArray(sRaw) ? sRaw : []);

        const tRaw = teacherRes?.data?.teachers ?? teacherRes?.data ?? [];
        setTeachers(Array.isArray(tRaw) ? tRaw : []);

        const cRaw = courseOfferingRes?.data?.offerings ?? courseOfferingRes?.data ?? [];
        setCourseOfferings(Array.isArray(cRaw) ? cRaw : []);

        const subRaw = subjectRes?.data?.subjects ?? subjectRes?.data ?? [];
        setSubjects(Array.isArray(subRaw) ? subRaw : []); // ✅

        setLoading(false);
      })
      .catch((e) => {
        setRoutines([]); setStudents([]); setTeachers([]); setCourseOfferings([]); setSubjects([]);
        setLoading(false);
        setErr('Failed to load initial data: ' + (e.message || ''));
      });
  }, []);

  // Update course offering and related data when subject is selected
  useEffect(() => {
    if (!selectedSubject) {
      setSelectedCourseOffering('');
      setAcadYearOptions([]);
      setSectionOptions([]);
      setSelectedAcadYear('');
      setSelectedSection('');
      setSelectedTeacher('');
      setSelectedTiming('');
      return;
    }

    // Find course offerings that match the selected subject
    const matchingOfferings = courseOfferings.filter(offer => {
      const subjectId = offer.offer_courseid || offer.subjectid;
      return String(subjectId) === String(selectedSubject);
    });

    if (matchingOfferings.length > 0) {
      // Auto-select first matching offering
      const offering = matchingOfferings[0];
      setSelectedCourseOffering(offering.offerid);

      // Find routines for this offering
      const filtered = routines.filter(r => String(r.drsubjid) === String(offering.offerid));

      // Extract unique academic years
      const acadYears = [...new Set(filtered.map(r => r.acad_year).filter(Boolean))];
      setAcadYearOptions(acadYears);

      // Auto-set teacher and timing if available
      if (filtered.length > 0) {
        const firstRoutine = filtered[0];
        setSelectedTeacher(firstRoutine.drclassteacherid || '');
        setSelectedTiming(firstRoutine.drfrom && firstRoutine.drto ?
          `${firstRoutine.drfrom} - ${firstRoutine.drto}` : '');
      }
    } else {
      setSelectedCourseOffering('');
      setAcadYearOptions([]);
    }

    setSectionOptions([]);
    setSelectedSection('');
  }, [selectedSubject, courseOfferings, routines]);

  // Update Sections after selecting Academic Year
  useEffect(() => {
    if (!selectedCourseOffering || !selectedAcadYear) {
      setSectionOptions([]); setSelectedSection('');
      return;
    }
    const filtered = routines.filter(r =>
      String(r.drsubjid) === String(selectedCourseOffering) &&
      r.acad_year === selectedAcadYear
    );
    const sections = [...new Set(filtered.map(r => r.stu_section).filter(Boolean))];
    setSectionOptions(sections);
    setSelectedSection('');
  }, [selectedCourseOffering, selectedAcadYear, routines]);

  // Find all routines matching the full filter combo
  const showTable = selectedSubject && selectedCourseOffering && selectedAcadYear && selectedSection;
  const filteredRoutines = routines.filter(r =>
    String(r.drsubjid) === String(selectedCourseOffering) &&
    r.acad_year === selectedAcadYear &&
    r.stu_section === selectedSection
  );

  // Meta from course offering
  const selectedOfferingMeta = courseOfferings.find(
    o => String(o.offerid) === String(selectedCourseOffering)
  );
  const offer_courseid = selectedOfferingMeta?.offer_courseid || ''; // real subject id (kept for DB)
  // ✅ what we SHOW to the user:
  const subjectDisplay =
    selectedOfferingMeta?.subjectname ||
    selectedOfferingMeta?.subject_NAME ||
    subjectDescFromLists(offer_courseid, subjects) ||
    offer_courseid ||
    '--';

  // Filtered students in section
  const filteredStudents = showTable
    ? students.filter(stu => stu.stu_section === selectedSection)
    : [];

  // Teacher/timing options for current session
  useEffect(() => {
    if (showTable && filteredRoutines.length > 0) {
      // Extract unique timings
      const timings = [...new Set(filteredRoutines.map(r => {
        if (r.drfrom && r.drto) {
          return `${r.drfrom} - ${r.drto}`;
        }
        return null;
      }).filter(Boolean))];

      // Extract unique teachers
      const teachers = [...new Set(filteredRoutines.map(r => r.drclassteacherid).filter(Boolean))];

      setTimingOptions(timings);
      setTeacherOptions(teachers);

      // Auto-select if not already selected
      if (!selectedTeacher && teachers.length > 0) {
        setSelectedTeacher(teachers[0]);
      }
      if (!selectedTiming && timings.length > 0) {
        setSelectedTiming(timings[0]);
      }
    } else if (!showTable) {
      // Only clear if not showing table
      setTimingOptions([]);
      setTeacherOptions([]);
    }
    // eslint-disable-next-line
  }, [showTable, filteredRoutines]);

  // Attendance state per session (restore from localStorage if any)
  useEffect(() => {
    if (showTable) {
      const key = `attendance_${selectedCourseOffering}_${selectedAcadYear}_${selectedSection}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        setAttendance(JSON.parse(saved));
      } else {
        const initial = {};
        filteredStudents.forEach(stu => { initial[stu.stuid] = false; });
        setAttendance(initial);
        localStorage.setItem(key, JSON.stringify(initial));
      }
    } else {
      setAttendance({});
    }
    // eslint-disable-next-line
  }, [showTable, selectedCourseOffering, selectedAcadYear, selectedSection, students]);

  // Update attendance in localStorage
  useEffect(() => {
    if (showTable) {
      const key = `attendance_${selectedCourseOffering}_${selectedAcadYear}_${selectedSection}`;
      localStorage.setItem(key, JSON.stringify(attendance));
    }
  }, [attendance, showTable, selectedCourseOffering, selectedAcadYear, selectedSection]);

  // Handlers
  const handleCheckboxChange = (stuid) => {
    setAttendance(prev => ({
      ...prev,
      [stuid]: !prev[stuid]
    }));
  };

  // Update date range when report type changes
  useEffect(() => {
    const { start, end } = getDateRange(reportType);
    setReportStartDate(start);
    setReportEndDate(end);
  }, [reportType]);

  // Extract attendance data for reports
  const extractAttendanceData = () => {
    if (!selectedSubject || !selectedSection) {
      setSubmitMsg('Please select subject and section first!');
      setTimeout(() => setSubmitMsg(''), 2500);
      return;
    }

    setLoadingReport(true);

    // ✅ reset report view first (prevents any transient duplication on fast clicks)
    setShowReportSection(false);
    setReportData([]);

    const mockData = [];
    const studentsInSection = students.filter(stu => stu.stu_section === selectedSection);

    const startDate = new Date(reportStartDate);
    const endDate = new Date(reportEndDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    for (let d = new Date(startDate); d.getTime() <= endDate.getTime(); d.setDate(d.getDate() + 1)) {
      const dateStr = fmtYmdLocal(d);
      const dayOfWeek = new Date(d).getDay();
      if (dayOfWeek === 0) continue; // Skip Sundays

      studentsInSection.forEach(stu => {
        const key = `attendance_${selectedCourseOffering}_${selectedAcadYear}_${selectedSection}_${dateStr}`;
        const savedAttendance = localStorage.getItem(key);
        let isPresent = false;

        if (savedAttendance) {
          const parsed = JSON.parse(savedAttendance);
          isPresent = parsed[stu.stuid] || false;
        } else {
          // Random attendance for demo (70% present)
          isPresent = Math.random() > 0.3;
        }

        mockData.push({
          date: dateStr,
          studentId: stu.stuid,
          studentName: stu.stuname,
          section: selectedSection,
          subject: subjectDisplay,
          present: isPresent,
          dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]
        });
      });
    }

    // ✅ strong de-dupe by (date, studentId, section, subject)
    const dedupMap = new Map();
    for (const row of mockData) {
      const k = `${row.date}|${row.studentId}|${row.section}|${row.subject}`;
      if (!dedupMap.has(k)) dedupMap.set(k, row);
    }
    const deduped = Array.from(dedupMap.values());

    setReportData(deduped);
    setLoadingReport(false);
    setShowReportSection(true);
  };

  // ---- SUBMIT ----
  const handleSubmitAttendance = async () => {
    if (!selectedTeacher || !offer_courseid) {
      setSubmitMsg('Please select a teacher and a valid subject!');
      setTimeout(() => setSubmitMsg(''), 2500);
      return;
    }
    setLoading(true); setSubmitMsg('');
    const data = filteredStudents.map(stu => ({
      attuserid: stu.stuid,
      present: !!attendance[stu.stuid],
      attclassid: stu.stu_section,
      attsubjectid: selectedCourseOffering, // offering id (unchanged)
      attcourseid: offer_courseid,          // subject id for DB (unchanged)
      attmaarkedbyemployee: selectedTeacher,
      teacherid: selectedTeacher
    }));

    try {
      await axios.post(ATTENDANCE_API, data);
      setSubmitMsg('Attendance submitted & saved to database!');
    } catch (err) {
      setSubmitMsg('Failed to submit attendance to database. ' + (err.response?.data?.error || err.message));
    }
    setLoading(false);
    setTimeout(() => setSubmitMsg(''), 3500);
  };

  const getTeacherName = (tid) => {
    if (!tid) return '--';
    const t = teachers.find(t => String(t.teacherid) === String(tid));
    return t ? `${t.teachername} (${t.teacherid})` : `(${tid})`;
  };

  // Get unique subjects from course offerings that have routines
  const courseOfferingIdsInRoutine = [...new Set(routines.map(r => r.drsubjid).filter(Boolean))];
  const offeringsInRoutine = courseOfferings.filter(o =>
    courseOfferingIdsInRoutine.includes(String(o.offerid))
  );

  // Extract unique subjects
  const subjectMap = new Map();
  offeringsInRoutine.forEach(offer => {
    const subjectId = offer.offer_courseid || offer.subjectid;
    if (subjectId) {
      const subjectName = subjectDescFromLists(subjectId, subjects) ||
        offer.subjectname ||
        offer.subject_NAME ||
        subjectId;
      subjectMap.set(String(subjectId), subjectName);
    }
  });

  const subjectOptions = [
    { value: '', label: '-- Select Subject --' },
    ...[...subjectMap.entries()].map(([id, name]) => ({
      value: id,
      label: name
    }))]
    ;

  return (
    <div className="attendance-manager-container">
      <h2 className="attendance-manager-header">STUDENT ATTENDANCE </h2>
      {err && <div className="attendance-error-message">{err}</div>}

      <div className="attendance-filter-section">
        <div>
          <label className="attendance-filter-label">Date: </label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="attendance-filter-input attendance-date-input"
            max={fmtYmdLocal(new Date())}
          />
        </div>
        <div>
          <label className="attendance-filter-label">Subject: </label>
          <select
            className="attendance-filter-select attendance-subject-select"
            value={selectedSubject}
            onChange={e => setSelectedSubject(e.target.value)}
          >
            {subjectOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="attendance-filter-label">Academic Year: </label>
          <select
            className="attendance-filter-select attendance-acad-year-select"
            value={selectedAcadYear}
            onChange={e => setSelectedAcadYear(e.target.value)}
            disabled={!acadYearOptions.length}
          >
            <option value="">-- Select Year --</option>
            {acadYearOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="attendance-filter-label">Section: </label>
          <select
            className="attendance-filter-select attendance-section-select"
            value={selectedSection}
            onChange={e => setSelectedSection(e.target.value)}
            disabled={!sectionOptions.length}
          >
            <option value="">-- Select Section --</option>
            {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {showTable && (
        <div className="attendance-session-info">
          <div className="attendance-session-info-content">
            <div className="attendance-info-box">
              <b className="attendance-info-label">Subject:</b>
              <span className="attendance-info-value">
                {subjectDisplay}
              </span>
            </div>

            <div className="attendance-info-box">
              <b className="attendance-info-label">Course ID:</b>
              <span className="attendance-course-id-value">
                {selectedCourseOffering}
              </span>
            </div>
          </div>

          <div className="attendance-teacher-timing-container">
            <div className="attendance-label-container">
              <label className="attendance-teacher-label">👨‍🏫 Teacher:</label>
              <select
                value={selectedTeacher}
                onChange={e => setSelectedTeacher(e.target.value)}
                className="attendance-teacher-select"
              >
                {teacherOptions.length > 0 ? (
                  teacherOptions.map(tid =>
                    <option key={tid} value={tid}>{getTeacherName(tid)}</option>
                  )
                ) : (
                  <option value="">No teacher assigned</option>
                )}
              </select>
            </div>

            <div className="attendance-label-container">
              <label className="attendance-timing-label">⏰ Timing:</label>
              <select
                value={selectedTiming}
                onChange={e => setSelectedTiming(e.target.value)}
                className="attendance-timing-select"
              >
                {timingOptions.length > 0 ? (
                  timingOptions.map(time =>
                    <option key={time} value={time}>{time}</option>
                  )
                ) : (
                  <option value="">No timing available</option>
                )}
              </select>
            </div>

            {filteredRoutines.length > 0 && filteredRoutines[0].drslot && (
              <div className="attendance-slot-container">
                <b className="attendance-slot-label">Slot:</b>
                <span className="attendance-slot-value">
                  {filteredRoutines[0].drslot}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {showTable && (
        <div className="attendance-date-text">
          Attendance Date: <span className="attendance-date-value">{selectedDate}</span>
        </div>
      )}

      {showTable && (
        <div className="attendance-table-container">
          <table className="attendance-table">
            <thead className="attendance-table-header">
              <tr>
                <th className="attendance-table-header-cell"></th>
                <th className="attendance-table-header-cell">Student ID</th>
                <th className="attendance-table-header-cell">Student Name</th>
                <th className="attendance-table-header-cell-center">Present</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="attendance-table-message">Loading...</td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="attendance-table-message">
                    No students found for this Section.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((stu, idx) => (
                  <tr key={stu.stuid || idx} className={idx % 2 === 0 ? "attendance-table-row-even" : "attendance-table-row-odd"}>
                    <td className="attendance-table-cell">{idx + 1}</td>
                    <td className="attendance-table-cell">{stu.stuid || '--'}</td>
                    <td className="attendance-table-cell">{stu.stuname || '--'}</td>
                    <td className="attendance-table-cell-center">
                      <input
                        type="checkbox"
                        checked={attendance[stu.stuid] || false}
                        onChange={() => handleCheckboxChange(stu.stuid)}
                        aria-label={`Mark present for ${stu.stuname}`}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {filteredStudents.length > 0 && (
            <div className="attendance-submit-container">
              <button
                onClick={handleSubmitAttendance}
                disabled={loading}
                className="attendance-submit-button">
                {loading ? 'Submitting...' : 'Submit Attendance'}
              </button>
              {submitMsg && <span className={`attendance-submit-message ${submitMsg.includes('Failed') ? 'attendance-submit-message-error' : 'attendance-submit-message-success'}`}>{submitMsg}</span>}
            </div>
          )}
        </div>
      )}

      {/* Attendance Report/Extraction Section */}
      <div className="attendance-report-section">
        <h3 className="attendance-report-header">
          📊 Attendance Report Extraction
        </h3>

        <div className="attendance-report-filters">
          <div>
            <label className="attendance-report-label">
              Report Type:
            </label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              className="attendance-report-select"
            >
              <option value="daily">Daily</option>
              
            </select>
          </div>

          <div>
            <label className="attendance-report-label">
              Start Date:
            </label>
            <input
              type="date"
              value={reportStartDate}
              onChange={e => setReportStartDate(e.target.value)}
              className="attendance-report-date-input"
            />
          </div>

          <div>
            <label className="attendance-report-label">
              End Date:
            </label>
            <input
              type="date"
              value={reportEndDate}
              onChange={e => setReportEndDate(e.target.value)}
              className="attendance-report-date-input"
            />
          </div>

          <button
            onClick={extractAttendanceData}
            disabled={loadingReport}
            className="attendance-report-button attendance-extract-button"
          >
            {loadingReport ? '⏳ Extracting...' : '📥 Extract Data'}
          </button>

          <button
            onClick={() => {
              // Export to CSV
              if (reportData.length === 0) {
                alert('No data to export!');
                return;
              }

              const headers = ['Date', 'Day', 'Student ID', 'Student Name', 'Section', 'Subject', 'Status'];

              // CSV rows (quote-safe)
              const rows = reportData.map(row => ([
                row.date,
                row.dayOfWeek,
                row.studentId,
                row.studentName,
                row.section,
                row.subject,
                row.present ? 'Present' : 'Absent'
              ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')));

              const csvContent = [
                headers.join(','),
                ...rows
              ].join('\n');

              const blob = new Blob([csvContent], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `attendance_${reportType}_${reportStartDate}_to_${reportEndDate}.csv`;
              a.click();
            }}
            disabled={reportData.length === 0}
            className="attendance-report-button attendance-export-button"
          >
            📄 Export CSV
          </button>
        </div>

        {/* Report Summary */}
        {showReportSection && reportData.length > 0 && (
          <div className="attendance-report-summary">
            <h4 className="attendance-report-summary-header">Report Summary</h4>

            <div className="attendance-summary-grid">
              <div className="attendance-summary-item attendance-period-item">
                <div className="attendance-summary-label attendance-period-label">Period</div>
                <div className="attendance-summary-value attendance-period-value">
                  {reportStartDate} to {reportEndDate}
                </div>
              </div>

              <div className="attendance-summary-item attendance-days-item">
                <div className="attendance-summary-label attendance-days-label">Total Days</div>
                <div className="attendance-summary-value attendance-days-value">
                  {[...new Set(reportData.map(r => r.date))].length}
                </div>
              </div>

              <div className="attendance-summary-item attendance-students-item">
                <div className="attendance-summary-label attendance-students-label">Total Students</div>
                <div className="attendance-summary-value attendance-students-value">
                  {[...new Set(reportData.map(r => r.studentId))].length}
                </div>
              </div>

              <div className="attendance-summary-item attendance-attendance-item">
                <div className="attendance-summary-label attendance-attendance-label">Avg Attendance</div>
                <div className="attendance-summary-value attendance-attendance-value">
                  {Math.round((reportData.filter(r => r.present).length / reportData.length) * 100)}%
                </div>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="attendance-detailed-table-container">
              <table className="attendance-detailed-table">
                <thead className="attendance-detailed-table-header">
                  <tr>
                    <th className="attendance-detailed-table-header-cell">Date</th>
                    <th className="attendance-detailed-table-header-cell">Day</th>
                    <th className="attendance-detailed-table-header-cell">Student ID</th>
                    <th className="attendance-detailed-table-header-cell">Name</th>
                    <th className="attendance-detailed-table-header-cell-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "attendance-detailed-table-row-even" : "attendance-detailed-table-row-odd"}>
                      <td className="attendance-detailed-table-cell">{row.date}</td>
                      <td className="attendance-detailed-table-cell">{row.dayOfWeek}</td>
                      <td className="attendance-detailed-table-cell">{row.studentId}</td>
                      <td className="attendance-detailed-table-cell">{row.studentName}</td>
                      <td className="attendance-detailed-table-cell-center">
                        <span className={`attendance-status-badge ${row.present ? 'attendance-status-present' : 'attendance-status-absent'}`}>
                          {row.present ? 'Present' : 'Absent'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length > 100 && (
                <div className="attendance-record-limit-message">
                  Showing first 100 records. Export CSV to see all {reportData.length} records.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceManager;
