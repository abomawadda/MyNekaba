import { getPrintBrandHeader, getPrintBrandStyles } from "../../../utils/branding";
import { openPrintWindow } from "../../../utils/print";
import { formatFundBenefitAmount, formatFundBenefitDate } from "./fundBenefits";

const escapeHtml = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const printMemberFundBenefitsReport = ({ member, entries = [], summary }) => {
  const win = openPrintWindow("member-fund-benefits", "width=1200,height=900");
  if (!win) return;

  const reportDate = new Date().toLocaleString("ar-EG");
  const rows = entries
    .map(
      (entry, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(formatFundBenefitDate(entry.date))}</td>
          <td><span class="badge">${escapeHtml(entry.categoryLabel)}</span></td>
          <td>
            <div class="main">${escapeHtml(entry.title)}</div>
            ${entry.description ? `<div class="sub">${escapeHtml(entry.description)}</div>` : ""}
          </td>
          <td>${escapeHtml(entry.sourceLabel)}</td>
          <td>${escapeHtml(entry.reference || "—")}</td>
          <td class="amount">${escapeHtml(formatFundBenefitAmount(entry.amount))}</td>
        </tr>
      `
    )
    .join("");

  const categoryRows = (summary?.categories || [])
    .map(
      (category) => `
        <tr>
          <td>${escapeHtml(category.label)}</td>
          <td>${category.count}</td>
          <td class="amount">${escapeHtml(formatFundBenefitAmount(category.amount))}</td>
        </tr>
      `
    )
    .join("");

  win.document.write(`<!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>تقرير ما حصل عليه العضو من الصندوق</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
          *{box-sizing:border-box;margin:0;padding:0;font-family:'Cairo',sans-serif}
          html,body{width:100%;height:auto}
          body{padding:18px;color:#0f172a;background:#fff}
          .report-shell{display:block}
          .member-box{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
          .member-card,.summary-card{border:1px solid #dbeafe;border-radius:16px;padding:14px;background:linear-gradient(180deg,#f8fafc,#ffffff)}
          .member-card .label,.summary-card .label{font-size:10px;font-weight:800;color:#64748b;margin-bottom:4px}
          .member-card .value{font-size:15px;font-weight:900;color:#0f172a}
          .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
          .summary-card .value{font-size:24px;font-weight:900;color:#0f766e}
          .summary-card .sub{font-size:11px;color:#64748b;font-weight:700;margin-top:5px}
          .section-title{font-size:16px;font-weight:900;color:#0f172a;margin-bottom:8px}
          table{width:100%;border-collapse:collapse}
          th{background:#0f766e;color:#fff;padding:10px 8px;font-size:11px;text-align:right}
          td{border:1px solid #dbeafe;padding:10px 8px;font-size:11px;vertical-align:top}
          tbody tr:nth-child(even){background:#f8fafc}
          .amount{text-align:left;font-weight:900;color:#047857;white-space:nowrap}
          .badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#ecfeff;border:1px solid #99f6e4;color:#0f766e;font-size:10px;font-weight:800}
          .main{font-weight:900;color:#0f172a}
          .sub{font-size:10px;color:#64748b;margin-top:4px;line-height:1.7}
          .footer{padding-top:14px;border-top:1px solid #cbd5e1;color:#64748b;font-size:10px;font-weight:700;text-align:center}
          @media print{
            @page{size:A4 portrait;margin:9mm}
            body{padding:0}
            .report-shell,.member-box,.summary-grid,table,.footer{break-inside:auto;page-break-inside:auto}
            .member-box,.summary-grid,.member-card,.summary-card,.section-title,.footer,.brand-header{break-inside:avoid;page-break-inside:avoid}
            table{page-break-inside:auto;break-inside:auto}
            thead{display:table-header-group}
            tfoot{display:table-footer-group}
            tr,td,th{break-inside:avoid;page-break-inside:avoid}
          }
          ${getPrintBrandStyles()}
        </style>
      </head>
      <body>
        <div class="report-shell">
          ${getPrintBrandHeader({
            reportTitle: "تقرير ما حصل عليه العضو من الصندوق",
            reportMeta: `تاريخ الإصدار: ${reportDate} | عدد البنود: ${summary?.totalCount || 0}`,
          })}

          <div class="member-box">
            <div class="member-card"><div class="label">اسم العضو</div><div class="value">${escapeHtml(member?.name || "—")}</div></div>
            <div class="member-card"><div class="label">الرقم الوظيفي</div><div class="value">${escapeHtml(member?.jobId || "—")}</div></div>
            <div class="member-card"><div class="label">الحالة النقابية</div><div class="value">${escapeHtml(member?.membershipStatus || "—")}</div></div>
            <div class="member-card"><div class="label">جهة العمل</div><div class="value">${escapeHtml(member?.workplace || "—")}</div></div>
          </div>

          <div class="summary-grid">
            <div class="summary-card">
              <div class="label">إجمالي ما حصل عليه من الصندوق</div>
              <div class="value">${escapeHtml(formatFundBenefitAmount(summary?.totalAmount || 0))}</div>
              <div class="sub">إجمالي مالي تقديري لجميع البنود</div>
            </div>
            <div class="summary-card">
              <div class="label">عدد أوجه الدعم</div>
              <div class="value">${summary?.totalCount || 0}</div>
              <div class="sub">من شيكات ومزايا وأنشطة</div>
            </div>
            <div class="summary-card">
              <div class="label">صرف مباشر من الصندوق</div>
              <div class="value">${escapeHtml(formatFundBenefitAmount(summary?.directSupportAmount || 0))}</div>
              <div class="sub">إعانات ودعم مالي مسجل بشيكات</div>
            </div>
            <div class="summary-card">
              <div class="label">مزايا ودعم نشاط</div>
              <div class="value">${escapeHtml(formatFundBenefitAmount(summary?.benefitAmount || 0))}</div>
              <div class="sub">${escapeHtml(summary?.topCategory?.label || "لا يوجد تصنيف سائد بعد")}</div>
            </div>
          </div>

          <div>
            <div class="section-title">ملخص التصنيفات</div>
            <table>
              <thead>
                <tr>
                  <th>التصنيف</th>
                  <th>عدد البنود</th>
                  <th>القيمة</th>
                </tr>
              </thead>
              <tbody>
                ${categoryRows || `<tr><td colspan="3" style="text-align:center;color:#64748b">لا توجد بيانات تصنيفية متاحة</td></tr>`}
              </tbody>
            </table>
          </div>

          <div>
            <div class="section-title">التفاصيل الزمنية لما حصل عليه العضو</div>
            <table>
              <thead>
                <tr>
                  <th style="width:5%">#</th>
                  <th style="width:12%">التاريخ</th>
                  <th style="width:14%">التصنيف</th>
                  <th style="width:28%">البيان</th>
                  <th style="width:12%">المصدر</th>
                  <th style="width:17%">المرجع</th>
                  <th style="width:12%">القيمة</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:24px">لا توجد سجلات دعم أو مزايا لهذا العضو</td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="footer">
            هذا التقرير يعرض إجمالي ما حصل عليه العضو من الصندوق وفق السجلات المالية والمزايا المسجلة داخل المنظومة حتى لحظة الطباعة.
          </div>
        </div>
        <script>window.onload=()=>setTimeout(()=>window.print(),500);</script>
      </body>
    </html>`);

  win.document.close();
};
