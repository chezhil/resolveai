// A Brain proposes the next tool calls for a case. The runtime executes them through the
// policy engine and feeds results back. Two implementations share this contract:
// LlmBrain (Groq, falling back to Gemini) and PlannerBrain (deterministic, offline).

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  parseError?: string;
}

export interface BrainTurn {
  thought?: string;
  calls: ToolCall[];
  /** Which model produced the turn, e.g. "groq:openai/gpt-oss-120b". */
  by: string;
}

export interface ToolResult {
  call: ToolCall;
  output: unknown;
  isError: boolean;
}

export interface Brain {
  readonly kind: "llm" | "planner";
  next(): Promise<BrainTurn>;
  observe(results: ToolResult[]): void;
  /** Something happened while the case was paused (watcher fired, approval decided). */
  event(text: string, data?: Record<string, unknown>): void;
}

export class ModelOutage extends Error {
  constructor(public attempts: string[]) {
    super(`All model providers failed: ${attempts.join(" | ")}`);
  }
}
