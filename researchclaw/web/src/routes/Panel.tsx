import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchHealth, fetchProjects } from "../api/client";
import { useProjectStream } from "../api/useProjectStream";
import { LeftColumn } from "../components/LeftColumn";
import { CenterColumn } from "../components/CenterColumn";
import { RightColumn } from "../components/RightColumn";
import { ArtifactDetailDrawer } from "../components/ArtifactDetailDrawer";

export function Panel() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, status, error, cliChunks, liveConsult, sendConsult } = useProjectStream(projectId);
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects, refetchInterval: 10000 });
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: fetchHealth, refetchInterval: 8000 });

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-panel-muted">
        {error ? `加载失败：${error}` : "连接研究项目中…"}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <LeftColumn
        state={state}
        status={status}
        cliChunks={cliChunks}
        projects={projectsQuery.data ?? []}
        health={{ data: healthQuery.data, isLoading: healthQuery.isLoading, isError: healthQuery.isError }}
      />
      <CenterColumn state={state} cliChunks={cliChunks} />
      <RightColumn state={state} cliChunks={cliChunks} liveConsult={liveConsult} onSendConsult={sendConsult} />
      {projectId && <ArtifactDetailDrawer projectId={projectId} />}
    </div>
  );
}
