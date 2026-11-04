/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        dinkes: {
          navy: "#0A2540",
          blue: "#0070F3",
          amber: "#F59E0B",
          emerald: "#10B981",
          slate: "#64748B",
          50: "#f1f6ff",
          100: "#d6e3ff",
          200: "#aac7ff",
          300: "#7da9f3",
          400: "#4f85d5",
          500: "#325ea0",
          600: "#1a4b8c",
          700: "#124687",
          800: "#00346d",
          900: "#001b3e"
        },
        govgold: {
          50: "#fff9eb",
          100: "#ffe088",
          300: "#fed65b",
          500: "#d4af37",
          700: "#735c00"
        }
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "Segoe UI", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "Segoe UI", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 12px 28px rgba(15, 23, 42, 0.08)",
        etpp: "0 1px 2px rgba(15, 23, 42, 0.04)",
        button: "0 8px 18px rgba(0, 52, 109, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
