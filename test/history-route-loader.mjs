export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return {
      url: "data:text/javascript,export%20const%20cookies%3DglobalThis.__historyCookies",
      shortCircuit: true,
    };
  }

  if (specifier === "next/server") {
    return {
      url: "data:text/javascript,export%20const%20NextResponse%3DglobalThis.__historyNextResponse",
      shortCircuit: true,
    };
  }

  if (specifier.endsWith("/src/history/service")) {
    return {
      url: "data:text/javascript,export%20const%20saveSearchHistory%3DglobalThis.__historyService.saveSearchHistory%3Bexport%20const%20getRecentSearchHistory%3DglobalThis.__historyService.getRecentSearchHistory",
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
