/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostOrderResult } from "@/lib/apiClient";

vi.mock("@/lib/apiClient", () => ({
  postNormalizedOrder: vi.fn(),
}));

import { postNormalizedOrder } from "@/lib/apiClient";
import { MockPosPage } from "./MockPosPage";

afterEach(() => {
  cleanup();
  vi.mocked(postNormalizedOrder).mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const CREATED: PostOrderResult = {
  ok: true,
  requiredKdsWork: true,
  tickets: [{ id: "t1" } as never],
};

const NO_WORK: PostOrderResult = { ok: true, requiredKdsWork: false, tickets: [] };

/**
 * Every assertion here goes through the real MockPosPage component tree and
 * the real ScenarioCard/scenario-building code — only the network boundary
 * (postNormalizedOrder itself) is mocked. This is what proves the launcher
 * calls the real API-client boundary with the shape it claims to, not just
 * that some internal state variable changed.
 */
describe("MockPosPage", () => {
  it("renders with no KitchenStateProvider in the tree — never touches KitchenStateContext", () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue(CREATED);
    // useKitchenState() throws outside its provider — a clean render here is
    // direct proof nothing in this tree calls it.
    expect(() => render(<MockPosPage />)).not.toThrow();
  });

  it("posts the scenario's built order with the expected shape (station, quantity, createdAt)", async () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue(CREATED);
    render(<MockPosPage />);

    const button = screen.getAllByRole("button", { name: "FIRE ORDER" })[0]; // Broil Only
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(postNormalizedOrder).toHaveBeenCalledTimes(1);
    const posted = vi.mocked(postNormalizedOrder).mock.calls[0][0];
    expect(posted.items).toHaveLength(1);
    expect(posted.items[0].station).toBe("BROIL");
    expect(posted.items[0].quantity).toBe(1);
    expect(posted.createdAt).toBeInstanceOf(Date);
    expect(posted.orderNumber.length).toBeGreaterThan(0);
  });

  it("disables the fired button while the request is in flight, and re-enables after it resolves", async () => {
    const pending = deferred<PostOrderResult>();
    vi.mocked(postNormalizedOrder).mockReturnValue(pending.promise);
    render(<MockPosPage />);

    const button = screen.getAllByRole("button", { name: /FIRE ORDER|FIRING/ })[0] as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(true));

    await act(async () => {
      pending.resolve(CREATED);
      await Promise.resolve();
    });

    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("shows the created order number on success with tickets", async () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue(CREATED);
    render(<MockPosPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "FIRE ORDER" })[0]);

    await screen.findByText(/Created — order #MOCK-/);
  });

  it('shows "Accepted — no KDS work required" for a 200 [] result, not as an error', async () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue(NO_WORK);
    render(<MockPosPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "FIRE ORDER" })[0]);

    // Appears twice by design: once on the fired card's own status line, once
    // in the recent-activity feed below.
    const matches = await screen.findAllByText(/Accepted — no KDS work required/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces a validation (400) rejection cleanly", async () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue({
      ok: false,
      reason: "validation",
      message: "Invalid order payload",
    });
    render(<MockPosPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "FIRE ORDER" })[0]);

    await screen.findByText(/Failed: Invalid order payload/);
  });

  it("surfaces a network failure cleanly instead of pretending the order was created", async () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue({
      ok: false,
      reason: "network",
      message: "Failed to fetch",
    });
    render(<MockPosPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "FIRE ORDER" })[0]);

    await screen.findByText(/Failed: Failed to fetch/);
  });

  it("repeated clicks on the same scenario each post a fresh order with a distinct orderNumber", async () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue(CREATED);
    render(<MockPosPage />);

    const button = screen.getAllByRole("button", { name: "FIRE ORDER" })[0];
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });
    }

    expect(postNormalizedOrder).toHaveBeenCalledTimes(3);
    const orderNumbers = vi.mocked(postNormalizedOrder).mock.calls.map((call) => call[0].orderNumber);
    expect(new Set(orderNumbers).size).toBe(3);
  });

  it("Rush x5 fires exactly 5 requests", async () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue(CREATED);
    render(<MockPosPage />);

    fireEvent.click(screen.getByRole("button", { name: "RUSH x5" }));

    await waitFor(() => expect(postNormalizedOrder).toHaveBeenCalledTimes(5));
  });

  it("Rush x10 fires exactly 10 requests, each with a distinct orderNumber", async () => {
    vi.mocked(postNormalizedOrder).mockResolvedValue(CREATED);
    render(<MockPosPage />);

    fireEvent.click(screen.getByRole("button", { name: "RUSH x10" }));

    await waitFor(() => expect(postNormalizedOrder).toHaveBeenCalledTimes(10));
    const orderNumbers = vi.mocked(postNormalizedOrder).mock.calls.map((call) => call[0].orderNumber);
    expect(new Set(orderNumbers).size).toBe(10);
  });
});
