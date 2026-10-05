/** @vitest-environment jsdom */
import { act, render } from "@testing-library/react";
import { memo } from "react";
import { describe, expect, it, vi } from "vitest";
import type { StationTicket } from "@zkds/shared";
import { FakeWebSocket } from "@/test/fakeWebSocket";
import { generateStressTickets } from "@/test/stress";

// Reflecting into React internals (`.type`) that the public React types don't model.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;
/**
 * memo()'s public type doesn't expose the wrapped function, though it exists
 * at runtime as `.type` — this is how React itself stores it internally.
 */
type MemoComponent = { type: AnyFn };

// memo() wraps a component in a non-callable object, so vi.fn() can't wrap it
// directly. Spy on the inner function (via `.type`) and re-wrap in memo() for
// the mock, preserving the exact memoization behavior under test.
vi.mock("./KitchenTicket", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./KitchenTicket")>();
  const inner = (actual.KitchenTicket as unknown as MemoComponent).type;
  return { KitchenTicket: memo(vi.fn(inner)) };
});

// Step 5: state now arrives over the network, so the board is seeded via a
// mocked snapshot fetch + a simulated WebSocket broadcast, not a local prop.
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
import { KitchenTicket } from "./KitchenTicket";
import { StationPage } from "./StationPage";

function innerTicketSpy() {
  return vi.mocked((KitchenTicket as unknown as MemoComponent).type);
}

/**
 * Step 3.5: protects the KitchenTicket/KitchenItem memo boundary added to fix
 * a measured render fan-out (toggling one item among a large stress board
 * previously re-invoked a large fraction of unrelated ticket components).
 * Re-verified for Step 5's architecture: the update now arrives as a real
 * WebSocket STATION_TICKET_UPDATED broadcast, not a direct reducer dispatch —
 * the memo boundary has to hold under the new update mechanism too.
 */
describe("toggling one item does not re-render unrelated tickets", () => {
  it("re-invokes only the changed ticket among many mounted, when the update arrives over the WebSocket", async () => {
    const now = new Date("2026-08-20T20:00:00.000Z");
    const tickets = generateStressTickets(80, now);

    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
    vi.mocked(fetchSnapshot).mockResolvedValue({ tickets, expoOrders: {} } as never);

    render(
      <KitchenStateProvider>
        <StationPage station="BROIL" />
      </KitchenStateProvider>,
    );

    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    const mountedTicketCount = innerTicketSpy().mock.calls.length;
    expect(mountedTicketCount).toBeGreaterThan(10); // sanity: a meaningful board size

    innerTicketSpy().mockClear();

    const target = tickets.find((t) => t.id === "stress-order-0-BROIL")!;
    const updatedTicket: StationTicket = {
      ...target,
      items: target.items.map((item, i) =>
        i === 0 ? { ...item, status: "READY", completedAt: now } : item,
      ),
    };

    act(() => {
      FakeWebSocket.latest.simulateMessage({
        type: "STATION_TICKET_UPDATED",
        ticket: updatedTicket,
      });
    });

    // The whole point of the memo boundary: only the ticket that actually
    // changed re-executes, no matter how many other tickets are mounted.
    const calls = innerTicketSpy().mock.calls as [{ ticket: StationTicket }][];
    expect(calls).toHaveLength(1);
    expect(calls[0][0].ticket.id).toBe("stress-order-0-BROIL");

    vi.unstubAllGlobals();
  });
});
