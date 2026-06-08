import { useParams } from "react-router-dom";
import { useProjectStream } from "../api/useProjectStream";
import { LeftColumn } from "../components/LeftColumn";
import { CenterColumn } from "../components/CenterColumn";
import { RightColumn } from "../components/RightColumn";
import { ArtifactDetailDrawer } from "../components/ArtifactDetailDrawer";

export function Panel() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, status, error, cliChunks } = useProjectStream(projectId);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-panel-muted">
        {error ? `加载失败：${error}` : "连接研究项目中…"}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <LeftColumn state={state} status={status} />
      <CenterColumn state={state} />
      <RightColumn state={state} cliChunks={cliChunks} />
      {projectId && <ArtifactDetailDrawer projectId={projectId} />}
    </div>
  );
}
