import type { Metadata } from "next";
import { Suspense } from "react";
import PlansView from "@/components/PlansView";

export const metadata: Metadata = {
  title: "Plans",
  description: "Choose a Song Pass, Unwritten Pro, or additional render credits.",
};

export default function PlansPage() {
  return (
    <Suspense fallback={<div className="plans-page" aria-busy="true" />}>
      <PlansView />
    </Suspense>
  );
}
