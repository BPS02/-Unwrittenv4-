import type { Metadata } from "next";
import StartingPointsScreen from "@/components/StartingPointsScreen";

export const metadata: Metadata = { title: "Choose a starting point" };

export default function StartingPointsPage() {
  // Every template is hand-curated and shipped with the app — nothing is
  // generated, so the page is fully static.
  return <StartingPointsScreen />;
}
