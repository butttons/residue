import type { Mapper } from "../types";
import { claudeCodeMapper } from "./claude-code";

const mapperRegistry: Record<string, Mapper> = {
  "claude-code": claudeCodeMapper,
};

const getMapper = (agent: string): Mapper | null => {
  return mapperRegistry[agent] ?? null;
};

export { mapperRegistry, getMapper };
