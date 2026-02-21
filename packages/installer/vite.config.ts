import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss()],
	publicDir: false,
	build: {
		rollupOptions: {
			input: {
				styles: "src/styles.css",
				install: "src/client/install.ts",
				update: "src/client/update.ts",
			},
			output: {
				entryFileNames: "[name].js",
				assetFileNames: "[name][extname]",
			},
		},
		outDir: "public",
		emptyOutDir: true,
	},
});
