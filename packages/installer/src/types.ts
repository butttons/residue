type InstallerEnv = {
	Bindings: {
		BUILD_SHA: string;
	};
};

type ProvisionRequest = {
	token: string;
	accountId: string;
	workerName: string;
	adminUsername: string;
	adminPassword: string;
};

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

type ProvisionStep = {
	id: string;
	label: string;
	status: StepStatus;
	detail?: string;
	error?: string;
};

type ProvisionResult = {
	isSuccess: boolean;
	workerUrl: string;
	authToken: string;
	adminUsername: string;
	adminPassword: string;
	steps: ProvisionStep[];
	error?: string;
};

type CloudflareApiResponse<T> = {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	messages: Array<{ code: number; message: string }>;
	result: T;
};

type D1DatabaseResult = {
	uuid: string;
	name: string;
	created_at: string;
};

type R2BucketResult = {
	name: string;
	creation_date: string;
};

type TokenResult = {
	id: string;
	value: string;
};

type PermissionGroup = {
	id: string;
	name: string;
	description: string;
	scopes: string[];
};

type WorkerSubdomain = {
	subdomain: string;
};

export type {
	InstallerEnv,
	ProvisionRequest,
	StepStatus,
	ProvisionStep,
	ProvisionResult,
	CloudflareApiResponse,
	D1DatabaseResult,
	R2BucketResult,
	TokenResult,
	PermissionGroup,
	WorkerSubdomain,
};
