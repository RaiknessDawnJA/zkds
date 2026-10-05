import type { Metadata } from "next";
import { StationPage } from "@/components/kds/StationPage";

export const metadata: Metadata = {
  title: "BAR — ZKDS",
};

export default function BarStationRoute() {
  return <StationPage station="BAR" />;
}
