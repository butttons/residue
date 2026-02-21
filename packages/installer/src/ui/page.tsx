import { html } from "hono/html";
import type { FC } from "hono/jsx";

const Page: FC<{ buildSha: string }> = ({ buildSha }) => {
	return html`<!doctype html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>residue -- setup</title>
				<link rel="stylesheet" href="/styles.css" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
				<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
				<script src="https://unpkg.com/@phosphor-icons/web"></script>
			</head>
			<body class="bg-zinc-950 text-zinc-100 min-h-screen antialiased flex flex-col">
				<!-- Nav -->
				<nav class="border-b border-zinc-800">
					<div class="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between">
						<div class="flex items-center gap-1.5 text-sm">
							<span class="font-bold text-zinc-100">residue</span>
							<span class="text-zinc-600">/</span>
							<span class="text-zinc-400">setup</span>
						</div>
						<a href="https://github.com/butttons/residue" target="_blank" rel="noopener noreferrer" class="text-zinc-600 hover:text-zinc-300 transition-colors">
							<i class="ph ph-github-logo text-base"></i>
						</a>
					</div>
				</nav>

				<!-- Main -->
				<div class="max-w-4xl mx-auto px-4 py-8 w-full flex-1">
					<div class="max-w-lg">
						<h1 class="text-xl font-semibold mb-1">Deploy your own instance</h1>
						<p class="text-sm text-zinc-400 mb-6">One API token. Fully automated. Your data stays on your Cloudflare account.</p>

						<!-- Mode Toggle -->
						<div class="flex mb-6 border border-zinc-800 rounded-md overflow-hidden">
							<button id="btn-install" type="button" class="flex-1 py-2 text-xs font-medium text-zinc-100 bg-zinc-900 transition-colors">New Install</button>
							<button id="btn-update" type="button" class="flex-1 py-2 text-xs font-medium text-zinc-500 bg-transparent transition-colors hover:text-zinc-300">Update Existing</button>
						</div>

						<!-- Step 1: Token instructions -->
						<section class="mb-6">
							<h2 class="text-sm font-medium mb-2 text-zinc-200">1. Create a Cloudflare API token</h2>
							<p class="text-xs text-zinc-400 mb-2 leading-relaxed">
								Go to your
								<a
									href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22account%22%2C%22access%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22account%22%2C%22access%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22account%22%2C%22access%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22api_tokens%22%2C%22type%22%3A%22user%22%2C%22access%22%3A%22edit%22%7D%5D&name=residue-setup"
									target="_blank"
									rel="noopener"
									class="text-blue-400 hover:underline"
								>Cloudflare dashboard</a>
								and create a token with these permissions:
							</p>
							<div class="bg-zinc-900 border border-zinc-800 rounded-md p-3 text-xs text-zinc-300 space-y-1">
								<div><span class="text-zinc-500">-</span> Account &gt; Workers Scripts &gt; Edit</div>
								<div><span class="text-zinc-500">-</span> Account &gt; D1 &gt; Edit</div>
								<div><span class="text-zinc-500">-</span> Account &gt; R2 &gt; Edit</div>
								<div><span class="text-zinc-500">-</span> User &gt; API Tokens &gt; Edit</div>
							</div>
						</section>

						<!-- Step 2: Form -->
						<section class="mb-6">
							<h2 class="text-sm font-medium mb-3 text-zinc-200">2. Configure and deploy</h2>
							<form id="provision-form" autocomplete="off" class="space-y-3">
								<!-- Token -->
								<div>
									<label for="token" class="block text-xs text-zinc-400 mb-1">API Token</label>
									<input id="token" name="token" type="password" required
										class="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
										placeholder="Paste your Cloudflare API token" />
								</div>
								<!-- Account ID -->
								<div>
									<label for="accountId" class="block text-xs text-zinc-400 mb-1">Account ID</label>
									<input id="accountId" name="accountId" type="text" required
										class="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
										placeholder="Found in Cloudflare dashboard sidebar" />
								</div>
								<!-- Worker Name -->
								<div>
									<label for="workerName" class="block text-xs text-zinc-400 mb-1">Worker Name</label>
									<input id="workerName" name="workerName" type="text" required value="residue"
										class="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors" />
									<span class="text-[11px] text-zinc-500 mt-0.5 block">Deployed to &lt;name&gt;.&lt;subdomain&gt;.workers.dev</span>
								</div>
								<!-- Install-only fields -->
								<div id="install-fields" class="space-y-3">
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
								</div>
								<!-- Submit -->
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
					</div>
				</div>

				<!-- Footer -->
				<footer class="border-t border-zinc-800/50">
					<div class="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
						<span class="text-[11px] text-zinc-600">
							built by <a href="https://x.com/AeizeiXY" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-300 transition-colors">Yash</a>
						</span>
						<div class="flex items-center gap-2">
							<span class="text-[11px] text-zinc-600">${buildSha.slice(0, 7)}</span>
							<a href="https://github.com/butttons/residue" target="_blank" rel="noopener noreferrer" class="text-zinc-600 hover:text-zinc-300 transition-colors">
								<i class="ph ph-github-logo text-base"></i>
							</a>
						</div>
					</div>
				</footer>

				<script>
					${CLIENT_JS}
				</script>
			</body>
		</html>`;
};

