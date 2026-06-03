export const modelAdapterNames = ["mock", "claude", "gemini", "codex"];

export function adapterError(code, message, retryable = false) {
  return {
    ok: false,
    adapter: "mock",
    error: {
      code,
      message,
      retryable
    }
  };
}
