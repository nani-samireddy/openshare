import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#26304f",
        surface: "#2fc89b",
        mint: "#2fc89b",
        sun: "#f9bd18",
        sky: "#4698cc",
        cream: "#f5efdf",
        coral: "#f26f5b"
      },
      boxShadow: {
        soft: "8px 8px 0 rgba(38, 48, 79, 0.18)",
        sketch: "5px 5px 0 #26304f"
      }
    }
  },
  plugins: []
} satisfies Config;
