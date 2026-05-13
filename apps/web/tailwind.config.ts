import type { Config } from "tailwindcss";

export default {
	content: ["./src/**/*.{ts,tsx}"],
	darkMode: "class",
	theme: {
		extend: {
			colors: {
				// Surfaces (driven by CSS vars in globals.css so light/dark just swaps)
				bg:       "var(--c-bg)",
				surface:  "var(--c-surface)",
				surface2: "var(--c-surface2)",
				border:   "var(--c-border)",
				ink:      "var(--c-ink)",
				inkDim:   "var(--c-ink-dim)",
				inkMute:  "var(--c-ink-mute)",

				// Brand — bright cyan for primary action; teal for "live"
				accent:    "#00BBE4",
				accentDim: "#0095B6",
				live:      "#7AB6B2",

				// Status hierarchy
				ok:   "#7AB6B2",
				warn: "#F6C800",
				bad:  "#ED1D25",
				info: "#9AD9EA",
			},
			fontFamily: {
				sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
				mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
			},
			fontSize: {
				"2xs": ["10px", { lineHeight: "14px" }],
			},
			borderRadius: {
				none: "0",
				sm:   "2px",
				DEFAULT: "3px",
				md:   "4px",
				lg:   "6px",
				xl:   "10px",
				"2xl": "14px",
				full: "9999px",
			},
			boxShadow: {
				// Layered drop shadow inspired by AKVAconnect
				soft:
					"0 1px 2px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.05)",
				lift:
					"0 1px 2px rgba(0,0,0,0.08), 0 6px 15px rgba(0,0,0,0.08), 0 21px 51px rgba(0,0,0,0.10)",
				glow:
					"0 0 0 1px rgba(0,187,228,0.35), 0 0 24px rgba(0,187,228,0.15)",
			},
			transitionDuration: {
				DEFAULT: "200ms",
			},
			minHeight: { touch: "44px" },
			minWidth:  { touch: "44px" },
		},
	},
	plugins: [],
} satisfies Config;
