#!/usr/bin/env bun

import { program } from "commander";
import { registerLogin } from "@/commands/login";
import { registerInit } from "@/commands/init";
import { registerSessionStart } from "@/commands/session-start";
import { registerSessionEnd } from "@/commands/session-end";
import { registerCapture } from "@/commands/capture";
import { registerSync } from "@/commands/sync";
import { registerPush } from "@/commands/push";

program
  .name("residue")
  .description("Capture AI agent conversations linked to git commits")
  .version("0.0.1");

registerLogin(program);
registerInit(program);
registerSessionStart(program);
registerSessionEnd(program);
registerCapture(program);
registerSync(program);
registerPush(program);

program.parse();
