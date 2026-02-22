import { html } from "hono/html";
import type { FC } from "hono/jsx";
import { Layout } from "@/ui/layout";

const InstallPage: FC<{ buildSha: string }> = ({ buildSha }) => {
	return (
		<Layout buildSha={buildSha} activeTab="install">
			{html`
				<!-- Step 1: Token instructions -->
				<section class="mb-6">
					<h2 class="text-sm font-medium mb-2 text-zinc-200">1. Create a Cloudflare API token</h2>
					<p class="text-xs text-zinc-400 mb-2 leading-relaxed">
						Go to your
						<a
							href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22ai_search%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_api_tokens%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=*&zoneId=all&name=residue-setup"
							target="_blank"
							rel="noopener"
							class="text-blue-400 hover:underline"
						>Cloudflare dashboard</a>
						and create a custom token with these permissions:
					</p>
					<div class="bg-zinc-900 border border-zinc-800 rounded-md p-3 text-xs text-zinc-300 space-y-1">
						<div><span class="text-zinc-500">-</span> Account &gt; Workers Scripts &gt; Edit</div>
						<div><span class="text-zinc-500">-</span> Account &gt; D1 &gt; Edit</div>
						<div><span class="text-zinc-500">-</span> Account &gt; Workers R2 Storage &gt; Edit</div>
						<div><span class="text-zinc-500">-</span> Account &gt; AI Search &gt; Edit</div>
						<div><span class="text-zinc-500">-</span> User &gt; API Tokens &gt; Edit</div>
					</div>
				</section>

				<!-- Step 2: Form -->
				<section class="mb-6">
					<h2 class="text-sm font-medium mb-3 text-zinc-200">2. Configure and deploy</h2>
					<form id="provision-form" autocomplete="off" class="space-y-3">
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
							<span class="text-[11px] text-zinc-500 mt-0.5 block">&lt;name&gt;.&lt;subdomain&gt;.workers.dev</span>
						</div>
						<div>
							<label for="adminUsername" class="block text-xs text-zinc-400 mb-1">Admin Username</label>
							<input id="adminUsername" name="adminUsername" type="text" value="admin"
								class="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors" />
						</div>
						<div>
							<label for="adminPassword" class="block text-xs text-zinc-400 mb-1">Admin Password</label>
							<div class="flex gap-2">
								<input id="adminPassword" name="adminPassword" type="text" required
									class="flex-1 bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors" />
								<button type="button" id="gen-pw" title="Generate password"
									class="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-sm text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors">
									<i class="ph ph-dice-five"></i>
								</button>
							</div>
						</div>
						<button id="submit-btn" type="submit"
							class="w-full py-2 mt-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
							Deploy
						</button>
					</form>
				</section>

				<!-- Progress -->
				<section id="step-progress" class="mb-6 hidden">
					<h2 id="progress-title" class="text-sm font-medium mb-2 text-zinc-200">Provisioning...</h2>
					<div id="progress-list" class="bg-zinc-900 border border-zinc-800 rounded-md divide-y divide-zinc-800/50"></div>
				</section>

				<!-- Result -->
				<section id="step-result" class="hidden">
					<div id="result-body"></div>
				</section>

				<script type="module" src="/install.js"></script>
			`}
		</Layout>
	);
};

export { InstallPage };
