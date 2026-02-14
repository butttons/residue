#!/usr/bin/env bun

import { program } from "commander";
import { registerLogin } from "@/commands/login";
import { registerInit } from "@/commands/init";
import { registerSessionStart } from "@/commands/session-start";

program
  .name("residue")
  .description("Capture AI agent conversations linked to git commits")
  .version("0.0.1");

registerLogin(program);
registerInit(program);
registerSessionStart(program);

program.parse();
