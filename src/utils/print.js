const PRINT_NUMBERING_STYLE_ID = "__print-page-numbering-style";
const PRINT_NUMBERING_MARKERS_CLASS = "__print-page-number-markers";

const parsePageMarginsMm = (rawValue = "") => {
  const values = String(rawValue || "")
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part.replace("mm", "")))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return { top: 10, right: 10, bottom: 10, left: 10 };
  }

  if (values.length === 1) {
    const [all] = values;
    return { top: all, right: all, bottom: all, left: all };
  }

  if (values.length === 2) {
    const [vertical, horizontal] = values;
    return { top: vertical, right: horizontal, bottom: vertical, left: horizontal };
  }

  if (values.length === 3) {
    const [top, horizontal, bottom] = values;
    return { top, right: horizontal, bottom, left: horizontal };
  }

  const [top, right, bottom, left] = values;
  return { top, right, bottom, left };
};

const getPrintPageSettings = (doc) => {
  const stylesText = Array.from(doc.querySelectorAll("style"))
    .map((styleTag) => styleTag.textContent || "")
    .join("\n");

  const pageBlockMatch = stylesText.match(/@page\s*\{([\s\S]*?)\}/i);
  const pageBlock = pageBlockMatch?.[1] || "";
  const orientationMatch = pageBlock.match(/size\s*:\s*A4\s+(landscape|portrait)/i);
  const orientation = orientationMatch?.[1]?.toLowerCase() === "landscape" ? "landscape" : "portrait";
  const marginMatch = pageBlock.match(/margin\s*:\s*([^;]+);?/i);

  return {
    orientation,
    margins: parsePageMarginsMm(marginMatch?.[1] || "10mm"),
  };
};

const getPixelsPerMm = (doc) => {
  const probe = doc.createElement("div");
  probe.style.position = "absolute";
  probe.style.left = "-1000mm";
  probe.style.top = "0";
  probe.style.width = "100mm";
  probe.style.height = "1px";
  probe.style.pointerEvents = "none";
  doc.body.appendChild(probe);
  const pixelsPerMm = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return pixelsPerMm || 3.7795275591;
};

const ensurePrintNumberingStyle = (doc) => {
  if (doc.getElementById(PRINT_NUMBERING_STYLE_ID)) return;

  const style = doc.createElement("style");
  style.id = PRINT_NUMBERING_STYLE_ID;
  style.textContent = `
    @media print {
      body.__print-page-numbering-ready .page-counter::before {
        content: "" !important;
      }
      .${PRINT_NUMBERING_MARKERS_CLASS} {
        position: absolute;
        inset: 0 0 auto 0;
        pointer-events: none;
        z-index: 6;
        overflow: hidden;
      }
      .__print-page-number-marker {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        color: #475569;
        font-size: 10px;
        font-weight: 800;
        line-height: 1.2;
        white-space: nowrap;
        padding: 0 6px;
      }
    }
  `;
  doc.head.appendChild(style);
};

const preparePrintPageNumbers = (win) => {
  const doc = win.document;
  if (!doc?.body || !doc.querySelector(".page-counter")) return;

  ensurePrintNumberingStyle(doc);

  const existingMarkers = doc.querySelector(`.${PRINT_NUMBERING_MARKERS_CLASS}`);
  if (existingMarkers) existingMarkers.remove();

  const { orientation, margins } = getPrintPageSettings(doc);
  const pixelsPerMm = getPixelsPerMm(doc);
  const pageHeightMm = orientation === "landscape" ? 210 : 297;
  const printableHeight = Math.max(1, (pageHeightMm - margins.top - margins.bottom) * pixelsPerMm);
  const contentHeight = Math.max(
    doc.body.scrollHeight,
    doc.body.offsetHeight,
    doc.documentElement.scrollHeight,
    doc.documentElement.offsetHeight
  );
  // تجاهل تجاوز هامشي (ظلال/تقريب البكسل) حتى لا تُحسب صفحة فارغة زائدة
  const BLANK_TOLERANCE_MM = 3;
  const totalPages = Math.max(1, Math.ceil((contentHeight - BLANK_TOLERANCE_MM * pixelsPerMm) / printableHeight));
  const markerOffset = Math.max(10, Math.round(4 * pixelsPerMm));

  if (getComputedStyle(doc.body).position === "static") {
    doc.body.style.position = "relative";
  }

  const markers = doc.createElement("div");
  markers.className = PRINT_NUMBERING_MARKERS_CLASS;
  markers.setAttribute("aria-hidden", "true");
  // لا تتجاوز الحاوية ارتفاع المحتوى حتى لا تولّد صفحة فارغة
  markers.style.height = `${contentHeight}px`;

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const marker = doc.createElement("div");
    marker.className = "__print-page-number-marker";
    marker.textContent = `صفحة ${pageIndex + 1}`;
    const rawTop = Math.round((pageIndex + 1) * printableHeight) - markerOffset;
    marker.style.top = `${Math.max(0, Math.min(rawTop, Math.max(0, contentHeight - 28)))}px`;
    markers.appendChild(marker);
  }

  doc.body.classList.add("__print-page-numbering-ready");
  doc.body.appendChild(markers);
};

export const openPrintWindow = (title = "print", features = "width=1200,height=900") => {
  const win = window.open("", "_blank", features);
  if (!win) {
    window.alert("يرجى السماح بالنوافذ المنبثقة حتى تعمل الطباعة.");
    return null;
  }

  try {
    win.document.title = title;
  } catch {
    // no-op
  }

  try {
    const nativePrint = win.print.bind(win);
    win.print = () => {
      preparePrintPageNumbers(win);
      nativePrint();
    };
  } catch {
    // no-op
  }

  return win;
};
