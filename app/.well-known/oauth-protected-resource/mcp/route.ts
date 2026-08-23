import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";

/**
 * Declares this MCP endpoint as an OAuth-protected resource and the scopes
 * it wants. Publicly reachable by design.
 */
const handler = protectedResourceHandlerClerk({
  scopes_supported: ["profile", "email"],
});
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
