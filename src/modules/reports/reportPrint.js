import { getPrintBrandHeader, getPrintBrandStyles } from "../../utils/branding";
import { openPrintWindow } from "../../utils/print";
import { tafqeet } from "../../utils/tafqeet";
import { escapeHtml, formatDisplayValue } from "./reportUtils";

export const renderPrintReport = ({
  config,
  rows,
  selectedFields,
  summary,
  period,
}) => {
  const win = openPrintWindow(`report-${config.id}`, "width=1200,height=900");
  if (!win) return;

  const fields = config.fields.filter((field) => selectedFields.includes(field.key));
  const orientation = config.orientation === "landscape" ? "landscape" : "portrait";
  const layoutClass = orientation === "landscape" ? "landscape-report" : "portrait-report";
  const reportMeta = [
    period?.from && period?.to ? `الفترة: ${period.from} إلى ${period.to}` : "",
    `عدد السجلات: ${rows.length}`,
  ]
    .filter(Boolean)
    .join(" • ");

  const summaryCardsData =
    Array.isArray(summary?.customSummary?.cards) && summary.customSummary.cards.length > 0
      ? summary.customSummary.cards
      : [
          { label: "إجمالي السجلات", value: String(rows.length) },
          ...summary.currencyFields.slice(0, 3).map((field) => ({
            label: field.label,
            value: formatDisplayValue(field, summary.totals[field.key] || 0),
          })),
        ];

  const summaryCards = summaryCardsData
    .map(
      (card) => `
        <div class="summary-card">
          <div class="summary-label">${escapeHtml(card.label)}</div>
          <div class="summary-value">${escapeHtml(card.value)}</div>
        </div>
      `
    )
    .join("");

  const summarySectionsHtml = Array.isArray(summary?.customSummary?.sections)
    ? summary.customSummary.sections
        .map(
          (section) => `
            <div class="summary-section">
              <div class="summary-section-title">${escapeHtml(section.title)}</div>
              <div class="summary-section-items">
                ${(section.items || [])
                  .map(
                    (item) => `
                      <div class="summary-section-item">
                        <span>${escapeHtml(item.label)}</span>
                        <strong>${escapeHtml(item.value)}</strong>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
        )
        .join("")
    : "";

  const sanitizeCellValue = (value) => {
    const normalized = String(value ?? "");
    return normalized.trim() ? normalized : "—";
  };

  const headersHtml = fields.map((field) => `<th>${escapeHtml(field.label)}</th>`).join("");
  const rowsHtml = rows
    .map((row, index) => {
      const cells = fields
        .map((field) => {
          const value = sanitizeCellValue(formatDisplayValue(field, row[field.key]));
          const className = field.currency ? "cell-amount" : "cell-text";
          return `<td class="${className}">${escapeHtml(value)}</td>`;
        })
        .join("");
      return `<tr><td class="cell-index">${index + 1}</td>${cells}</tr>`;
    })
    .join("");

  const totalsRow =
    config.showTotals !== false &&
    summary.currencyFields.some((field) => selectedFields.includes(field.key))
      ? `
      <tr class="totals-row">
        <td class="cell-index">#</td>
        ${fields
          .map((field, index) => {
            if (index === 0) return `<td class="cell-text">الإجمالي</td>`;
            if (field.currency) {
              return `<td class="cell-amount">${escapeHtml(
                sanitizeCellValue(formatDisplayValue(field, summary.totals[field.key] || 0))
              )}</td>`;
            }
            return `<td class="cell-text">—</td>`;
          })
          .join("")}
      </tr>
    `
      : "";

  const toNumeric = (value) => {
    const normalized = String(value ?? "").replace(/,/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const totalsInWords = summary.currencyFields
    .filter((field) => selectedFields.includes(field.key))
    .map((field) => {
      const totalAmount = toNumeric(summary.totals[field.key] || 0);
      const words = tafqeet(totalAmount);
      return words
        ? `<div class="amount-words-row"><span class="amount-words-label">تفقيط ${escapeHtml(field.label)}:</span><span class="amount-words-value">${escapeHtml(words)}</span></div>`
        : "";
    })
    .filter(Boolean)
    .join("");

  win.document.write(`<!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(config.title)}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
          @page { size: A4 ${orientation}; margin: 10mm; }
          *{box-sizing:border-box;margin:0;padding:0;font-family:'Cairo',sans-serif}
          html,body{width:100%;height:auto;min-height:0;overflow-x:hidden}
          body{padding:6px 0 10px;color:#0f172a;background:#fff;font-size:10px;line-height:1.35}
          .sheet{display:block;position:relative;z-index:1;max-width:100%;break-after:auto;page-break-after:auto}
          .report-title{margin:4px 0 8px;padding:8px 12px;border-right:5px solid #0f766e;background:linear-gradient(135deg,#f0fdfa,#f8fafc);border-radius:8px}
          .report-title h2{margin:0 0 2px;color:#0f766e;font-size:14px;font-weight:900;line-height:1.35}
          .report-title p{margin:0;color:#64748b;font-size:8.5px;font-weight:800;line-height:1.5}
          .info-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
          .info-item{padding:7px 9px;border:1px solid #dbe5ea;border-radius:7px;background:#fff;font-size:8.5px;font-weight:800;color:#475569}
          .info-item strong{display:block;margin-top:2px;color:#0f172a;font-size:10px;line-height:1.4}
          .summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:6px}
          .summary-card{border:1px solid #dbeafe;border-radius:10px;padding:6px 8px;background:linear-gradient(180deg,#f8fafc,#ffffff)}
          .summary-label{font-size:8px;font-weight:900;color:#64748b;margin-bottom:3px;line-height:1.4}
          .summary-value{font-size:12px;font-weight:900;color:#0f766e;line-height:1.25}
          .table-shell{border:1px solid #cbd5e1;border-radius:10px;overflow:hidden}
          .summary-sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
          .summary-section{border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#f8fafc}
          .summary-section-title{font-size:9px;font-weight:900;color:#0f172a;margin-bottom:6px}
          .summary-section-items{display:grid;gap:5px}
          .summary-section-item{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:9px;color:#475569}
          .summary-section-item strong{font-size:9px;color:#0f172a}
          table{width:100%;border-collapse:collapse;table-layout:auto}
          th{background:#0f172a;color:#fff;padding:6px 8px;border:1px solid #334155;font-size:9px;text-align:right;line-height:1.4;white-space:nowrap}
          td{border:1px solid #cbd5e1;padding:5px 6px;font-size:9px;vertical-align:middle;line-height:1.5;word-break:normal;overflow-wrap:break-word;white-space:normal}
          .cell-index{text-align:center;font-weight:900;width:38px;min-width:30px}
          .cell-text{text-align:right;white-space:normal}
          .cell-amount{text-align:left;font-weight:900;color:#047857;white-space:nowrap}
          .totals-row td{background:#eef2ff;font-weight:900}
          .amount-words{margin-top:8px;border:1px solid #bfdbfe;border-radius:10px;padding:8px;background:#f8fbff;display:grid;gap:5px}
          .amount-words-row{display:flex;gap:8px;flex-wrap:wrap;font-size:9px;line-height:1.5}
          .amount-words-label{font-weight:900;color:#1e3a8a}
          .amount-words-value{font-weight:800;color:#0f172a}
          .signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8mm}
          .sig{padding-top:14px;border-top:1px dashed #94a3b8;text-align:center;font-size:9px;font-weight:800;color:#475569}
          .portrait-report .summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
          .portrait-report th,.portrait-report td{font-size:8.5px;padding:4px 3px}
          .portrait-report .summary-value{font-size:11px}
          .portrait-report .summary-sections{grid-template-columns:repeat(2,minmax(0,1fr))}
          .landscape-report .summary-grid{grid-template-columns:repeat(6,minmax(0,1fr))}
          .landscape-report .summary-value{font-size:11px}
          @media print{
            @page { size: A4 ${orientation}; margin: 10mm; }
            html,body{height:auto;min-height:0;overflow:visible}
            body{padding:0;color:#0f172a;background:#fff}
            .sheet,.summary-grid,.summary-card,.summary-sections,.summary-section,.signatures,.sig,.table-shell{break-inside:auto;page-break-inside:auto}
            .report-title,.info-bar,.summary-grid,.summary-sections,.summary-section,.brand-header,.print-footer{break-inside:avoid;page-break-inside:avoid}
            .summary-card{break-inside:avoid;page-break-inside:avoid}
            .table-shell{overflow:visible}
            table{page-break-inside:auto;break-inside:auto}
            thead{display:table-header-group}
            tfoot{display:table-footer-group}
            tbody{break-inside:auto;page-break-inside:auto}
            tr{break-inside:avoid;page-break-inside:avoid}
            td,th{break-inside:auto;page-break-inside:auto}
            .totals-row{break-inside:avoid;page-break-inside:avoid}
            .signatures{break-before:auto;page-break-before:auto}
          }
          ${getPrintBrandStyles()}
        </style>
      </head>
      <body>
        <div class="sheet ${layoutClass}">
          ${getPrintBrandHeader({ reportTitle: config.title, reportMeta })}
          <div class="report-title">
            <h2>${escapeHtml(config.title)}</h2>
            <p>${escapeHtml(config.subtitle || "تقرير تفصيلي من مركز التقارير والتحليلات")}</p>
          </div>
          <div class="info-bar">
            <div class="info-item">الفترة<strong>${escapeHtml(period?.from || "—")} — ${escapeHtml(period?.to || "—")}</strong></div>
            <div class="info-item">عدد السجلات<strong>${escapeHtml(String(rows.length))}</strong></div>
            <div class="info-item">ترتيب التقرير<strong>${escapeHtml(config.sortLabel || "التاريخ ثم رقم الشيك ثم رقم العامل")}</strong></div>
          </div>
          <div class="summary-grid">${summaryCards}</div>
          <div class="table-shell">
            <table>
              <thead>
                <tr>
                  <th class="cell-index">#</th>
                  ${headersHtml}
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="${fields.length + 1}" style="text-align:center;padding:20px;color:#64748b">${escapeHtml(config.emptyMessage)}</td></tr>`}
              </tbody>
              ${totalsRow ? `<tfoot>${totalsRow}</tfoot>` : ""}
            </table>
          </div>
          ${totalsInWords ? `<div class="amount-words">${totalsInWords}</div>` : ""}
          ${summarySectionsHtml ? `<div class="summary-sections">${summarySectionsHtml}</div>` : ""}
          <div class="signatures">
            <div class="sig">إعداد التقرير</div>
            <div class="sig">المراجعة</div>
            <div class="sig">الاعتماد</div>
          </div>
        </div>
        <script>window.onload=()=>setTimeout(()=>window.print(),500);</script>
      </body>
    </html>`);

  win.document.close();
};
