import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { KitchenStateProvider } from "@/state/KitchenStateContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZKDS — Kitchen Display System",
  description:
    "Kitchen Display System station screens. V1 runs on local mock data.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080b10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <KitchenStateProvider>{children}</KitchenStateProvider>
      </body>
    </html>
  );
}
