import { describe, expect, test } from "vitest";
import {
  DEFAULT_USER,
  DEFAULT_USER_STATE,
  AVATAR_MAX_SIZE,
  isValidUserProfile,
  migrateUserState,
  generateUserId
} from "./user";

describe("isValidUserProfile", () => {
  test("returns true for valid user", () => {
    expect(isValidUserProfile(DEFAULT_USER)).toBe(true);
  });

  test("returns false for null / non-object", () => {
    expect(isValidUserProfile(null)).toBe(false);
    expect(isValidUserProfile("x")).toBe(false);
    expect(isValidUserProfile(42)).toBe(false);
  });

  test("returns false for missing required string fields", () => {
    expect(isValidUserProfile({ ...DEFAULT_USER, id: "" })).toBe(false);
    expect(isValidUserProfile({ ...DEFAULT_USER, nickname: undefined })).toBe(false);
    expect(isValidUserProfile({ ...DEFAULT_USER, email: undefined })).toBe(false);
  });

  test("returns true with avatar as null or string", () => {
    expect(isValidUserProfile({ ...DEFAULT_USER, avatar: null })).toBe(true);
    expect(isValidUserProfile({ ...DEFAULT_USER, avatar: "data:image/png;base64,abc" })).toBe(true);
  });
});

describe("migrateUserState", () => {
  test("returns defaults for non-object raw", () => {
    expect(migrateUserState(null)).toEqual(DEFAULT_USER_STATE);
    expect(migrateUserState("x")).toEqual(DEFAULT_USER_STATE);
  });

  test("keeps valid state", () => {
    const state = {
      currentUserId: "user-2",
      users: [
        { ...DEFAULT_USER, id: "user-2", nickname: "Alice" }
      ]
    };
    const out = migrateUserState(state);
    expect(out.currentUserId).toBe("user-2");
    expect(out.users).toHaveLength(1);
    expect(out.users[0].nickname).toBe("Alice");
  });

  test("filters out invalid users and falls back to default", () => {
    const state = {
      currentUserId: "user-2",
      users: [
        { id: "user-2", nickname: "Alice", account: "a", email: "a@b.com", school: "", company: "" },
        { id: null, nickname: "Bad" } // invalid
      ]
    };
    const out = migrateUserState(state);
    expect(out.users).toHaveLength(1);
    expect(out.users[0].nickname).toBe("Alice");
  });

  test("resets currentUserId if not found in users", () => {
    const state = {
      currentUserId: "ghost",
      users: [{ ...DEFAULT_USER, id: "user-2" }]
    };
    const out = migrateUserState(state);
    expect(out.currentUserId).toBe("user-2");
  });
});

describe("generateUserId", () => {
  test("generates unique ids", () => {
    const id1 = generateUserId();
    const id2 = generateUserId();
    expect(id1).not.toBe(id2);
    expect(id1.startsWith("user-")).toBe(true);
  });
});

describe("AVATAR_MAX_SIZE", () => {
  test("is 2MB", () => {
    expect(AVATAR_MAX_SIZE).toBe(2 * 1024 * 1024);
  });
});
