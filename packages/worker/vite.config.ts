import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss()],
	build: {
		rollupOptions: {
			input: {
				styles: "./src/styles.css",
			},
			output: {
				assetFileNames: "[name][extname]",
			},
		},
		outDir: "public",
		copyPublicDir: false,
		emptyOutDir: true,
	},
});
