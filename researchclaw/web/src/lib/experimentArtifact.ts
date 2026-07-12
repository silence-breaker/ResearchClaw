import type { ArtifactType } from "../api/types";

export interface ExperimentField {
  label: string;
  value: string;
}

export interface ClaimSupportEntry {
  claim_id?: string;
  metric_ref?: string;
  support_type?: string;
}

export interface ShapedExperimentArtifact {
  fields: ExperimentField[];
  commands?: string[];
  claimSupport?: ClaimSupportEntry[];
  runRef?: string;
}

function toValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function record(content: unknown): Record<string, unknown> {
  return content && typeof content === "object" ? (content as Record<string, unknown>) : {};
}

export function shapeExperimentArtifact(
  type: ArtifactType,
  content: unknown
): ShapedExperimentArtifact {
  const c = record(content);

  if (type === "experiment_plan") {
    const commands = Array.isArray(c.commands) ? (c.commands as string[]) : undefined;
    return {
      commands,
      fields: [
        { label: "hypothesis", value: toValue(c.hypothesis) },
        { label: "metrics", value: toValue(c.metrics) },
        { label: "success_criteria", value: toValue(c.success_criteria) },
        { label: "failure_criteria", value: toValue(c.failure_criteria) }
      ]
    };
  }

  if (type === "experiment_run") {
    const executed = Array.isArray(c.commands_executed)
      ? (c.commands_executed as Array<Record<string, unknown>>)
      : [];
    const commands = executed.map((e) => toValue(e.command));
    return {
      commands,
      fields: [
        { label: "status", value: toValue(c.status) },
        ...executed.map((e, i) => ({
          label: `command[${i}] exit_code`,
          value: `${toValue(e.command)} → ${toValue(e.exit_code)}`
        })),
        { label: "metrics_observed", value: toValue(c.metrics_observed) },
        { label: "failure_reason", value: toValue(c.failure_reason) },
        { label: "produced_files", value: toValue(c.produced_files) }
      ]
    };
  }

  if (type === "experiment_review") {
    const claimSupport = Array.isArray(c.claim_support)
      ? (c.claim_support as ClaimSupportEntry[])
      : undefined;
    return {
      runRef: typeof c.run_ref === "string" ? c.run_ref : undefined,
      claimSupport,
      fields: [
        { label: "decision", value: toValue(c.decision) },
        { label: "next_actions", value: toValue(c.next_actions) }
      ]
    };
  }

  return { fields: [] };
}
