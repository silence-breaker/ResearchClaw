import type { CliId, CliProvider, ProviderStatus } from "../api/types";

export const CLI_BY_PROVIDER: Record<Exclude<CliProvider, "mock" | "runner">, CliId> = {
  claude: "claude-code",
  gemini: "gemini-cli",
  codex: "codex-cli"
};

// "mock" and "runner" are not user-selectable CLI providers — runner is RC's
// internal command executor (experiment_execution), not an LLM CLI. Narrow them
// out before indexing CLI_BY_PROVIDER.
function isCliProvider(provider: CliProvider): provider is Exclude<CliProvider, "mock" | "runner"> {
  return provider !== "mock" && provider !== "runner";
}

export function isValidCliForProvider(provider: CliProvider, cli: CliId): boolean {
  if (provider === "mock") return cli === "mock";
  if (!isCliProvider(provider)) return false;
  if (cli === "mock") return false;
  return CLI_BY_PROVIDER[provider] === cli;
}

export function defaultCliForProvider(provider: CliProvider): CliId {
  if (!isCliProvider(provider)) return "mock";
  return CLI_BY_PROVIDER[provider];
}

export function getDefaultModelForProvider(provider: CliProvider, providers: ProviderStatus[]): string {
  if (provider === "mock") return "";
  const p = providers.find((x) => x.id === provider);
  return p?.models[0] ?? "";
}

export function isModelValidForProvider(provider: CliProvider, model: string, providers: ProviderStatus[]): boolean {
  if (provider === "mock") return model === "" || model === undefined;
  const p = providers.find((x) => x.id === provider);
  if (!p || !p.configured) return false;
  return p.models.includes(model);
}
