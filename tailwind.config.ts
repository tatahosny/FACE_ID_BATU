import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        batu: {
          navy: {
            DEFAULT: "#0f172a",
            50: "#f8fafc",
            100: "#f1f5f9",
            800: "#1e293b",
            900: "#0f172a",
            950: "#020617",
          },
          blue: {
            DEFAULT: "#1d4ed8",
            50: "#eff6ff",
            100: "#dbeafe",
            500: "#3b82f6",
            600: "#2563eb",
            700: "#1d4ed8",
            800: "#1e40af",
            900: "#1e3a8a",
          },
          gold: {
            DEFAULT: "#d97706",
            400: "#fbbf24",
            500: "#f59e0b",
            600: "#d97706",
            700: "#b45309",
          },
          emerald: {
            DEFAULT: "#059669",
            500: "#10b981",
            600: "#059669",
          },
        },
      },
      fontFamily: {
        arabic: ["Cairo", "IBM Plex Sans Arabic", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
