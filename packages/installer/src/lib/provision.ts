import type { WorkerAssetFile } from "@/lib/assets";
import { cfFetch } from "@/lib/cloudflare";
import { deployWorker } from "@/lib/deploy";

type StepResult = {
	id: string;
	label: string;
	isSuccess: boolean;
	detail?: string;
	error?: string;
};

type ProvisionInput = {
	token: string;
	accountId: string;
	workerName: string;
	adminUsername: string;
	adminPassword: string;
	workerScript: string;
	migrationSql: string;
	workerAssets: WorkerAssetFile[];
};

type ProvisionOutput = {
	isSuccess: boolean;
	steps: StepResult[];
	workerUrl?: string;
	authToken?: string;
	adminUsername?: string;
	adminPassword?: string;
	error?: string;
};

function stepOk({
	id,
	label,
	detail,
}: {
	id: string;
	label: string;
	detail?: string;
}): StepResult {
	return { id, label, isSuccess: true, detail };
}

function stepFail({
	id,
	label,
	error,
}: {
	id: string;
	label: string;
	error: string;
}): StepResult {
	return { id, label, isSuccess: false, error };
}

async function provision({
	token,
	accountId,
	workerName,
	adminUsername,
	adminPassword,
	workerScript,
	migrationSql,
	workerAssets,
}: ProvisionInput): Promise<ProvisionOutput> {
	const steps: StepResult[] = [];
	const dbName = `${workerName}-db`;
	const bucketName = `${workerName}-sessions`;

	// -- 1. Validate token --
	const verify = await cfFetch<{ status: string }>({
		path: "/user/tokens/verify",
		token,
	});
	if (!verify.success || verify.result?.status !== "active") {
		steps.push(
			stepFail({
				id: "verify",
				label: "Validate API token",
				error: verify.errors?.[0]?.message ?? "Token is not active",
			}),
		);
		return { isSuccess: false, steps };
	}
	steps.push(stepOk({ id: "verify", label: "Validate API token" }));

	// -- 2. Create D1 database (or reuse existing) --
	let databaseId: string;
	const d1 = await cfFetch<{ uuid: string; name: string }>({
		path: `/accounts/${accountId}/d1/database`,
		token,
		method: "POST",
		body: { name: dbName },
	});
	if (d1.success) {
		databaseId = d1.result.uuid;
		steps.push(
			stepOk({
				id: "d1",
				label: "Create D1 database",
				detail: dbName,
			}),
		);
	} else {
		const isAlreadyExists = d1.errors?.some((e) =>
			e.message.toLowerCase().includes("already exists"),
		);
		if (!isAlreadyExists) {
			steps.push(
				stepFail({
					id: "d1",
					label: "Create D1 database",
					error: d1.errors?.[0]?.message ?? "Failed to create D1 database",
				}),
			);
			return { isSuccess: false, steps };
		}
		// Look up existing database by name
		const list = await cfFetch<Array<{ uuid: string; name: string }>>({
			path: `/accounts/${accountId}/d1/database?name=${encodeURIComponent(dbName)}`,
			token,
		});
		const existing = list.result?.find((db) => db.name === dbName);
		if (!existing) {
			steps.push(
				stepFail({
					id: "d1",
					label: "Create D1 database",
					error: "Database exists but could not be found by name",
				}),
			);
			return { isSuccess: false, steps };
		}
		databaseId = existing.uuid;
		steps.push(
			stepOk({
				id: "d1",
				label: "Create D1 database",
				detail: `${dbName} (existing)`,
			}),
		);
	}

	// -- 3. Run D1 migrations (statement by statement, idempotent) --
	const statements = migrationSql
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	let hasFailedMigration = false;
	let migrationError = "";
	for (const sql of statements) {
		const result = await cfFetch<unknown>({
			path: `/accounts/${accountId}/d1/database/${databaseId}/query`,
			token,
			method: "POST",
			body: { sql: `${sql};` },
		});
		if (!result.success) {
			const msg = result.errors?.[0]?.message ?? "";
			const isIdempotent =
				msg.toLowerCase().includes("already exists") ||
				msg.toLowerCase().includes("duplicate");
			if (!isIdempotent) {
				hasFailedMigration = true;
				migrationError = msg || "Migration failed";
				break;
			}
		}
	}
	if (hasFailedMigration) {
		steps.push(
			stepFail({
				id: "migrate",
				label: "Run D1 migrations",
				error: migrationError,
			}),
		);
		return { isSuccess: false, steps };
	}
	steps.push(stepOk({ id: "migrate", label: "Run D1 migrations" }));

	// -- 4. Create R2 bucket (or reuse existing) --
	const r2 = await cfFetch<{ name: string }>({
		path: `/accounts/${accountId}/r2/buckets`,
		token,
		method: "POST",
		body: { name: bucketName },
	});
	if (!r2.success) {
		const isAlreadyExists = r2.errors?.some(
			(e) =>
				e.message.toLowerCase().includes("already exists") || e.code === 10006,
		);
		if (!isAlreadyExists) {
			steps.push(
				stepFail({
					id: "r2",
					label: "Create R2 bucket",
					error: r2.errors?.[0]?.message ?? "Failed to create R2 bucket",
				}),
			);
			return { isSuccess: false, steps };
		}
		steps.push(
			stepOk({
				id: "r2",
				label: "Create R2 bucket",
				detail: `${bucketName} (existing)`,
			}),
		);
	} else {
		steps.push(
			stepOk({
				id: "r2",
				label: "Create R2 bucket",
				detail: bucketName,
			}),
		);
	}

	// -- 5. Create scoped R2 S3 API token --
	const permGroups = await cfFetch<
		Array<{ id: string; name: string; scopes: string[] }>
	>({
		path: "/user/tokens/permission_groups",
		token,
	});
	if (!permGroups.success) {
		steps.push(
			stepFail({
				id: "r2token",
				label: "Create R2 S3 credentials",
				error: "Failed to fetch permission groups",
			}),
		);
		return { isSuccess: false, steps };
	}

	const r2ReadGroup = permGroups.result.find(
		(g) =>
			g.name === "Workers R2 Storage Read" &&
			g.scopes?.includes("com.cloudflare.api.account"),
	);
	const r2WriteGroup = permGroups.result.find(
		(g) =>
			g.name === "Workers R2 Storage Write" &&
			g.scopes?.includes("com.cloudflare.api.account"),
	);
	if (!r2ReadGroup || !r2WriteGroup) {
		steps.push(
			stepFail({
				id: "r2token",
				label: "Create R2 S3 credentials",
				error: "Could not find R2 Storage permission groups",
			}),
		);
		return { isSuccess: false, steps };
	}

	const r2Token = await cfFetch<{ id: string; value: string }>({
		path: "/user/tokens",
		token,
		method: "POST",
		body: {
			name: `${workerName}-r2-s3`,
			policies: [
				{
					effect: "allow",
					resources: {
						[`com.cloudflare.api.account.${accountId}`]: "*",
					},
					permission_groups: [{ id: r2ReadGroup.id }, { id: r2WriteGroup.id }],
				},
			],
		},
	});
	if (!r2Token.success) {
		steps.push(
			stepFail({
				id: "r2token",
				label: "Create R2 S3 credentials",
				error: r2Token.errors?.[0]?.message ?? "Failed to create R2 token",
			}),
		);
		return { isSuccess: false, steps };
	}
	const r2AccessKeyId = r2Token.result.id;
	const r2SecretAccessKey = r2Token.result.value;
	steps.push(stepOk({ id: "r2token", label: "Create R2 S3 credentials" }));

	// -- 6. Deploy worker (with static assets) --
	const deploy = await deployWorker({
		accountId,
		token,
		workerName,
		workerScript,
		workerAssets,
		bindings: [
			{
				type: "d1",
				name: "DB",
				id: databaseId,
			},
			{
				type: "r2_bucket",
				name: "BUCKET",
				bucket_name: bucketName,
			},
			{
				type: "ai",
				name: "AI",
			},
		],
	});
	if (!deploy.isSuccess) {
		steps.push(
			stepFail({
				id: "deploy",
				label: "Deploy worker",
				error: deploy.error ?? "Deploy failed",
			}),
		);
		return { isSuccess: false, steps };
	}
	steps.push(
		stepOk({ id: "deploy", label: "Deploy worker", detail: workerName }),
	);

	// -- 7. Set worker secrets --
	const authToken = crypto.randomUUID();
	const secrets: Record<string, string> = {
		AUTH_TOKEN: authToken,
		ADMIN_USERNAME: adminUsername,
		ADMIN_PASSWORD: adminPassword,
		R2_ACCESS_KEY_ID: r2AccessKeyId,
		R2_SECRET_ACCESS_KEY: r2SecretAccessKey,
		R2_ACCOUNT_ID: accountId,
		R2_BUCKET_NAME: bucketName,
	};

	for (const [name, value] of Object.entries(secrets)) {
		const sec = await cfFetch<unknown>({
			path: `/accounts/${accountId}/workers/scripts/${workerName}/secrets`,
			token,
			method: "PUT",
			body: { name, text: value, type: "secret_text" },
		});
		if (!sec.success) {
			steps.push(
				stepFail({
					id: "secrets",
					label: "Set worker secrets",
					error: `Failed to set ${name}: ${sec.errors?.[0]?.message ?? "unknown"}`,
				}),
			);
			return { isSuccess: false, steps };
		}
	}
	steps.push(stepOk({ id: "secrets", label: "Set worker secrets" }));

	// -- 8. Enable workers.dev route --
	const subdomain = await cfFetch<{ subdomain: string }>({
		path: `/accounts/${accountId}/workers/subdomain`,
		token,
	});
	const subdomainName = subdomain.result?.subdomain;

	const enable = await cfFetch<unknown>({
		path: `/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
		token,
		method: "POST",
		body: { enabled: true },
	});
	if (!enable.success) {
		steps.push(
			stepFail({
				id: "route",
				label: "Enable workers.dev route",
				error: enable.errors?.[0]?.message ?? "Failed to enable route",
			}),
		);
		return { isSuccess: false, steps };
	}

	const workerUrl = subdomainName
		? `https://${workerName}.${subdomainName}.workers.dev`
		: `https://${workerName}.workers.dev`;

	steps.push(
		stepOk({
			id: "route",
			label: "Enable workers.dev route",
			detail: workerUrl,
		}),
	);

	return {
		isSuccess: true,
		steps,
		workerUrl,
		authToken,
		adminUsername,
		adminPassword,
	};
}

export { provision };
export type { ProvisionInput, ProvisionOutput, StepResult };
