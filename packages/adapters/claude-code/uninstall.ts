#!/usr/bin/env bun
/**
 * Uninstall script for the Residue Claude Code adapter.
 *
 * Removes SessionStart and SessionEnd hooks from ~/.claude/settings.json.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

type HookHandler = {
  type: string;
  command: string;
  timeout?: number;
};

type HookEntry = {
  matcher: string;
  hooks: HookHandler[];
};

type ClaudeSettings = {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
};

const SETTINGS_PATH = join(
  process.env.HOME ?? "~",
  ".claude",
  "settings.json"
);

function main() {
  if (!existsSync(SETTINGS_PATH)) {
    console.log("No Claude Code settings found.");
    return;
  }

  const raw = readFileSync(SETTINGS_PATH, "utf-8");
  const settings = JSON.parse(raw) as ClaudeSettings;

  if (!settings.hooks) {
    console.log("No hooks configured in Claude Code settings.");
    return;
  }

  let isChanged = false;

  for (const eventName of ["SessionStart", "SessionEnd"]) {
    const entries = settings.hooks[eventName];
    if (!entries) continue;

    const filtered = entries.filter(
      (entry) => !entry.hooks.some((h) => h.command.includes("hooks.sh"))
    );

    if (filtered.length !== entries.length) {
      settings.hooks[eventName] = filtered;
      isChanged = true;

      // Clean up empty arrays
      if (filtered.length === 0) {
        delete settings.hooks[eventName];
      }
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  if (!isChanged) {
    console.log("No residue hooks found in Claude Code settings.");
    return;
  }

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 4) + "\n");
  console.log("Removed residue hooks from Claude Code settings.");
}

main();
