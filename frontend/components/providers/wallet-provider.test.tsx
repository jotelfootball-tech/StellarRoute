import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletProvider, useWallet } from "./wallet-provider";

import * as freighter from "@stellar/freighter-api";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

// ── Test consumer ──────────────────────────────────────────────────────────────
function WalletConsumer() {
  const {
    address,
    isConnected,
    network,
    walletId,
    error,
    isLoading,
    networkMismatch,
    stubSpendableBalance,
    autoReconnectPreferred,
    connect,
    reconnect,
    disconnect,
    setAutoReconnectPreferred,
  } = useWallet();

  return (
    <div>
      <span data-testid="connected">{String(isConnected)}</span>
      <span data-testid="address">{address ?? "none"}</span>
      <span data-testid="network">{network}</span>
      <span data-testid="walletId">{walletId ?? "none"}</span>
      <span data-testid="error">{error?.message ?? "none"}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="mismatch">{String(networkMismatch)}</span>
      <span data-testid="balance">{stubSpendableBalance ?? "none"}</span>
      <span data-testid="autoReconnect">{String(autoReconnectPreferred)}</span>
      <button onClick={() => connect("freighter")}>Connect Freighter</button>
      <button onClick={reconnect}>Reconnect</button>
      <button onClick={disconnect}>Disconnect</button>
      <button onClick={() => setAutoReconnectPreferred(false)}>Disable auto reconnect</button>
      <button onClick={() => setAutoReconnectPreferred(true)}>Enable auto reconnect</button>
    </div>
  );
}

