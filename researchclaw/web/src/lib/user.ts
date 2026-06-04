// User profile types and utilities.
// TODO(M3): Replace localStorage persistence with backend API calls.

export interface UserProfile {
  id: string;
  avatar: string | null; // base64 data URL or null for default
  nickname: string;
  account: string; // unique username, backend-assigned
  email: string;
  school: string;
  company: string;
}

export const DEFAULT_AVATAR = null;

export const DEFAULT_USER: UserProfile = {
  id: "user-1",
  avatar: DEFAULT_AVATAR,
  nickname: "Researcher",
  account: "researcher_01",
  email: "2719653442@qq.com",
  school: "",
  company: ""
};

export const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2MB

export function isValidUserProfile(u: unknown): u is UserProfile {
  if (!u || typeof u !== "object") return false;
  const p = u as Partial<UserProfile>;
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.nickname === "string" &&
    typeof p.account === "string" &&
    typeof p.email === "string" &&
    typeof p.school === "string" &&
    typeof p.company === "string" &&
    (p.avatar === null || p.avatar === undefined || typeof p.avatar === "string")
  );
}

export interface UserState {
  currentUserId: string;
  users: UserProfile[];
}

export const DEFAULT_USER_STATE: UserState = {
  currentUserId: DEFAULT_USER.id,
  users: [DEFAULT_USER]
};

export function migrateUserState(raw: unknown): UserState {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_USER_STATE };
  }
  const partial = raw as Partial<UserState>;
  const users = Array.isArray(partial.users)
    ? partial.users.filter(isValidUserProfile)
    : [];
  const validUsers = users.length > 0 ? users : [DEFAULT_USER];
  const currentUserId =
    typeof partial.currentUserId === "string" &&
    validUsers.some((u) => u.id === partial.currentUserId)
      ? partial.currentUserId
      : validUsers[0].id;
  return { currentUserId, users: validUsers };
}

// Reads a File as base64 data URL. Rejects if file exceeds max size.
export function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > AVATAR_MAX_SIZE) {
      reject(new Error("头像大小不能超过 2MB"));
      return;
    }
    if (!file.type.startsWith("image/")) {
      reject(new Error("请上传图片文件"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("读取头像失败"));
    };
    reader.onerror = () => reject(new Error("读取头像失败"));
    reader.readAsDataURL(file);
  });
}

// Generates a new unique id for adding users locally.
export function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
