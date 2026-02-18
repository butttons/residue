import { html } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import { version } from "../../package.json";
import { urls } from "../lib/urls";

type BreadcrumbItem = { label: string; href?: string };

type LayoutProps = PropsWithChildren<{
	title: string;
	username?: string;
	breadcrumbs?: BreadcrumbItem[];
}>;

const Layout: FC<LayoutProps> = ({
	title,
	username,
	breadcrumbs,
	children,
}) => {
	return html`<!doctype html>
		<html lang="en" class="dark">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>${title}</title>
				<link rel="stylesheet" href="/styles.css" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
				<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
				<script src="https://unpkg.com/@phosphor-icons/web"></script>
			</head>
			<body class="bg-zinc-950 text-zinc-100 min-h-screen antialiased flex flex-col">
				<nav class="border-b border-zinc-800">
					<div class="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between">
						<div class="flex items-center gap-1.5 text-sm text-zinc-400">
							${
								breadcrumbs && breadcrumbs.length > 0
									? html`${breadcrumbs.map(
											(item, i) => html`
											${i > 0 ? html`<span class="text-zinc-600">/</span>` : ""}
											${
												i === 0 && item.href
													? html`<a href="${item.href}" class="hover:text-zinc-200 transition-colors flex items-center" title="Home"><i class="ph ph-house text-base"></i></a>`
													: item.href
														? html`<a href="${item.href}" class="hover:text-zinc-200 transition-colors">${item.label}</a>`
														: html`<span class="text-zinc-200">${item.label}</span>`
											}
										`,
										)}`
									: html`<a href="/app" class="hover:text-zinc-200 transition-colors flex items-center" title="Home"><i class="ph ph-house text-base"></i></a>`
							}
						</div>
						<div class="flex items-center gap-3">
							${
								username
									? html`<span class="text-xs text-zinc-500">${username}</span>
									<a href="/app/settings" class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">settings</a>
									<form method="POST" action="/app/logout" class="inline-flex">
										<button type="submit" class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">sign out</button>
									</form>`
									: html`<a href="/app/login" class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">sign in</a>`
							}
						</div>
					</div>
				</nav>
				<div class="max-w-4xl mx-auto px-4 py-8 w-full flex-1">${children}</div>
				<footer class="border-t border-zinc-800/50">
					<div class="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
						<span class="text-[11px] text-zinc-600">built by <a href="${urls.author}" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-300 transition-colors">Yash</a></span>
						<div class="flex items-center gap-2">
							<span class="text-[11px] text-zinc-600">v${version}</span>
							<a href="${urls.githubRepo}" target="_blank" rel="noopener noreferrer" class="text-zinc-600 hover:text-zinc-300 transition-colors"><i class="ph ph-github-logo text-base"></i></a>
						</div>
					</div>
				</footer>
				<script>
					document.addEventListener('DOMContentLoaded', function () {
						document.querySelectorAll('[data-popover-target]').forEach(function (rect) {
							var id = rect.getAttribute('data-popover-target');
							var popover = document.getElementById(id);
							if (!popover) return;
							rect.style.pointerEvents = 'auto';
							rect.style.cursor = 'default';
							rect.addEventListener('mouseenter', function () {
								popover.showPopover();
								var r = rect.getBoundingClientRect();
								var cx = r.left + r.width / 2;
								var cy = r.top;
								popover.style.left = cx - popover.offsetWidth / 2 + 'px';
								popover.style.top = cy - popover.offsetHeight - 6 + 'px';
							});
							rect.addEventListener('mouseleave', function () {
								popover.hidePopover();
							});
						});
					});
				</script>
			</body>
		</html>`;
};

export { Layout };
export type { LayoutProps, BreadcrumbItem };
