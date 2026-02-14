type ToolCall = {
  name: string;
  input: string;
  output: string;
};

type Message = {
  role: string;
  content: string;
  timestamp?: string;
  model?: string;
  tool_calls?: ToolCall[];
};

type Mapper = (raw: string) => Message[];

export type { ToolCall, Message, Mapper };
