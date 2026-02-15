import { html } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";

type LayoutProps = PropsWithChildren<{
	title: string;
}>;

const Layout: FC<LayoutProps> = ({ title, children }) => {
	return html`<!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            darkMode: "class",
            theme: {
              extend: {
                fontFamily: {
                  mono: [
                    "JetBrains Mono",
                    "IBM Plex Mono",
                    "ui-monospace",
                    "SFMono-Regular",
                    "monospace",
                  ],
                },
              },
            },
          };
        </script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          src="https://unpkg.com/@phosphor-icons/web"
        ></script>
        <style>
          body {
            font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace,
              SFMono-Regular, monospace;
          }
          details summary::-webkit-details-marker {
            display: none;
          }
          details summary {
            list-style: none;
          }
          details[open] summary .ph-caret-right {
            transform: rotate(90deg);
          }
          .activity-tooltip {
            margin: 0;
            padding: 6px 10px;
            border: 1px solid #3f3f46;
            border-radius: 6px;
            background: #18181b;
            color: #e4e4e7;
            font-size: 11px;
            line-height: 1.4;
            white-space: nowrap;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            pointer-events: none;
            inset: unset;
          }
          .activity-tooltip-date {
            display: block;
            font-weight: 600;
            color: #a1a1aa;
          }
          .activity-tooltip-counts {
            display: block;
            color: #e4e4e7;
          }
        </style>
      </head>
      <body class="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
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
