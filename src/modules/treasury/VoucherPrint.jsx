/* eslint-disable react-refresh/only-export-components */

/**
 * VoucherPrint — طباعة سند الخزينة وطلبات الإعانة
 *
 * التحسينات:
 * - التفقيط الآلي للمبالغ يظهر في الطباعة فقط
 * - يدعم تصنيف الإعانة
 * - تصميم أكثر احترافية مناسب للطباعة الرسمية
 */

import { tafqeet } from "../../utils/tafqeet";
import { ORG_REPORT_SUBTITLE, ORG_REPORT_TITLE, getPrintBrandHeader, getPrintBrandStyles } from "../../utils/branding";
import { formatMoney } from "../../utils/numberFormat";
import { escapeHtml } from "../../utils/escapeHtml";
import { openPrintWindow } from "../../utils/print";

const ORG_NAME = `${ORG_REPORT_TITLE} - ${ORG_REPORT_SUBTITLE}`;
const PRINT_FONT = `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');`;

const PRINT_BASE = (title) => `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>${title}</title>
<style>${PRINT_FONT}
@page{size:A4 portrait;margin:12mm}
*{font-family:'Cairo',sans-serif;margin:0;padding:0;box-sizing:border-box}
body{padding:32px 42px;color:#1e293b;font-size:14px;line-height:1.6}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:100px;color:rgba(13,148,136,.03);font-weight:800;pointer-events:none;white-space:nowrap;z-index:0}
.badge{display:inline-block;padding:4px 16px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:20px;font-size:13px;font-weight:700;color:#0f766e;margin-top:6px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0;position:relative;z-index:1}
.box{padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#fafafa}
.bl{font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:4px}
.bv{font-size:15px;font-weight:700;color:#1e293b}
.amt-box{background:linear-gradient(135deg,#f0fdfa,#e6fffa);border:2px solid #0d9488;border-radius:10px;padding:20px;text-align:center;margin:20px 0;position:relative;z-index:1}
.amt-lbl{font-size:12px;color:#0d9488;font-weight:700;margin-bottom:6px}
.amt-val{font-size:42px;font-weight:800;color:#0d9488}
.amt-text{font-size:16px;font-weight:700;color:#0f766e;margin-top:8px;padding-top:8px;border-top:1px dashed #99f6e4;}
.note-box{background:#f8fafc;border-right:4px solid #0d9488;border-radius:0 8px 8px 0;padding:12px 16px;margin:16px 0;font-size:14px;color:#334155;font-weight:600}
.sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:60px;position:relative;z-index:1}
.sig{text-align:center;border-top:1px solid #cbd5e1;padding-top:10px;font-size:13px;color:#64748b;font-weight:700}
.sig-space{height:50px}
table{width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;position:relative;z-index:1;table-layout:fixed}
th{padding:12px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f766e;background:#f0fdfa;width:35%}
td{padding:12px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;overflow-wrap:anywhere;word-break:break-word}
.check-list{margin:20px 0;font-size:14px;position:relative;z-index:1}
.check-row{display:flex;align-items:center;gap:10px;padding:6px 0;color:#475569;font-weight:600}
.check-box{width:18px;height:18px;border:2px solid #cbd5e1;border-radius:4px;display:inline-block}
.pledge{font-size:13px;color:#475569;border:1px dashed #cbd5e1;padding:16px;border-radius:8px;margin:20px 0;background:#f8fafc;line-height:1.8;font-weight:600;}
@media print{body{padding:20px}.wm{display:none}}
@media screen and (max-width:640px){body{padding:16px 12px;font-size:13px}.grid2{grid-template-columns:1fr}.sigs{grid-template-columns:1fr;gap:8px;margin-top:30px}.amt-val{font-size:32px}th,td{padding:8px 6px;font-size:12px}}
${getPrintBrandStyles()}
</style></head><body>
<div class="wm">${ORG_REPORT_TITLE}</div>`;


