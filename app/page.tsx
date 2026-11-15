import { ConciergeApp } from "@/components/concierge-app";
import { TripErrorBoundary } from "@/components/error-boundary";

export default function Page() {
  return (
    <TripErrorBoundary>
      <ConciergeApp />
    </TripErrorBoundary>
  );
}
