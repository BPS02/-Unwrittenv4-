import type { Metadata } from "next";
import StoryProfile from "@/components/StoryProfile";

export const metadata: Metadata = {
  title: "Your Story",
  description: "Manage the personal details Unwritten can remember for future songs.",
};

export default function ProfilePage() {
  return <StoryProfile />;
}
