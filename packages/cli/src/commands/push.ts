import type { Command } from "commander";
import { runSync } from "@/commands/sync";

export function registerPush(program: Command): void {
  program
    .command("push")
    .description("Upload pending sessions to worker (manual trigger)")
    .action(runSync);
}
