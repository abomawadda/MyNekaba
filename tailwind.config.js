// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Tajawal", "Cairo", "sans-serif"],
        tajawal: ["Tajawal", "sans-serif"],
        cairo: ["Cairo", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#F7F4FB",
          100: "#EDE4F6",
          200: "#D8C6EB",
          300: "#BB9CDD",
          400: "#9667CB",
          500: "#743DB3",
          600: "#5B308C",
          700: "#47256D",
          800: "#321A4D",
          900: "#201131",
        },
      },
      borderRadius: {
        enterprise: "0.75rem",
      },
      boxShadow: {
        enterprise: "0 8px 24px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
