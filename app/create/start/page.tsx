import type { Metadata } from "next";
import StartingPointsScreen from "@/components/StartingPointsScreen";
import { builtInStartingPoints } from "@/lib/starting-points";

export const metadata: Metadata = { title: "Choose a starting point" };

export default function StartingPointsPage() {
  // The shipped ten are server-rendered so the gallery is never blank while
  // fresh ones are being written.
  return <StartingPointsScreen initialPoints={builtInStartingPoints()} />;
}
