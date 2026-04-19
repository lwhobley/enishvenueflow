import { createRoot } from "react-dom/client";
import { setUserIdGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const AUTH_STORAGE_KEY = "enosh-auth-user";

setUserIdGetter(() => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown } | null;
    return parsed && typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
