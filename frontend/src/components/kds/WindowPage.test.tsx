/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StationTicket } from "@zkds/shared";
import { FakeWebSocket } from "@/test/fakeWebSocket";

vi.mock("@/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiClient")>();
  return {
    ...actual,
    fetchSnapshot: vi.fn(),
    sendStationAction: vi.fn().mockResolvedValue(undefined),
    getWebSocketUrl: () => "ws://test-backend",
    createRefire: vi.fn().mockResolvedValue({}),
  };
});

import { createRefire, fetchSnapshot } from "@/lib/apiClient";
import { KitchenStateProvider } from "@/state/KitchenStateContext";
import { WindowPage } from "./WindowPage";

afterEach(() => {
  cleanup();
  vi.mocked(createRefire).mockClear();
});

function makeTicket(): StationTicket {
  return {
    id: "order-9101-BROIL",
    orderId: "order-9101",
    orderNumber: "9101",
    table: "10",
    server: "Alex",
    station: "BROIL",
    items: [
      {
        id: "item-filet",
        name: "Dallas Filet",
        quantity: 1,
        modifiers: ["Medium Rare"],
        station: "BROIL",
        status: "PENDING",
        sentAt: new Date("2026-01-01T18:00:00.000Z"),
      },
    ],
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T18:00:00.000Z"),
  };
}

async function renderWindowWithOneItem() {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.reset();
  vi.mocked(fetchSnapshot).mockResolvedValue({ tickets: [makeTicket()], expoOrders: {} });

  render(
    <KitchenStateProvider>
      <WindowPage />
    </KitchenStateProvider>,
  );

  await act(async () => {
    FakeWebSocket.latest.simulateOpen();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("WindowPage — REFIRE confirmation flow (Step 7)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clicking REFIRE opens a confirmation and sends no request yet", async () => {
    await renderWindowWithOneItem();

    fireEvent.click(screen.getByRole("button", { name: "REFIRE" }));

    const dialog = screen.getByRole("alertdialog");
    within(dialog).getByText(/Dallas Filet/);
    expect(createRefire).not.toHaveBeenCalled();
  });

  it("canceling the confirmation sends no request", async () => {
    await renderWindowWithOneItem();

    fireEvent.click(screen.getByRole("button", { name: "REFIRE" }));
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));

    expect(createRefire).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("confirming sends exactly one request for the correct ticket/item", async () => {
    await renderWindowWithOneItem();

    // Two buttons named "REFIRE" now exist: the item-row trigger and the
    // dialog's own confirmLabel — scope to the dialog for the confirm click.
    fireEvent.click(screen.getByRole("button", { name: "REFIRE" }));
    const dialog = screen.getByRole("alertdialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "REFIRE" }));
    });

    expect(createRefire).toHaveBeenCalledTimes(1);
    expect(createRefire).toHaveBeenCalledWith("order-9101-BROIL", "item-filet");
  });
});
