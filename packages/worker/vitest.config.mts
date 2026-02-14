import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						AUTH_TOKEN: 'test-auth-token',
						R2_ACCESS_KEY_ID: 'test-access-key-id',
						R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
						R2_ACCOUNT_ID: 'test-account-id',
						R2_BUCKET_NAME: 'residue-sessions',
						ADMIN_USERNAME: 'admin',
						ADMIN_PASSWORD: 'password',
					},
				},
			},
		},
	},
});
