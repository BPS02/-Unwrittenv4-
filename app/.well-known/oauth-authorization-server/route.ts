import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from "@clerk/mcp-tools/next";

/**
 * OAuth discovery: points MCP clients at Clerk as the authorization server.
 * Must stay publicly reachable — clients read it before they have a token.
 */
const handler = authServerMetadataHandlerClerk();
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
