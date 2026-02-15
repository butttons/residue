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
        </style>
      </head>
      <body class="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        <div class="max-w-4xl mx-auto px-4 py-8">${children}</div>
      </body>
    </html>`;
};

export { Layout };
export type { LayoutProps };
