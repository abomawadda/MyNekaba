import EmployeeCard from "./EmployeeCard";

export default function EmployeeList({ list, onEdit, onOpen }) {
  if (list.length === 0) {
    return <p className="text-center text-slate-500 py-6">لا يوجد أعضاء مسجلين</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {list.map((e) => (
        <div key={e.jobId} onClick={() => onOpen(e)}>
          <EmployeeCard
            employee={e}
            onBack={() => {}}
            onEdit={() => onEdit(e)}
          />
        </div>
      ))}
    </div>
  );
}