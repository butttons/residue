import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					bindings: {
						AUTH_TOKEN: "test-auth-token",
						ADMIN_USERNAME: "admin",
						ADMIN_PASSWORD: "password",
					},
				},
			},
		},
	},
});
