import React, { useState } from "react";
import { useParams } from "react-router-dom";
import EmployeeDashboard from "./EmployeeDashboard";
import EmployeeForm from "./EmployeeForm";
import EmployeeCard from "./EmployeeCard"; // 👈 استدعاء شاشة العرض الجديدة

export default function EmployeesPage() {
  const { employeeId = "" } = useParams();
  // حالة التحكم في الشاشة: "dashboard" | "form" | "card"
  const [currentView, setCurrentView] = useState("dashboard");
  // تخزين الموظف المحدد عند التعديل أو العرض
  const [selectedEmp, setSelectedEmp] = useState(null);

  if (employeeId) {
    return <EmployeeDashboard forcedEmployeeId={employeeId} />;
  }

  return (
    <div className="w-full">
      {currentView === "dashboard" && (
        <EmployeeDashboard 
          onAddNew={() => { 
            setSelectedEmp(null); // تفريغ البيانات لموظف جديد
            setCurrentView("form"); 
          }} 
          onEditMember={(emp) => { 
            setSelectedEmp(emp); 
            setCurrentView("form"); 
          }}
          onViewMember={(emp) => { 
            setSelectedEmp(emp);
            setCurrentView("card"); // 👈 الانتقال إلى شاشة الـ Card
          }}
        />
      )}

      {currentView === "form" && (
        <EmployeeForm 
          initial={selectedEmp} 
          onSubmit={() => setCurrentView("dashboard")} // عند الحفظ نعود للوحة
          onCancel={() => setCurrentView("dashboard")} // عند الإلغاء نعود للوحة
        />
      )}

      {currentView === "card" && (
        <EmployeeCard 
          employee={selectedEmp}
          onBack={() => setCurrentView("dashboard")}
          onEdit={(emp) => {
             setSelectedEmp(emp);
             setCurrentView("form"); // الانتقال للتعديل من داخل البروفايل
          }}
        />
      )}
    </div>
  );
}
