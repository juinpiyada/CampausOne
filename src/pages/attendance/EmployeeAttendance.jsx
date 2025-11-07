// File: SMS-ui/src/pages/Attendance/EmployeeAttendance.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import config from '../../config/middleware_config';

/* ---------------- Safe URL joiner (prevents double/missing slashes) ---------------- */
function joinUrl(base = '', path = '') {
  if (!base) return path || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}/${p}`;
}

/* ---------------- API endpoints via config ---------------- */
const TEACHER_API   = joinUrl(config.TEACHER_ROUTE);                 // /api/teacher
const ROUTINE_API   = joinUrl(config.DAILY_ROUTINE_ROUTE);           // /api/daily-routine
const OFFERING_API  = joinUrl(config.COURSE_OFFERING_ROUTE);         // /api/course-offering
const ATTENDANCE_API= joinUrl(config.EMPLOYEE_ATTENDANCE_ROUTE);     // /api/employee-attendance
const SUBJECT_API   = joinUrl(config.SUBJECT_ROUTE, 'list');         // /api/subject/list
const ROLE_API      = joinUrl(config.MASTER_ROLE_ROUTE);             // /api/master-role

/* ---------------- date helpers (local, no UTC surprises) ---------------- */
function pad(n){ return String(n).padStart(2,'0'); }
function todayYMD(){
  const d = new Date();
  const y = d.getFullYear();
  const m = pad(d.getMonth()+1);
  const da = pad(d.getDate());
  return `${y}-${m}-${da}`;
}
function weekdayFromDate(dateStr){
  if(!dateStr) return '';
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dt.getDay()];
}

/* ---------------- keys & ids ---------------- */
function getAttendanceKey({ teacherId, date, offerId, classId }) {
  return `attendance_${teacherId}_${date}_${offerId}_${classId}`;
}
function randomId() {
  return 'ATT' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

/* ---------------- Resolve subject *description* from master subject list ---------------- */
function subjectDescFromList(subjId, subjects) {
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

/* ---------------- Role display helpers ---------------- */
function getRoleBackgroundColor(role) {
  const roleColors = {
    'Admin': '#fef3c7',
    'Manager': '#dbeafe',
    'Faculty': '#e0e7ff',
  };
  return roleColors[role] || '#e0e7ff';
}
function getRoleTextColor(role) {
  const roleColors = {
    'Admin': '#92400e',
    'Manager': '#1e40af',
    'Faculty': '#4c1d95',
  };
  return roleColors[role] || '#4c1d95';
}

/* ---------------- date format for table ---------------- */
function formatDate(dateString) {
  if (!dateString) return '--';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

const EmployeeAttendance = () => {
  const [date, setDate] = useState(() => todayYMD());
  const [selectedRole, setSelectedRole] = useState(''); // Filter by role
  const [teacherId, setTeacherId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [classId, setClassId] = useState('');

  const [teachers, setTeachers] = useState([]);
  const [filteredTeachers, setFilteredTeachers] = useState([]);
  const [routineAlloc, setRoutineAlloc] = useState([]);
  const [offerings, setOfferings] = useState([{ offerid: '', offerlabel: '-- Select Offer ID --', offer_courseid: '' }]);
  const [classes, setClasses] = useState([{ classroomid: '', classroomname: '-- Select Class --' }]);
  const [present, setPresent] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [routine, setRoutine] = useState(null);
  const [attendanceList, setAttendanceList] = useState([]);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const [guardMsg, setGuardMsg] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [roles, setRoles] = useState([]);
  const [roleFilter, setRoleFilter] = useState(''); // Filter for attendance history
  const [employeeFilter, setEmployeeFilter] = useState(''); // Filter by employee name
  const [sortBy, setSortBy] = useState('date'); // Sorting option
  const [sortOrder, setSortOrder] = useState('desc'); // Sorting order

  // Subject master list and chosen subject id from offering
  const [subjects, setSubjects] = useState([]);
  const [selectedOfferCourseId, setSelectedOfferCourseId] = useState('');
  
  // State for export format selection
  const [exportFormat, setExportFormat] = useState('csv');
  const [includeStats, setIncludeStats] = useState(true);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('');

  // cache for offerings
  useEffect(() => {
    axios.get(OFFERING_API)
      .then(res => {
        const arr = Array.isArray(res?.data) ? res.data : (res?.data?.offerings ?? []);
        window.__allOfferingsCache__ = Array.isArray(arr) ? arr : [];
      })
      .catch(() => { window.__allOfferingsCache__ = []; });
  }, []);

  // Load roles, teachers, subjects
  useEffect(() => {
    const fetchRoles = axios.get(ROLE_API)
      .then(res => {
        const roleData = res?.data?.roles ?? res?.data ?? [];
        const out = Array.isArray(roleData) ? roleData : [];
        setRoles(out);
        return out;
      })
      .catch(() => {
        setRoles([]);
        return [];
      });

    const fetchTeachers = axios.get(TEACHER_API)
      .then(res => {
        const data = res?.data?.teachers ?? res?.data ?? [];
        return Array.isArray(data) ? data : [];
      })
      .catch(() => []);

    Promise.all([fetchRoles, fetchTeachers])
      .then(([rolesData, teachersData]) => {
        const teachersWithRoles = (teachersData || []).map(teacher => {
          const teacherRole = (rolesData || []).find(r =>
            r.teacher_id === teacher.teacherid ||
            r.user_id === teacher.teacherid ||
            r.employee_id === teacher.teacherid
          );
          const roleName = teacherRole?.role_name || teacher.role || 'Faculty';
          return {
            ...teacher,
            role: roleName,
            displayName: `${teacher.teachername} (${roleName})`
          };
        });
        setTeachers(teachersWithRoles);
        setFilteredTeachers(teachersWithRoles);
      })
      .catch(() => {
        setTeachers([]);
        setFilteredTeachers([]);
      });

    axios.get(SUBJECT_API)
      .then(res => {
        const list = res?.data?.subjects ?? res?.data ?? [];
        setSubjects(Array.isArray(list) ? list : []);
      })
      .catch(() => setSubjects([]));
  }, []);

  // Filter teachers by role
  useEffect(() => {
    if (!selectedRole) {
      setFilteredTeachers(teachers);
    } else {
      setFilteredTeachers(teachers.filter(t => t.role === selectedRole));
    }
    setTeacherId('');
  }, [selectedRole, teachers]);

  // Load routines for selected teacher
  useEffect(() => {
    setOfferId('');
    setClassId('');
    setRoutineAlloc([]);
    setRoutine(null);
    setClasses([{ classroomid: '', classroomname: '-- Select Class --' }]);
    setOfferings([{ offerid: '', offerlabel: '-- Select Offer ID --', offer_courseid: '' }]);

    if (!teacherId) return;

    axios.get(ROUTINE_API)
      .then(res => {
        const routines = res?.data?.routines ?? res?.data ?? [];
        const arr = Array.isArray(routines) ? routines : [];
        const alloc = arr.filter(r => String(r.drclassteacherid) === String(teacherId));
        setRoutineAlloc(alloc);

        // Build Offer list
        const uniqueOfferIds = [];
        alloc.forEach(r => {
          if (r.drsubjid && !uniqueOfferIds.includes(r.drsubjid)) uniqueOfferIds.push(r.drsubjid);
        });

        const allOff = window.__allOfferingsCache__ || [];
        const offeringOpts = [{ offerid: '', offerlabel: '-- Select Offer ID --', offer_courseid: '' }];
        uniqueOfferIds.forEach(ofId => {
          const off = (allOff || []).find(o => String(o.offerid) === String(ofId));
          offeringOpts.push({
            offerid: ofId,
            offerlabel: ofId,
            offer_courseid: off ? off.offer_courseid : ''
          });
        });
        setOfferings(offeringOpts);

        // Build Classes list
        const uniqueClasses = [];
        alloc.forEach(r => {
          if (r.drclassroomid && !uniqueClasses.includes(r.drclassroomid)) uniqueClasses.push(r.drclassroomid);
        });
        setClasses([{ classroomid: '', classroomname: '-- Select Class --' },
          ...uniqueClasses.map(classroomid => ({ classroomid, classroomname: classroomid }))
        ]);
      })
      .catch(() => {
        setRoutineAlloc([]);
        setOfferings([{ offerid: '', offerlabel: '-- Select Offer ID --', offer_courseid: '' }]);
        setClasses([{ classroomid: '', classroomname: '-- Select Class --' }]);
      });
  }, [teacherId]);

  // Set subject id (offer_courseid) when offerId changes
  useEffect(() => {
    if (!offerId) {
      setSelectedOfferCourseId('');
      return;
    }
    let subid = '';
    const arr = Array.isArray(offerings) ? offerings : [];
    const match = arr.find(o => String(o.offerid) === String(offerId));
    if (match && match.offer_courseid) subid = match.offer_courseid;

    if (!subid) {
      const all = window.__allOfferingsCache__;
      if (all && Array.isArray(all)) {
        const off = all.find(o => String(o.offerid) === String(offerId));
        setSelectedOfferCourseId(off ? off.offer_courseid : '');
      } else {
        axios.get(OFFERING_API)
          .then(res => {
            const all2 = Array.isArray(res?.data) ? res.data : (res?.data?.offerings ?? []);
            const off = (all2 || []).find(o => String(o.offerid) === String(offerId));
            setSelectedOfferCourseId(off ? off.offer_courseid : '');
          })
          .catch(() => setSelectedOfferCourseId(''));
      }
    } else {
      setSelectedOfferCourseId(subid);
    }
  }, [offerId, offerings]);

  // Update routine for current selections — include weekday match with selected date
  useEffect(() => {
    setRoutine(null);
    if (teacherId && offerId && classId) {
      const todayName = weekdayFromDate(date);
      const found = routineAlloc.find(
        r =>
          String(r.drclassteacherid) === String(teacherId) &&
          String(r.drsubjid) === String(offerId) &&
          String(r.drclassroomid) === String(classId) &&
          String(r.drdayofweek).toLowerCase() === String(todayName).toLowerCase()
      );
      setRoutine(found || null);
    }
  }, [teacherId, offerId, classId, routineAlloc, date]);

  // Attendance already marked check
  useEffect(() => {
    setSubmitMessage('');
    if (teacherId && date && offerId && classId) {
      const key = getAttendanceKey({ teacherId, date, offerId, classId });
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        const status = JSON.parse(stored);
        setPresent(!!status.present);
        setAlreadyMarked(true);
      } else {
        setPresent(false);
        setAlreadyMarked(false);
      }
    } else {
      setPresent(false);
      setAlreadyMarked(false);
    }
  }, [teacherId, date, offerId, classId]);

  // Fetch attendance list
  useEffect(() => {
    if (teacherId && offerId && classId) {
      axios.get(ATTENDANCE_API)
        .then(res => {
          const data = res?.data ?? [];
          const filtered = (Array.isArray(data) ? data : []).filter(
            a =>
              String(a.attmaarkedbyemployee) === String(teacherId) &&
              String(a.attsubjectid) === String(offerId) &&
              String(a.attclassid) === String(classId)
          );
          setAttendanceList(filtered);
        })
        .catch(() => setAttendanceList([]));
    } else {
      setAttendanceList([]);
    }
  }, [teacherId, offerId, classId]);

  // ---- SUBMIT GUARD: only today + routine day must match selected date ----
  const todayStr = todayYMD();
  const selectedDayName = weekdayFromDate(date);
  const routineDayName = routine?.drdayofweek || '';
  const isToday = date === todayStr;
  const dayMatches = routine ? (String(routineDayName).toLowerCase() === String(selectedDayName).toLowerCase()) : false;

  useEffect(() => {
    if (!teacherId || !offerId || !classId) { setGuardMsg(''); return; }
    if (!isToday) {
      setGuardMsg(`You can only give attendance for today (${todayStr}).`);
    } else if (!routine) {
      setGuardMsg(`No routine found for ${selectedDayName}. Choose the correct Offer/Class for today.`);
    } else if (!dayMatches) {
      setGuardMsg(`This routine is for ${routineDayName}, but selected date is ${selectedDayName}.`);
    } else {
      setGuardMsg('');
    }
  }, [teacherId, offerId, classId, isToday, routine, selectedDayName, routineDayName, todayStr]);

  const canSubmit = !!teacherId && !!offerId && !!classId && !!routine && isToday && dayMatches && !alreadyMarked;

  // ---- SUBMIT ----
  const handleSubmitAttendance = async (e) => {
    e.preventDefault();
    setSubmitMessage('');
    if (!canSubmit) {
      setSubmitMessage(guardMsg || 'Submission blocked by rules.');
      return;
    }

    // Subject id from course-offering
    let offer_courseid = selectedOfferCourseId || '';
    if (!offer_courseid && routine?.drcourseid) {
      offer_courseid = routine.drcourseid;
    }

    const payload = {
      attid: randomId(),
      attuserid: teacherId,
      attcourseid: offer_courseid || '',  // subject id stored in DB
      attsubjectid: offerId,              // offering id
      attlat: '',
      attlong: '',
      attts_in: date + 'T09:00:00',
      attts_out: date + 'T16:00:00',
      attvalid: present,
      attvaliddesc: present ? 'Present' : 'Absent',
      attclassid: classId,
      attdeviceid: '',
      attmaarkedbyemployee: teacherId
    };

    try {
      await axios.post(ATTENDANCE_API, payload);
      setSubmitMessage('Attendance submitted successfully!');
      const key = getAttendanceKey({ teacherId, date, offerId, classId });
      window.sessionStorage.setItem(key, JSON.stringify({ present }));
      setAlreadyMarked(true);

      setTimeout(() => {
        axios.get(ATTENDANCE_API)
          .then(res => {
            const data = res?.data ?? [];
            const filtered = (Array.isArray(data) ? data : []).filter(
              a =>
                String(a.attmaarkedbyemployee) === String(teacherId) &&
                String(a.attsubjectid) === String(offerId) &&
                String(a.attclassid) === String(classId)
            );
            setAttendanceList(filtered);
          })
          .catch(() => {});
      }, 800);
    } catch (err) {
      setSubmitMessage('Failed to submit attendance: ' + (err?.response?.data?.error || err.message));
    }
  };

  /* ---------------- UI styles ---------------- */
  const enhancedFilterBoxStyle = { display: 'flex', flexDirection: 'column', gap: 8 };
  const enhancedLabelStyle = { fontWeight: 600, fontSize: 14, color: '#4b5563', marginBottom: 4 };
  const enhancedInputStyle = {
    padding: '8px 12px',
    borderRadius: 8,
    border: '2px solid #e5e7eb',
    fontSize: 14,
    fontWeight: 500,
    outline: 'none'
  };

  const subjectDisplay = selectedOfferCourseId
    ? subjectDescFromList(selectedOfferCourseId, subjects)
    : '--';

  // Function to get academic year start and end dates
  const getAcademicYearRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // Assuming academic year starts in April (month 3) and ends in March (month 2)
    // If current month is before April, academic year started last year
    if (currentMonth < 3) {
      return {
        start: `${currentYear - 1}-04-01`,
        end: `${currentYear}-03-31`,
        label: `${currentYear - 1}-${currentYear}`
      };
    } else {
      return {
        start: `${currentYear}-04-01`,
        end: `${currentYear + 1}-03-31`,
        label: `${currentYear}-${currentYear + 1}`
      };
    }
  };

  // Function to get custom date range
  const getCustomDateRange = (startDate, endDate) => {
    return {
      start: startDate,
      end: endDate
    };
  };

  // Function to get week start and end dates
  const getWeekRange = (dateStr) => {
    const date = new Date(dateStr);
    const day = date.getDay();
    const startDate = new Date(date);
    startDate.setDate(date.getDate() - day);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  };

  // Function to get month start and end dates
  const getMonthRange = (dateStr) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  };

  // Function to filter records by date range
  const filterRecordsByDateRange = (records, startDate, endDate) => {
    return records.filter(rec => {
      const recordDate = (rec.attts_in || '').split('T')[0];
      return recordDate >= startDate && recordDate <= endDate;
    });
  };

  // Export to CSV function
  const exportToCSV = (data, filename, includeStats = false) => {
    if (!data.length) {
      alert('No data to export');
      return;
    }

    // Calculate statistics
    const presentCount = data.filter(rec => rec.attvalid).length;
    const absentCount = data.length - presentCount;
    const attendanceRate = data.length > 0 ? Math.round((presentCount / data.length) * 100) : 0;

    // Create CSV content
    const headers = [
      'Sr. No.',
      'Date',
      'Employee ID',
      'Employee Name',
      'Role',
      'Department',
      'Status',
      'Check-In Time',
      'Check-Out Time',
      'Day',
      'Slot',
      'Time',
      'Subject',
      'Class',
      'Marked By'
    ];

    let csvContent = [
      headers.join(','),
      ...data.map((rec, index) => {
        const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
        const roleName = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
        const recordDate = formatDate((rec.attts_in || '').split('T')[0]);
        const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
        const status = rec.attvalid ? 'Present' : 'Absent';
        const time = rec.drfrom && rec.drto ? `${rec.drfrom} - ${rec.drto}` : '--';
        const subject = subjectDescFromList(rec.attcourseid, subjects) || '--';
        const checkIn = rec.attts_in ? new Date(rec.attts_in).toLocaleTimeString() : '--';
        const checkOut = rec.attts_out ? new Date(rec.attts_out).toLocaleTimeString() : '--';
        const department = teacher?.department || 'Academic';
        
        return [
          index + 1,
          `"${recordDate}"`,
          `"${rec.attmaarkedbyemployee || ''}"`,
          `"${employeeName}"`,
          `"${roleName}"`,
          `"${department}"`,
          `"${status}"`,
          `"${checkIn}"`,
          `"${checkOut}"`,
          `"${rec.drdayofweek || '--'}"`,
          `"${rec.drslot || '--'}"`,
          `"${time}"`,
          `"${subject}"`,
          `"${rec.attclassid || '--'}"`,
          `"${employeeName}"`
        ].join(',');
      })
    ].join('\n');

    // Add statistics at the end if requested
    if (includeStats) {
      csvContent += '\n\n"ATTENDANCE SUMMARY"\n';
      csvContent += `"Total Records:","${data.length}"\n`;
      csvContent += `"Present:","${presentCount}"\n`;
      csvContent += `"Absent:","${absentCount}"\n`;
      csvContent += `"Attendance Rate:","${attendanceRate}%"\n`;
      csvContent += `"Report Generated:","${new Date().toLocaleString()}"\n`;
    }

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to Excel format (as CSV with Excel-friendly formatting)
  const exportToExcel = (data, filename) => {
    if (!data.length) {
      alert('No data to export');
      return;
    }

    // Calculate statistics
    const presentCount = data.filter(rec => rec.attvalid).length;
    const absentCount = data.length - presentCount;
    const attendanceRate = data.length > 0 ? Math.round((presentCount / data.length) * 100) : 0;

    // Create Excel-friendly CSV with UTF-8 BOM for proper character encoding
    const BOM = '\uFEFF';
    const headers = [
      'Sr. No.',
      'Date',
      'Employee ID',
      'Employee Name',
      'Role',
      'Status',
      'Check-In',
      'Check-Out',
      'Working Hours',
      'Subject',
      'Class'
    ];

    let excelContent = BOM + headers.join('\t') + '\n';
    
    data.forEach((rec, index) => {
      const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
      const roleName = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
      const recordDate = formatDate((rec.attts_in || '').split('T')[0]);
      const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
      const status = rec.attvalid ? 'Present' : 'Absent';
      const subject = subjectDescFromList(rec.attcourseid, subjects) || '--';
      const checkIn = rec.attts_in ? new Date(rec.attts_in).toLocaleTimeString() : '--';
      const checkOut = rec.attts_out ? new Date(rec.attts_out).toLocaleTimeString() : '--';
      
      // Calculate working hours
      let workingHours = '--';
      if (rec.attts_in && rec.attts_out) {
        const inTime = new Date(rec.attts_in);
        const outTime = new Date(rec.attts_out);
        const diff = outTime - inTime;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        workingHours = `${hours}h ${minutes}m`;
      }
      
      excelContent += [
        index + 1,
        recordDate,
        rec.attmaarkedbyemployee || '',
        employeeName,
        roleName,
        status,
        checkIn,
        checkOut,
        workingHours,
        subject,
        rec.attclassid || '--'
      ].join('\t') + '\n';
    });

    // Add summary
    excelContent += '\n\nATTENDANCE SUMMARY\n';
    excelContent += `Total Records:\t${data.length}\n`;
    excelContent += `Present:\t${presentCount}\n`;
    excelContent += `Absent:\t${absentCount}\n`;
    excelContent += `Attendance Rate:\t${attendanceRate}%\n`;
    excelContent += `Report Generated:\t${new Date().toLocaleString()}\n`;

    // Create download link
    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename.replace('.csv', '.xls'));
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper function to apply all filters
  const applyAllFilters = (records) => {
    return records.filter(rec => {
      // Date filter
      if (dateFilter && (rec.attts_in || '').slice(0, 10) !== dateFilter) return false;
      
      // Role filter
      if (roleFilter) {
        const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
        const recordRole = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
        if (recordRole !== roleFilter) return false;
      }
      
      // Employee name filter
      if (employeeFilter) {
        const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
        const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
        if (!employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
      }
      
      return true;
    });
  };

  // Export functions for different periods
  const exportDaily = (format = 'csv') => {
    const targetDate = dateFilter || todayYMD();
    let filteredRecords = attendanceList.filter(rec => 
      (rec.attts_in || '').split('T')[0] === targetDate
    );
    
    // Apply role and employee filters if set
    if (roleFilter || employeeFilter) {
      filteredRecords = applyAllFilters(filteredRecords);
    }
    
    if (filteredRecords.length === 0) {
      alert('No attendance records found for the selected date');
      return;
    }
    
    const filename = `attendance_daily_${targetDate}`;
    if (format === 'excel') {
      exportToExcel(filteredRecords, `${filename}.xls`);
    } else {
      exportToCSV(filteredRecords, `${filename}.csv`, includeStats);
    }
  };

  const exportWeekly = (format = 'csv') => {
    const weekRange = getWeekRange(dateFilter || todayYMD());
    let filteredRecords = filterRecordsByDateRange(attendanceList, weekRange.start, weekRange.end);
    
    // Apply role and employee filters if set
    if (roleFilter || employeeFilter) {
      filteredRecords = filteredRecords.filter(rec => {
        // Role filter
        if (roleFilter) {
          const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
          const recordRole = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
          if (recordRole !== roleFilter) return false;
        }
        
        // Employee name filter
        if (employeeFilter) {
          const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
          const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
          if (!employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
        }
        
        return true;
      });
    }
    
    if (filteredRecords.length === 0) {
      alert('No attendance records found for the selected week');
      return;
    }
    
    const filename = `attendance_weekly_${weekRange.start}_to_${weekRange.end}`;
    if (format === 'excel') {
      exportToExcel(filteredRecords, `${filename}.xls`);
    } else {
      exportToCSV(filteredRecords, `${filename}.csv`, includeStats);
    }
  };

  const exportMonthly = (format = 'csv') => {
    const monthRange = getMonthRange(dateFilter || todayYMD());
    let filteredRecords = filterRecordsByDateRange(attendanceList, monthRange.start, monthRange.end);
    
    // Apply role and employee filters if set
    if (roleFilter || employeeFilter) {
      filteredRecords = filteredRecords.filter(rec => {
        // Role filter
        if (roleFilter) {
          const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
          const recordRole = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
          if (recordRole !== roleFilter) return false;
        }
        
        // Employee name filter
        if (employeeFilter) {
          const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
          const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
          if (!employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
        }
        
        return true;
      });
    }
    
    if (filteredRecords.length === 0) {
      alert('No attendance records found for the selected month');
      return;
    }
    
    const monthName = new Date(monthRange.start).toLocaleString('default', { month: 'long', year: 'numeric' });
    const filename = `attendance_monthly_${monthName.replace(' ', '_')}`;
    if (format === 'excel') {
      exportToExcel(filteredRecords, `${filename}.xls`);
    } else {
      exportToCSV(filteredRecords, `${filename}.csv`, includeStats);
    }
  };

  const exportAcademicYear = (format = 'csv') => {
    const academicYear = getAcademicYearRange();
    let filteredRecords = filterRecordsByDateRange(attendanceList, academicYear.start, academicYear.end);
    
    // Apply role and employee filters if set
    if (roleFilter || employeeFilter) {
      filteredRecords = filteredRecords.filter(rec => {
        // Role filter
        if (roleFilter) {
          const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
          const recordRole = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
          if (recordRole !== roleFilter) return false;
        }
        
        // Employee name filter
        if (employeeFilter) {
          const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
          const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
          if (!employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
        }
        
        return true;
      });
    }
    
    if (filteredRecords.length === 0) {
      alert('No attendance records found for the academic year');
      return;
    }
    
    const filename = `attendance_academic_year_${academicYear.label}`;
    if (format === 'excel') {
      exportToExcel(filteredRecords, `${filename}.xls`);
    } else {
      exportToCSV(filteredRecords, `${filename}.csv`, includeStats);
    }
  };

  const exportCustomRange = (format = 'csv') => {
    if (!customStartDate || !customEndDate) {
      alert('Please select both start and end dates');
      return;
    }
    
    if (customStartDate > customEndDate) {
      alert('Start date must be before end date');
      return;
    }
    
    const filteredRecords = filterRecordsByDateRange(attendanceList, customStartDate, customEndDate);
    
    if (filteredRecords.length === 0) {
      alert('No attendance records found for the selected date range');
      return;
    }
    
    const filename = `attendance_custom_${customStartDate}_to_${customEndDate}`;
    if (format === 'excel') {
      exportToExcel(filteredRecords, `${filename}.xls`);
    } else {
      exportToCSV(filteredRecords, `${filename}.csv`, includeStats);
    }
  };

  // Handle export based on type
  const handleExport = () => {
    switch(exportType) {
      case 'daily':
        exportDaily(exportFormat);
        break;
      case 'weekly':
        exportWeekly(exportFormat);
        break;
      case 'monthly':
        exportMonthly(exportFormat);
        break;
      case 'academic':
        exportAcademicYear(exportFormat);
        break;
      case 'custom':
        exportCustomRange(exportFormat);
        break;
      default:
        break;
    }
    setShowExportModal(false);
  };

  // Sorting function
  const sortRecords = (records) => {
    return records.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'date':
          aVal = new Date(a.attts_in || '');
          bVal = new Date(b.attts_in || '');
          break;
        case 'name':
          const aTeacher = teachers.find(t => t.teacherid === a.attmaarkedbyemployee);
          const bTeacher = teachers.find(t => t.teacherid === b.attmaarkedbyemployee);
          aVal = (aTeacher?.teachername || a.attmaarkedbyemployee || '').toLowerCase();
          bVal = (bTeacher?.teachername || b.attmaarkedbyemployee || '').toLowerCase();
          break;
        case 'role':
          const aTeacherRole = teachers.find(t => t.teacherid === a.attmaarkedbyemployee);
          const bTeacherRole = teachers.find(t => t.teacherid === b.attmaarkedbyemployee);
          aVal = (aTeacherRole?.role || a.teacherRole || a.role || 'Faculty').toLowerCase();
          bVal = (bTeacherRole?.role || b.teacherRole || b.role || 'Faculty').toLowerCase();
          break;
        case 'status':
          aVal = a.attvalid ? 1 : 0;
          bVal = b.attvalid ? 1 : 0;
          break;
        default:
          aVal = new Date(a.attts_in || '');
          bVal = new Date(b.attts_in || '');
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 16, padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontWeight: 700, fontSize: 32, color: '#fff', marginBottom: 32, letterSpacing: 0.5, textAlign: 'center' }}>
          👥 EMPLOYEE ATTENDANCE MANAGEMENT
        </h2>

        {/* Primary Filters Panel - Date and Role */}
        <div
          style={{
            background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
            borderRadius: 16,
            padding: 28,
            marginBottom: 24,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: '1px solid rgba(255,255,255,0.2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0, color: '#1e293b', fontSize: 20, fontWeight: 700 }}>
              🎯 Primary Filters
            </h3>
            <div style={{ marginLeft: 'auto', fontSize: 14, color: '#64748b', fontWeight: 500 }}>
              Filter by Date & Role
            </div>
          </div>

          {/* Primary Filter Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                📅 <span>Select Date</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '2px solid #e2e8f0',
                  fontSize: 16,
                  fontWeight: 500,
                  outline: 'none',
                  background: '#ffffff',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                }}
                max={todayStr}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
              <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Selected: {formatDate(date)} ({weekdayFromDate(date)})
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                👥 <span>Employee Role</span>
              </label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '2px solid #e2e8f0',
                  fontSize: 16,
                  fontWeight: 500,
                  outline: 'none',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              >
                <option key="all-roles" value="">🌟 All Roles</option>
                <option key="admin-role" value="Admin">🔑 Admin</option>
                <option key="manager-role" value="Manager">👔 Manager</option>
                <option key="faculty-role" value="Faculty">🎓 Faculty</option>
                {roles.length > 0 && (
                  [...new Set(roles.map(role => role.role_name))]
                    .filter(roleName => !['Admin', 'Manager', 'Faculty'].includes(roleName))
                    .map((roleName, index) => (
                      <option key={`dynamic-role-${roleName || 'unknown'}-${index}`} value={roleName}>
                        {roleName}
                      </option>
                    ))
                )}
              </select>
              <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {selectedRole ? `Showing: ${selectedRole} employees` : 'Showing all employee roles'}
              </span>
            </div>

            {(date !== todayStr || selectedRole) && (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setDate(todayYMD());
                    setSelectedRole('');
                  }}
                  style={{
                    padding: '12px 20px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(239,68,68,0.3)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 6px 16px rgba(239,68,68,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 12px rgba(239,68,68,0.3)';
                  }}
                >
                  🔄 <span>Reset Filters</span>
                </button>
                <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
                  Clear all applied filters
                </span>
              </div>
            )}
          </div>

          {/* Filter Status Indicator */}
          <div style={{ 
            padding: '12px 16px', 
            background: selectedRole || date !== todayStr ? '#dbeafe' : '#f1f5f9', 
            borderRadius: 8, 
            border: selectedRole || date !== todayStr ? '1px solid #3b82f6' : '1px solid #cbd5e1'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Active Filters:</span>
              {date !== todayStr && (
                <span style={{
                  padding: '4px 12px',
                  background: '#3b82f6',
                  color: '#ffffff',
                  borderRadius: 16,
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  📅 {formatDate(date)}
                </span>
              )}
              {selectedRole && (
                <span style={{
                  padding: '4px 12px',
                  background: '#8b5cf6',
                  color: '#ffffff',
                  borderRadius: 16,
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  👥 {selectedRole}
                </span>
              )}
              {!selectedRole && date === todayStr && (
                <span style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>No filters applied - showing today's data for all roles</span>
              )}
            </div>
          </div>
        </div>

        {/* Secondary Filters Panel */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 16, color: '#4c1d95', fontSize: 16 }}>
            🔧 Additional Options
          </h3>

          {/* Dependent selections */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={enhancedFilterBoxStyle}>
              <label style={enhancedLabelStyle}>👨‍🏫 Employee:</label>
              <select
                value={teacherId}
                onChange={e => setTeacherId(e.target.value)}
                style={enhancedInputStyle}
                disabled={filteredTeachers.length === 0}
              >
                <option key="select-employee-default" value="">-- Select Employee --</option>
                {filteredTeachers.map(opt => (
                  <option key={opt.teacherid} value={opt.teacherid}>
                    {opt.displayName || opt.teachername}
                  </option>
                ))}
              </select>
            </div>

            <div style={enhancedFilterBoxStyle}>
              <label style={enhancedLabelStyle}>🎓 Offer ID:</label>
              <select
                value={offerId}
                onChange={e => setOfferId(e.target.value)}
                style={enhancedInputStyle}
                disabled={!teacherId || offerings.length <= 1}
              >
                {offerings.map(opt => (
                  <option key={opt.offerid} value={opt.offerid}>
                    {opt.offerlabel || opt.offerid}
                  </option>
                ))}
              </select>
            </div>

            <div style={enhancedFilterBoxStyle}>
              <label style={enhancedLabelStyle}>🏫 Class:</label>
              <select
                value={classId}
                onChange={e => setClassId(e.target.value)}
                style={enhancedInputStyle}
                disabled={!teacherId || classes.length <= 1}
              >
                {classes.map(opt => (
                  <option key={opt.classroomid} value={opt.classroomid}>
                    {opt.classroomname}
                  </option>
                ))}
              </select>
            </div>

            <div style={enhancedFilterBoxStyle}>
              <label style={enhancedLabelStyle}>📚 Subject:</label>
              <input
                type="text"
                value={subjectDisplay}
                readOnly
                style={{ ...enhancedInputStyle, background: '#f0f4f8', color: '#6b7280' }}
              />
            </div>
          </div>
        </div>

        {/* Purple bar — shows routine info if available */}
        {routine && (
          <div
            style={{
              margin: '16px 0 0 0',
              padding: 18,
              borderRadius: 10,
              background: '#e0e7ff',
              color: '#222',
              fontWeight: 500
            }}
          >
            <span style={{ marginRight: 28 }}>
              Day: <b>{selectedDayName}</b>
            </span>
            <span style={{ marginRight: 28 }}>
              Slot: <b>{routine.drslot}</b>
            </span>
            <span style={{ marginRight: 28 }}>
              From: <b>{routine.drfrom}</b>
            </span>
            <span>
              To: <b>{routine.drto}</b>
            </span>
            <span style={{ marginLeft: 32, color: '#6349b5' }}>
              Subject: <b>{subjectDisplay}</b>
            </span>
          </div>
        )}

        {/* Guard message */}
        {guardMsg && (teacherId && offerId && classId) && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              background: '#fff7ed',
              color: '#9a3412',
              border: '1px solid #fdba74',
              borderRadius: 8
            }}
          >
            {guardMsg}
          </div>
        )}

        {/* Attendance form */}
        {teacherId && offerId && classId && (
          <form onSubmit={handleSubmitAttendance}>
            <h3 style={{ color: '#6366F1', margin: '18px 0 10px 0', fontWeight: 700 }}>
              Attendance Date: <span style={{ color: '#463cf1' }}>{date}</span>
            </h3>
            <div
              style={{
                borderRadius: 14,
                background: '#fff',
                boxShadow: '0 2px 8px #b3b6ff29',
                margin: '18px 0',
                padding: 10
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 17 }}>
                <thead>
                  <tr style={{ background: '#eef2ff', color: '#3730a3', fontWeight: 600 }}>
                    <th style={{ padding: '12px 8px', textAlign: 'left' }}>Teacher ID</th>
                    <th style={{ padding: '12px 8px', textAlign: 'left' }}>Teacher Name</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center' }}>Present</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: 12 }}>{teacherId}</td>
                    <td style={{ padding: 12 }}>{teachers.find(t => t.teacherid === teacherId)?.teachername}</td>
                    <td style={{ textAlign: 'center', padding: 12 }}>
                      <input
                        type="checkbox"
                        checked={present}
                        onChange={() => { if (canSubmit) setPresent(p => !p); }}
                        disabled={!canSubmit}
                        title={!canSubmit ? (guardMsg || 'Complete selections first') : ''}
                      />
                      {alreadyMarked && (
                        <span
                          style={{
                            marginLeft: 10,
                            color: present ? 'green' : 'red',
                            fontWeight: 600
                          }}
                        >
                          {present ? 'Present' : 'Absent'}
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button
              type="submit"
              style={{
                padding: '12px 38px',
                background: (!canSubmit ? '#ccc' : '#2563eb'),
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 19,
                float: 'right',
                marginTop: 12,
                cursor: (!canSubmit ? 'not-allowed' : 'pointer')
              }}
              disabled={!canSubmit}
              title={!canSubmit ? (guardMsg || 'Not allowed') : ''}
            >
              {alreadyMarked ? 'Attendance Given' : 'Submit Attendance'}
            </button>
            {submitMessage && (
              <div
                style={{
                  clear: 'both',
                  marginTop: 12,
                  color: submitMessage.includes('success') ? 'green' : 'red',
                  fontWeight: 600
                }}
              >
                {submitMessage}
              </div>
            )}
          </form>
        )}

        {/* Export Controls Section - Always Visible */}
        <div
          style={{
            margin: '30px 0 0 0',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}
          >
            <h3 style={{ fontWeight: 700, color: '#4c1d95', margin: 0 }}>📤 Export Attendance Data</h3>
          </div>
          
          {/* Export Buttons - Always Available */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => { setExportType('daily'); setShowExportModal(true); }}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s'
              }}
              title="Export today's or selected date attendance"
            >
              📄 Export Daily
            </button>
            <button
              onClick={() => { setExportType('weekly'); setShowExportModal(true); }}
              style={{
                padding: '8px 16px',
                background: '#8b5cf6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s'
              }}
              title="Export current week attendance (Sun-Sat)"
            >
              📅 Export Weekly
            </button>
            <button
              onClick={() => { setExportType('monthly'); setShowExportModal(true); }}
              style={{
                padding: '8px 16px',
                background: '#ec4899',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s'
              }}
              title="Export current month attendance"
            >
              🗓️ Export Monthly
            </button>
            <button
              onClick={() => { setExportType('academic'); setShowExportModal(true); }}
              style={{
                padding: '8px 16px',
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s'
              }}
              title="Export academic year attendance (Apr-Mar)"
            >
              🎓 Export Academic Year
            </button>
            <button
              onClick={() => { setExportType('custom'); setShowExportModal(true); }}
              style={{
                padding: '8px 16px',
                background: '#f59e0b',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s'
              }}
              title="Export custom date range"
            >
              📊 Custom Range
            </button>
            
            {/* Quick export dropdown - only show if data exists */}
            {attendanceList.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Quick Export All:</label>
                <select
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'csv-all') {
                      exportToCSV(attendanceList, 'all_attendance.csv', true);
                    } else if (value === 'excel-all') {
                      exportToExcel(attendanceList, 'all_attendance.xls');
                    }
                    e.target.value = '';
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '2px solid #cbd5e1',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  <option key="select-format-default" value="">Select Format</option>
                  <option key="csv-all-format" value="csv-all">📁 All Data (CSV)</option>
                  <option key="excel-all-format" value="excel-all">📊 All Data (Excel)</option>
                </select>
              </div>
            )}
          </div>
          
          {attendanceList.length === 0 && (
            <div style={{ 
              padding: '16px', 
              background: '#fef3c7', 
              borderRadius: 8, 
              color: '#92400e',
              fontSize: 14
            }}>
              ℹ️ Please select Employee, Offer ID, and Class to load attendance data for export.
            </div>
          )}
        </div>

        {/* Attendance History Section */}
        {attendanceList.length > 0 && (
          <div
            style={{
              margin: '30px 0 0 0',
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}
          >
            <div
              style={{ marginBottom: 20 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontWeight: 700, color: '#4c1d95', margin: 0 }}>📊 Attendance History & Analytics</h3>
                
                {/* Sorting Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '2px solid #cbd5e1',
                      fontSize: 13,
                      fontWeight: 500,
                      background: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <option key="sort-date" value="date">📅 Date</option>
                    <option key="sort-name" value="name">👤 Name</option>
                    <option key="sort-role" value="role">🏢 Role</option>
                    <option key="sort-status" value="status">✅ Status</option>
                  </select>
                  
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    style={{
                      padding: '6px 12px',
                      background: sortOrder === 'asc' ? '#dbeafe' : '#fecaca',
                      color: sortOrder === 'asc' ? '#1e40af' : '#991b1b',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title={`Sort ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
                  >
                    {sortOrder === 'asc' ? '📈' : '📉'} {sortOrder.toUpperCase()}
                  </button>
                </div>
              </div>
              
              {/* Enhanced Filter Controls */}
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
                  gap: 16,
                  padding: 20,
                  background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)',
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  marginBottom: 16
                }}
              >
                {/* Date Filter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>📅 Filter by Date:</label>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '2px solid #cbd5e1',
                      fontSize: 14,
                      background: '#fff',
                      fontWeight: 500,
                      transition: 'all 0.2s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                  />
                </div>
                
                {/* Role Filter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>👥 Filter by Role:</label>
                  <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '2px solid #cbd5e1',
                      fontSize: 14,
                      background: '#fff',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.2s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                  >
                    <option key="filter-all-roles" value="">🌟 All Roles</option>
                    <option key="filter-admin-role" value="Admin">🔑 Admin</option>
                    <option key="filter-manager-role" value="Manager">👔 Manager</option>
                    <option key="filter-faculty-role" value="Faculty">🎓 Faculty</option>
                  </select>
                </div>
                
                {/* Employee Name Filter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>🔍 Search Employee:</label>
                  <input
                    type="text"
                    value={employeeFilter}
                    onChange={e => setEmployeeFilter(e.target.value)}
                    placeholder="Type employee name..."
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '2px solid #cbd5e1',
                      fontSize: 14,
                      background: '#fff',
                      fontWeight: 500,
                      transition: 'all 0.2s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                  />
                </div>
                
                {/* Clear All Filters Button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setDateFilter('');
                      setRoleFilter('');
                      setEmployeeFilter('');
                      setSortBy('date');
                      setSortOrder('desc');
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      height: 'fit-content',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(239,68,68,0.3)'
                    }}
                    title="Clear all filters and reset sorting"
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'translateY(-1px)';
                      e.target.style.boxShadow = '0 4px 12px rgba(239,68,68,0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 2px 8px rgba(239,68,68,0.3)';
                    }}
                  >
                    🔄 Reset All
                  </button>
                </div>
              </div>
              
              {/* Active Filters Display */}
              {(dateFilter || roleFilter || employeeFilter) && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Active Filters:</span>
                  {dateFilter && (
                    <span style={{
                      padding: '4px 12px',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      📅 {formatDate(dateFilter)}
                      <button
                        onClick={() => setDateFilter('')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#1e40af',
                          cursor: 'pointer',
                          padding: 0,
                          marginLeft: 4,
                          fontSize: 16,
                          lineHeight: 1
                        }}
                      >×</button>
                    </span>
                  )}
                  {roleFilter && (
                    <span style={{
                      padding: '4px 12px',
                      background: '#fce7f3',
                      color: '#a21caf',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      👤 {roleFilter}
                      <button
                        onClick={() => setRoleFilter('')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#a21caf',
                          cursor: 'pointer',
                          padding: 0,
                          marginLeft: 4,
                          fontSize: 16,
                          lineHeight: 1
                        }}
                      >×</button>
                    </span>
                  )}
                  {employeeFilter && (
                    <span style={{
                      padding: '4px 12px',
                      background: '#dcfce7',
                      color: '#166534',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      🔍 "{employeeFilter}"
                      <button
                        onClick={() => setEmployeeFilter('')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#166534',
                          cursor: 'pointer',
                          padding: 0,
                          marginLeft: 4,
                          fontSize: 16,
                          lineHeight: 1
                        }}
                      >×</button>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Records count with enhanced filtering */}
            {(() => {
              const filteredByAll = attendanceList.filter(rec => {
                // Date filter
                if (dateFilter && (rec.attts_in || '').slice(0, 10) !== dateFilter) return false;
                
                // Role filter
                if (roleFilter) {
                  const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                  const recordRole = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
                  if (recordRole !== roleFilter) return false;
                }
                
                // Employee name filter
                if (employeeFilter) {
                  const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                  const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
                  if (!employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
                }
                
                return true;
              });
              
              // Role-wise statistics
              const roleStats = {};
              filteredByAll.forEach(rec => {
                const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                const role = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
                if (!roleStats[role]) {
                  roleStats[role] = { total: 0, present: 0, absent: 0 };
                }
                roleStats[role].total++;
                if (rec.attvalid) {
                  roleStats[role].present++;
                } else {
                  roleStats[role].absent++;
                }
              });
              
              return (
                <div style={{ marginBottom: 20 }}>
                  {/* Records Count */}
                  <div style={{ marginBottom: 16, color: '#6b7280', fontSize: 14 }}>
                    Showing <strong>{filteredByAll.length}</strong> of <strong>{attendanceList.length}</strong> records
                  </div>
                  
                  {/* Role-wise Summary */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 16,
                    marginBottom: 12,
                    padding: 16,
                    background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ gridColumn: '1 / -1', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        📊 <span>Role-wise Attendance Summary</span>
                      </h4>
                    </div>
                    
                    {Object.entries(roleStats).map(([role, stats]) => {
                      const attendanceRate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
                      return (
                        <div
                          key={role}
                          style={{
                            padding: '12px 16px',
                            background: '#ffffff',
                            borderRadius: 10,
                            border: '2px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              background: getRoleBackgroundColor(role),
                              color: getRoleTextColor(role)
                            }}>
                              {role === 'Admin' ? '🔑' : role === 'Manager' ? '👔' : role === 'Faculty' ? '🎓' : '👤'} {role}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Total:</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{stats.total}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#064e3b', fontWeight: 500 }}>Present:</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{stats.present}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#7c2d12', fontWeight: 500 }}>Absent:</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{stats.absent}</span>
                            </div>
                            <div style={{ 
                              marginTop: 6, 
                              padding: '4px 8px', 
                              background: attendanceRate >= 80 ? '#dcfce7' : attendanceRate >= 60 ? '#fef3c7' : '#fee2e2',
                              borderRadius: 8,
                              textAlign: 'center'
                            }}>
                              <span style={{ 
                                fontSize: 12, 
                                fontWeight: 700, 
                                color: attendanceRate >= 80 ? '#166534' : attendanceRate >= 60 ? '#92400e' : '#991b1b'
                              }}>
                                {attendanceRate}% Rate
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Attendance Statistics */}
            {(() => {
              const filteredRecords = attendanceList.filter(rec => {
                // Date filter
                if (dateFilter && (rec.attts_in || '').slice(0, 10) !== dateFilter) return false;
                
                // Role filter
                if (roleFilter) {
                  const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                  const recordRole = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
                  if (recordRole !== roleFilter) return false;
                }
                
                // Employee name filter
                if (employeeFilter) {
                  const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                  const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
                  if (!employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
                }
                
                return true;
              });
              const presentCount = filteredRecords.filter(rec => rec.attvalid).length;
              const absentCount = filteredRecords.length - presentCount;
              const presentPercentage = filteredRecords.length > 0 ? Math.round((presentCount / filteredRecords.length) * 100) : 0;

              return (
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div
                    style={{
                      background: '#dcfce7',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontWeight: 600,
                      color: '#166534'
                    }}
                  >
                    Present: {presentCount}
                  </div>
                  <div
                    style={{
                      background: '#fee2e2',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontWeight: 600,
                      color: '#991b1b'
                    }}
                  >
                    Absent: {absentCount}
                  </div>
                  <div
                    style={{
                      background: '#e0e7ff',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontWeight: 600,
                      color: '#4c1d95'
                    }}
                  >
                    Attendance Rate: {presentPercentage}%
                  </div>
                </div>
              );
            })()}

            <div style={{ overflowX: 'auto', maxHeight: 500, border: '2px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#fff' }}>
                <thead style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ color: '#fff' }}>
                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, borderRight: '1px solid rgba(255,255,255,0.1)' }}>📅 DATE</th>
                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, borderRight: '1px solid rgba(255,255,255,0.1)' }}>👤 EMPLOYEE NAME</th>
                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, borderRight: '1px solid rgba(255,255,255,0.1)' }}>🏢 ROLE</th>
                    <th style={{ padding: '16px 12px', textAlign: 'center', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, borderRight: '1px solid rgba(255,255,255,0.1)' }}>✅ STATUS</th>
                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, borderRight: '1px solid rgba(255,255,255,0.1)' }}>📆 DAY</th>
                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, borderRight: '1px solid rgba(255,255,255,0.1)' }}>⏰ TIME SLOT</th>
                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>📚 SUBJECT</th>
                  </tr>
                </thead>
                <tbody>
                  {sortRecords(
                    attendanceList.filter(rec => {
                      // Date filter
                      if (dateFilter && (rec.attts_in || '').slice(0, 10) !== dateFilter) return false;
                      
                      // Role filter
                      if (roleFilter) {
                        const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                        const recordRole = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
                        if (recordRole !== roleFilter) return false;
                      }
                      
                      // Employee name filter
                      if (employeeFilter) {
                        const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                        const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
                        if (!employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
                      }
                      
                      return true;
                    })
                  )
                    .map((rec, i) => {
                      // Find teacher from the teachers array or use rec data if available
                      const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                      // If teacher not found in state, try to get role info from the record itself
                      const roleName = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
                      const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || 'Unknown';
                      const recordDate = (rec.attts_in || '').slice(0, 10);
                      
                      return (
                        <tr
                          key={`attendance-${rec.attid || 'temp'}-${i}-${rec.attmaarkedbyemployee || ''}-${rec.attts_in ? rec.attts_in.replace(/[^0-9]/g, '') : Date.now()}`}
                          style={{
                            background: i % 2 === 0 ? '#ffffff' : '#fafbfc',
                            borderBottom: '2px solid #f1f5f9',
                            transition: 'all 0.2s ease',
                            cursor: 'default'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#f0f9ff';
                            e.currentTarget.style.transform = 'scale(1.001)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = i % 2 === 0 ? '#ffffff' : '#fafbfc';
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          {/* Date Column - Most Prominent */}
                          <td style={{ padding: '12px', borderRight: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ 
                                fontWeight: 700, 
                                fontSize: 15, 
                                color: '#1e293b',
                                letterSpacing: 0.3
                              }}>
                                {formatDate(recordDate)}
                              </span>
                              <span style={{ 
                                fontSize: 11, 
                                color: '#64748b', 
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5
                              }}>
                                {weekdayFromDate(recordDate)}
                              </span>
                            </div>
                          </td>
                          
                          {/* Employee Name Column - Second Most Prominent */}
                          <td style={{ padding: '12px', borderRight: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ 
                                fontWeight: 600, 
                                fontSize: 15, 
                                color: '#0f172a',
                                lineHeight: 1.2
                              }}>
                                {employeeName}
                              </span>
                              <span style={{ 
                                fontSize: 11, 
                                color: '#64748b', 
                                fontWeight: 500
                              }}>
                                ID: {rec.attmaarkedbyemployee || '--'}
                              </span>
                            </div>
                          </td>
                          
                          {/* Role Column - Third Most Prominent */}
                          <td style={{ padding: '12px', borderRight: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 20,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.5,
                                  background: getRoleBackgroundColor(roleName),
                                  color: getRoleTextColor(roleName),
                                  border: `2px solid ${getRoleTextColor(roleName)}20`,
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                              >
                                {roleName === 'Admin' ? '🔑 ADMIN' : 
                                 roleName === 'Manager' ? '👔 MANAGER' : 
                                 roleName === 'Faculty' ? '🎓 FACULTY' : roleName}
                              </span>
                            </div>
                          </td>
                          
                          {/* Status Column */}
                          <td style={{ padding: '12px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                            <span
                              style={{
                                padding: '6px 14px',
                                borderRadius: 16,
                                fontSize: 12,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                background: rec.attvalid 
                                  ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)' 
                                  : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                                color: rec.attvalid ? '#166534' : '#991b1b',
                                border: rec.attvalid 
                                  ? '2px solid #16653420' 
                                  : '2px solid #991b1b20',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                              }}
                            >
                              {rec.attvalid ? '✅ PRESENT' : '❌ ABSENT'}
                            </span>
                          </td>
                          
                          {/* Day Column */}
                          <td style={{ padding: '12px', borderRight: '1px solid #f1f5f9' }}>
                            <span style={{ 
                              fontSize: 13, 
                              color: '#475569', 
                              fontWeight: 500
                            }}>
                              {rec.drdayofweek || '--'}
                            </span>
                          </td>
                          
                          {/* Time Slot Column */}
                          <td style={{ padding: '12px', borderRight: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ 
                                fontSize: 13, 
                                color: '#475569', 
                                fontWeight: 500
                              }}>
                                {rec.drslot || '--'}
                              </span>
                              <span style={{ 
                                fontSize: 11, 
                                color: '#64748b', 
                                fontWeight: 500
                              }}>
                                {rec.drfrom && rec.drto ? `${rec.drfrom} - ${rec.drto}` : '--'}
                              </span>
                            </div>
                          </td>
                          
                          {/* Subject Column */}
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              fontSize: 13, 
                              color: '#475569', 
                              fontWeight: 500,
                              lineHeight: 1.4
                            }}>
                              {subjectDescFromList(rec.attcourseid, subjects) || '--'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {attendanceList.filter(rec => {
                // Date filter
                if (dateFilter && (rec.attts_in || '').slice(0, 10) !== dateFilter) return false;
                
                // Role filter
                if (roleFilter) {
                  const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                  const recordRole = teacher?.role || rec.teacherRole || rec.role || 'Faculty';
                  if (recordRole !== roleFilter) return false;
                }
                
                // Employee name filter
                if (employeeFilter) {
                  const teacher = teachers.find(t => t.teacherid === rec.attmaarkedbyemployee);
                  const employeeName = teacher?.teachername || rec.attmaarkedbyemployee || rec.teacherName || '';
                  if (!employeeName.toLowerCase().includes(employeeFilter.toLowerCase())) return false;
                }
                
                return true;
              }).length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>
                  {(dateFilter || roleFilter || employeeFilter) 
                    ? 'No attendance records found matching the selected filters.' 
                    : 'No attendance records found.'}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Export Modal */}
        {showExportModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowExportModal(false)}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 32,
                maxWidth: 500,
                width: '90%',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                animation: 'slideIn 0.3s ease-out'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0, marginBottom: 24, color: '#1f2937', fontSize: 20 }}>
                📤 Export Attendance Data
              </h3>
              
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#4b5563' }}>
                  Export Type: <span style={{ color: '#8b5cf6' }}>{exportType.toUpperCase()}</span>
                </label>
                
                {exportType === 'custom' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: '#6b7280' }}>Start Date:</label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '2px solid #e5e7eb',
                          fontSize: 14
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: '#6b7280' }}>End Date:</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '2px solid #e5e7eb',
                          fontSize: 14
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#4b5563' }}>Export Format:</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="csv"
                      checked={exportFormat === 'csv'}
                      onChange={(e) => setExportFormat(e.target.value)}
                      style={{ marginRight: 6 }}
                    />
                    <span style={{ fontSize: 14 }}>📄 CSV Format</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="excel"
                      checked={exportFormat === 'excel'}
                      onChange={(e) => setExportFormat(e.target.value)}
                      style={{ marginRight: 6 }}
                    />
                    <span style={{ fontSize: 14 }}>📊 Excel Format</span>
                  </label>
                </div>
              </div>
              
              {exportFormat === 'csv' && (
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={includeStats}
                      onChange={(e) => setIncludeStats(e.target.checked)}
                      style={{ marginRight: 8 }}
                    />
                    <span style={{ fontSize: 14, color: '#6b7280' }}>Include attendance statistics in report</span>
                  </label>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowExportModal(false)}
                  style={{
                    padding: '10px 20px',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  🚀 Export Now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeAttendance;
