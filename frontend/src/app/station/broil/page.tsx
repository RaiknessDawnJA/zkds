import type { Metadata } from "next";
import { StationPage } from "@/components/kds/StationPage";

export const metadata: Metadata = {
  title: "BROIL — ZKDS",
};

/**
 * The route is Broil-specific; the screen behind it is not. Adding /station/fry
 * later means one more page file passing a different station.
 */
export default function BroilStationRoute() {
  return <StationPage station="BROIL" />;
}
