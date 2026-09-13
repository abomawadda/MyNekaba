import { useState, useCallback } from "react";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { useFirebase } from "../../../app/providers/FirebaseProvider";

export function useEmployeesService() {
  const { app } = useFirebase();
  const db = getFirestore(app);
  
  // 🎯 تحديد اسم المجلد في قاعدة البيانات (Collection)
  const path = "employees"; 

  // حالات لتخزين البيانات ومعرفة هل يتم التحميل الآن أم لا
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 1. دالة جلب جميع الأعضاء
  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, path));
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(data);
    } catch (error) {
      console.error("خطأ في جلب بيانات الأعضاء:", error);
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  // 2. دالة إضافة أو تعديل عضو
  async function saveEmployee(emp) {
    const id = emp.id || doc(collection(db, path)).id; // إنشاء ID جديد إذا لم يوجد
    const finalData = { ...emp, id };
    
    await setDoc(doc(db, path, id), finalData);
    await fetchEmployees(); // 🎯 تحديث القائمة تلقائياً بعد الحفظ
  }

  // 3. دالة حذف عضو
  async function deleteEmployee(id) {
    await deleteDoc(doc(db, path, id));
    await fetchEmployees(); // 🎯 تحديث القائمة تلقائياً بعد الحذف
  }

  return { 
    employees, 
    isLoading, 
    fetchEmployees, 
    saveEmployee, 
    deleteEmployee 
  };
}