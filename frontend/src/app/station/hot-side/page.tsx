import type { Metadata } from "next";
import { StationPage } from "@/components/kds/StationPage";

export const metadata: Metadata = {
  title: "HOT SIDE — ZKDS",
};

export default function HotSideStationRoute() {
  return <StationPage station="HOT_SIDE" />;
}
