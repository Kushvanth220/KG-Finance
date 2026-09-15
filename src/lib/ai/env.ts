function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

/** Gemini / Google AI Studio */
export function readGeminiApiKey(): string {
  return firstEnv("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY");
}

/** ChatGPT / OpenAI */
export function readOpenAiApiKey(): string {
  return firstEnv("OPENAI_API_KEY", "CHATGPT_API_KEY");
}

/** Claude / Anthropic */
export function readAnthropicApiKey(): string {
  return firstEnv("ANTHROPIC_API_KEY", "CLAUDE_API_KEY");
}

/** Only required for identity-linked Anthropic keys (not plain workspace API keys). */
export function readAnthropicWorkspaceId(): string {
  return firstEnv("ANTHROPIC_WORKSPACE_ID");
}
