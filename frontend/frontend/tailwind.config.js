/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0A0B0D",
        surface: "#131519",
        surface2: "#1C1F24",
        border: "#2A2E35",
        ink: "#EDEFF2",
        muted: "#8B909B",
        accent: "#0052FF",
        accentSoft: "#3D6BFF",
        state: {
          pending: "#8B909B",
          funded: "#FFB020",
          submitted: "#3AA9FF",
          disputed: "#FF5C5C",
          released: "#34D399",
          refunded: "#A78BFA",
          cancelled: "#5C6270",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
