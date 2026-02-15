// @ts-check

import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	site: "https://residue.dev",
	output: "static",
	adapter: cloudflare(),
	integrations: [sitemap()],
	vite: {
		plugins: [tailwindcss()],
	},
	devToolbar: {
		enabled: false,
	},
});
