import type { Config } from 'tailwindcss';
const config: Config = { content: ['./app/**/*.{js,ts,jsx,tsx,mdx}','./components/**/*.{js,ts,jsx,tsx,mdx}'], theme: { extend: { colors: { ink: '#08090d', panel: '#11131a', muted: '#9297a5', accent: '#c5ff4a' }, fontFamily: { sans: ['Arial','Helvetica','sans-serif'] } } }, plugins: [] };
export default config;
