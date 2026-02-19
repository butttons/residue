import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let doraAvailable = false;

	pi.on("session_start", async (_event, ctx) => {
		try {
			const check = await pi.exec("bash", ["-c", "command -v dora"], {
				timeout: 1000,
			});
			doraAvailable = check.code === 0;
			if (doraAvailable) {
				const status = await pi.exec(
					"bash",
					["-c", "dora status 2>/dev/null"],
					{ timeout: 2000 },
				);
				if (status.code !== 0) {
					ctx.ui.notify(
						"dora not initialized. Run: dora init && dora index",
						"info",
					);
				}
			}
		} catch (error) {
			doraAvailable = false;
		}
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		if (doraAvailable) {
			pi.exec(
				"bash",
				[
					"-c",
					"(dora index --ignore='worker-configuration.d.ts' > /tmp/dora-index.log 2>&1 &) || true",
				],
				{
					timeout: 500,
				},
			).catch(() => {});
		}
	});
}
