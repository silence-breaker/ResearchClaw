// Security & privacy types and utilities.
// TODO(M3): Replace with real auth API integration.

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  ip: string;
  location: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface PrivacySettings {
  dataCollection: boolean;
  analyticsEnabled: boolean;
  cookieConsent: "all" | "essential" | "none";
  autoDeleteDays: number;
}

export interface SecurityState {
  apiKeys: ApiKey[];
  sessions: Session[];
  privacy: PrivacySettings;
}

// ── Demo data ──
export const DEMO_API_KEYS: ApiKey[] = [
  {
    id: "key-1",
    name: "默认 API 密钥",
    key: "sk-rc-7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c",
    createdAt: "2024-01-15",
    lastUsed: "2024-06-04 14:32"
  },
  {
    id: "key-2",
    name: "CI/CD 部署密钥",
    key: "sk-rc-deploy-9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
    createdAt: "2024-03-20",
    lastUsed: "2024-06-01 09:15"
  }
];

export const DEMO_SESSIONS: Session[] = [
  {
    id: "sess-1",
    device: "Windows PC",
    browser: "Chrome 125",
    ip: "192.168.1.***",
    location: "北京",
    createdAt: "2024-06-04 10:00",
    isCurrent: true
  },
  {
    id: "sess-2",
    device: "MacBook Pro",
    browser: "Safari 17",
    ip: "183.15.**.***",
    location: "深圳",
    createdAt: "2024-06-03 18:30",
    isCurrent: false
  },
  {
    id: "sess-3",
    device: "iPhone 15",
    browser: "Safari Mobile",
    ip: "117.136.***.***",
    location: "上海",
    createdAt: "2024-06-02 14:15",
    isCurrent: false
  }
];

export const DEFAULT_PRIVACY: PrivacySettings = {
  dataCollection: true,
  analyticsEnabled: true,
  cookieConsent: "all",
  autoDeleteDays: 30
};

export function maskKey(key: string): string {
  if (key.length <= 12) return "****";
  return key.slice(0, 8) + "..." + key.slice(-4);
}

export function isValidPassword(pwd: string): boolean {
  return pwd.length >= 8 && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd);
}

export function validatePasswordChange(
  current: string,
  newPwd: string,
  confirm: string
): string | null {
  if (!current) return "请输入当前密码";
  if (!isValidPassword(newPwd)) return "新密码至少 8 位且包含字母和数字";
  if (newPwd !== confirm) return "两次输入的新密码不一致";
  return null;
}
