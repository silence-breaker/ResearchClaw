import { describe, expect, test } from "vitest";
import {
  maskKey,
  isValidPassword,
  validatePasswordChange
} from "./security";

describe("maskKey", () => {
  test("masks middle of long key", () => {
    expect(maskKey("sk-rc-abcdef1234567890")).toBe("sk-rc-ab...7890");
  });
  test("masks short key entirely", () => {
    expect(maskKey("short")).toBe("****");
  });
});

describe("isValidPassword", () => {
  test("accepts valid password", () => {
    expect(isValidPassword("Hello123")).toBe(true);
    expect(isValidPassword("Passw0rd!")).toBe(true);
  });
  test("rejects weak password", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("nouppercase123")).toBe(false);
    expect(isValidPassword("NoDigits")).toBe(false);
    expect(isValidPassword("12345678")).toBe(false);
  });
});

describe("validatePasswordChange", () => {
  test("returns null for valid change", () => {
    expect(validatePasswordChange("oldpass1", "NewPass123", "NewPass123")).toBe(null);
  });
  test("rejects empty current", () => {
    expect(validatePasswordChange("", "NewPass123", "NewPass123")).toBe("请输入当前密码");
  });
  test("rejects weak new password", () => {
    expect(validatePasswordChange("oldpass1", "weak", "weak")).toBe("新密码至少 8 位且包含字母和数字");
  });
  test("rejects mismatched confirm", () => {
    expect(validatePasswordChange("oldpass1", "NewPass123", "Different1")).toBe("两次输入的新密码不一致");
  });
});