const CLIENT_JS = `
(function() {
  var $ = function(s) { return document.querySelector(s); };
  var $id = function(s) { return document.getElementById(s); };

  var mode = "install";

  $id("btn-install").addEventListener("click", function() { setMode("install"); });
  $id("btn-update").addEventListener("click", function() { setMode("update"); });

  function setMode(m) {
    mode = m;
    var isInstall = m === "install";
    $id("btn-install").className = "flex-1 py-2 text-xs font-medium transition-colors " + (isInstall ? "text-zinc-100 bg-zinc-900" : "text-zinc-500 bg-transparent hover:text-zinc-300");
    $id("btn-update").className = "flex-1 py-2 text-xs font-medium transition-colors " + (!isInstall ? "text-zinc-100 bg-zinc-900" : "text-zinc-500 bg-transparent hover:text-zinc-300");
    $id("install-fields").style.display = isInstall ? "" : "none";
    $id("submit-btn").textContent = isInstall ? "Deploy" : "Update";
    $id("step-progress").classList.add("hidden");
    $id("step-result").classList.add("hidden");
  }

  $id("gen-pw").addEventListener("click", function() {
    var chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var pw = "";
    var arr = new Uint8Array(20);
    crypto.getRandomValues(arr);
    for (var i = 0; i < 20; i++) pw += chars[arr[i] % chars.length];
    $id("adminPassword").value = pw;
  });
  $id("gen-pw").click();

  $id("provision-form").addEventListener("submit", function(e) {
    e.preventDefault();
    var btn = $id("submit-btn");
    btn.disabled = true;

    var token = $id("token").value.trim();
    var accountId = $id("accountId").value.trim();
    var workerName = $id("workerName").value.trim();

    $id("step-progress").classList.remove("hidden");
    $id("step-result").classList.add("hidden");
    var list = $id("progress-list");
    list.innerHTML = "";

    var title = $id("progress-title");

    if (mode === "install") {
      var adminUsername = $id("adminUsername").value.trim() || "admin";
      var adminPassword = $id("adminPassword").value.trim();
      title.textContent = "Provisioning...";
      addStep(list, "running", "Starting deployment...");

      fetch("/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, accountId: accountId, workerName: workerName, adminUsername: adminUsername, adminPassword: adminPassword }),
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          renderSteps(list, data.steps);
          if (data.isSuccess) {
            title.textContent = "Complete";
            showInstallResult(data);
          } else {
            title.textContent = "Failed";
            showError(data.steps);
          }
        })
        .catch(function(err) {
          list.innerHTML = "";
          addStep(list, "fail", "Network error: " + err.message);
          title.textContent = "Failed";
        })
        .finally(function() { btn.disabled = false; });
    } else {
      title.textContent = "Updating...";
      addStep(list, "running", "Starting update...");

      fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, accountId: accountId, workerName: workerName }),
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          renderSteps(list, data.steps);
          if (data.isSuccess) {
            title.textContent = "Complete";
            showUpdateResult(data);
          } else {
            title.textContent = "Failed";
            showError(data.steps);
          }
        })
        .catch(function(err) {
          list.innerHTML = "";
          addStep(list, "fail", "Network error: " + err.message);
          title.textContent = "Failed";
        })
        .finally(function() { btn.disabled = false; });
    }
  });

  function addStep(list, status, label, detail, error) {
    var div = document.createElement("div");
    div.className = "flex items-center gap-2 px-3 py-2 text-xs";
    var iconClass = status === "done" ? "ph-check-circle text-emerald-400" : status === "fail" ? "ph-x-circle text-red-400" : "ph-circle-notch text-amber-400";
    var h = '<i class="ph ' + iconClass + ' text-sm flex-shrink-0"></i>';
    h += '<span class="text-zinc-200">' + esc(label) + '</span>';
    if (detail) h += '<span class="text-zinc-500 ml-auto truncate max-w-48">' + esc(detail) + '</span>';
    if (error) h += '<span class="text-red-400 ml-auto truncate max-w-48">' + esc(error) + '</span>';
    div.innerHTML = h;
    list.appendChild(div);
  }

  function renderSteps(list, steps) {
    list.innerHTML = "";
    if (!steps) return;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      addStep(list, s.isSuccess ? "done" : "fail", s.label, s.detail, s.error);
    }
  }

  function showInstallResult(data) {
    var body = $id("result-body");
    var loginCmd = "residue login --url " + data.workerUrl + " --token " + data.authToken;
    body.innerHTML =
      '<div class="bg-emerald-950/30 border border-emerald-900/50 rounded-md px-3 py-2 mb-4">' +
        '<span class="text-emerald-400 text-xs font-medium"><i class="ph ph-check-circle mr-0.5"></i> Your residue instance is live.</span>' +
      '</div>' +
      '<div class="bg-zinc-900 border border-zinc-800 rounded-md p-3 text-xs space-y-1.5 mb-3">' +
        '<div class="flex justify-between"><span class="text-zinc-500">Worker URL</span><span class="text-zinc-200">' + esc(data.workerUrl) + '</span></div>' +
        '<div class="flex justify-between"><span class="text-zinc-500">Auth Token</span><span class="text-zinc-200 break-all">' + esc(data.authToken) + '</span></div>' +
        '<div class="flex justify-between"><span class="text-zinc-500">Admin</span><span class="text-zinc-200">' + esc(data.adminUsername) + ' / ' + esc(data.adminPassword) + '</span></div>' +
      '</div>' +
      '<p class="text-xs text-zinc-400 mb-2">Run this to connect the CLI:</p>' +
      '<div id="login-cmd" class="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 cursor-pointer hover:border-zinc-700 transition-colors relative group">' +
        '<code>' + esc(loginCmd) + '</code>' +
        '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 group-hover:text-zinc-300 text-[10px]">click to copy</span>' +
      '</div>' +
      '<p class="text-[11px] text-zinc-500 mt-3 leading-relaxed">Bookmark this page. Use "Update Existing" to deploy new versions without losing your data or secrets.</p>';

    $id("login-cmd").addEventListener("click", function() {
      navigator.clipboard.writeText(loginCmd);
      var el = this.querySelector("span");
      el.textContent = "copied";
      el.className = "absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-[10px]";
      setTimeout(function() {
        el.textContent = "click to copy";
        el.className = "absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 group-hover:text-zinc-300 text-[10px]";
      }, 1500);
    });

    $id("step-result").classList.remove("hidden");
  }

  function showUpdateResult(data) {
    var body = $id("result-body");
    body.innerHTML =
      '<div class="bg-emerald-950/30 border border-emerald-900/50 rounded-md px-3 py-2 mb-4">' +
        '<span class="text-emerald-400 text-xs font-medium"><i class="ph ph-check-circle mr-0.5"></i> Worker updated successfully.</span>' +
      '</div>' +
      '<div class="bg-zinc-900 border border-zinc-800 rounded-md p-3 text-xs space-y-1.5 mb-3">' +
        '<div class="flex justify-between"><span class="text-zinc-500">Worker URL</span><span class="text-zinc-200">' + esc(data.workerUrl) + '</span></div>' +
      '</div>' +
      '<p class="text-[11px] text-zinc-500 mt-3 leading-relaxed">Your secrets and data are untouched. Only the worker code and D1 schema were updated.</p>';

    $id("step-result").classList.remove("hidden");
  }

  function showError(steps) {
    var body = $id("result-body");
    var failed = steps ? steps.find(function(s) { return !s.isSuccess; }) : null;
    body.innerHTML =
      '<div class="bg-red-950/30 border border-red-900/50 rounded-md px-3 py-2 mb-4">' +
        '<span class="text-red-400 text-xs font-medium"><i class="ph ph-x-circle mr-0.5"></i> Deployment failed.</span>' +
      '</div>' +
      (failed ? '<p class="text-xs text-zinc-400">' + esc(failed.error || "Unknown error at step: " + failed.label) + '</p>' : '');
    $id("step-result").classList.remove("hidden");
  }

  function esc(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
})();
`;

export { Page };
