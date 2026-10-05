/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeItem, makeTicket } from "@/test/factories";
import type { StationProgress } from "@/lib/orderSummary";
import { WindowStationSection } from "./WindowStationSection";

// render()'s returned queries are bound to document.body by default, not
// just their own container, and this project's vitest config doesn't set
// `globals: true` — so @testing-library/react's automatic afterEach-cleanup
// detection (which looks for a global `afterEach`) never registers. Without
// this, each render() in the suite below leaves its DOM behind for the next.
afterEach(cleanup);

function makeSection(overrides: Partial<StationProgress> = {}): StationProgress {
  const ticket = makeTicket({
    id: "t1",
    station: "FRY",
    items: [makeItem({ id: "i1", name: "Fries", station: "FRY" })],
  });

  return {
    station: ticket.station,
    ticketId: ticket.id,
    items: ticket.items,
    ready: false,
    ...overrides,
  };
}

// Renders in this suite aren't auto-unmounted between tests (no RTL cleanup
// wired into vitest here), so queries are scoped to each render()'s own
// return value rather than the global `screen`, which would otherwise see
// stale buttons left behind by earlier tests in the same file.

describe("WindowStationSection", () => {
  it("dispatches an item toggle while the owning ticket is still ACTIVE", () => {
    const onToggleItem = vi.fn();
    const { getByRole } = render(
      <WindowStationSection
        section={makeSection({ ready: false })}
        onToggleItem={onToggleItem}
        onRefire={vi.fn()}
        actionsEnabled={true}
      />,
    );

    fireEvent.click(getByRole("button", { name: /fries/i }));

    expect(onToggleItem).toHaveBeenCalledWith("t1", "i1", "PENDING");
  });

  it("does not dispatch an item toggle once the owning ticket is BUMPED (section.ready)", () => {
    const onToggleItem = vi.fn();
    const { getByRole } = render(
      <WindowStationSection
        section={makeSection({ ready: true })}
        onToggleItem={onToggleItem}
        onRefire={vi.fn()}
        actionsEnabled={true}
      />,
    );

    const button = getByRole("button", { name: /fries/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);

    expect(onToggleItem).not.toHaveBeenCalled();
  });

  it("still disables items while offline even if the ticket is ACTIVE", () => {
    const onToggleItem = vi.fn();
    const { getByRole } = render(
      <WindowStationSection
        section={makeSection({ ready: false })}
        onToggleItem={onToggleItem}
        onRefire={vi.fn()}
        actionsEnabled={false}
      />,
    );

    const button = getByRole("button", { name: /fries/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);

    expect(onToggleItem).not.toHaveBeenCalled();
  });

  describe("REFIRE trigger", () => {
    it("calls onRefire with the ticket id, item id, item name, and station", () => {
      const onRefire = vi.fn();
      const { getByRole } = render(
        <WindowStationSection
          section={makeSection({ ready: false })}
          onToggleItem={vi.fn()}
          onRefire={onRefire}
          actionsEnabled={true}
        />,
      );

      fireEvent.click(getByRole("button", { name: "REFIRE" }));

      expect(onRefire).toHaveBeenCalledWith("t1", "i1", "Fries", "FRY");
    });

    it("stays enabled even once the owning ticket is BUMPED — unlike the item toggle", () => {
      const onRefire = vi.fn();
      const { getByRole } = render(
        <WindowStationSection
          section={makeSection({ ready: true })}
          onToggleItem={vi.fn()}
          onRefire={onRefire}
          actionsEnabled={true}
        />,
      );

      const refireButton = getByRole("button", { name: "REFIRE" }) as HTMLButtonElement;
      expect(refireButton.disabled).toBe(false);

      fireEvent.click(refireButton);
      expect(onRefire).toHaveBeenCalledTimes(1);
    });

    it("disables only while offline", () => {
      const onRefire = vi.fn();
      const { getByRole } = render(
        <WindowStationSection
          section={makeSection({ ready: false })}
          onToggleItem={vi.fn()}
          onRefire={onRefire}
          actionsEnabled={false}
        />,
      );

      const refireButton = getByRole("button", { name: "REFIRE" }) as HTMLButtonElement;
      expect(refireButton.disabled).toBe(true);

      fireEvent.click(refireButton);
      expect(onRefire).not.toHaveBeenCalled();
    });
  });
});
