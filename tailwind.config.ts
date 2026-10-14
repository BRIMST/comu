import type { Config } from "tailwindcss";
const config: Config = { content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: { colors: { night: "#080d1b", panel: "#111a2e", electric: "#5d7cff", violet: "#a78bfa" }, boxShadow: { glow: "0 0 30px rgba(93,124,255,.13)" } } }, plugins: [] };
export default config;