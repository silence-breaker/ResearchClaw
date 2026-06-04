import { useArtifactDrawer } from "../stores/drawer";

// A clickable artifact reference. Clicking opens the shared detail drawer so any
// "conclusion" on the panel can be traced back to its artifact (red line §11.1).
export function RefChip({ refValue, label }: { refValue: string; label?: string }) {
  const open = useArtifactDrawer((s) => s.open);
  const text = label ?? refValue.split("/").pop() ?? refValue;
  return (
    <button
      type="button"
      onClick={() => open(refValue)}
      title={refValue}
      className="max-w-full truncate rounded bg-panel-bg px-1.5 py-0.5 font-mono text-[10px] text-accent hover:underline"
    >
      {text}
    </button>
  );
}
