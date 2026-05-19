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

restoreSpaPathFrom404Redirect();

createRoot(document.getElementById("root")!).render(<App />);
