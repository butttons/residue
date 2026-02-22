const $id = (s: string) => document.getElementById(s);

function esc(s: string): string {
	if (!s) return "";
	const d = document.createElement("div");
	d.textContent = s;
	return d.innerHTML;
}

type StepData = {
	isSuccess: boolean;
	label: string;
	detail?: string;
	error?: string;
};

type UpdateResponse = {
	isSuccess: boolean;
	steps: StepData[];
	workerUrl?: string;
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

const form = $id("update-form") as HTMLFormElement | null;
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
	title.textContent = "Updating...";
	addStep({ list, status: "running", label: "Starting update..." });

	try {
		const res = await fetch("/api/update", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, accountId, workerName }),
		});
		const data: UpdateResponse = await res.json();
		renderSteps({ list, steps: data.steps });

		if (data.isSuccess) {
			title.textContent = "Complete";
			resultBody.innerHTML =
				`<div class="bg-emerald-950/30 border border-emerald-900/50 rounded-md px-3 py-2 mb-4">` +
				`<span class="text-emerald-400 text-xs font-medium"><i class="ph ph-check-circle mr-0.5"></i> Worker updated successfully.</span>` +
				`</div>` +
				`<div class="bg-zinc-900 border border-zinc-800 rounded-md p-3 text-xs space-y-1.5 mb-3">` +
				`<div class="flex justify-between"><span class="text-zinc-500">Worker URL</span><span class="text-zinc-200">${esc(data.workerUrl ?? "")}</span></div>` +
				`</div>` +
				`<p class="text-[11px] text-zinc-500 mt-3 leading-relaxed">Your secrets and data are untouched. Only the worker code and D1 schema were updated.</p>`;
		} else {
			title.textContent = "Failed";
			const failed = data.steps ? data.steps.find((s) => !s.isSuccess) : null;
			resultBody.innerHTML =
				`<div class="bg-red-950/30 border border-red-900/50 rounded-md px-3 py-2 mb-4">` +
				`<span class="text-red-400 text-xs font-medium"><i class="ph ph-x-circle mr-0.5"></i> Update failed.</span>` +
				`</div>` +
				(failed
					? `<p class="text-xs text-zinc-400">${esc(failed.error || "Unknown error at step: " + failed.label)}</p>`
					: "");
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
