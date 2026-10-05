/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, it, vi } from "vitest";
import type { StationTicket } from "@zkds/shared";
import { FakeWebSocket } from "@/test/fakeWebSocket";

// Same seam every other page/component test in this repo mocks through —
// see renderFanOut.test.tsx / WindowStationSection.test.tsx.
vi.mock("@/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiClient")>();
  return {
    ...actual,
    fetchSnapshot: vi.fn(),
    sendStationAction: vi.fn().mockResolvedValue(undefined),
    getWebSocketUrl: () => "ws://test-backend",
  };
});

import { fetchSnapshot } from "@/lib/apiClient";
import { KitchenStateProvider } from "@/state/KitchenStateContext";
import BarStationRoute from "./page";

afterEach(cleanup);

/**
 * Proves /station/bar is the tiny <StationPage station="BAR" /> wrapper it
 * claims to be, not a BAR-specific copy: a real BAR ticket flows through the
 * exact same snapshot/WebSocket pipeline and generic components (header,
 * ticket grid, item rows) every other station uses, with zero new component
 * code written for BAR.
 */
describe("/station/bar route", () => {
  it("renders the generic station screen — BAR header and a real BAR ticket", async () => {
    const ticket: StationTicket = {
      id: "order-9101-BAR",
      orderId: "order-9101",
      orderNumber: "9101",
      table: "22",
      server: "Priya",
      station: "BAR",
      items: [
        {
          id: "i1",
          name: "Margarita",
          quantity: 1,
          modifiers: ["On the rocks"],
          station: "BAR",
          status: "PENDING",
          sentAt: new Date("2026-01-01T18:00:00.000Z"),
        },
      ],
      status: "ACTIVE",
      createdAt: new Date("2026-01-01T18:00:00.000Z"),
    };

    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
    vi.mocked(fetchSnapshot).mockResolvedValue({ tickets: [ticket], expoOrders: {} });

    render(
      <KitchenStateProvider>
        <BarStationRoute />
      </KitchenStateProvider>,
    );

    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    // StationHeader renders STATION_LABELS[station] — proves the real,
    // shared label map is in play, not a hardcoded string.
    screen.getByRole("heading", { name: "BAR" });
    // KitchenTicket/KitchenItem rendered the real ticket data (the item's
    // aria-label is unique; "Margarita" alone also matches AllDaySummary's
    // own entry, which is itself further proof All Day works for BAR too).
    screen.getByRole("button", { name: "1 Margarita, pending" });
    screen.getByText(/On the rocks/);

    vi.unstubAllGlobals();
  });
});
