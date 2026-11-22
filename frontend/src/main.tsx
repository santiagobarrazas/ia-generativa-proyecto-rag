import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "./styles.css";

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, type User } from "./api";
import { AppProvider } from "./state";
import AuthPage from "./pages/AuthPage";
import Shell from "./pages/Shell";
import HomePage from "./pages/HomePage";
import ProjectPage from "./pages/ProjectPage";
import KeysPage from "./pages/KeysPage";

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api<User>("/auth/me").then(setUser, () => setUser(null));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);

  if (user === undefined) return <div className="boot" aria-busy="true" />;

  if (!user) {
    return (
      <Routes>
        <Route path="/registro" element={<AuthPage mode="register" onAuth={setUser} />} />
        <Route path="*" element={<AuthPage mode="login" onAuth={setUser} />} />
      </Routes>
    );
  }

  return (
    <AppProvider user={user} setUser={setUser}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="/p/:projectId" element={<ProjectPage tab="chat" />} />
          <Route path="/p/:projectId/conocimiento" element={<ProjectPage tab="knowledge" />} />
          <Route path="/keys" element={<KeysPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
