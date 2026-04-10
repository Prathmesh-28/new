import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "olive-deepest": "#1C2209",
        "olive-deep": "#2E3A10",
        "olive-mid": "#4A5E1A",
        "olive-bright": "#6B8526",
        "olive-light": "#96B83D",
        "olive-pale": "#C4D97A",
        "olive-wash": "#E8F0C2",
        "olive-cream": "#F4F1E4",
        gold: "#C9A227",
        "gold-light": "#E8C84A",
        cream: "#FDFAF0",
        "text-dark": "#1A1F0A",
        "text-mid": "#3D4A1E",
        "text-muted": "#6B7A3D",
      },
      fontFamily: {
        serif: ["Georgia", "serif"],
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
