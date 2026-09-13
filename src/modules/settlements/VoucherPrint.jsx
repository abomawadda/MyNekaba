import { getPrintBrandHeader, getPrintBrandStyles } from "../../utils/branding";
import { formatMoney } from "../../utils/numberFormat";
import { escapeHtml } from "../../utils/escapeHtml";
import { openPrintWindow } from "../../utils/print";
import { tafqeet } from "../../utils/tafqeet";

// ── دالة طباعة كشف تسوية العهد والسلف ──
export function printSettlement({ advanceTxn, expenses, spent, remaining, prevBalance = 0, returnedActually }) {
  const win = openPrintWindow("settlement-print", "width=950,height=750");
  if (!win) return;

  const ADV_AMT = Number(advanceTxn?.advanceAmountBase || advanceTxn?.amount || 0);
  const TOTAL_AVAILABLE = ADV_AMT + Number(prevBalance);
  const INVOICES_TOTAL = (expenses || []).reduce(
    (sum, expense) => sum + Number(expense?.amount || 0),
    0
  );
  const invoicesTotalInWords = tafqeet(INVOICES_TOTAL);

  const rowsHtml = expenses?.length > 0 
    ? [...expenses].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.category || "").localeCompare(String(b.category || ""), "ar")).map((e, i) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td style="text-align:center">${escapeHtml(e.date)}</td>
          <td style="color:#0f766e">${escapeHtml(e.category)}</td>
          <td>${escapeHtml(e.notes) || "—"}</td>
          <td style="text-align:left; font-weight:900">${escapeHtml(formatMoney(e.amount))}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">لم يتم إدراج فواتير</td></tr>`;

  win.document.write(`
    <!DOCTYPE html><html lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تسوية عهدة - ${escapeHtml(advanceTxn?.employeeName || advanceTxn?.party)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        @page { size:A4 portrait; margin:10mm; }
        * { font-family: 'Cairo', sans-serif; margin: 0; padding: 0; box-sizing: border-box; direction: rtl; }
        html, body { width: 100%; height: auto; }
        body { padding: 18px; color: #1e293b; background: #fff; }
        .badge { display: inline-block; padding: 5px 15px; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 20px; font-size: 12px; font-weight: 700; color: #0f766e; }
        
        .info-row { margin-bottom: 20px; padding: 15px; background: #f8fafc; border-right: 4px solid #0d9488; border-radius: 8px; font-size: 16px; font-weight: bold; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
        .stat-box { border: 1px solid #e2e8f0; padding: 15px; border-radius: 10px; text-align: center; }
        .stat-label { font-size: 11px; color: #64748b; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; }
        .stat-value { font-size: 20px; font-weight: 900; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; page-break-inside: auto; break-inside: auto; }
        th { background: #f1f5f9; color: #0f766e; border: 1px solid #cbd5e1; padding: 12px; text-align: right; font-weight: 900; }
        td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; font-weight: 700; }
        
        .footer-note { margin-top: 15px; padding: 10px; background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; font-size: 13px; font-weight: bold; color: #854d0e; }
        
        .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-top: 50px; text-align: center; }
        .sig-box { border-top: 2px dashed #cbd5e1; padding-top: 10px; font-size: 14px; font-weight: 900; color: #475569; }
        .sig-space { height: 60px; }
        @media print {
          @page { margin: 10mm; }
          body { padding: 0; }
          .info-row, .stats-grid, .stat-box, .footer-note, .sigs, .brand-header { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          tr, td, th { break-inside: avoid; page-break-inside: avoid; }
        }
        ${getPrintBrandStyles()}
      </style>
    </head>
    <body>
      ${getPrintBrandHeader({ reportTitle: "كشف تسوية عهدة / سلفة مالية", reportMeta: `تاريخ الاعتماد: ${advanceTxn?.settlementDate || '—'}` })}
      
      <div class="info-row">
        اسم مسؤول العهدة: <span style="font-size:20px; color:#0d9488; margin-right: 10px;">${escapeHtml(advanceTxn?.employeeName || advanceTxn?.party) || '—'}</span>
      </div>
      
      <div class="stats-grid">
        <div class="stat-box"> <div class="stat-label">أصل السلفة المصروفة</div> <div class="stat-value" style="color:#334155">${formatMoney(ADV_AMT)}</div> </div>
        <div class="stat-box"> <div class="stat-label">رصيد مرحل من قبل</div> <div class="stat-value" style="color:#d97706">${formatMoney(prevBalance)}</div> </div>
        <div class="stat-box" style="background:#f0fdf4; border-color:#86efac"> <div class="stat-label" style="color:#15803d">إجمالي المتاح للصرف</div> <div class="stat-value" style="color:#166534">${formatMoney(TOTAL_AVAILABLE)}</div> </div>
        <div class="stat-box" style="background:#fff1f2; border-color:#fda4af"> <div class="stat-label" style="color:#e11d48">إجمالي المنصرف الفعلي</div> <div class="stat-value" style="color:#be123c">${formatMoney(spent)}</div> </div>
      </div>

      <h3 style="margin-bottom:10px; color:#334155; font-size: 14px;">بيان الفواتير والمصروفات المدرجة:</h3>
      <table>
        <thead><tr><th style="width:40px; text-align:center;">م</th><th style="width:100px; text-align:center;">التاريخ</th><th style="width:150px;">التصنيف المحاسبي</th><th>البيان والملاحظات</th><th style="width:120px;">المبلغ</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="font-weight:900; background:#ecfeff;">إجمالي مبلغ الفواتير</td>
            <td style="text-align:left; font-weight:900; background:#ecfeff;">${formatMoney(INVOICES_TOTAL)}</td>
          </tr>
        </tfoot>
      </table>
      ${invoicesTotalInWords ? `<div class="footer-note" style="margin-top:10px;background:#f0f9ff;border-color:#bae6fd;color:#075985;">تفقيط إجمالي الفواتير: ${escapeHtml(invoicesTotalInWords)}</div>` : ""}

      <div class="footer-note">
        الحالة النهائية للعهدة: 
        ${remaining > 0 
          ? `يوجد مبلغ متبقٍ قدره (${formatMoney(remaining)}) — ` + (returnedActually ? "تم توريده نقداً لخزينة النقابة بموجب إيصال استلام." : "تم ترحيله كـ 'رصيد دائن' ليُخصم من سلفة الموظف القادمة.")
          : remaining < 0 
          ? `يوجد تجاوز في الصرف قدره (${formatMoney(Math.abs(remaining))}) — يُصرف للموظف.`
          : `تم تسوية العهدة بالكامل (صفر).`
        }
      </div>

      <div class="sigs">
        <div class="sig-box">توقيع مسؤول العهدة<div class="sig-space"></div></div>
        <div class="sig-box">المراجعة والرقابة<div class="sig-space"></div></div>
        <div class="sig-box">يعتمد، أمين الصندوق<div class="sig-space"></div></div>
      </div>
      <script>window.onload=()=>{setTimeout(()=>window.print(), 500);}</script>
    </body></html>
  `);
  win.document.close();
}
