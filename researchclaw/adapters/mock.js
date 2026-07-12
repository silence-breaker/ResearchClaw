import { readJsonUrl, deepClone, makeId, nowIso } from "../util.js";

const fixtures = {
  contract: new URL("../../fixtures/contracts/valid.json", import.meta.url),
  literature: new URL("../../fixtures/workflows/literature-output.json", import.meta.url),
  baseline: new URL("../../fixtures/workflows/baseline-output.json", import.meta.url),
  checklist: new URL("../../fixtures/workflows/reproduction-checklist-output.json", import.meta.url),
  idea: new URL("../../fixtures/workflows/idea-output.json", import.meta.url),
  review: new URL("../../fixtures/workflows/idea-review-output.json", import.meta.url),
  experimentPlan: new URL("../../fixtures/workflows/experiment-plan-output.json", import.meta.url),
  experimentReview: new URL("../../fixtures/workflows/experiment-review-output.json", import.meta.url)
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
        const feedback = request.inputs?.find((input) => input.type === "revision_feedback")?.content;
        const previous = request.inputs?.find((input) => input.type === "research_contract")?.content;
        if (feedback && previous) {
          const revised = deepClone(previous);
          revised.version = Number(revised.version || 1) + 1;
          revised.contract_id = `${previous.contract_id}_v${revised.version}`;
          revised.status = "draft";
          revised.human_notes = [previous.human_notes, `Revision request: ${feedback}`]
            .filter(Boolean)
            .join("\n");
          revised.updated_at = nowIso();
          return revised;
        }
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
      case "experiment_planning":
        return deepClone(readJsonUrl(fixtures.experimentPlan));
      case "experiment_review":
        return deepClone(readJsonUrl(fixtures.experimentReview));
      case "summary":
        return this.summaryFor(request);
      default:
        throw new Error(`No mock fixture for phase ${request.phase}`);
    }
  }

  summaryFor(request) {
    const state = request.inputs?.find((input) => input.type === "state")?.content;
    const review = request.inputs?.find((input) => input.type === "idea_review_report")?.content;
    const evidenceIndex = request.inputs?.find((input) => input.type === "evidence_index")?.content || [];
    return {
      project_id: request.project_id,
      contract_ref: state?.current?.contract_artifact_ref,
      selected_baseline_ref: state?.current?.baseline_artifact_ref,
      recommended_idea_ref: review?.recommended_idea_id,
      phase_history: state?.phase_history || [],
      evidence_index: evidenceIndex,
      next_human_actions: [
        "Confirm baseline dataset license and hardware budget.",
        "Run the baseline reproduction checklist before implementation.",
        "Approve or revise the recommended idea before experiments."
      ]
    };
  }
}
