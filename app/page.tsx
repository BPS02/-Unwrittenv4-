import HomeEntry from "@/components/HomeEntry";
import { clerkEnabled } from "@/lib/clerk-config";

export default function LandingPage() {
  return <HomeEntry clerkEnabled={clerkEnabled} />;
}
