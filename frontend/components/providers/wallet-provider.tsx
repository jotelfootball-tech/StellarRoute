'use client';

import * as React from 'react';
import {
  connectWallet,
  disconnectWallet,
  getAvailableWallets,
  refreshWalletSession,
} from '@/lib/wallet';
import type {
  AvailableWallet,
  SupportedWallet,
  WalletError,
  WalletNetwork,
  AccountSwitchState,
} from '@/lib/wallet/types';

interface WalletContextValue {
  address: string | null;
  isConnected: boolean;
  network: WalletNetwork;
  walletNetwork: WalletNetwork | null;
  walletId: SupportedWallet | null;
  availableWallets: AvailableWallet[];
  isLoading: boolean;
  error: WalletError | null;
  connect: (walletId: SupportedWallet) => Promise<void>;
  disconnect: () => void;
  setNetwork: (network: WalletNetwork) => void;
  refreshWallets: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  networkMismatch: boolean;
  stubSpendableBalance: string | null;
  accountSwitchState: AccountSwitchState;
  isTransactionPending: boolean;
  setTransactionPending: (pending: boolean) => void;
}

const WalletContext = React.createContext<WalletContextValue | undefined>(undefined);

interface WalletProviderProps {
  children: React.ReactNode;
  defaultNetwork?: WalletNetwork;
}

export function WalletProvider({
  children,
  defaultNetwork = 'testnet',
}: WalletProviderProps) {
  const [address, setAddress] = React.useState<string | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [network, setNetwork] = React.useState<WalletNetwork>(defaultNetwork);
  const [walletNetwork, setWalletNetwork] = React.useState<WalletNetwork | null>(null);
  const [walletId, setWalletId] = React.useState<SupportedWallet | null>(null);
  const [availableWallets, setAvailableWallets] = React.useState<AvailableWallet[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<WalletError | null>(null);
  const [accountSwitchState, setAccountSwitchState] = React.useState<AccountSwitchState>({
    isDetecting: false,
    hasChanged: false,
    previousAddress: null,
  });
  const [isTransactionPending, setIsTransactionPending] = React.useState(false);

  const refreshWallets = React.useCallback(async () => {
    const wallets = await getAvailableWallets();
    setAvailableWallets(wallets);
  }, []);

  React.useEffect(() => {
    void refreshWallets();
  }, [refreshWallets]);

  const connect = React.useCallback(async (selectedWalletId: SupportedWallet) => {
    // Prevent account switching during transactions
    if (isTransactionPending) {
      setError({ message: 'Cannot switch accounts during a pending transaction' });
      return;
    }

    setIsLoading(true);
    setError(null);
    setAccountSwitchState({
      isDetecting: false,
      hasChanged: false,
      previousAddress: null,
    });

    try {
      const session = await connectWallet(selectedWalletId);
      setAddress(session.address);
      setIsConnected(session.isConnected);
      setWalletNetwork(session.network ?? null);
      setWalletId(session.walletId);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Unknown error');
      setError({ message: e.message });
    } finally {
      setIsLoading(false);
    }
  }, [isTransactionPending]);

  const disconnect = React.useCallback(() => {
    // Prevent disconnection during transactions
    if (isTransactionPending) {
      setError({ message: 'Cannot disconnect during a pending transaction' });
      return;
    }

    const session = disconnectWallet();
    setAddress(session.address);
    setIsConnected(session.isConnected);
    setWalletNetwork(session.network ?? null);
    setWalletId(session.walletId);
    setError(null);
    setAccountSwitchState({
      isDetecting: false,
      hasChanged: false,
      previousAddress: null,
    });
  }, [isTransactionPending]);

  const refreshAccount = React.useCallback(async () => {
    if (!walletId || !isConnected) return;

    // Prevent account refresh during transactions
    if (isTransactionPending) {
      setError({ message: 'Cannot refresh account during a pending transaction' });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const session = await refreshWalletSession(walletId);
      const previousAddress = address;
      
      setAddress(session.address);
      setIsConnected(session.isConnected);
      setWalletNetwork(session.network ?? null);
      setWalletId(session.walletId);

      // Reset account switch state after successful refresh
      setAccountSwitchState({
        isDetecting: false,
        hasChanged: false,
        previousAddress: null,
      });

      // If address changed, this was an account switch
      if (previousAddress && session.address !== previousAddress) {
        // Trigger any necessary balance/quote refreshes here
        console.log('Account switched from', previousAddress, 'to', session.address);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Unknown error');
      setError({ message: e.message });
    } finally {
      setIsLoading(false);
    }
  }, [walletId, isConnected, address, isTransactionPending]);

  const networkMismatch = isConnected && walletNetwork !== null && walletNetwork !== network;
  const stubSpendableBalance = isConnected ? '10000.0000000' : null;

  const value: WalletContextValue = {
    address,
    isConnected,
    network,
    walletNetwork,
    walletId,
    availableWallets,
    isLoading,
    error,
    connect,
    disconnect,
    setNetwork,
    refreshWallets,
    refreshAccount,
    networkMismatch,
    stubSpendableBalance,
    accountSwitchState,
    isTransactionPending,
    setTransactionPending: React.useCallback((pending: boolean) => {
      setIsTransactionPending(pending);
    }, []),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = React.useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
