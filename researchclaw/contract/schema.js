function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function pushIf(errors, condition, message) {
  if (condition) {
    errors.push(message);
  }
}

export function validateResearchContract(contract) {
  const errors = [];
  pushIf(errors, !contract || typeof contract !== "object", "contract must be an object");
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  pushIf(errors, contract.schema_version !== "research-contract/v1", "schema_version must be research-contract/v1");
  pushIf(errors, !isNonEmptyString(contract.contract_id), "contract_id is required");
  pushIf(errors, !isNonEmptyString(contract.project_id), "project_id is required");
  pushIf(errors, !["draft", "approved", "superseded"].includes(contract.status), "status is invalid");
  pushIf(errors, !Number.isInteger(contract.version) || contract.version < 1, "version must be a positive integer");
  pushIf(errors, !isNonEmptyString(contract.topic), "topic is required");
  pushIf(errors, !isNonEmptyString(contract.research_question), "research_question is required");
  pushIf(errors, !isNonEmptyString(contract.hypothesis), "hypothesis is required");
  pushIf(errors, !contract.setting || typeof contract.setting !== "object", "setting is required");
  pushIf(errors, !isNonEmptyArray(contract.metrics), "metrics must be non-empty");
  pushIf(errors, !isNonEmptyArray(contract.success_criteria), "success_criteria must be non-empty");
  pushIf(errors, !isNonEmptyArray(contract.failure_signals), "failure_signals must be non-empty");
  pushIf(errors, !isNonEmptyArray(contract.claim_evidence_map), "claim_evidence_map must be non-empty");

  const split = contract.data_split;
  const hasSplit =
    split &&
    typeof split === "object" &&
    (isNonEmptyString(split.train) ||
      isNonEmptyString(split.validation) ||
      isNonEmptyString(split.test) ||
      split.note === "not_applicable");
  pushIf(errors, !hasSplit, "data_split must be non-empty or note must be not_applicable");

  if (Array.isArray(contract.metrics)) {
    contract.metrics.forEach((metric, index) => {
      pushIf(errors, !isNonEmptyString(metric?.name), `metrics[${index}].name is required`);
      pushIf(
        errors,
        !["higher_is_better", "lower_is_better", "qualitative"].includes(metric?.direction),
        `metrics[${index}].direction is invalid`
      );
      pushIf(errors, !isNonEmptyString(metric?.reason), `metrics[${index}].reason is required`);
    });
  }

  return { ok: errors.length === 0, errors };
}
