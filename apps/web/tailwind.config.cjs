// Aetheria — Tailwind config for apps/web. Pulls shared preset from
// @aetheria/config (realm/tier colour tokens, font slots, breakpoints).

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("@aetheria/config/tailwind/preset")],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
};
