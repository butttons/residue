/**
 * Biome Format Extension
 *
 * Automatically runs `biome check --write` on files after the agent
 * writes or edits them. Only formats files that biome knows how to
 * handle -- biome itself ignores unsupported file types gracefully.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, _ctx) => {
    const isWriteOrEdit =
      event.toolName === "write" || event.toolName === "edit";
    if (!isWriteOrEdit) return;
    if (event.isError) return;

    const filePath = (event.input as Record<string, unknown>).path;
    if (typeof filePath !== "string") return;

    await pi.exec("npx", ["biome", "check", "--write", filePath]);
  });
}
