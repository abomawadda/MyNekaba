export const ORG_REPORT_TITLE = "النقابة العامة للعاملين بالاتصالات بالدقهلية";
export const ORG_REPORT_SUBTITLE = "أمانة الصندوق";
export const ORG_SYSTEM_TITLE = "المنظومة الإدارية والمالية للنقابة العامة بالدقهلية";
export const ORG_IMPLEMENTATION_CREDIT = "إعداد وتنفيذ أ/ محمود العراقي";
export const ORG_RIGHT_LOGO_URL = "/brand-right.png";
export const ORG_LEFT_LOGO_URL = "/brand-left.png";
export const ORG_RIGHT_LOGO_FALLBACK_URL = "/we-logo.png";

const escapeHtml = (value = "") => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

export const getReportTitleHtml = () =>
  `${ORG_REPORT_TITLE}<br/><span style="font-size:.72em; color:#5b21b6;">${ORG_REPORT_SUBTITLE}</span>`;

export const getPrintBrandStyles = () => `
.brand-header{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:2px solid #5b21b6;padding-bottom:10px;margin-bottom:12px}
.brand-logo-wrap{width:58px;display:flex;justify-content:center;align-items:center;flex:0 0 58px}
.brand-logo{width:46px;height:46px;object-fit:contain;filter:drop-shadow(0 3px 8px rgba(91,33,182,.12))}
.brand-center{flex:1;text-align:center}
.brand-title{font-size:17px;font-weight:900;color:#0f172a;line-height:1.25}
.brand-subtitle{font-size:11px;font-weight:800;color:#5b21b6;margin-top:2px}
.brand-report-title{font-size:14px;font-weight:900;color:#5b21b6;margin-top:6px;line-height:1.25}
.brand-report-meta{font-size:9px;color:#64748b;font-weight:700;margin-top:4px;line-height:1.5}
.print-watermark{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0}
.print-watermark span{font-size:68px;font-weight:900;color:rgba(91,33,182,.045);transform:rotate(-28deg);white-space:nowrap;letter-spacing:.04em}
.print-footer{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 12mm 0;border-top:1px solid #cbd5e1;background:#fff;color:#475569;font-size:9px;font-weight:800;z-index:3}
.print-footer-side{max-width:40%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.print-footer-center{min-width:90px;text-align:center}
@media print{
  @page { margin-bottom: 14mm; }
  .brand-header{break-inside:avoid;page-break-inside:avoid}
  .brand-logo{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .print-footer{position:fixed;left:0;right:0;bottom:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .print-watermark{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .page-counter::before{content:"صفحة " counter(page)}
}
`;

export const getPrintBrandHeader = ({ reportTitle = "", reportMeta = "" } = {}) => `
  ${getPrintFrameHtml({ watermark: reportTitle || ORG_REPORT_TITLE })}
  <div class="brand-header">
    <div class="brand-logo-wrap"><img src="${ORG_RIGHT_LOGO_URL}" alt="logo-right" class="brand-logo" onerror="this.onerror=null;this.src='${ORG_RIGHT_LOGO_FALLBACK_URL}'"/></div>
    <div class="brand-center">
      <div class="brand-title">${ORG_REPORT_TITLE}</div>
      <div class="brand-subtitle">${ORG_REPORT_SUBTITLE}</div>
      ${reportTitle ? `<div class="brand-report-title">${escapeHtml(reportTitle)}</div>` : ""}
      ${reportMeta ? `<div class="brand-report-meta">${escapeHtml(reportMeta)}</div>` : ""}
    </div>
    <div class="brand-logo-wrap"><img src="${ORG_LEFT_LOGO_URL}" alt="logo-left" class="brand-logo"/></div>
  </div>
`;

export const getPrintFrameHtml = ({
  watermark = ORG_REPORT_TITLE,
  footerRight = ORG_SYSTEM_TITLE,
  footerLeft = ORG_IMPLEMENTATION_CREDIT,
} = {}) => `
  <div class="print-watermark"><span>${escapeHtml(watermark)}</span></div>
  <div class="print-footer">
    <div class="print-footer-side">${escapeHtml(footerRight)}</div>
    <div class="print-footer-center page-counter"></div>
    <div class="print-footer-side" style="text-align:left">${escapeHtml(footerLeft)}</div>
  </div>
`;
