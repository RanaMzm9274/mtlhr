import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const restoreSpaPathFrom404Redirect = () => {
  const url = new URL(window.location.href);
  const encodedPath = url.searchParams.get("__spa_path");
  if (!encodedPath) return;

  const decodedPath = decodeURIComponent(encodedPath);
  url.searchParams.delete("__spa_path");
  const cleanSearch = url.searchParams.toString();
  const fallbackPath = `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${url.hash}`;
  const nextPath = decodedPath || fallbackPath;

  window.history.replaceState({}, "", nextPath);
};

const normalizeLegacyHashRoute = () => {
  const { hash, pathname, search } = window.location;
  if (!hash || !hash.startsWith("#/")) return;
  if (hash.includes("access_token=")) return;

  const legacyPath = hash.slice(1);
  const nextPath = `${legacyPath}${search || ""}`;
  if (pathname !== legacyPath) {
    window.history.replaceState({}, "", nextPath);
  }
};

restoreSpaPathFrom404Redirect();
normalizeLegacyHashRoute();

createRoot(document.getElementById("root")!).render(<App />);
