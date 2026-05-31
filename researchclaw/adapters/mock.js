import { readJsonUrl, deepClone, makeId, nowIso } from "../util.js";

const fixtures = {
  contract: new URL("../../fixtures/contracts/valid.json", import.meta.url),
  literature: new URL("../../fixtures/workflows/literature-output.json", import.meta.url),
  baseline: new URL("../../fixtures/workflows/baseline-output.json", import.meta.url),
  checklist: new URL("../../fixtures/workflows/reproduction-checklist-output.json", import.meta.url),
  idea: new URL("../../fixtures/workflows/idea-output.json", import.meta.url),
  review: new URL("../../fixtures/workflows/idea-review-output.json", import.meta.url)
};

export class MockModelAdapter {
  name = "mock";

  async run(request) {
    try {
      return {
        ok: true,
        adapter: this.name,
        output: this.outputFor(request),
        raw_ref: undefined
      };
    } catch (error) {
      return {
        ok: false,
        adapter: this.name,
        error: {
          code: "mock_adapter_error",
          message: error.message,
          retryable: false
        }
      };
    }
  }

  outputFor(request) {
    switch (request.phase) {
      case "contract_draft": {
        const contract = deepClone(readJsonUrl(fixtures.contract));
        contract.project_id = request.project_id;
        contract.contract_id = makeId("contract");
        contract.topic = request.inputs?.find((input) => input.type === "research_direction")?.content || contract.topic;
        contract.created_at = nowIso();
        contract.updated_at = contract.created_at;
        return contract;
      }
      case "literature_scouting":
        return deepClone(readJsonUrl(fixtures.literature));
      case "baseline_selection":
        return deepClone(readJsonUrl(fixtures.baseline));
      case "baseline_reproduction_checklist":
        return deepClone(readJsonUrl(fixtures.checklist));
      case "idea_generation":
        return deepClone(readJsonUrl(fixtures.idea));
      case "idea_review":
        return deepClone(readJsonUrl(fixtures.review));
      case "summary":
        return this.summaryFor(request);
      default:
        throw new Error(`No mock fixture for phase ${request.phase}`);
    }
  }

  summaryFor(request) {
    const state = request.inputs?.find((input) => input.type === "state")?.content;
    const review = request.inputs?.find((input) => input.type === "idea_review_report")?.content;
    return {
      project_id: request.project_id,
      contract_ref: state?.current?.contract_artifact_ref,
      selected_baseline_ref: state?.current?.baseline_artifact_ref,
      recommended_idea_ref: review?.recommended_idea_id,
      phase_history: state?.phase_history || [],
      evidence_index: [
        {
          claim: "Contract, baseline, idea, and review conclusions are backed by stored artifacts.",
          evidence_refs: Object.values(state?.current || {}).filter(
            (value) => typeof value === "string" && value.startsWith("artifacts/")
          )
        }
      ],
      next_human_actions: [
        "Confirm baseline dataset license and hardware budget.",
        "Run the baseline reproduction checklist before implementation.",
        "Approve or revise the recommended idea before experiments."
      ]
    };
  }
}
