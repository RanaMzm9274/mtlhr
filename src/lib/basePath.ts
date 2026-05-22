const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const inferBasePathFromLocation = () => {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  const candidate = parts[0];
  // Avoid inferring a basename from dynamic company slug routes like /acme/employee/dashboard.
  // Only infer explicit known subfolder deployments.
  if (/docx$/i.test(candidate)) return `/${candidate}`;
  return "";
};

const matchesCurrentPath = (basePath: string) => {
  if (!basePath || basePath === "/") return true;
  const pathname = window.location.pathname;
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
};

export const getBasePath = () => {
  const configured = (window as Window & { MTLHR_PORTAL_BASE_PATH?: string }).MTLHR_PORTAL_BASE_PATH;
  const fromBuild = import.meta.env.BASE_URL;
  const inferred = inferBasePathFromLocation();
  const configuredNormalized = configured ? trimTrailingSlash(configured) || "/" : "";
  const buildNormalized = fromBuild ? trimTrailingSlash(fromBuild) || "/" : "";
  const inferredNormalized = inferred ? trimTrailingSlash(inferred) || "/" : "";

  if (configuredNormalized && matchesCurrentPath(configuredNormalized)) return configuredNormalized;
  if (buildNormalized && buildNormalized !== "/" && matchesCurrentPath(buildNormalized)) return buildNormalized;
  if (inferredNormalized && matchesCurrentPath(inferredNormalized)) return inferredNormalized;
  return "/";
};

export const withBasePath = (path: string) => {
  const base = getBasePath();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (base === "/") return cleanPath;
  return `${base}${cleanPath}`;
};

export const absoluteAppUrl = (path: string) => `${window.location.origin}${withBasePath(path)}`;
