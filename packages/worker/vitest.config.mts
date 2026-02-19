import path from "node:path";
import {
	defineWorkersConfig,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "src"),
			},
		},
		test: {
			setupFiles: ["./test/apply-migrations.ts"],
			poolOptions: {
				workers: {
					singleWorker: true,
					wrangler: { configPath: "./wrangler.test.jsonc" },
					miniflare: {
						bindings: {
							TEST_MIGRATIONS: migrations,
							AUTH_TOKEN: "test-auth-token",
							ADMIN_USERNAME: "admin",
							ADMIN_PASSWORD: "password",
							R2_ACCESS_KEY_ID: "test-access-key",
							R2_SECRET_ACCESS_KEY: "test-secret-key",
							R2_ACCOUNT_ID: "test-account-id",
							R2_BUCKET_NAME: "residue-sessions",
						},
					},
				},
			},
		},
	};
});