/** طباعة سند الخزينة (إيداع / صرف إعانة / سلفة) */
export function printVoucher({ vType, vNum, date, party, amount, notes, checkNum, extraFields = [] }) {
  const win = openPrintWindow(vType, "width=900,height=700");
  if (!win) return;

  const numericAmount = Number(amount || 0);
  const formattedAmount = formatMoney(numericAmount);
  const amountInWords = tafqeet(numericAmount); // التفقيط
  const isDeposit = vType.includes('إيداع');

  win.document.write(PRINT_BASE(vType) + `
    ${getPrintBrandHeader({ reportTitle: vType, reportMeta: `رقم السند: ${vNum || '—'}` })}
    <div class="grid2">
      <div class="box"><div class="bl">التاريخ</div><div class="bv">${escapeHtml(date) || '—'}</div></div>
      <div class="box"><div class="bl">${isDeposit ? 'اسم المودع / الجهة' : 'اسم المستفيد / المستلم'}</div><div class="bv">${escapeHtml(party) || '—'}</div></div>
      ${checkNum ? `<div class="box"><div class="bl">رقم الشيك / الحوالة</div><div class="bv">${escapeHtml(checkNum)}</div></div>` : ''}
      ${extraFields.map(f => `<div class="box"><div class="bl">${escapeHtml(f.label)}</div><div class="bv">${escapeHtml(f.value) || '—'}</div></div>`).join('')}
    </div>
    <div class="amt-box">
      <div class="amt-lbl">المبلغ الإجمالي</div>
      <div class="amt-val">${escapeHtml(formattedAmount)}</div>
      <div class="amt-text">(${escapeHtml(amountInWords)})</div>
    </div>
    <div class="note-box"><strong>البيان التفصيلي:</strong> ${escapeHtml(notes) || 'لا يوجد تفاصيل إضافية'}</div>
    <div class="sigs">
      <div class="sig">أمين الصندوق<div class="sig-space"></div></div>
      <div class="sig">المراجع / المعتمد<div class="sig-space"></div></div>
      <div class="sig">${isDeposit ? 'توقيع المودع' : 'توقيع المستلم'}<div class="sig-space"></div></div>
    </div>
    <script>window.onload=()=>{setTimeout(()=>window.print(), 500)}</script>
  </body></html>`);

  win.document.close();
}


/** طباعة طلب صرف الرعاية (مخصص للرعايات فقط) */
export function printAidRequest({ emp, aidCat, aidRel, incDate, amount, date, notes }) {
  const win = openPrintWindow("aid-request", "width=900,height=800");
  if (!win) return;

  const numericAmount = Number(amount || 0);
  const amountInWords = tafqeet(numericAmount); // التفقيط

  const doc1 = aidCat === 'رعاية زواج' ? 'عقد الزواج الرسمي موثّق' : aidCat === 'رعاية وفاة' ? 'شهادة الوفاة الرسمية' : 'التقرير الطبي أو المستند الرسمي للواقعة';
  
  win.document.write(PRINT_BASE('نموذج طلب صرف رعاية') + `
    ${getPrintBrandHeader({ reportTitle: 'نموذج طلب صرف رعاية', reportMeta: `تاريخ تقديم الطلب: ${date || '—'}` })}
    <table>
      <tr><th>الكود الوظيفي</th><td>${escapeHtml(emp?.jobId) || '—'}</td></tr>
      <tr><th>اسم العضو كاملاً</th><td style="font-size:16px;color:#0f766e">${escapeHtml(emp?.name) || '—'}</td></tr>
      <tr><th>تصنيف الرعاية</th><td style="color:#e11d48">${escapeHtml(aidCat) || '—'}</td></tr>
      <tr><th>صلة القرابة / الحالة</th><td>${escapeHtml(aidRel) || '—'}</td></tr>
      <tr><th>تاريخ الواقعة</th><td>${escapeHtml(incDate) || '—'}</td></tr>
      <tr>
        <th>المبلغ المستحق صرفه</th>
        <td>
          <div style="font-size:20px;color:#0d9488;font-weight:800">${escapeHtml(formatMoney(numericAmount))}</div>
          <div style="font-size:14px;color:#0f766e;margin-top:4px;">(${escapeHtml(amountInWords)})</div>
        </td>
      </tr>
      ${notes ? `<tr><th>ملاحظات الطلب</th><td>${escapeHtml(notes)}</td></tr>` : ''}
    </table>
    
    <div class="check-list">
      <strong style="color:#0f766e;font-size:15px;">المستندات المطلوبة والمرفقة مع الطلب:</strong>
      <div class="check-row"><div class="check-box"></div> صورة بطاقة الرقم القومي سارية المفعول</div>
      <div class="check-row"><div class="check-box"></div> ${doc1}</div>
      <div class="check-row"><div class="check-box"></div> كشف خدمة أو مفردات مرتب موثّق من جهة العمل</div>
      <div class="check-row"><div class="check-box"></div> صورة شهادة الميلاد فى حالة وفاة الأم</div>
    </div>

    <div class="pledge">
      <strong>إقرار:</strong> أُقرّ أنا الموقّع أدناه بأن جميع البيانات والمعلومات المذكورة في هذا النموذج صحيحة، وأتحمّل المسئولية القانونية الكاملة عن صحتها، وأُقرّ بأحقيّتي في الحصول على هذه الرعاية وفق اللوائح المالية المنظمة لعمل النقابة.
    </div>

    <div class="sigs">
      <div class="sig">توقيع العضو مقدّم الطلب<div class="sig-space"></div></div>
      <div class="sig">اعتماد رئيس النقابة / المراجع<div class="sig-space"></div></div>
      <div class="sig">اعتماد أمين الصندوق<div class="sig-space"></div></div>
    </div>
    <script>window.onload=()=>{setTimeout(()=>window.print(), 500)}</script>
  </body></html>`);

  win.document.close();
}
