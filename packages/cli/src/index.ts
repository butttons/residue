#!/usr/bin/env bun

const COMMANDS: Record<string, { description: string; module: string }> = {
  login: { description: "Save worker URL and auth token", module: "./commands/login" },
  init: { description: "Install git hooks in current repo", module: "./commands/init" },
  "session-start": { description: "Start tracking an agent session", module: "./commands/session-start" },
  "session-end": { description: "Mark an agent session as ended", module: "./commands/session-end" },
  capture: { description: "Tag pending sessions with current commit", module: "./commands/capture" },
  sync: { description: "Upload pending sessions to worker", module: "./commands/sync" },
  push: { description: "Manual trigger to upload sessions (alias for sync)", module: "./commands/push" },
};

function printUsage(): void {
  console.log("residue - capture AI agent conversations linked to git commits\n");
  console.log("Usage: residue <command> [options]\n");
  console.log("Commands:");
  const maxLen = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  for (const [name, { description }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(maxLen + 2)}${description}`);
  }
  console.log("\nRun 'residue <command> --help' for more info on a command.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  const entry = COMMANDS[command];
  if (!entry) {
    console.error(`Unknown command: ${command}\n`);
    printUsage();
    process.exit(1);
  }

  const mod = await import(entry.module);
  await mod.run(args.slice(1));
}

main();
