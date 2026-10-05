import type { Metadata } from "next";
import { StationPage } from "@/components/kds/StationPage";

export const metadata: Metadata = {
  title: "FRY — ZKDS",
};

export default function FryStationRoute() {
  return <StationPage station="FRY" />;
}
