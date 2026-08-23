import type { Metadata } from "next";
import ConnectGuide from "@/components/ConnectGuide";

export const metadata: Metadata = {
  title: "Connect Unwritten to Claude",
  description: "Write and record songs from inside Claude, on your Unwritten account.",
};

export default function ConnectPage() {
  const origin = process.env.APP_URL || "https://v2-liner-notes.vercel.app";
  return <ConnectGuide mcpUrl={`${origin}/mcp`} />;
}
