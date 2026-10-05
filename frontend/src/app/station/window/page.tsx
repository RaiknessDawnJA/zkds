import type { Metadata } from "next";
import { WindowPage } from "@/components/kds/WindowPage";

export const metadata: Metadata = {
  title: "WINDOW / EXPO — ZKDS",
};

export default function WindowStationRoute() {
  return <WindowPage />;
}