function renderWithProvider(defaultNetwork?: "testnet" | "mainnet") {
  return render(
    <WalletProvider defaultNetwork={defaultNetwork ?? "testnet"}>
      <WalletConsumer />
    </WalletProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("WalletProvider", () => {
  it("provides disconnected state by default", () => {
    renderWithProvider();
    expect(screen.getByTestId("connected").textContent).toBe("false");
    expect(screen.getByTestId("address").textContent).toBe("none");
    expect(screen.getByTestId("network").textContent).toBe("testnet");
  });

  it("connects and exposes address", async () => {
    vi.mocked(freighter.requestAccess).mockResolvedValueOnce({ address: "GABCDEFGHIJKLMNOPWXYZ" });
    vi.mocked(freighter.getAddress).mockResolvedValueOnce({ address: "GABCDEFGHIJKLMNOPWXYZ" });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValueOnce({
      network: "testnet",
      networkUrl: "",
      networkPassphrase: "",
    });

    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole("button", { name: "Connect Freighter" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected").textContent).toBe("true");
    });
    expect(screen.getByTestId("address").textContent).toBe("GABCDEFGHIJKLMNOPWXYZ");
    expect(screen.getByTestId("walletId").textContent).toBe("freighter");
  });

  it("disconnects and clears state", async () => {
    vi.mocked(freighter.requestAccess).mockResolvedValueOnce({ address: "GABCDEFGHIJKLMNOPWXYZ" });
    vi.mocked(freighter.getAddress).mockResolvedValueOnce({ address: "GABCDEFGHIJKLMNOPWXYZ" });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValueOnce({
      network: "testnet",
      networkUrl: "",
      networkPassphrase: "",
    });

    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole("button", { name: "Connect Freighter" }));
    await waitFor(() => expect(screen.getByTestId("connected").textContent).toBe("true"));

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(screen.getByTestId("connected").textContent).toBe("false");
    expect(screen.getByTestId("address").textContent).toBe("none");
    expect(screen.getByTestId("walletId").textContent).toBe("none");
    expect(screen.getByTestId("error").textContent).toBe("none");
  });

  it("detects network mismatch when wallet is on mainnet but app is testnet", async () => {
    vi.mocked(freighter.requestAccess).mockResolvedValueOnce({ address: "GABCDEFGHIJKLMNOPWXYZ" });
    vi.mocked(freighter.getAddress).mockResolvedValueOnce({ address: "GABCDEFGHIJKLMNOPWXYZ" });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValueOnce({
      network: "mainnet",
      networkUrl: "",
      networkPassphrase: "",
    });

    const user = userEvent.setup();
    renderWithProvider("testnet");

    await user.click(screen.getByRole("button", { name: "Connect Freighter" }));
    await waitFor(() => expect(screen.getByTestId("connected").textContent).toBe("true"));

    expect(screen.getByTestId("mismatch").textContent).toBe("true");
  });

  it("exposes stubSpendableBalance when connected", async () => {
    vi.mocked(freighter.requestAccess).mockResolvedValueOnce({ address: "GABCDEFGHIJKLMNOPWXYZ" });
    vi.mocked(freighter.getAddress).mockResolvedValueOnce({ address: "GABCDEFGHIJKLMNOPWXYZ" });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValueOnce({
      network: "testnet",
      networkUrl: "",
      networkPassphrase: "",
    });

    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole("button", { name: "Connect Freighter" }));
    await waitFor(() => expect(screen.getByTestId("connected").textContent).toBe("true"));

    expect(screen.getByTestId("balance").textContent).toBe("10000.0000000");
  });

  it("sets error on connect failure", async () => {
    vi.mocked(freighter.requestAccess).mockRejectedValueOnce(new Error("Extension not found"));

    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole("button", { name: "Connect Freighter" }));

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("Extension not found");
    });
    expect(screen.getByTestId("connected").textContent).toBe("false");
  });

  it("throws when useWallet is used outside WalletProvider", () => {
    // Suppress React error boundary noise
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<WalletConsumer />)).toThrow(
      "useWallet must be used within a WalletProvider"
    );
    spy.mockRestore();
  });

  it("persists auto reconnect preference changes", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    expect(screen.getByTestId("autoReconnect").textContent).toBe("true");

    await user.click(
      screen.getByRole("button", { name: "Disable auto reconnect" }),
    );
    expect(screen.getByTestId("autoReconnect").textContent).toBe("false");
    expect(
      window.localStorage.getItem("stellarroute.wallet.autoReconnect"),
    ).toBe("false");

    await user.click(
      screen.getByRole("button", { name: "Enable auto reconnect" }),
    );
    expect(screen.getByTestId("autoReconnect").textContent).toBe("true");
    expect(
      window.localStorage.getItem("stellarroute.wallet.autoReconnect"),
    ).toBe("true");
  });

  it("auto reconnects on mount when preference is enabled and a wallet was previously used", async () => {
    window.localStorage.setItem("stellarroute.wallet.autoReconnect", "true");
    window.localStorage.setItem("stellarroute.wallet.lastWalletId", "freighter");

    vi.mocked(freighter.requestAccess).mockResolvedValueOnce({
      address: "GABCDEFGHIJKLMNOPWXYZ",
    });
    vi.mocked(freighter.getAddress).mockResolvedValueOnce({
      address: "GABCDEFGHIJKLMNOPWXYZ",
    });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValueOnce({
      network: "testnet",
      networkUrl: "",
      networkPassphrase: "",
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("connected").textContent).toBe("true");
    });
    expect(screen.getByTestId("walletId").textContent).toBe("freighter");
  });

  it("does not auto reconnect on mount when preference is disabled", async () => {
    window.localStorage.setItem("stellarroute.wallet.autoReconnect", "false");
    window.localStorage.setItem("stellarroute.wallet.lastWalletId", "freighter");

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("connected").textContent).toBe("false");
    });
    expect(freighter.requestAccess).not.toHaveBeenCalled();
  });

  it("recovers disconnected session when reconnect is triggered", async () => {
    window.localStorage.setItem("stellarroute.wallet.lastWalletId", "freighter");

    vi.mocked(freighter.requestAccess).mockResolvedValueOnce({
      address: "GABCDEFGHIJKLMNOPWXYZ",
    });
    vi.mocked(freighter.getAddress).mockResolvedValueOnce({
      address: "GABCDEFGHIJKLMNOPWXYZ",
    });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValueOnce({
      network: "testnet",
      networkUrl: "",
      networkPassphrase: "",
    });

    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole("button", { name: "Reconnect" }));

    await waitFor(() => {
      expect(screen.getByTestId("connected").textContent).toBe("true");
    });
    expect(screen.getByTestId("walletId").textContent).toBe("freighter");
  });
});
