/** @type {import('tailwindcss').Config} */

// Semantic tokens resolve to CSS variables defined in src/index.css, so the
// same class works in both themes and a theme switch is a single attribute
// change on <html> rather than a class rewrite in every component.
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'IBM Plex Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        // Page and panels
        ground: token('--ground'),
        'ground-tint': token('--ground-tint'),
        surface: token('--surface'),
        'surface-sunk': token('--surface-sunk'),
        'surface-raised': token('--surface-raised'),

        // Navigation rail (dark in both themes)
        rail: token('--rail'),
        'rail-ink': token('--rail-ink'),
        'rail-dim': token('--rail-dim'),

        // Lines and text
        line: token('--line'),
        'line-soft': token('--line-soft'),
        ink: token('--ink'),
        'ink-2': token('--ink-2'),
        'ink-3': token('--ink-3'),

        // Accent — the blue the product is built around
        accent: {
          DEFAULT: token('--accent'),
          deep: token('--accent-deep'),
          soft: token('--accent-soft'),
          ink: token('--accent-ink'),
        },

        // Severity, kept separate from the accent so "mismatch" never reads
        // as "this is a button"
        ok: { DEFAULT: token('--ok'), soft: token('--ok-soft') },
        warn: { DEFAULT: token('--warn'), soft: token('--warn-soft') },
        bad: { DEFAULT: token('--bad'), soft: token('--bad-soft') },

        // Legacy palette, kept so any not-yet-migrated markup still renders
        primary: {
          DEFAULT: '#2596be',
          50: '#e6f5fa',
          100: '#ccebf5',
          200: '#99d7eb',
          300: '#66c3e1',
          400: '#33afd7',
          500: '#2596be',
          600: '#1e7a9a',
          700: '#175e76',
          800: '#104252',
          900: '#08262e',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow-rgb) / .06), 0 8px 24px -14px rgb(var(--shadow-rgb) / .22)',
        pop: '0 12px 32px -12px rgb(var(--shadow-rgb) / .34)',
      },
      keyframes: {
        'radar-spin': { to: { transform: 'rotate(360deg)' } },
        'radar-blip': {
          '0%, 60%': { opacity: '0', transform: 'scale(.6)' },
          '70%': { opacity: '1', transform: 'scale(1.25)' },
          '100%': { opacity: '0', transform: 'scale(1)' },
        },
        bloom: {
          '0%': { transform: 'scale(.28)', opacity: '.85' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
        'hub-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.12)' },
        },
        bars: {
          '0%, 100%': { transform: 'scaleY(.42)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'radar-spin': 'radar-spin 1.9s linear infinite',
        'radar-blip': 'radar-blip 1.9s ease-out infinite',
        bloom: 'bloom 2.2s cubic-bezier(.22,.7,.3,1) infinite',
        'hub-pulse': 'hub-pulse 2.2s ease-in-out infinite',
        bars: 'bars 1.15s ease-in-out infinite',
        'fade-up': 'fade-up .25s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
