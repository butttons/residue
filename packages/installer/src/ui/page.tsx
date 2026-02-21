import type { FC } from "hono/jsx";

const Page: FC<{ buildSha: string }> = ({ buildSha }) => {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>residue -- setup</title>
				<style>{CSS}</style>
			</head>
			<body>
				<main>
					<header>
						<h1>residue</h1>
						<p class="subtitle">
							Deploy your own instance. One API token, fully automated.
						</p>
					</header>

					{/* ---- Mode Toggle ---- */}
					<div class="mode-toggle">
						<button id="btn-install" class="mode-btn active" type="button">
							New Install
						</button>
						<button id="btn-update" class="mode-btn" type="button">
							Update Existing
						</button>
					</div>

					{/* ---- Step 1: Create Token ---- */}
					<section id="step-token" class="step">
						<h2>1. Create a Cloudflare API token</h2>
						<p>
							Go to your{" "}
							<a
								href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22account%22%2C%22access%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22account%22%2C%22access%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22account%22%2C%22access%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22api_tokens%22%2C%22type%22%3A%22user%22%2C%22access%22%3A%22edit%22%7D%5D&name=residue-setup"
								target="_blank"
								rel="noopener"
							>
								Cloudflare dashboard
							</a>{" "}
							and create a token with these permissions:
						</p>
						<ul class="perms">
							<li>
								<code>Account &gt; Workers Scripts &gt; Edit</code>
							</li>
							<li>
								<code>Account &gt; D1 &gt; Edit</code>
							</li>
							<li>
								<code>Account &gt; R2 &gt; Edit</code>
							</li>
							<li>
								<code>User &gt; API Tokens &gt; Edit</code>
							</li>
						</ul>
					</section>

					{/* ---- Step 2: Form ---- */}
					<section id="step-form" class="step">
						<h2>2. Configure and deploy</h2>
						<form id="provision-form" autocomplete="off">
							<div class="field">
								<label for="token">API Token</label>
								<input
									id="token"
									name="token"
									type="password"
									placeholder="Paste your Cloudflare API token"
									required
								/>
							</div>
							<div class="field">
								<label for="accountId">Account ID</label>
								<input
									id="accountId"
									name="accountId"
									type="text"
									placeholder="Found in Cloudflare dashboard sidebar"
									required
								/>
							</div>
							<div class="field">
								<label for="workerName">Worker Name</label>
								<input
									id="workerName"
									name="workerName"
									type="text"
									value="residue"
									required
								/>
								<span class="hint">
									Deployed to{" "}
									<code>&lt;name&gt;.&lt;subdomain&gt;.workers.dev</code>
								</span>
							</div>

							{/* Install-only fields */}
							<div id="install-fields">
								<div class="field">
									<label for="adminUsername">Admin Username</label>
									<input
										id="adminUsername"
										name="adminUsername"
										type="text"
										value="admin"
									/>
								</div>
								<div class="field">
									<label for="adminPassword">Admin Password</label>
									<div class="password-row">
										<input
											id="adminPassword"
											name="adminPassword"
											type="text"
											required
										/>
										<button type="button" id="gen-pw" title="Generate password">
											dice
										</button>
									</div>
								</div>
							</div>

							<button id="submit-btn" type="submit">
								Deploy
							</button>
						</form>
					</section>

					{/* ---- Progress ---- */}
					<section id="step-progress" class="step hidden">
						<h2>
							<span id="progress-title">Provisioning...</span>
						</h2>
						<ul id="progress-list" class="progress-list" />
					</section>

					{/* ---- Result ---- */}
					<section id="step-result" class="step hidden">
						<h2 id="result-title">Done</h2>
						<div id="result-body" />
					</section>

					<footer>
						<span>
							<a
								href="https://github.com/butttons/residue"
								target="_blank"
								rel="noopener"
							>
								source
							</a>
						</span>
						<span class="sha">{buildSha.slice(0, 7)}</span>
					</footer>
				</main>
				<script>{CLIENT_JS}</script>
			</body>
		</html>
	);
};

