"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { Itinerary } from "@/lib/types";

const MapCanvas = dynamic(() => import("@/components/map-canvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full lg:h-[28rem]" />,
});

export function TripMap({ itinerary, dayIndex }: { itinerary: Itinerary; dayIndex: number }) {
  return <MapCanvas key={`${itinerary.id}-${dayIndex}`} itinerary={itinerary} dayIndex={dayIndex} />;
}
