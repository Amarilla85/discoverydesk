import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/*
 * DiscoveryDesk design system (Story 1.3 — UX-DR1 through UX-DR5).
 * Token values come from DESIGN.md and are authoritative.
 *
 * Color values live as raw CSS custom properties in app/globals.css and are
 * wrapped with var() here — NOT hsl(var(--x)), because several tokens are
 * rgba overlays.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["SF Mono", "SFMono-Regular", "ui-monospace", "Menlo", "monospace"],
      },
      /*
       * Type scale (UX-DR2). The `code` role also uses font-mono.
       * Apply Tailwind's built-in `tabular-nums` to all numeric displays
       * (scores, metrics, timestamps) — per-use, in feature stories.
       */
      fontSize: {
        display: ["36px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-sm": ["24px", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "700" }],
        h1: ["22px", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        h2: ["18px", { lineHeight: "1.33", fontWeight: "600" }],
        h3: ["16px", { lineHeight: "1.375", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "1.625" }],
        body: ["14px", { lineHeight: "1.57" }],
        "body-sm": ["13px", { lineHeight: "1.54" }],
        label: ["12px", { lineHeight: "1.67", letterSpacing: "0.02em", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "1.33" }],
        "caption-sm": ["11px", { lineHeight: "1.27" }],
        code: ["13px", { lineHeight: "1.54" }],
      },
      colors: {
        // shadcn semantic names — remapped to DiscoveryDesk values so
        // components/ui/* keep working unchanged.
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        "primary-container": "var(--primary-container)",
        "on-primary-container": "var(--on-primary-container)",
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        // shadcn `accent` is the hover background (surface-variant). The DD
        // cyan accent is exposed separately as `accent-cyan` (decorative only).
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        "accent-cyan": "var(--accent-cyan)",
        "on-accent-cyan": "var(--on-accent-cyan)",
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        "destructive-container": "var(--destructive-container)",
        "on-destructive-container": "var(--on-destructive-container)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",

        // DiscoveryDesk-native tokens (UX-DR1)
        surface: {
          DEFAULT: "var(--surface)",
          variant: "var(--surface-variant)",
          container: "var(--surface-container)",
        },
        "on-surface": {
          DEFAULT: "var(--on-surface)",
          variant: "var(--on-surface-variant)",
          disabled: "var(--on-surface-disabled)",
        },
        outline: {
          DEFAULT: "var(--outline)",
          variant: "var(--outline-variant)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--on-success)",
        },
        "success-container": "var(--success-container)",
        "on-success-container": "var(--on-success-container)",
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--on-warning)",
        },
        "warning-container": "var(--warning-container)",
        "on-warning-container": "var(--on-warning-container)",
        "hover-overlay": "var(--hover-overlay)",
        "active-overlay": "var(--active-overlay)",
        "focus-ring": "var(--focus-ring)",
        "disabled-surface": "var(--disabled-surface)",
        "disabled-on-surface": "var(--disabled-on-surface)",
        "disabled-border": "var(--disabled-border)",
        badge: {
          draft: "var(--badge-draft)",
          "draft-text": "var(--badge-draft-text)",
          "in-review": "var(--badge-in-review)",
          "in-review-text": "var(--badge-in-review-text)",
          approved: "var(--badge-approved)",
          "approved-text": "var(--badge-approved-text)",
          error: "var(--badge-error)",
          "error-text": "var(--badge-error-text)",
        },
        "modal-overlay": "var(--modal-overlay)",
      },
      /*
       * UX-DR4: --radius (0.5rem) already derives lg=8px / md=6px / sm=4px;
       * only xl (12px) is new. `full` (9999px) is built in.
       */
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
      },
      // UX-DR5 elevation — cards sit flat and gain level-1 on hover only.
      boxShadow: {
        "level-1": "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "level-2": "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
        "level-3": "0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
        // Sticky top bar / stepper bottom-edge shadow (DESIGN.md).
        sticky: "0 1px 0 rgba(0,0,0,0.06)",
      },
      // Modal overlay (1000) and toast (1100) layers per DESIGN.md component specs.
      zIndex: {
        "modal-overlay": "1000",
        toast: "1100",
      },
    },
  },
  plugins: [animate],
};
export default config;
