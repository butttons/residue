#!/usr/bin/env bun
/**
 * Install script for the Residue Claude Code adapter.
 *
 * Adds SessionStart and SessionEnd hooks to ~/.claude/settings.json
 * that call the hooks.sh script in this package.
 *
 * Usage:
 *   bun run packages/adapters/claude-code/install.ts
 *   # or from the package directory:
 *   bun run install.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";

type HookEntry = {
  matcher: string;
  hooks: Array<{
    type: string;
    command: string;
    timeout?: number;
  }>;
};

type ClaudeSettings = {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
};

const HOOKS_SCRIPT = resolve(dirname(import.meta.path), "hooks.sh");
const SETTINGS_PATH = join(
  process.env.HOME ?? "~",
  ".claude",
  "settings.json"
);

const HOOK_COMMAND = `bash ${HOOKS_SCRIPT}`;

function readSettings(): ClaudeSettings {
  if (!existsSync(SETTINGS_PATH)) {
    return {};
  }
  const raw = readFileSync(SETTINGS_PATH, "utf-8");
  return JSON.parse(raw) as ClaudeSettings;
}

function writeSettings(settings: ClaudeSettings): void {
  const dir = dirname(SETTINGS_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 4) + "\n");
}

function hasResidueHook(hookEntries: HookEntry[]): boolean {
  return hookEntries.some((entry) =>
    entry.hooks.some((h) => h.command.includes("hooks.sh"))
  );
}

function addHook(
  settings: ClaudeSettings,
  eventName: string
): { isChanged: boolean } {
  if (!settings.hooks) {
    settings.hooks = {};
  }

  if (!settings.hooks[eventName]) {
    settings.hooks[eventName] = [];
  }

  if (hasResidueHook(settings.hooks[eventName])) {
    return { isChanged: false };
  }

  settings.hooks[eventName].push({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: HOOK_COMMAND,
        timeout: 10,
      },
    ],
  });

  return { isChanged: true };
}

function main() {
  if (!existsSync(HOOKS_SCRIPT)) {
    console.error(`hooks.sh not found at: ${HOOKS_SCRIPT}`);
    process.exit(1);
  }

  const settings = readSettings();

  const startResult = addHook(settings, "SessionStart");
  const endResult = addHook(settings, "SessionEnd");

  if (!startResult.isChanged && !endResult.isChanged) {
    console.log("residue hooks already installed in Claude Code settings.");
    return;
  }

  writeSettings(settings);

  const installed = [];
  if (startResult.isChanged) installed.push("SessionStart");
  if (endResult.isChanged) installed.push("SessionEnd");

  console.log(
    `Installed residue hooks: ${installed.join(", ")}`
  );
  console.log(`Settings file: ${SETTINGS_PATH}`);
  console.log(`Hook script: ${HOOKS_SCRIPT}`);
}

main();
