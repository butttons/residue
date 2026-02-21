import { html } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";

type LayoutProps = PropsWithChildren<{
	buildSha: string;
	activeTab: "install" | "update";
}>;

const Layout: FC<LayoutProps> = ({ buildSha, activeTab, children }) => {
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
				<nav class="border-b border-zinc-800">
					<div class="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between">
						<div class="flex items-center gap-1.5 text-sm">
							<a href="/" class="font-bold text-zinc-100 hover:text-zinc-200 transition-colors">residue</a>
							<span class="text-zinc-600">/</span>
							<span class="text-zinc-400">setup</span>
						</div>
						<a href="https://github.com/butttons/residue" target="_blank" rel="noopener noreferrer" class="text-zinc-600 hover:text-zinc-300 transition-colors">
							<i class="ph ph-github-logo text-base"></i>
						</a>
					</div>
				</nav>

				<div class="max-w-4xl mx-auto px-4 py-8 w-full flex-1 flex flex-col items-center">
					<div class="w-full max-w-lg">
						<h1 class="text-xl font-semibold mb-1 text-center">Deploy your own instance</h1>
						<p class="text-sm text-zinc-400 mb-6 text-center">One API token. Fully automated. Your data stays on your Cloudflare account.</p>

						<div class="flex mb-6 border border-zinc-800 rounded-md overflow-hidden">
							<a href="/"
								class="flex-1 py-2 text-xs font-medium text-center transition-colors ${activeTab === "install" ? "text-zinc-100 bg-zinc-900" : "text-zinc-500 bg-transparent hover:text-zinc-300"}">
								New Install
							</a>
							<a href="/update"
								class="flex-1 py-2 text-xs font-medium text-center transition-colors ${activeTab === "update" ? "text-zinc-100 bg-zinc-900" : "text-zinc-500 bg-transparent hover:text-zinc-300"}">
								Update Existing
							</a>
						</div>

						${children}
					</div>
				</div>

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
			</body>
		</html>`;
};

export { Layout };
