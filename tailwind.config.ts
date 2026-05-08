import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        chest: {
          bg: "#0B1020",
          surface: "#111827",
          panel: "#0f1929",
          panel2: "#152033",
          border: "#1e2d45",
          border2: "#263a56",
          gold: "#F59E0B",
          "gold-light": "#FCD34D",
          "gold-dim": "#92400e",
          red: "#DC2626",
          "red-light": "#F87171",
          blue: "#2563EB",
          "blue-light": "#60A5FA",
          green: "#16A34A",
          "green-light": "#4ADE80",
          muted: "#64748b",
          subtle: "#94a3b8",
          text: "#E2E8F0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      backgroundImage: {
        "grid-slate":
          "linear-gradient(rgba(30,45,69,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(30,45,69,0.4) 1px, transparent 1px)",
        "gold-glow": "radial-gradient(ellipse at top, rgba(245,158,11,0.15) 0%, transparent 60%)",
        "hero-gradient": "linear-gradient(135deg, #0B1020 0%, #0f1929 50%, #111827 100%)",
      },
      backgroundSize: {
        "grid-40": "40px 40px",
      },
      boxShadow: {
        gold: "0 0 20px rgba(245,158,11,0.25)",
        "gold-sm": "0 0 10px rgba(245,158,11,0.2)",
        blue: "0 0 20px rgba(37,99,235,0.3)",
        card: "0 4px 24px rgba(0,0,0,0.4)",
        "card-hover": "0 8px 40px rgba(0,0,0,0.6)",
      },
      animation: {
        "pulse-gold": "pulse-gold 2s ease-in-out infinite",
        "slide-up": "slide-up 0.4s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        ticker: "ticker 30s linear infinite",
      },
      keyframes: {
        "pulse-gold": {
          "0%, 100%": { boxShadow: "0 0 10px rgba(245,158,11,0.3)" },
          "50%": { boxShadow: "0 0 25px rgba(245,158,11,0.6)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        ticker: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
