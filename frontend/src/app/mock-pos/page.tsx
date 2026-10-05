import type { Metadata } from "next";
import { MockPosPage } from "@/components/mockPos/MockPosPage";

export const metadata: Metadata = {
  title: "Mock POS — ZKDS",
};

export default function MockPosRoute() {
  return <MockPosPage />;
}
