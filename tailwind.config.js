/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Extend with custom values if needed
      fontFamily: {
        mono: ['"SFMono-Regular"', 'Consolas', '"Liberation Mono"', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        dark: {
          "primary": "#3fb950",
          "secondary": "#58a6ff",
          "accent": "#58a6ff",
          "neutral": "#161616",
          "base-100": "#0a0a0a",
          "base-200": "#161616",
          "base-300": "#1f1f1f",
          "info": "#58a6ff",
          "success": "#3fb950",
          "warning": "#d29922",
          "error": "#f85149",
          
          // Custom variables for backward compatibility
          "--border": "#333",
          "--muted": "#888",
        },
        light: {
          "primary": "#1f883d",
          "secondary": "#0969da",
          "accent": "#0969da",
          "neutral": "#f6f8fa",
          "base-100": "#ffffff",
          "base-200": "#f6f8fa",
          "base-300": "#eaeef2",
          "info": "#0969da",
          "success": "#1f883d",
          "warning": "#9a6700",
          "error": "#d1242f",
          
          // Custom variables for backward compatibility
          "--border": "#d0d7de",
          "--muted": "#656d76",
        },
      },
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    logs: false,
  },
}
