import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App.jsx"; 
import "./index.css";

window.onerror = () => {
  document.body.innerHTML = `<div dir="rtl" style="padding:40px;font-family:sans-serif;background:#fff1f1;color:#c00;min-height:100vh">
    <h2 style="margin:0 0 10px">خطأ غير متوقع</h2>
    <p style="font-size:14px">حدث خطأ أثناء التشغيل. يرجى تحديث الصفحة والمحاولة مجدداً.</p>
  </div>`;
  return true;
};

window.addEventListener("unhandledrejection", () => {
  document.body.innerHTML = `<div dir="rtl" style="padding:40px;font-family:sans-serif;background:#fff1f1;color:#c00;min-height:100vh">
    <h2 style="margin:0 0 10px">خطأ غير معالج</h2>
    <p style="font-size:14px">حدث خطأ أثناء التشغيل. يرجى تحديث الصفحة والمحاولة مجدداً.</p>
  </div>`;
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);