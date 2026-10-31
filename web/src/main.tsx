import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";
import App from "./App";
import { Landing } from "./views/Landing";
import { I18nProvider } from "./lib/i18n";

/** Old top-level console URLs (before the landing page) keep working. */
function LegacyRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={{ pathname: `/app${pathname}`, search }} replace />;
}

const LEGACY = ["merchant", "approvals", "cases", "evals", "audit", "impact", "plugins"];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app/*" element={<App />} />
          {LEGACY.map((p) => (
            <Route key={p} path={`/${p}`} element={<LegacyRedirect />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
