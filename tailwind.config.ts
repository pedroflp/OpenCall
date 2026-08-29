import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
	],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        "background": 'hsl(var(--background) /  <alpha-value>)',
        "foreground": 'hsl(var(--foreground) /  <alpha-value>)',
        "card": 'hsl(var(--card) /  <alpha-value>)',
        "card-foreground": 'hsl(var(--card-foreground) /  <alpha-value>)',
        "popover": 'hsl(var(--popover) /  <alpha-value>)',
        "popover-foreground": 'hsl(var(--popover-foreground) /  <alpha-value>)',
        "primary": 'hsl(var(--primary) /  <alpha-value>)',
        "primary-foreground": 'hsl(var(--primary-foreground) /  <alpha-value>)',
        "secondary": 'hsl(var(--secondary) /  <alpha-value>)',
        "secondary-foreground": 'hsl(var(--secondary-foreground) /  <alpha-value>)',
        "muted": 'hsl(var(--muted) /  <alpha-value>)',
        "muted-foreground": 'hsl(var(--muted-foreground) /  <alpha-value>)',
        "accent": 'hsl(var(--accent) /  <alpha-value>)',
        "accent-foreground": 'hsl(var(--accent-foreground) /  <alpha-value>)',
        "destructive": 'hsl(var(--destructive) /  <alpha-value>)',
        "destructive-foreground": 'hsl(var(--destructive-foreground) /  <alpha-value>)',
        "border": 'hsl(var(--border) /  <alpha-value>)',
        "input": 'hsl(var(--input) /  <alpha-value>)',
        "ring": 'hsl(var(--ring) /  <alpha-value>)',
        "radius": 'hsl(var(--radius) /  <alpha-value>)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "shine": {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "drift": {
          "0%, 100%": { transform: "translate(-50%, -50%) scale(1)" },
          "50%": { transform: "translate(-46%, -54%) scale(1.08)" },
        },
        "drift-reverse": {
          "0%, 100%": { transform: "translate(-50%, -50%) scale(1)" },
          "50%": { transform: "translate(-54%, -47%) scale(0.92)" },
        },
        "wiggle": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(-12deg)" },
          "75%": { transform: "rotate(12deg)" },
        },
        "shadow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.35)" },
          "50%": { boxShadow: "0 0 28px 6px hsl(var(--primary) / 0.35)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "shine": "shine 1.6s linear infinite",
        "drift": "drift 20s ease-in-out infinite",
        "drift-reverse": "drift-reverse 26s ease-in-out infinite",
        "wiggle": "wiggle 0.5s ease-in-out 3",
        "wiggle-loop": "wiggle 0.5s ease-in-out infinite",
        "shadow-pulse": "shadow-pulse 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
