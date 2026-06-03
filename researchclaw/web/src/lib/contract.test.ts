import { describe, expect, test } from "vitest";
import { criterionMeta } from "./contract";

describe("criterionMeta", () => {
  test("joins metric and threshold with a middot", () => {
    expect(
      criterionMeta({ id: "S1", description: "x", metric: "recall@10", threshold: ">= baseline + 1.0" })
    ).toBe("recall@10 · >= baseline + 1.0");
  });

  test("returns only metric when threshold missing", () => {
    expect(criterionMeta({ id: "S1", description: "x", metric: "recall@10" })).toBe("recall@10");
  });

  test("returns only threshold when metric missing", () => {
    expect(criterionMeta({ id: "F1", description: "x", threshold: "> baseline + 20%" })).toBe(
      "> baseline + 20%"
    );
  });

  test("returns empty string when neither present", () => {
    expect(criterionMeta({ id: "S1", description: "x" })).toBe("");
  });
});
