import { createBrowserRouter } from "react-router-dom";
import { ProjectList } from "./routes/ProjectList";
import { Panel } from "./routes/Panel";

export const router = createBrowserRouter(
  [
    { path: "/", element: <ProjectList /> },
    { path: "/panel/:projectId", element: <Panel /> }
  ],
  { basename: "/app" }
);
