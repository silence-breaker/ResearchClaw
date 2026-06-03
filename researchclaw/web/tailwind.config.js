/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // IDE-style dark console palette (see UI 概念图)
        panel: {
          bg: "#0d1117",
          surface: "#161b22",
          border: "#30363d",
          muted: "#8b949e",
          text: "#c9d1d9"
        },
        accent: {
          DEFAULT: "#58a6ff",
          green: "#3fb950",
          amber: "#d29922",
          red: "#f85149"
        }
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};
