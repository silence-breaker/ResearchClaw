import { describe, expect, test } from "vitest";
import { makeProjectId } from "./project";

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
