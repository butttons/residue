import type { Mapper, Message, ToolCall } from "../types";

/**
 * Claude Code stores sessions as JSONL (one JSON object per line).
 *
 * Entry types we care about: user, assistant
 * Entry types we skip: system, summary, progress, file-history-snapshot, queue-operation
 *
 * Structure:
 * - Each entry has { type, uuid, parentUuid, message, isMeta?, isSidechain? }
 * - A single assistant turn (same message.id) can span multiple entries
 *   (e.g., thinking -> text -> tool_use), chained via parentUuid.
 * - User entries contain either:
 *   - string content (actual human messages)
 *   - array with text blocks (auto-injected, often isMeta=true)
 *   - array with tool_result blocks (tool outputs)
 * - Assistant entries always have array content with blocks:
 *   thinking, text, tool_use
 */

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | ContentBlock[];
      is_error?: boolean;
    };

type ClaudeCodeEntry = {
  type: string;
  uuid?: string;
  parentUuid?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  timestamp?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    content?: string | ContentBlock[];
    stop_reason?: string | null;
  };
  subtype?: string;
  summary?: string;
};

const parseLines = (raw: string): ClaudeCodeEntry[] => {
  const entries: ClaudeCodeEntry[] = [];
  const lines = raw.trim().split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as ClaudeCodeEntry);
    } catch {
      // skip malformed lines
    }
  }

  return entries;
};

const getActiveBranch = (entries: ClaudeCodeEntry[]): ClaudeCodeEntry[] => {
  const conversationEntries = entries.filter(
    (e) =>
      (e.type === "user" || e.type === "assistant") &&
      e.uuid !== undefined &&
      !e.isSidechain
  );

  if (conversationEntries.length === 0) return [];

  const childrenOf = new Map<string, string[]>();
  const entryById = new Map<string, ClaudeCodeEntry>();

  for (const entry of conversationEntries) {
    entryById.set(entry.uuid!, entry);
    const parentKey = entry.parentUuid ?? "__root__";
    const children = childrenOf.get(parentKey) ?? [];
    children.push(entry.uuid!);
    childrenOf.set(parentKey, children);
  }

  // Leaf = last entry with no children
  let leafId: string | null = null;
  for (let i = conversationEntries.length - 1; i >= 0; i--) {
    const id = conversationEntries[i].uuid!;
    if (!childrenOf.has(id) || childrenOf.get(id)!.length === 0) {
      leafId = id;
      break;
    }
  }

  if (!leafId) return conversationEntries;

  // Walk from leaf to root
  const branch: ClaudeCodeEntry[] = [];
  let currentId: string | null = leafId;
  while (currentId) {
    const entry = entryById.get(currentId);
    if (!entry) break;
    branch.push(entry);
    currentId = entry.parentUuid ?? null;
  }

  branch.reverse();
  return branch;
};

const extractTextFromContent = (
  content: string | ContentBlock[] | undefined
): string => {
  if (!content) return "";
  if (typeof content === "string") return content;

  return content
    .filter(
      (b): b is ContentBlock & { type: "text" } =>
        b.type === "text" && "text" in b
    )
    .map((b) => b.text)
    .join("\n");
};

