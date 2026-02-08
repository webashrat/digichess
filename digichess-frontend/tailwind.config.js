/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#135bec",
        "primary-dark": "#0e45b5",
        "background-light": "#f6f6f8",
        "background-dark": "#101622",
        "surface-light": "#ffffff",
        "surface-dark": "#1e2430",
        "border-light": "#e5e7eb",
        "border-dark": "#2d3544",
        "accent-gold": "#FFD700",
        "accent-silver": "#C0C0C0",
        "accent-bronze": "#CD7F32",
        "accent-green": "#2e7d32",
        "accent-green-bright": "#4ade80",
        "board-light": "#cbd5e1",
        "board-dark": "#475569",
      },
      fontFamily: {
        "display": ["Lexend", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem", 
        "lg": "0.5rem", 
        "xl": "0.75rem", 
        "full": "9999px"
      },
    },
  },
  plugins: [],
}
