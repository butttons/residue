import type { Mapper } from "../types";
import { claudeCodeMapper } from "./claude-code";
import { opencodeMapper } from "./opencode";
import { piMapper } from "./pi";

const mapperRegistry: Record<string, Mapper> = {
	"claude-code": claudeCodeMapper,
	opencode: opencodeMapper,
	pi: piMapper,
};

const getMapper = (agent: string): Mapper | null => {
	return mapperRegistry[agent] ?? null;
};

export { mapperRegistry, getMapper };
