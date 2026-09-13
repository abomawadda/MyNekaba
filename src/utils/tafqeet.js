// المسار: src/utils/tafqeet.js

export function tafqeet(number) {
  if (!number || isNaN(number) || number <= 0) return "";
  
  const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
  const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  
  function convert(n) {
    if (n === 0) return "";
    if (n < 10) return units[n];
    if (n === 10) return "عشرة";
    if (n === 11) return "أحد عشر";
    if (n === 12) return "اثنا عشر";
    if (n < 20) return units[n % 10] + " عشر";
    if (n < 100) return (n % 10 !== 0 ? units[n % 10] + " و" : "") + tens[Math.floor(n / 10)];
    if (n < 1000) return hundreds[Math.floor(n / 100)] + (n % 100 !== 0 ? " و" + convert(n % 100) : "");
    if (n === 1000) return "ألف" + (n % 1000 !== 0 ? " و" + convert(n % 1000) : "");
    if (n === 2000) return "ألفان" + (n % 1000 !== 0 ? " و" + convert(n % 1000) : "");
    if (n < 11000) return convert(Math.floor(n / 1000)) + " آلاف" + (n % 1000 !== 0 ? " و" + convert(n % 1000) : "");
    if (n < 1000000) return convert(Math.floor(n / 1000)) + " ألفًا" + (n % 1000 !== 0 ? " و" + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 1000000)) + " مليون" + (n % 1000000 !== 0 ? " و" + convert(n % 1000000) : "");
    if (n < 1000000000) return convert(Math.floor(n / 1000000)) + " مليونًا" + (n % 1000000 !== 0 ? " و" + convert(n % 1000000) : "");
    if (n < 1000000000000) return convert(Math.floor(n / 1000000000)) + " مليار" + (n % 1000000000 !== 0 ? " و" + convert(n % 1000000000) : "");
    return convert(Math.floor(n / 1000000000000)) + " تريليون" + (n % 1000000000000 !== 0 ? " و" + convert(n % 1000000000000) : "");
  }

  const intPart = Math.floor(number);
  return `فقط ${convert(intPart)} جنيه مصري لا غير`;
}