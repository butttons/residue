/**
 * Mapper registry.
 *
 * Copied from packages/adapter/src/mappers.ts
 * The worker needs its own copy so it can deploy standalone without
 * the @residue/adapter workspace dependency.
 */

import { claudeCodeMapper } from "./claude-code";
import { opencodeMapper } from "./opencode";
import { piMapper } from "./pi";
import type { Mapper } from "./types";

const mapperRegistry: Record<string, Mapper> = {
	"claude-code": claudeCodeMapper,
	opencode: opencodeMapper,
	pi: piMapper,
};

const getMapper = (agent: string): Mapper | null => {
	return mapperRegistry[agent] ?? null;
};

export { mapperRegistry, getMapper };
export { claudeCodeMapper } from "./claude-code";
export { opencodeMapper } from "./opencode";
export { piMapper } from "./pi";
export type { Mapper, Message, ThinkingBlock, ToolCall } from "./types";
