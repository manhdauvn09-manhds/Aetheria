// Aetheria — shared Tailwind preset.
// apps/web and packages/ui-kit pull this in via `presets: [require('@aetheria/config/tailwind/preset')]`.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      colors: {
        // Realm palette mirrors db/mysql/02_seed.sql realms.color_hex.
        realm: {
          verdant:  "#2E7D32", // Verdant Reach
          ashen:    "#B71C1C", // Ashen Wastes
          aetheric: "#1565C0", // Aetheric Spires
          sunken:   "#006064", // Sunken Hollow
          hollow:   "#311B92"  // Hollow Vault
        },
        tier: {
          common:       "#9E9E9E",
          rare:         "#1976D2",
          epic:         "#7B1FA2",
          mythic:       "#F57C00",
          aetherforged: "#E91E63"
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia"],
        body:    ["var(--font-body)",    "ui-sans-serif", "system-ui"]
      },
      screens: {
        // Mobile-first; 1024 is the canvas-vs-sidebar breakpoint per arch doc.
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px"
      }
    }
  },
  plugins: []
};
