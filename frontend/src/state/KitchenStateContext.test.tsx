/** @vitest-environment jsdom */
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "@/test/fakeWebSocket";
import { KitchenStateProvider, useKitchenState } from "./KitchenStateContext";

vi.mock("@/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiClient")>();
  return {
    ...actual,
    fetchSnapshot: vi.fn(),
    sendStationAction: vi.fn().mockResolvedValue(undefined),
    getWebSocketUrl: () => "ws://test-backend",
  };
});

import { fetchSnapshot, sendStationAction } from "@/lib/apiClient";

const BASE_TIME = new Date("2026-01-01T18:00:00.000Z");

function makeTicket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t1",
    orderId: "o1",
    orderNumber: "1048",
    table: "18",
    server: "Maria",
    station: "BROIL",
    status: "ACTIVE",
    createdAt: BASE_TIME,
    items: [],
    ...overrides,
  };
}

let latestValue: ReturnType<typeof useKitchenState> | null = null;

function Probe() {
  const value = useKitchenState();
  useEffect(() => {
    latestValue = value;
  });
  return null;
}

function renderProvider() {
  return render(
    <KitchenStateProvider>
      <Probe />
    </KitchenStateProvider>,
  );
}

beforeEach(() => {
  FakeWebSocket.reset();
  latestValue = null;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.mocked(fetchSnapshot).mockReset();
  vi.mocked(sendStationAction).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("KitchenStateProvider", () => {
  it("loads the snapshot once the socket opens and reports ONLINE", async () => {
    vi.mocked(fetchSnapshot).mockResolvedValue({
      tickets: [makeTicket()],
      expoOrders: {},
    } as never);

    renderProvider();
    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestValue?.tickets).toHaveLength(1);
    expect(latestValue?.connectionStatus).toBe("ONLINE");
  });

  it("buffers events that arrive before the snapshot resolves, then applies them after", async () => {
    let resolveSnapshot!: (value: { tickets: unknown[]; expoOrders: Record<string, unknown> }) => void;
    vi.mocked(fetchSnapshot).mockReturnValue(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }) as never,
    );

    renderProvider();
    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
    });

    // An update for a ticket arrives before the snapshot fetch has resolved.
    const updatedTicket = makeTicket({ status: "BUMPED", bumpedAt: BASE_TIME });
    act(() => {
      FakeWebSocket.latest.simulateMessage({
        type: "STATION_TICKET_UPDATED",
        ticket: updatedTicket,
      });
    });

    // Snapshot resolves with the PRE-update ticket — the buffered event must
    // still win, proving it replayed after the snapshot rather than being lost.
    await act(async () => {
      resolveSnapshot({ tickets: [makeTicket({ status: "ACTIVE" })], expoOrders: {} });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestValue?.tickets[0].status).toBe("BUMPED");
  });

  it("STATION_TICKET_UPDATED replaces only the matching ticket", async () => {
    vi.mocked(fetchSnapshot).mockResolvedValue({
      tickets: [makeTicket({ id: "t1" }), makeTicket({ id: "t2", station: "FRY" })],
      expoOrders: {},
    } as never);

    renderProvider();
    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      FakeWebSocket.latest.simulateMessage({
        type: "STATION_TICKET_UPDATED",
        ticket: makeTicket({ id: "t1", status: "BUMPED", bumpedAt: BASE_TIME }),
      });
    });

    const t1 = latestValue?.tickets.find((t) => t.id === "t1");
    const t2 = latestValue?.tickets.find((t) => t.id === "t2");
    expect(t1?.status).toBe("BUMPED");
    expect(t2?.status).toBe("ACTIVE"); // untouched
  });

  it("EXPO_ORDER_UPDATED sets that order's expo state without touching tickets", async () => {
    vi.mocked(fetchSnapshot).mockResolvedValue({
      tickets: [makeTicket()],
      expoOrders: {},
    } as never);

    renderProvider();
    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      FakeWebSocket.latest.simulateMessage({
        type: "EXPO_ORDER_UPDATED",
        orderId: "o1",
        expoOrder: { status: "BUMPED", bumpedAt: BASE_TIME },
      });
    });

    expect(latestValue?.expoOrders.o1.status).toBe("BUMPED");
    expect(latestValue?.tickets[0].status).toBe("ACTIVE");
  });

  it("ORDER_CREATED appends new tickets without duplicating existing ones", async () => {
    vi.mocked(fetchSnapshot).mockResolvedValue({
      tickets: [makeTicket({ id: "t1" })],
      expoOrders: {},
    } as never);

    renderProvider();
    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      FakeWebSocket.latest.simulateMessage({
        type: "ORDER_CREATED",
        tickets: [makeTicket({ id: "t1" }), makeTicket({ id: "t2" })],
      });
    });

    expect(latestValue?.tickets.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("dispatch calls sendStationAction with the given action, without touching local state directly", async () => {
    vi.mocked(fetchSnapshot).mockResolvedValue({ tickets: [], expoOrders: {} } as never);

    renderProvider();
    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    const action = { type: "BUMP_TICKET" as const, ticketId: "t1", at: new Date() };
    act(() => {
      latestValue?.dispatch(action);
    });

    expect(sendStationAction).toHaveBeenCalledWith(action);
    expect(latestValue?.tickets).toHaveLength(0); // no local mutation happened
  });

  it("reports OFFLINE on close and reconnects, re-fetching a fresh snapshot", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchSnapshot).mockResolvedValue({
      tickets: [makeTicket()],
      expoOrders: {},
    } as never);

    renderProvider();
    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latestValue?.connectionStatus).toBe("ONLINE");

    act(() => {
      FakeWebSocket.latest.simulateClose();
    });
    expect(latestValue?.connectionStatus).toBe("OFFLINE");

    const fetchCallsBefore = vi.mocked(fetchSnapshot).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    // A new socket was opened for the reconnect attempt.
    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);

    await act(async () => {
      FakeWebSocket.latest.simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(vi.mocked(fetchSnapshot).mock.calls.length).toBeGreaterThan(fetchCallsBefore);
    expect(latestValue?.connectionStatus).toBe("ONLINE");
  });
});
