const $ = (s: string) => document.querySelector(s);
const $id = (s: string) => document.getElementById(s);

function esc(s: string): string {
	if (!s) return "";
	const d = document.createElement("div");
	d.textContent = s;
	return d.innerHTML;
}

function generatePassword(): string {
	const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let pw = "";
	const arr = new Uint8Array(20);
	crypto.getRandomValues(arr);
	for (let i = 0; i < 20; i++) pw += chars[arr[i] % chars.length];
	return pw;
}

type StepData = {
	isSuccess: boolean;
	label: string;
	detail?: string;
	error?: string;
};

type ProvisionResponse = {
	isSuccess: boolean;
	steps: StepData[];
	workerUrl?: string;
	authToken?: string;
	adminUsername?: string;
	adminPassword?: string;
};

function addStep({
	list,
	status,
	label,
	detail,
	error,
}: {
	list: HTMLElement;
	status: "done" | "fail" | "running";
	label: string;
	detail?: string;
	error?: string;
}) {
	const div = document.createElement("div");
	div.className = "flex items-center gap-2 px-3 py-2 text-xs";
	const iconClass =
		status === "done"
			? "ph-check-circle text-emerald-400"
			: status === "fail"
				? "ph-x-circle text-red-400"
				: "ph-circle-notch text-amber-400";
	let h = `<i class="ph ${iconClass} text-sm flex-shrink-0"></i>`;
	h += `<span class="text-zinc-200">${esc(label)}</span>`;
	if (detail)
		h += `<span class="text-zinc-500 ml-auto truncate max-w-48">${esc(detail)}</span>`;
	if (error)
		h += `<span class="text-red-400 ml-auto truncate max-w-48">${esc(error)}</span>`;
	div.innerHTML = h;
	list.appendChild(div);
}

function renderSteps({
	list,
	steps,
}: {
	list: HTMLElement;
	steps: StepData[];
}) {
	list.innerHTML = "";
	if (!steps) return;
	for (const s of steps) {
		addStep({
			list,
			status: s.isSuccess ? "done" : "fail",
			label: s.label,
			detail: s.detail,
			error: s.error,
		});
	}
}

// Generate password on load
const genBtn = $id("gen-pw");
const pwInput = $id("adminPassword") as HTMLInputElement | null;
if (genBtn && pwInput) {
	genBtn.addEventListener("click", () => {
		pwInput.value = generatePassword();
	});
	pwInput.value = generatePassword();
}

// Form submit
const form = $id("provision-form") as HTMLFormElement | null;
const submitBtn = $id("submit-btn") as HTMLButtonElement | null;

form?.addEventListener("submit", async (e) => {
	e.preventDefault();
	if (!submitBtn) return;
	submitBtn.disabled = true;

	const token = (($id("token") as HTMLInputElement).value ?? "").trim();
	const accountId = (($id("accountId") as HTMLInputElement).value ?? "").trim();
	const workerName = (
		($id("workerName") as HTMLInputElement).value ?? ""
	).trim();
	const adminUsername = (
		($id("adminUsername") as HTMLInputElement).value ?? "admin"
	).trim();
	const adminPassword = (
		($id("adminPassword") as HTMLInputElement).value ?? ""
	).trim();

	const progressSection = $id("step-progress");
	const resultSection = $id("step-result");
	const list = $id("progress-list");
	const title = $id("progress-title");
	const resultBody = $id("result-body");

	if (!progressSection || !resultSection || !list || !title || !resultBody)
		return;

	progressSection.classList.remove("hidden");
	resultSection.classList.add("hidden");
	list.innerHTML = "";
	title.textContent = "Provisioning...";
	addStep({ list, status: "running", label: "Starting deployment..." });

	try {
		const res = await fetch("/api/provision", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				token,
				accountId,
				workerName,
				adminUsername,
				adminPassword,
			}),
		});
		const data: ProvisionResponse = await res.json();
		renderSteps({ list, steps: data.steps });

		if (data.isSuccess) {
			title.textContent = "Complete";
			showInstallResult({ data, body: resultBody });
		} else {
			title.textContent = "Failed";
			showError({ steps: data.steps, body: resultBody });
		}
	} catch (err) {
		list.innerHTML = "";
		addStep({
			list,
			status: "fail",
			label: `Network error: ${(err as Error).message}`,
		});
		title.textContent = "Failed";
	}

	resultSection.classList.remove("hidden");
	submitBtn.disabled = false;
});

function showInstallResult({
	data,
	body,
}: {
	data: ProvisionResponse;
	body: HTMLElement;
}) {
	const loginCmd = `residue login --url ${data.workerUrl} --token ${data.authToken}`;
	body.innerHTML =
		`<div class="bg-emerald-950/30 border border-emerald-900/50 rounded-md px-3 py-2 mb-4">` +
		`<span class="text-emerald-400 text-xs font-medium"><i class="ph ph-check-circle mr-0.5"></i> Your residue instance is live.</span>` +
		`</div>` +
		`<div class="bg-zinc-900 border border-zinc-800 rounded-md p-3 text-xs space-y-1.5 mb-3">` +
		`<div class="flex justify-between"><span class="text-zinc-500">Worker URL</span><span class="text-zinc-200">${esc(data.workerUrl ?? "")}</span></div>` +
		`<div class="flex justify-between"><span class="text-zinc-500">Auth Token</span><span class="text-zinc-200 break-all">${esc(data.authToken ?? "")}</span></div>` +
		`<div class="flex justify-between"><span class="text-zinc-500">Admin</span><span class="text-zinc-200">${esc(data.adminUsername ?? "")} / ${esc(data.adminPassword ?? "")}</span></div>` +
		`</div>` +
		`<p class="text-xs text-zinc-400 mb-2">Run this to connect the CLI:</p>` +
		`<div id="login-cmd" class="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 cursor-pointer hover:border-zinc-700 transition-colors relative group">` +
		`<code>${esc(loginCmd)}</code>` +
		`<span class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 group-hover:text-zinc-300 text-[10px]">click to copy</span>` +
		`</div>` +
		`<p class="text-[11px] text-zinc-500 mt-3 leading-relaxed">Bookmark this page. Use "Update Existing" to deploy new versions without losing your data or secrets.</p>`;

	$id("login-cmd")?.addEventListener("click", function (this: HTMLElement) {
		navigator.clipboard.writeText(loginCmd);
		const el = this.querySelector("span");
		if (!el) return;
		el.textContent = "copied";
		el.className =
			"absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-[10px]";
		setTimeout(() => {
			el.textContent = "click to copy";
			el.className =
				"absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 group-hover:text-zinc-300 text-[10px]";
		}, 1500);
	});
}

function showError({ steps, body }: { steps: StepData[]; body: HTMLElement }) {
	const failed = steps ? steps.find((s) => !s.isSuccess) : null;
	body.innerHTML =
		`<div class="bg-red-950/30 border border-red-900/50 rounded-md px-3 py-2 mb-4">` +
		`<span class="text-red-400 text-xs font-medium"><i class="ph ph-x-circle mr-0.5"></i> Deployment failed.</span>` +
		`</div>` +
		(failed
			? `<p class="text-xs text-zinc-400">${esc(failed.error || "Unknown error at step: " + failed.label)}</p>`
			: "");
}
