export async function register() {
  // Only the production Node server reports; dev and edge have no token.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.PATCHWATCH_TOKEN) {
    const { startPatchwatch } = await import("./patchwatch.mjs");
    startPatchwatch();
  }
}
