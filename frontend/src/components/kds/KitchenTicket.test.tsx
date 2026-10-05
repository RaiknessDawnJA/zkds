/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeItem, makeTicket } from "@/test/factories";
import { KitchenTicket } from "./KitchenTicket";

afterEach(cleanup);

describe("KitchenTicket — REFIRE visual treatment (Step 7)", () => {
  it("renders data-refire=false and no REFIRE badge for a normal ticket", () => {
    const ticket = makeTicket({
      id: "t1",
      items: [makeItem({ id: "i1", name: "Ribeye" })],
    });

    const { container, queryByText } = render(
      <KitchenTicket
        ticket={ticket}
        now={ticket.createdAt.getTime()}
        onToggleItem={vi.fn()}
        onBump={vi.fn()}
        actionsEnabled={true}
      />,
    );

    expect(container.querySelector("article")?.getAttribute("data-refire")).toBe("false");
    expect(queryByText("REFIRE")).toBeNull();
  });

  it("renders data-refire=true and the REFIRE badge for a REFIRE ticket", () => {
    const ticket = makeTicket({
      id: "t-refire",
      refire: { originTicketId: "origin-ticket", originItemId: "origin-item" },
      items: [makeItem({ id: "i1", name: "Dallas Filet" })],
    });

    const { container, getByText } = render(
      <KitchenTicket
        ticket={ticket}
        now={ticket.createdAt.getTime()}
        onToggleItem={vi.fn()}
        onBump={vi.fn()}
        actionsEnabled={true}
      />,
    );

    expect(container.querySelector("article")?.getAttribute("data-refire")).toBe("true");
    getByText("REFIRE");
  });

  it("stays visually identifiable as REFIRE regardless of how CRITICAL-aged it is", () => {
    // 20 minutes old — well past the CRITICAL threshold (12 minutes).
    const createdAt = new Date(Date.now() - 20 * 60_000);
    const ticket = makeTicket({
      id: "t-refire",
      createdAt,
      refire: { originTicketId: "origin-ticket", originItemId: "origin-item" },
      items: [makeItem({ id: "i1", name: "Dallas Filet", sentAt: createdAt })],
    });

    const { container, getByText } = render(
      <KitchenTicket
        ticket={ticket}
        now={Date.now()}
        onToggleItem={vi.fn()}
        onBump={vi.fn()}
        actionsEnabled={true}
      />,
    );

    const article = container.querySelector("article")!;
    // Still visually flagged as REFIRE even though urgency has separately
    // escalated to CRITICAL underneath — the two are independent signals.
    expect(article.getAttribute("data-refire")).toBe("true");
    expect(article.getAttribute("data-urgency")).toBe("CRITICAL");
    getByText("REFIRE");
  });
});
