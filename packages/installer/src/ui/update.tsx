import { html } from "hono/html";
import type { FC } from "hono/jsx";
import { Layout } from "@/ui/layout";

const UpdatePage: FC<{ buildSha: string }> = ({ buildSha }) => {
	return (
		<Layout buildSha={buildSha} activeTab="update">
			{html`
				<section class="mb-6">
					<h2 class="text-sm font-medium mb-2 text-zinc-200">Update an existing deployment</h2>
					<p class="text-xs text-zinc-400 mb-3 leading-relaxed">
						Redeploys the worker code and runs any new D1 migrations.
						Your secrets, data, and R2 bucket are untouched.
					</p>
					<p class="text-xs text-zinc-400 mb-3 leading-relaxed">
						Use the same API token from your initial install, or create a new one with the same permissions.
					</p>
				</section>

				<section class="mb-6">
					<form id="update-form" autocomplete="off" class="space-y-3">
						<div>
							<label for="token" class="block text-xs text-zinc-400 mb-1">API Token</label>
							<input id="token" name="token" type="password" required
								class="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
								placeholder="Paste your Cloudflare API token" />
						</div>
						<div>
							<label for="accountId" class="block text-xs text-zinc-400 mb-1">Account ID</label>
							<input id="accountId" name="accountId" type="text" required
								class="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
								placeholder="Found in Cloudflare dashboard sidebar" />
						</div>
						<div>
							<label for="workerName" class="block text-xs text-zinc-400 mb-1">Worker Name</label>
							<input id="workerName" name="workerName" type="text" required value="residue"
								class="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors" />
							<span class="text-[11px] text-zinc-500 mt-0.5 block">Must match the name used during install</span>
						</div>
						<button id="submit-btn" type="submit"
							class="w-full py-2 mt-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
							Update
						</button>
					</form>
				</section>

				<!-- Progress -->
				<section id="step-progress" class="mb-6 hidden">
					<h2 id="progress-title" class="text-sm font-medium mb-2 text-zinc-200">Updating...</h2>
					<div id="progress-list" class="bg-zinc-900 border border-zinc-800 rounded-md divide-y divide-zinc-800/50"></div>
				</section>

				<!-- Result -->
				<section id="step-result" class="hidden">
					<div id="result-body"></div>
				</section>

				<script type="module" src="/update.js"></script>
			`}
		</Layout>
	);
};

export { UpdatePage };
