import { html } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";

type LayoutProps = PropsWithChildren<{
	title: string;
	username?: string;
}>;

const Layout: FC<LayoutProps> = ({ title, username, children }) => {
	return html`<!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <link rel="stylesheet" href="/styles.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          src="https://unpkg.com/@phosphor-icons/web"
        ></script>
      </head>
      <body class="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        ${
					username
						? html`<div class="max-w-4xl mx-auto px-4 pt-4 flex justify-end items-center gap-3">
            <span class="text-xs text-zinc-500">${username}</span>
            <a href="/app/settings" class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">settings</a>
            <form method="POST" action="/app/logout" class="inline">
              <button type="submit" class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">sign out</button>
            </form>
          </div>`
						: html`<div class="max-w-4xl mx-auto px-4 pt-4 flex justify-end items-center gap-3">
            <a href="/app/login" class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">sign in</a>
          </div>`
				}
        <div class="max-w-4xl mx-auto px-4 py-8">${children}</div>
        <script>
          document.addEventListener("DOMContentLoaded", function () {
            document.querySelectorAll("[data-popover-target]").forEach(function (rect) {
              var id = rect.getAttribute("data-popover-target");
              var popover = document.getElementById(id);
              if (!popover) return;
              rect.style.pointerEvents = "auto";
              rect.style.cursor = "default";
              rect.addEventListener("mouseenter", function () {
                popover.showPopover();
                var r = rect.getBoundingClientRect();
                var cx = r.left + r.width / 2;
                var cy = r.top;
                popover.style.left = cx - popover.offsetWidth / 2 + "px";
                popover.style.top = cy - popover.offsetHeight - 6 + "px";
              });
              rect.addEventListener("mouseleave", function () {
                popover.hidePopover();
              });
            });
          });
        </script>
      </body>
    </html>`;
};

export { Layout };
export type { LayoutProps };
