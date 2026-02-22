import type { WorkerAssetFile } from "@/lib/assets";
import { cfFetch } from "@/lib/cloudflare";
import { deployWorker } from "@/lib/deploy";
import type { StepResult } from "@/lib/provision";

type UpdateInput = {
	token: string;
	accountId: string;
	workerName: string;
	workerScript: string;
	migrationSql: string;
	workerAssets: WorkerAssetFile[];
};

type UpdateOutput = {
	isSuccess: boolean;
	steps: StepResult[];
	workerUrl?: string;
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

async function update({
	token,
	accountId,
	workerName,
	workerScript,
	migrationSql,
	workerAssets,
}: UpdateInput): Promise<UpdateOutput> {
	const steps: StepResult[] = [];

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

	// -- 2. Look up existing worker settings to get D1 + R2 bindings --
	const settings = await cfFetch<{
		bindings: Array<{
			type: string;
			name: string;
			database_id?: string;
			bucket_name?: string;
		}>;
	}>({
		path: `/accounts/${accountId}/workers/scripts/${workerName}/settings`,
		token,
	});
	if (!settings.success) {
		steps.push(
			stepFail({
				id: "lookup",
				label: "Look up existing worker",
				error: `Worker "${workerName}" not found or inaccessible`,
			}),
		);
		return { isSuccess: false, steps };
	}

	const d1Binding = settings.result.bindings.find(
		(b) => b.type === "d1" && b.name === "DB",
	);
	const r2Binding = settings.result.bindings.find(
		(b) => b.type === "r2_bucket" && b.name === "BUCKET",
	);
	if (!d1Binding?.database_id || !r2Binding?.bucket_name) {
		steps.push(
			stepFail({
				id: "lookup",
				label: "Look up existing worker",
				error: "Could not find DB or BUCKET bindings on existing worker",
			}),
		);
		return { isSuccess: false, steps };
	}
	steps.push(
		stepOk({
			id: "lookup",
			label: "Look up existing worker",
			detail: `D1=${d1Binding.database_id}, R2=${r2Binding.bucket_name}`,
		}),
	);

	// -- 3. Run migrations (statement by statement, idempotent) --
	const statements = migrationSql
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	let hasFailedMigration = false;
	let migrationError = "";
	for (const sql of statements) {
		const result = await cfFetch<unknown>({
			path: `/accounts/${accountId}/d1/database/${d1Binding.database_id}/query`,
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

	// -- 4. Redeploy worker script with same bindings and assets --
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
				id: d1Binding.database_id,
			},
			{
				type: "r2_bucket",
				name: "BUCKET",
				bucket_name: r2Binding.bucket_name,
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
				label: "Redeploy worker",
				error: deploy.error ?? "Deploy failed",
			}),
		);
		return { isSuccess: false, steps };
	}
	steps.push(stepOk({ id: "deploy", label: "Redeploy worker" }));

	// -- 5. Resolve worker URL --
	const subdomain = await cfFetch<{ subdomain: string }>({
		path: `/accounts/${accountId}/workers/subdomain`,
		token,
	});
	const subdomainName = subdomain.result?.subdomain;
	const workerUrl = subdomainName
		? `https://${workerName}.${subdomainName}.workers.dev`
		: `https://${workerName}.workers.dev`;

	steps.push(
		stepOk({
			id: "route",
			label: "Resolve worker URL",
			detail: workerUrl,
		}),
	);

	return { isSuccess: true, steps, workerUrl };
}

export { update };
export type { UpdateInput, UpdateOutput };
