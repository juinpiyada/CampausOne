// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AddCollege from './components/AddCollege.jsx';
import AddCourse from './components/AddCourse.jsx';
import CollegeGroupManager from './pages/CollageGroup/CollegeGroupManager.jsx';
import Manageuser from './pages/User/Manageuser.jsx';
import MasterStudent from './pages/Student/MasterStudent.jsx'; // ✅ Corrected path and name
import MasterSubject from './pages/Subject/MasterSubject.jsx';
import MasterTeacher from './pages/Teacher/MasterTeacher.jsx';
import MasterDepts from './pages/Department/MasterDepts.jsx';
import UserRole from './pages/User/UserRole.jsx';
import TeacherAvailabilityManager from './pages/TeacherAvailabilityManager/TeacherAvailabilityManager.jsx';
import ExamRoutineManager from './pages/ExamRoutineManager/ExamRoutineManager.jsx';
import CourseRegistrationManager from './pages/CourseRegistrationManager/CourseRegistrationManager.jsx';
import CourseOfferingManager from './pages/CourseOfferingManager/CourseOfferingManager.jsx';
import DailyRoutine from './pages/routine/DailyRoutine.jsx'; // ✅ Added DailyRoutine import
import ClassroomManager from './pages/classroom/ClassroomManager.jsx'; // Assuming you have this component
import MenuManager from './pages/menu/MenuManager';
import MasterRole from './pages/User/MasterRole.jsx';
import CollegeAttendenceManager from './pages/attendance/AttendanceManager.jsx';
import EmployeeAttendanceManager from './pages/attendance/EmployeeAttendance.jsx'; // ✅ Added EmployeeAttendanceManager import
import ExamResult from './pages/result/ExamResult.jsx'; // ✅ Added ExamResult import
import SmsDeviceManager from "./pages/device/SmsDeviceManager.jsx";
import WhiteboardManager from './pages/themes/White_bord.jsx'; // New WhiteboardManager import
import TeacherDtlsManager from './pages/Teacher/TeacherDtlsManager.jsx';
import UserDtlsManager from './pages/UserDtl/UserDtlsManager.jsx';
import StudentMasterManager from "./pages/StudentBulk/StudentMasterManager";
import TeacherMasterBulkUp from "./pages/TeacherBulk/TeacherMasterBulkUp";
import ExamResultBulkManager from './pages/result/ExamResultBulkManager.jsx';
import StudentInformationManager from "./pages/studentinformation/StudentInformationManager";
// ✅ CMS Finance imports
import FeeStructureManager from "./pages/cms-fin/FeeStructure.jsx";
import PaymentManager from "./pages/cms-fin/Payment.jsx";
import StudentFeelInvoiceManager from "./pages/cms-fin/StudentFeeInvoice.jsx";
import StuScholarshipManager from "./pages/cms-fin/StuScholarship.jsx";
import FinDashbordManager from "./pages/cms-fin/FinDashbord.jsx";
import DemandLetterGenerator from './pages/cms-fin/DemandLetterGenerator.jsx';
import TeacherInformation from './pages/Teacher/TeacherInformation.jsx';
import LeaveApplicationManager from './pages/Leave/LeaveApplicationManager.jsx';


export default function App() {
  return (
    <Router>
      <div
        style={{
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          fontFamily: 'Arial, sans-serif',
          backgroundColor: '#ffffff',
          minHeight: '100vh'
        }}
      >
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/add-college" element={<AddCollege />} />
          <Route path="/add-course" element={<AddCourse />} />
          <Route path="/college-group-manager" element={<CollegeGroupManager />} />
          <Route path="/manage-user" element={<Manageuser />} />
          <Route path="/master-student" element={<MasterStudent />} />
          <Route path="/master-subject" element={<MasterSubject />} />
          <Route path="/master-teacher" element={<MasterTeacher />} />
          <Route path="/master-depts" element={<MasterDepts />} />
          <Route path='/user-role' element={<UserRole />} />
          <Route path="/teacher-availability-manager" element={<TeacherAvailabilityManager />} />
          <Route path="/exam-routine-manager" element={<ExamRoutineManager />} />
          <Route path="/course-registration-manager" element={<CourseRegistrationManager />} />
          <Route path="/course-offering" element={<CourseOfferingManager />} />
          <Route path="/daily-routine" element={<DailyRoutine />} /> {/* ✅ Added DailyRoutine route */}
          <Route path="/class-room" element={<ClassroomManager />} /> {/* Assuming you have this component */}
          <Route path="/course-registration" element={<CourseRegistrationManager />} />
          <Route path="/menu" element={<MenuManager />} />
          <Route path="/master-role" element={<MasterRole />} /> {/* ✅ Added MasterRole route */}
          <Route path="/CollegeAttendenceManager" element={<CollegeAttendenceManager />} /> {/* ✅ Added CollegeAttendenceManager route */}
          <Route path="/employee-attendance" element={<EmployeeAttendanceManager />} /> {/* ✅ Added EmployeeAttendance route */}
          <Route path="/exam-result" element={<ExamResult />} /> {/* ✅ Added ExamResult route */}
          <Route path="/sms-device" element={<SmsDeviceManager />} /> {/* ✅ Added SmsDeviceManager route */}
          <Route path="/whiteboard_cms" element={<WhiteboardManager />} /> {/* New WhiteboardManager route */}
          <Route path="/teacher-dtls" element={<TeacherDtlsManager />} /> {/* ✅ Added TeacherDtlsManager route */}
          <Route path="/user-dtls" element={<UserDtlsManager />} />
          <Route path="/students" element={<StudentMasterManager />} />
          <Route path="/teachers" element={<TeacherMasterBulkUp />} />
          <Route path="/exam-result-bulk" element={<ExamResultBulkManager />} /> {/* ✅ Added ExamResultBulkManager route */}
          {/* ✅ NEW: Leave route */}
          <Route path="/leave" element={<LeaveApplicationManager />} />
          
          {/* ✅ CMS Finance routes */}
          <Route path="/cmsFeeStructure" element={<FeeStructureManager />} />
          <Route path="/cmsPayments" element={<PaymentManager />} />
          <Route path="/cmsStuFeeInvoice" element={<StudentFeelInvoiceManager />} />
          <Route path="/cmsStuScholarship" element={<StuScholarshipManager />} />
          <Route path="/finDashbord" element={<FinDashbordManager />} />
          <Route path="/demand-letter-generator" element={<DemandLetterGenerator />} />
          <Route path="/teacher-info" element={<TeacherInformation />} />
          <Route path="/studentinformation" element={<StudentInformationManager />} />
        </Routes>
      </div>
    </Router>
  );
}
