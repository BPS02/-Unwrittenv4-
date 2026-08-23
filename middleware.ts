import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/songs(.*)", "/api/songs(.*)"]);
// OAuth discovery and the MCP endpoint authenticate themselves (bearer
// tokens via withMcpAuth), so page-level protection must never redirect them.
const isMcpRoute = createRouteMatcher(["/mcp", "/sse", "/.well-known/(.*)"]);
const enabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export default enabled
  ? clerkMiddleware(async (auth, request) => {
      if (isMcpRoute(request)) return;
      if (isProtectedRoute(request)) await auth.protect();
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
