const unsafePathCharacters = /[\\\u0000-\u001f\u007f]/;

export function sanitizeNextPath(
  requestedPath: string | null | undefined,
  fallback = "/dashboard",
) {
  if (
    !requestedPath ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//") ||
    unsafePathCharacters.test(requestedPath)
  ) {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(requestedPath);
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      unsafePathCharacters.test(decoded)
    ) {
      return fallback;
    }

    const baseUrl = new URL("https://attruvi.local");
    const resolved = new URL(requestedPath, baseUrl);
    if (resolved.origin !== baseUrl.origin) return fallback;

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

export function isProtectedPage(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/auth/reset"
  );
}

export function isPrivateApi(pathname: string) {
  return pathname === "/api/private" || pathname.startsWith("/api/private/");
}
