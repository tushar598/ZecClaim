import type { Config } from "tailwindcss";

/**
 * ZecClaim design tokens: tactile neomorphism with a mint accent (see docs/DESIGN_SYSTEM.md).
 *
 * Theme-dependent colors are CSS variables (RGB channels) defined in src/app/globals.css
 * for the light theme (:root, default, matches the reference UI) and the dark theme
 * ([data-theme="dark"]). Components use these tokens instead of raw hex values so both
 * themes come from a single set of class names.
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        inset: v("inset"),
        rail: v("rail"),
        line: v("line"),
        grid: v("grid"),
        ink: {
          DEFAULT: v("ink"),
          soft: v("ink-soft"),
        },
        muted: v("muted"),
        subtle: v("subtle"),
        faint: v("faint"),
        chip: {
          DEFAULT: v("chip"),
          fg: v("chip-fg"),
        },
        charcoal: "#252C37",
        mint: {
          DEFAULT: "#14C39A",
          hover: v("mint-hover"),
          deep: v("mint-deep"),
          light: "#6BD8BE",
        },
        peach: "#F2B89B",
        // Status hues: DEFAULT for tints (bg-rose/10), fg for readable text in each theme
        rose: { DEFAULT: "#E11D48", fg: v("rose-fg") },
        amber: { DEFAULT: "#F59E0B", fg: v("amber-fg") },
        cyan: { DEFAULT: "#06B6D4", fg: v("cyan-fg") },
        violet: { DEFAULT: "#8B5CF6", fg: v("violet-fg") },
        slate: { DEFAULT: "#64748B", fg: v("slate-fg") },
        neutral: { DEFAULT: "#8B97A8", fg: v("neutral-fg") },
      },
      // Soft status tints used by badges and notices (bg-mint/12 etc.)
      opacity: {
        "12": "0.12",
        "14": "0.14",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
