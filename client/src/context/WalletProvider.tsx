// src/providers/WalletProvider.tsx
import React, { useEffect } from "react";
import { getFullnodeUrl } from "@mysten/sui/client";
import {
  SuiClientProvider,
  WalletProvider,
  lightTheme,
} from "@mysten/dapp-kit";

type Props = {
  children: React.ReactNode;
};

import { registerStashedWallet } from "@mysten/zksend";

export const SuiWalletProvider = ({ children }: Props) => {
  useEffect(() => {
    const isSuiWallet =
      typeof window !== "undefined" &&
      navigator.userAgent.includes("Sui-Wallet");

    if (!isSuiWallet) {
      registerStashedWallet("GiftDrop");
    }
  }, []);

  const networks = {
    localnet: { url: getFullnodeUrl("localnet") },
    devnet: { url: getFullnodeUrl("devnet") },
    testnet: { url: getFullnodeUrl("testnet") },
    mainnet: { url: getFullnodeUrl("mainnet") },
  };

  if (typeof window === "undefined") return <></>;
  return (
    <>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider
          theme={lightTheme}
          autoConnect={true}
          storage={localStorage as any}
          storageKey="sui-wallet"
          preferredWallets={["Sui Wallet"]}
        >
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </>
  );
};

export default SuiWalletProvider;
