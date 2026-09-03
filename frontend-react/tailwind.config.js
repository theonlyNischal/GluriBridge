/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // The design-system showcase page builds swatch classnames dynamically
  // (bg-forest-500 etc.) from data, which Tailwind's static content scan
  // can't see — safelisted here so those swatches actually render.
  safelist: [
    { pattern: /bg-(forest|clay|teal|stone)-(50|100|200|300|400|500|600|700|800|900)/ },
  ],
  theme: {
    extend: {
      fontFamily: {
        // Display: an editorial serif for the brand/candidate-name scale —
        // gives GluriBridge an institutional, "real research org" register
        // instead of a generic SaaS grotesk everywhere.
        // 'Noto Serif KR' added (2026-09-03) for the same reason as
        // Noto Sans KR below — the Dashboard's big serif headline
        // renders in Korean when the toggle is on, and Fraunces has no
        // Hangul glyphs either.
        display: ["'Fraunces'", "'Noto Serif KR'", "ui-serif", "Georgia", "serif"],
        // UI: a clean, highly legible grotesk for chrome, labels, body copy.
        // 'Noto Sans KR' listed after Inter (2026-09-03, EN/KO toggle) —
        // Inter has no Hangul glyphs, so the browser falls through to
        // Noto Sans KR per-character for Korean text automatically; pure
        // English text never touches it.
        sans: ["'Inter'", "'Noto Sans KR'", "ui-sans-serif", "system-ui", "sans-serif"],
        // Data: genuinely tabular-figure monospace — every score, coordinate,
        // date, id, and percentage in the app renders in this face, on
        // purpose, so precise real data reads as visibly distinct from prose.
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Warm stone neutrals — paper/earth undertone, never cold gray.
        stone: {
          50: "#f8f6f2", 100: "#f0ebe2", 200: "#e2d9c9", 300: "#c9bba1",
          400: "#a89577", 500: "#8a7658", 600: "#6b5a42", 700: "#4f4230",
          800: "#372e21", 900: "#231d16", 950: "#161209",
        },
        // Forest — brand primary AND the credibility axis. Credibility
        // deliberately shares the brand color: a mature, well-documented
        // candidate reads as "on-brand trustworthy," not an arbitrary hue.
        forest: {
          50: "#eef5f0", 100: "#d7e8dc", 200: "#aed0b9", 300: "#7fb290",
          400: "#4f8f68", 500: "#2f6d4f", 600: "#235940", 700: "#1c4633",
          800: "#173829", 900: "#122b1f", 950: "#0b1a13",
        },
        // Clay — the need axis. Warm and urgent without being an alarm
        // color; never paired with forest as "bad vs good," only as
        // "which axis this candidate leans on."
        clay: {
          50: "#fbf1ea", 100: "#f5ddca", 200: "#e8b791", 300: "#d99562",
          400: "#c17540", 500: "#a05a2c", 600: "#824623", 700: "#66371c",
          800: "#4c2a17", 900: "#331c0f",
        },
        // Teal — the geospatial/evidence accent: citation links, FACT
        // tags, map chrome. A third hue on purpose, so "this is a
        // confirmed real source" never gets confused with either score axis.
        teal: {
          50: "#eaf3f3", 100: "#cde3e2", 200: "#9cc7c6", 300: "#6aa6a5",
          400: "#458584", 500: "#2f6b6a", 600: "#245452", 700: "#1c4140",
          800: "#15302f", 900: "#0f2221",
        },
        // Compliance is a genuinely different semantic axis (real deadline
        // urgency, not "which axis dominates") — earth-toned traffic
        // signal, not bright red/amber/green.
        compliance: {
          green: "#2f6d4f", greenBg: "#e3ede7",
          amber: "#a3711f", amberBg: "#f3e8d4",
          red: "#9c3b2e", redBg: "#f2e0dc",
          na: "#7c7160", naBg: "#eae5db",
        },
      },
      fontSize: {
        // Tabular data-figure scale — always used with font-mono +
        // tabular-nums, e.g. the big need/credibility numbers.
        figure: ["2.25rem", { lineHeight: "1", letterSpacing: "-0.01em", fontWeight: "600" }],
        "figure-sm": ["1.25rem", { lineHeight: "1.1", fontWeight: "600" }],
        // The detail-page hero's two score cards specifically — bigger
        // than the general "figure" scale (used elsewhere, e.g. the
        // Compliance tab's deadline countdown), Stripe/Linear-style KPI
        // scale: this is the largest number in the whole app.
        "figure-xl": ["3.25rem", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
}