const CSS = `
:root {
  --bg: #09090b;
  --surface: #18181b;
  --border: #27272a;
  --text: #f4f4f5;
  --text2: #a1a1aa;
  --accent: #3b82f6;
  --green: #22c55e;
  --red: #ef4444;
  --amber: #f59e0b;
  --mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html {
  font-family: var(--mono);
  font-size: 14px;
  background: var(--bg);
  color: var(--text);
}

body { display: flex; justify-content: center; padding: 2rem 1rem; }

main {
  width: 100%;
  max-width: 640px;
}

header { margin-bottom: 2rem; }
h1 { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
.subtitle { color: var(--text2); margin-top: 0.25rem; font-size: 0.85rem; }

h2 { font-size: 1rem; font-weight: 500; margin-bottom: 0.75rem; }

.step { margin-bottom: 1.5rem; }
.step p { color: var(--text2); font-size: 0.85rem; line-height: 1.6; margin-bottom: 0.5rem; }
.step a { color: var(--accent); text-decoration: none; }
.step a:hover { text-decoration: underline; }

.perms { list-style: none; margin-bottom: 0.5rem; }
.perms li { padding: 0.25rem 0; font-size: 0.8rem; }
.perms li::before { content: "- "; color: var(--text2); }
.perms code { background: var(--surface); padding: 0.125rem 0.375rem; border-radius: 3px; font-size: 0.8rem; }

.mode-toggle {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.mode-btn {
  flex: 1;
  padding: 0.5rem;
  background: transparent;
  color: var(--text2);
  border: none;
  font-family: var(--mono);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}
.mode-btn.active {
  background: var(--surface);
  color: var(--text);
}

.field { margin-bottom: 0.75rem; }
.field label {
  display: block;
  font-size: 0.8rem;
  color: var(--text2);
  margin-bottom: 0.25rem;
}
.field input {
  width: 100%;
  padding: 0.5rem 0.625rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.15s;
}
.field input:focus { border-color: var(--accent); }
.field .hint { font-size: 0.75rem; color: var(--text2); margin-top: 0.125rem; display: block; }

.password-row { display: flex; gap: 0.5rem; }
.password-row input { flex: 1; }
.password-row button {
  padding: 0.5rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text2);
  font-family: var(--mono);
  font-size: 0.75rem;
  cursor: pointer;
}
.password-row button:hover { border-color: var(--text2); }

#submit-btn {
  width: 100%;
  padding: 0.625rem;
  margin-top: 0.5rem;
  background: var(--accent);
  border: none;
  border-radius: 4px;
  color: white;
  font-family: var(--mono);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
#submit-btn:hover { opacity: 0.9; }
#submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.progress-list { list-style: none; }
.progress-list li {
  padding: 0.375rem 0;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.progress-list .icon { width: 1.25rem; text-align: center; flex-shrink: 0; }
.progress-list .done .icon { color: var(--green); }
.progress-list .fail .icon { color: var(--red); }
.progress-list .running .icon { color: var(--amber); }
.progress-list .detail { color: var(--text2); font-size: 0.75rem; margin-left: 0.25rem; }
.progress-list .error-msg { color: var(--red); font-size: 0.75rem; margin-left: 0.25rem; }

#result-body .creds {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem;
  margin: 0.75rem 0;
  font-size: 0.8rem;
  line-height: 1.8;
}
#result-body .creds strong { color: var(--text2); font-weight: 400; }
#result-body .cmd {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem;
  margin: 0.5rem 0;
  font-size: 0.8rem;
  cursor: pointer;
  position: relative;
}
#result-body .cmd:hover { border-color: var(--text2); }
#result-body .cmd .copied {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--green);
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s;
}
#result-body .cmd .copied.show { opacity: 1; }
#result-body .update-note {
  color: var(--text2);
  font-size: 0.8rem;
  margin-top: 0.75rem;
  line-height: 1.6;
}
#result-body .success-text { color: var(--green); margin-bottom: 0.5rem; font-size: 0.85rem; }
#result-body .fail-text { color: var(--red); margin-bottom: 0.5rem; font-size: 0.85rem; }

.hidden { display: none; }

footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text2);
}
footer a { color: var(--text2); text-decoration: none; }
footer a:hover { color: var(--text); }
.sha { font-variant-numeric: tabular-nums; }
`;

