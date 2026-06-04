import { describe, expect, test } from "vitest";
import { makeProjectId, splitProjects } from "./project";
import type { ProjectSummary } from "../api/types";

describe("makeProjectId", () => {
  test("slugifies an ascii name and appends the suffix", () => {
    expect(makeProjectId("Lightweight Reranking", "ab12cd")).toBe("proj_lightweight_reranking_ab12cd");
  });

  test("collapses punctuation and whitespace runs into single underscores", () => {
    expect(makeProjectId("A,  B!! C", "x9")).toBe("proj_a_b_c_x9");
  });

  test("falls back to just the suffix when the name has no ascii word chars", () => {
    expect(makeProjectId("轻量级重排序", "x9")).toBe("proj_x9");
  });

  test("trims leading/trailing separators and is filesystem-safe", () => {
    const id = makeProjectId("  --Hello--  ", "z0");
    expect(id).toBe("proj_hello_z0");
    expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  test("caps the slug length so ids stay reasonable", () => {
    const long = "word ".repeat(40);
    const id = makeProjectId(long, "ab");
    // proj_ (5) + slug (<=40) + _ + suffix
    expect(id.length).toBeLessThanOrEqual(5 + 40 + 1 + 2);
    expect(id.startsWith("proj_")).toBe(true);
    expect(id.endsWith("_ab")).toBe(true);
  });
});

describe("splitProjects", () => {
  const make = (id: string, archived?: boolean): ProjectSummary => ({
    project_id: id,
    phase: "idle",
    updated_at: "2026-06-04T00:00:00.000Z",
    pending_human_actions: [],
    archived
  });

  test("separates archived from active, preserving order", () => {
    const { active, archived } = splitProjects([
      make("a"),
      make("b", true),
      make("c", false),
      make("d", true)
    ]);
    expect(active.map((p) => p.project_id)).toEqual(["a", "c"]);
    expect(archived.map((p) => p.project_id)).toEqual(["b", "d"]);
  });

  test("treats missing archived flag as active", () => {
    const { active, archived } = splitProjects([make("a")]);
    expect(active).toHaveLength(1);
    expect(archived).toHaveLength(0);
  });
});
