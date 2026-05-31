import { deepClone, nowIso } from "../util.js";
import { validateResearchContract } from "./schema.js";

export function approveContract(contract) {
  const validation = validateResearchContract(contract);
  if (!validation.ok) {
    return validation;
  }
  const approved = deepClone(contract);
  approved.status = "approved";
  approved.updated_at = nowIso();
  return { ok: true, contract: approved };
}

export function reviseContract(contract, feedback) {
  const revised = deepClone(contract);
  revised.version = Number(revised.version || 1) + 1;
  revised.contract_id = `${contract.contract_id}_v${revised.version}`;
  revised.status = "draft";
  revised.human_notes = [contract.human_notes, `Revision request: ${feedback}`]
    .filter(Boolean)
    .join("\n");
  revised.updated_at = nowIso();
  return revised;
}

export function summarizeContract(contract) {
  return {
    contract_id: contract.contract_id,
    version: contract.version,
    status: contract.status,
    topic: contract.topic,
    primary_metrics: Array.isArray(contract.metrics) ? contract.metrics.map((metric) => metric.name) : []
  };
}
