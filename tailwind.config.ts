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
        primary: "#fa520f",
        "primary-deep": "#cc3a05",
        "on-primary": "#ffffff",
        "sunshine-700": "#ffa110",
        "sunshine-500": "#ffb83e",
        "yellow-saturated": "#ffd900",
        cream: "#fff8e0",
        "beige-deep": "#e6d5a8",
        ink: "#1f1f1f",
        "ink-tint": "#3d3d3d",
        canvas: "#ffffff",
        surface: "#fafafa",
        "hairline-soft": "#ededed",
        "hairline-strong": "#c7c7c7",
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