const CLIENT_JS = `
(function() {
  const $ = (s) => document.querySelector(s);
  const $id = (s) => document.getElementById(s);

  let mode = "install";

  // -- Mode toggle --
  $id("btn-install").addEventListener("click", () => setMode("install"));
  $id("btn-update").addEventListener("click", () => setMode("update"));

  function setMode(m) {
    mode = m;
    $id("btn-install").classList.toggle("active", m === "install");
    $id("btn-update").classList.toggle("active", m === "update");
    $id("install-fields").classList.toggle("hidden", m === "update");
    $id("submit-btn").textContent = m === "install" ? "Deploy" : "Update";
    // Reset state
    $id("step-progress").classList.add("hidden");
    $id("step-result").classList.add("hidden");
  }

  // -- Generate password --
  $id("gen-pw").addEventListener("click", () => {
    const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let pw = "";
    const arr = new Uint8Array(20);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 20; i++) pw += chars[arr[i] % chars.length];
    $id("adminPassword").value = pw;
  });

  // Auto-generate on load
  $id("gen-pw").click();

  // -- Form submit --
  $id("provision-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $id("submit-btn");
    btn.disabled = true;

    const token = $id("token").value.trim();
    const accountId = $id("accountId").value.trim();
    const workerName = $id("workerName").value.trim();

    // Show progress
    $id("step-progress").classList.remove("hidden");
    $id("step-result").classList.add("hidden");
    const list = $id("progress-list");
    list.innerHTML = "";

    const progressTitle = $id("progress-title");

    if (mode === "install") {
      const adminUsername = $id("adminUsername").value.trim() || "admin";
      const adminPassword = $id("adminPassword").value.trim();

      progressTitle.textContent = "Provisioning...";
      addStep(list, "running", "Starting deployment...");

      try {
        const res = await fetch("/api/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, accountId, workerName, adminUsername, adminPassword }),
        });
        const data = await res.json();
        renderSteps(list, data.steps);

        if (data.isSuccess) {
          progressTitle.textContent = "Complete";
          showInstallResult(data);
        } else {
          progressTitle.textContent = "Failed";
          showError(data.steps);
        }
      } catch (err) {
        list.innerHTML = "";
        addStep(list, "fail", "Network error: " + err.message);
        progressTitle.textContent = "Failed";
      }
    } else {
      progressTitle.textContent = "Updating...";
      addStep(list, "running", "Starting update...");

      try {
        const res = await fetch("/api/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, accountId, workerName }),
        });
        const data = await res.json();
        renderSteps(list, data.steps);

        if (data.isSuccess) {
          progressTitle.textContent = "Complete";
          showUpdateResult(data);
        } else {
          progressTitle.textContent = "Failed";
          showError(data.steps);
        }
      } catch (err) {
        list.innerHTML = "";
        addStep(list, "fail", "Network error: " + err.message);
        progressTitle.textContent = "Failed";
      }
    }

    btn.disabled = false;
  });

  function addStep(list, status, label, detail, error) {
    const li = document.createElement("li");
    li.className = status;
    const icons = { done: "ok", fail: "x", running: "..." };
    let html = '<span class="icon">' + (icons[status] || "?") + "</span>";
    html += "<span>" + esc(label) + "</span>";
    if (detail) html += ' <span class="detail">(' + esc(detail) + ")</span>";
    if (error) html += ' <span class="error-msg">' + esc(error) + "</span>";
    li.innerHTML = html;
    list.appendChild(li);
  }

  function renderSteps(list, steps) {
    list.innerHTML = "";
    if (!steps) return;
    for (const s of steps) {
      addStep(list, s.isSuccess ? "done" : "fail", s.label, s.detail, s.error);
    }
  }

  function showInstallResult(data) {
    const body = $id("result-body");
    const loginCmd = "residue login --url " + data.workerUrl + " --token " + data.authToken;
    body.innerHTML =
      '<p class="success-text">Your residue instance is live.</p>' +
      '<div class="creds">' +
        "<strong>Worker URL:</strong> " + esc(data.workerUrl) + "<br>" +
        "<strong>Auth Token:</strong> " + esc(data.authToken) + "<br>" +
        "<strong>Admin:</strong> " + esc(data.adminUsername) + " / " + esc(data.adminPassword) +
      "</div>" +
      "<p>Run this to connect the CLI:</p>" +
      '<div class="cmd" id="login-cmd">' +
        "<code>" + esc(loginCmd) + "</code>" +
        '<span class="copied">copied</span>' +
      "</div>" +
      '<p class="update-note">Bookmark this page. Come back and use "Update Existing" to deploy new versions without losing your data.</p>';

    $id("login-cmd").addEventListener("click", () => {
      navigator.clipboard.writeText(loginCmd);
      const badge = $id("login-cmd").querySelector(".copied");
      badge.classList.add("show");
      setTimeout(() => badge.classList.remove("show"), 1500);
    });

    $id("step-result").classList.remove("hidden");
  }

  function showUpdateResult(data) {
    const body = $id("result-body");
    body.innerHTML =
      '<p class="success-text">Worker updated successfully.</p>' +
      '<div class="creds">' +
        "<strong>Worker URL:</strong> " + esc(data.workerUrl) + "<br>" +
        "<strong>Version:</strong> latest" +
      "</div>" +
      '<p class="update-note">Your secrets and data are untouched. Only the worker code and D1 schema were updated.</p>';
    $id("step-result").classList.remove("hidden");
  }

  function showError(steps) {
    const body = $id("result-body");
    const failed = steps ? steps.find((s) => !s.isSuccess) : null;
    body.innerHTML =
      '<p class="fail-text">Deployment failed.</p>' +
      (failed ? "<p>" + esc(failed.error || "Unknown error at step: " + failed.label) + "</p>" : "");
    $id("step-result").classList.remove("hidden");
  }

  function esc(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
})();
`;

export { Page };
