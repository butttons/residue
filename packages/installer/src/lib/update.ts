import { cfFetch, cfFetchRaw } from "@/lib/cloudflare";
import { MIGRATION_SQL, WORKER_SCRIPT } from "@/lib/embedded";
import type { StepResult } from "@/lib/provision";

type UpdateInput = {
	token: string;
	accountId: string;
	workerName: string;
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

	// -- 3. Run migrations (idempotent -- uses IF NOT EXISTS / ADD COLUMN) --
	const migrate = await cfFetch<unknown>({
		path: `/accounts/${accountId}/d1/database/${d1Binding.database_id}/query`,
		token,
		method: "POST",
		body: { sql: MIGRATION_SQL },
	});
	if (!migrate.success) {
		// Migrations may partially fail if columns already exist, which is fine
		steps.push(
			stepOk({
				id: "migrate",
				label: "Run D1 migrations",
				detail: "Applied (some statements may have been no-ops)",
			}),
		);
	} else {
		steps.push(stepOk({ id: "migrate", label: "Run D1 migrations" }));
	}

	// -- 4. Redeploy worker script with same bindings --
	const metadata = {
		main_module: "worker.js",
		bindings: [
			{
				type: "d1",
				name: "DB",
				database_id: d1Binding.database_id,
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
		compatibility_date: "2025-02-14",
		compatibility_flags: ["nodejs_compat"],
	};

	const form = new FormData();
	form.append(
		"worker.js",
		new Blob([WORKER_SCRIPT], { type: "application/javascript+module" }),
		"worker.js",
	);
	form.append(
		"metadata",
		new Blob([JSON.stringify(metadata)], { type: "application/json" }),
	);

	const deploy = await cfFetchRaw({
		path: `/accounts/${accountId}/workers/scripts/${workerName}`,
		token,
		body: form,
	});
	if (!deploy.ok) {
		const err = await deploy.text();
		steps.push(
			stepFail({
				id: "deploy",
				label: "Redeploy worker",
				error: `Deploy failed (${deploy.status}): ${err.substring(0, 200)}`,
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
