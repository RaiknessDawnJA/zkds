import type { Metadata } from "next";
import { StationPage } from "@/components/kds/StationPage";

export const metadata: Metadata = {
  title: "SALAD / COLD — ZKDS",
};

export default function SaladStationRoute() {
  return <StationPage station="SALAD" />;
}
