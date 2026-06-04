import { createBrowserRouter } from "react-router-dom";
import { ProjectList } from "./routes/ProjectList";
import { Panel } from "./routes/Panel";
import { SettingsPage } from "./routes/SettingsPage";

export const router = createBrowserRouter(
  [
    { path: "/", element: <ProjectList /> },
    { path: "/panel/:projectId", element: <Panel /> },
    { path: "/settings", element: <SettingsPage /> }
  ],
  { basename: "/app" }
);