const extractToolResultContent = (
  content: string | ContentBlock[] | undefined
): string => {
  if (!content) return "";
  if (typeof content === "string") return content;

  // tool_result content can be a string or array of content blocks
  return content
    .map((b) => {
      if (b.type === "text" && "text" in b) return b.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

const claudeCodeMapper: Mapper = (raw: string): Message[] => {
  if (!raw.trim()) return [];

  const entries = parseLines(raw);
  if (entries.length === 0) return [];

  const branch = getActiveBranch(entries);
  if (branch.length === 0) return [];

  const messages: Message[] = [];

  // Group assistant entries by message.id to reconstruct full turns.
  // A single assistant turn can be split across multiple entries:
  //   entry 1: thinking block
  //   entry 2: text block
  //   entry 3: tool_use block
  // All share the same message.id.
  //
  // We process entries sequentially and merge consecutive assistant entries
  // with the same message.id into a single Message.

  // Track pending tool calls so we can fill in outputs from tool_result entries
  const pendingToolCalls = new Map<string, ToolCall>();

  // Track the current assistant turn being built.
  // Use a unique sentinel so that the first assistant entry (even with null/undefined id)
  // is always treated as a new turn.
  const UNSET = Symbol("unset");
  let currentAssistantMsgId: string | null | typeof UNSET = UNSET;
  let currentAssistantMessage: Message | null = null;
  let currentAssistantModel: string | undefined = undefined;

  const flushAssistant = () => {
    if (currentAssistantMessage) {
      if (currentAssistantModel) {
        currentAssistantMessage.model = currentAssistantModel;
      }
      messages.push(currentAssistantMessage);
      currentAssistantMessage = null;
      currentAssistantMsgId = UNSET;
      currentAssistantModel = undefined;
    }
  };

  for (const entry of branch) {
    if (entry.type === "user") {
      // Flush any pending assistant message
      flushAssistant();

      const msg = entry.message;
      if (!msg) continue;

      // Skip meta entries (auto-injected system/skill content)
      if (entry.isMeta) continue;

      const content = msg.content;

      if (typeof content === "string") {
        // Actual human message
        messages.push({
          role: "human",
          content,
          timestamp: entry.timestamp,
        });
      } else if (Array.isArray(content)) {
        // Check if it contains tool_result blocks
        const toolResults = content.filter(
          (b): b is ContentBlock & { type: "tool_result" } =>
            b.type === "tool_result"
        );

        if (toolResults.length > 0) {
          // Match tool results back to pending tool calls
          for (const tr of toolResults) {
            const toolCallId = tr.tool_use_id;
            const output = extractToolResultContent(tr.content);
            const isError = tr.is_error ?? false;

            if (pendingToolCalls.has(toolCallId)) {
              const tc = pendingToolCalls.get(toolCallId)!;
              tc.output = isError ? `[ERROR] ${output}` : output;
              pendingToolCalls.delete(toolCallId);
            }
          }
        } else {
          // Text content blocks from user (non-meta)
          const text = extractTextFromContent(content);
          if (text) {
            messages.push({
              role: "human",
              content: text,
              timestamp: entry.timestamp,
            });
          }
        }
      }
    } else if (entry.type === "assistant") {
      const msg = entry.message;
      if (!msg) continue;

      const msgId = msg.id ?? null;

      // If this is a new assistant turn, flush the previous one
      if (msgId !== currentAssistantMsgId) {
        flushAssistant();
        currentAssistantMsgId = msgId;
        currentAssistantMessage = {
          role: "assistant",
          content: "",
          timestamp: entry.timestamp,
        };
        currentAssistantModel = msg.model;
      }

      if (!currentAssistantMessage) continue;

      // Update model if available
      if (msg.model) {
        currentAssistantModel = msg.model;
      }

      const content = msg.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type === "text" && "text" in block) {
          // Append text content
          if (currentAssistantMessage.content) {
            currentAssistantMessage.content += "\n" + block.text;
          } else {
            currentAssistantMessage.content = block.text;
          }
        } else if (block.type === "tool_use" && "name" in block) {
          // Extract tool call
          const toolCall: ToolCall = {
            name: block.name,
            input: JSON.stringify(block.input ?? {}, null, 2),
            output: "",
          };

          if (!currentAssistantMessage.tool_calls) {
            currentAssistantMessage.tool_calls = [];
          }
          currentAssistantMessage.tool_calls.push(toolCall);

          // Register for later output matching
          if ("id" in block && block.id) {
            pendingToolCalls.set(block.id, toolCall);
          }
        }
        // Skip thinking blocks - they're internal reasoning, not conversation content
      }

      // Trim leading newline from content aggregation
      if (currentAssistantMessage.content.startsWith("\n")) {
        currentAssistantMessage.content =
          currentAssistantMessage.content.slice(1);
      }
    }
    // Skip system, summary, progress, file-history-snapshot, queue-operation entries
  }

  // Flush any remaining assistant message
  flushAssistant();

  return messages;
};

export { claudeCodeMapper };
