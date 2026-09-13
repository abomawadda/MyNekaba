import { useState } from "react";

export default function EmployeeSearch({ onSearch }) {
  const [q, setQ] = useState("");

  function handleSearch() {
    if (!q.trim()) return;
    onSearch(q.trim());
  }

  return (
    <div className="flex gap-2 mb-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder="بحث بالاسم / الكود / الرقم القومي…"
        className="flex-1 px-4 py-2 rounded-lg border"
      />
      <button
        onClick={handleSearch}
        className="px-4 py-2 bg-teal-500 text-white rounded-lg"
      >
        بحث
      </button>
    </div>
  );
}