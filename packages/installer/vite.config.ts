import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss()],
	publicDir: false,
	build: {
		rollupOptions: {
			input: "src/styles.css",
			output: { assetFileNames: "[name][extname]" },
		},
		outDir: "public",
		emptyOutDir: true,
	},
});
