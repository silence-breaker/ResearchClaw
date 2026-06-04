import { useState, useRef, useCallback } from "react";
import { useUserStore } from "../stores/user";
import { readAvatarFile, type UserProfile } from "../lib/user";

/* ── Avatar helpers ── */

function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase() || "?";
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent font-semibold overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

/* ── Account Dropdown ── */

function AccountDropdown({
  users,
  currentId,
  onSwitch
}: {
  users: UserProfile[];
  currentId: string;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = users.find((u) => u.id === currentId) ?? users[0];
  if (!current) return null;

  return (
    <div className="relative mb-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg border border-panel-border bg-panel-bg px-4 py-3 text-left hover:border-accent/50 transition-colors"
      >
        <Avatar src={current.avatar} name={current.nickname} size={36} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-panel-text truncate">{current.email}</div>
          <div className="text-xs text-panel-muted truncate">{current.nickname}</div>
        </div>
        <svg
          className={`h-4 w-4 text-panel-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-panel-border bg-panel-bg shadow-lg overflow-hidden">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  onSwitch(u.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-panel-surface transition-colors ${
                  u.id === currentId ? "bg-panel-surface/50" : ""
                }`}
              >
                <Avatar src={u.avatar} name={u.nickname} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-panel-text truncate">{u.email}</div>
                  <div className="text-xs text-panel-muted truncate">{u.nickname}</div>
                </div>
                {u.id === currentId && (
                  <span className="text-xs text-accent">当前</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Add Account Modal ── */

function AddAccountModal({
  open,
  onClose,
  onAdd
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (p: Omit<UserProfile, "id">) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !email.trim()) {
      setError("请填写昵称和邮箱");
      return;
    }
    if (!email.includes("@")) {
      setError("请输入有效的邮箱地址");
      return;
    }
    onAdd({
      avatar: null,
      nickname: nickname.trim(),
      account: email.split("@")[0] + "_" + Math.floor(Math.random() * 1000),
      email: email.trim(),
      school: "",
      company: ""
    });
    setNickname("");
    setEmail("");
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg border border-panel-border bg-panel-surface p-5 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-panel-text">添加新账户</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-panel-muted">昵称</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded border border-panel-border bg-panel-bg px-3 py-2 text-sm text-panel-text outline-none focus:border-accent"
              placeholder="例如：张三"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-panel-muted">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-panel-border bg-panel-bg px-3 py-2 text-sm text-panel-text outline-none focus:border-accent"
              placeholder="example@email.com"
            />
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-panel-border px-4 py-1.5 text-sm text-panel-text hover:bg-panel-bg"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-panel-bg hover:opacity-90"
            >
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Profile Card ── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-panel-border/50 last:border-0">
      <span className="text-xs text-panel-muted">{label}</span>
      <span className="text-sm text-panel-text">{value || <span className="text-panel-muted/50">未设置</span>}</span>
    </div>
  );
}

function EditableRow({
  label,
  value,
  onChange,
  readOnly
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-panel-border/50 last:border-0">
      <span className="text-xs text-panel-muted shrink-0">{label}</span>
      {readOnly ? (
        <span className="text-sm text-panel-text">{value}</span>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-panel-border bg-panel-bg px-2 py-1 text-sm text-panel-text outline-none focus:border-accent w-48"
        />
      )}
    </div>
  );
}

/* ── Main Profile Settings ── */

export function ProfileSettings() {
  const { users, currentUserId, switchUser, updateCurrentUser, addUser, logout } = useUserStore();
  const current = users.find((u) => u.id === currentUserId) ?? users[0];
  const [isEditing, setIsEditing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [draft, setDraft] = useState<Partial<UserProfile>>({});
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    if (!current) return;
    setDraft({
      nickname: current.nickname,
      school: current.school,
      company: current.company,
      avatar: current.avatar
    });
    setIsEditing(true);
    setAvatarError(null);
  }, [current]);

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft({});
    setAvatarError(null);
  };

  const saveEdit = () => {
    if (!current) return;
    updateCurrentUser({
      nickname: draft.nickname ?? current.nickname,
      school: draft.school ?? current.school,
      company: draft.company ?? current.company,
      avatar: draft.avatar ?? current.avatar
    });
    setIsEditing(false);
    setDraft({});
  };

  const handleAvatarClick = () => {
    if (!isEditing) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readAvatarFile(file);
      setDraft((d) => ({ ...d, avatar: dataUrl }));
      setAvatarError(null);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "上传失败");
    }
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  if (!current) {
    return (
      <div>
        <div className="rounded border border-panel-border bg-panel-bg p-4 text-sm text-panel-muted">
          当前没有登录的账户。
          <button
            onClick={() => setShowAddModal(true)}
            className="ml-2 text-accent hover:underline"
          >
            添加账户
          </button>
        </div>
        <AddAccountModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdd={addUser} />
      </div>
    );
  }

  const displayAvatar = isEditing ? (draft.avatar ?? current.avatar) : current.avatar;

  return (
    <div>
      {/* Account selector */}
      <AccountDropdown users={users} currentId={currentUserId} onSwitch={switchUser} />

      {/* Profile card */}
      <div className="rounded-lg border border-panel-border bg-panel-bg p-5">
        {/* Avatar section */}
        <div className="flex flex-col items-center mb-5">
          <button
            onClick={handleAvatarClick}
            className={`relative group rounded-full ${isEditing ? "cursor-pointer" : "cursor-default"}`}
            disabled={!isEditing}
          >
            <Avatar src={displayAvatar} name={current.nickname} size={80} />
            {isEditing && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs text-white">更换</span>
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {avatarError && (
            <div className="mt-2 text-xs text-red-400">{avatarError}</div>
          )}
          <div className="mt-2 text-sm font-medium text-panel-text">{current.nickname}</div>
          <div className="text-xs text-panel-muted">{current.email}</div>
        </div>

        {/* Info rows */}
        <div className="space-y-0">
          {isEditing ? (
            <>
              <EditableRow
                label="昵称"
                value={draft.nickname ?? current.nickname}
                onChange={(v) => setDraft((d) => ({ ...d, nickname: v }))}
              />
              <EditableRow label="账号" value={current.account} onChange={() => {}} readOnly />
              <EditableRow label="邮箱" value={current.email} onChange={() => {}} readOnly />
              <EditableRow
                label="学校"
                value={draft.school ?? current.school}
                onChange={(v) => setDraft((d) => ({ ...d, school: v }))}
              />
              <EditableRow
                label="企业"
                value={draft.company ?? current.company}
                onChange={(v) => setDraft((d) => ({ ...d, company: v }))}
              />
            </>
          ) : (
            <>
              <InfoRow label="昵称" value={current.nickname} />
              <InfoRow label="账号" value={current.account} />
              <InfoRow label="邮箱" value={current.email} />
              <InfoRow label="学校" value={current.school} />
              <InfoRow label="企业" value={current.company} />
            </>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between border-t border-panel-border pt-4">
          {isEditing ? (
            <>
              <button
                onClick={cancelEdit}
                className="rounded border border-panel-border px-4 py-1.5 text-sm text-panel-text hover:bg-panel-surface"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-panel-bg hover:opacity-90"
              >
                保存修改
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="rounded border border-panel-border px-4 py-1.5 text-sm text-panel-text hover:bg-panel-surface"
              >
                编辑资料
              </button>
              <button
                onClick={() => {
                  if (confirm("确定要登出当前账户吗？")) logout();
                }}
                className="rounded border border-red-500/30 px-4 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
              >
                登出
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add account button */}
      {!isEditing && (
        <button
          onClick={() => setShowAddModal(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-panel-border py-2.5 text-sm text-panel-muted hover:border-accent/50 hover:text-accent transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加新账户
        </button>
      )}

      <AddAccountModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addUser}
      />
    </div>
  );
}
