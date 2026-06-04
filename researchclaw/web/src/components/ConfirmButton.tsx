import { useState } from "react";

// A small two-step confirm button: first click arms, second click fires.
// Blurring disarms. Avoids native confirm() and stays style-consistent.
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
  danger,
  className
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const base = "rounded border px-2 py-1 text-xs disabled:opacity-50";
  const tone = danger
    ? "border-accent-red/60 text-accent-red hover:bg-accent-red/10"
    : "border-panel-border text-panel-muted hover:text-panel-text";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
      className={`${base} ${armed ? "border-accent-amber text-accent-amber" : tone} ${className ?? ""}`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
