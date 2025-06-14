// src/contexts/CustomWallet.tsx
import { createContext, useContext, useState } from "react";

import {
  useEnokiFlow,
  useZkLogin,
  useZkLoginSession,
} from "@mysten/enoki/react";
import {
  useCurrentWallet,
  useCurrentAccount,
  useSignTransaction,
  useSignPersonalMessage,
  useDisconnectWallet,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useEffect, useMemo } from "react";

import { toast } from "react-toastify";
import {
  SuiTransactionBlockResponse,
  SuiTransactionBlockResponseOptions,
} from "@mysten/sui/client";
import { fromB64, toB64 } from "@mysten/sui/utils";
import axios, { AxiosResponse } from "axios";
import { ConvertAddress, ConvertAddressSuiNS } from "@/lib/ConvertAddress";
import { ToUint8Array } from "@/lib/ToUint8Array";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { checkSignatureDateValid } from "@/lib/signatureUtils";

export interface SponsorTxRequestBody {
  network: EnokiNetwork;
  txBytes: string;
  sender: string;
  allowedAddresses?: string[];
}

export type EnokiNetwork = "mainnet" | "testnet" | "devnet";
export interface CreateSponsoredTransactionApiResponse {
  bytes: string;
  digest: string;
}
export interface ExecuteSponsoredTransactionApiInput {
  digest: string;
  signature: string;
}

interface SponsorAndExecuteTransactionBlockProps {
  tx: Transaction;
  network: EnokiNetwork;
  options: SuiTransactionBlockResponseOptions;
  includesTransferTx: boolean;
  allowedAddresses?: string[];
}

interface ExecuteTransactionBlockWithoutSponsorshipProps {
  tx: Transaction;
  options: SuiTransactionBlockResponseOptions;
}

type UserRole = string;

interface CustomWalletContextProps {
  isConnected: boolean;
  isUsingEnoki: boolean;
  address?: string;
  jwt?: string;
  sponsorAndExecuteTransactionBlock: (
    props: SponsorAndExecuteTransactionBlockProps
  ) => Promise<SuiTransactionBlockResponse | void>;
  executeTransactionBlockWithoutSponsorship: (
    props: ExecuteTransactionBlockWithoutSponsorshipProps
  ) => Promise<SuiTransactionBlockResponse | void>;
  logout: () => void;
  disconnectWallet: () => void;
  redirectToAuthUrl: (role: UserRole) => void;
  handleEnokiSignIn: () => void;
  isSuiWallet: boolean;
  signTransaction: (bytes: Uint8Array) => Promise<string>;
  signAndExecuteTransaction: ({
    tx,
    options,
  }: {
    tx: Transaction;
    options?: SuiTransactionBlockResponseOptions;
  }) => Promise<SuiTransactionBlockResponse>;
  displayAddress: string;
  walletSignIn: () => Promise<{
    signInSignatureMessage: string;
    signInSignature: string;
  }>;
  signInSignature: string;
  getSignInSignature: () => Promise<{
    signInSignatureMessage: string;
    signInSignature: string;
  }>;
  checkSignatureDateValid: (signInSignature: string) => boolean;
  signInSignatureLoaded: boolean;
  signInSignatureMessage: string;
  clearSignInSignature: () => void;
}

export const useCustomWallet = () => {
  const context = useContext(CustomWalletContext);
  return context;
};

export const CustomWalletContext = createContext<CustomWalletContextProps>({
  isConnected: false,
  isUsingEnoki: false,
  address: undefined,
  jwt: undefined,
  sponsorAndExecuteTransactionBlock: async () => {},
  executeTransactionBlockWithoutSponsorship: async () => {},
  logout: () => {},
  disconnectWallet: () => {},
  redirectToAuthUrl: () => {},
  handleEnokiSignIn: () => {},
  isSuiWallet: false,
  signTransaction: async () => "",
  signAndExecuteTransaction: async () => {
    return {} as any;
  },
  displayAddress: "",
  walletSignIn: async () => {
    return {
      signInSignatureMessage: "",
      signInSignature: "",
    };
  },
  signInSignature: "",
  getSignInSignature: async () => {
    return {
      signInSignatureMessage: "",
      signInSignature: "",
    };
  },
  checkSignatureDateValid: () => false,
  signInSignatureLoaded: false,
  signInSignatureMessage: "",
  clearSignInSignature: () => {},
});

export const CustomWalletProvider = ({
  children,
}: {
  children: React.ReactNode | React.ReactNode[];
}) => {
  const currentWallet = useCurrentWallet();

  const suiClient = useSuiClient();
  const { address: enokiAddress } = useZkLogin();

  const zkLoginSession = useZkLoginSession();
  const enokiFlow = useEnokiFlow();

  const currentAccount = useCurrentAccount();
  const { isConnected: isWalletConnected } = useCurrentWallet();
  const { mutateAsync: signTransactionBlock } = useSignTransaction();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const { mutate: disconnect } = useDisconnectWallet();

  const [signInSignature, setSignInSignature] = useState<string>("");
  const [signInSignatureMessage, setSignInSignatureMessage] =
    useState<string>("");
  const [signInSignatureLoaded, setSignInSignatureLoaded] =
    useState<boolean>(false);
  const [signInWalletAddress, setSignInWalletAddress] = useState<string>("");

  useEffect(() => {
    if (signInSignature) {
      sessionStorage.setItem("signInSignature", signInSignature);
    }
  }, [signInSignature]);

  useEffect(() => {
    const signature = sessionStorage.getItem("signInSignature");
    const message = sessionStorage.getItem("signInSignatureMessage");
    if (signature && message) {
      if (checkSignatureDateValid(message)) {
        setSignInSignature(signature);
        setSignInSignatureMessage(message);
        verifyPersonalMessageSignature(ToUint8Array(message), signature).then(
          (publicKey) => {
            setSignInWalletAddress(publicKey.toSuiAddress());
          }
        );
      } else {
        sessionStorage.removeItem("signInSignature");
      }
    }
    setSignInSignatureLoaded(true);
  }, []);

  useEffect(() => {
    if (signInSignatureMessage) {
      sessionStorage.setItem("signInSignatureMessage", signInSignatureMessage);
    }
  }, [signInSignatureMessage]);

  const getSignInSignature = async (): Promise<{
    signInSignatureMessage: string;
    signInSignature: string;
  }> => {
    if (signInSignature && checkSignatureDateValid(signInSignatureMessage)) {
      return { signInSignatureMessage, signInSignature };
    }
    if (isUsingEnoki) {
      toast.error("This Feature Didn't support Sign In with Enoki Yet.");
      return { signInSignatureMessage: "", signInSignature: "" };
    }

    return await walletSignIn();
  };

  const walletSignIn = async () => {
    const now = new Date().toISOString();
    const message = `I'm using GiveRep at ${now} with wallet ${address}`;
    try {
      const res = await signMessage({ message: ToUint8Array(message) });
      if (!res?.signature) {
        throw new Error("Signature is required");
      }
      setSignInSignature(res.signature);
      setSignInSignatureMessage(message);
      return {
        signInSignatureMessage: message,
        signInSignature: res.signature,
      };
    } catch (err) {
      toast.error(
        "You need to sign a message to proof your wallet ownership to use this feature."
      );
      throw err;
    }
  };

  const isSuiWallet =
    typeof window !== "undefined" && navigator.userAgent.includes("Sui-Wallet");

  const { isConnected, isUsingEnoki, address, logout } = useMemo(() => {
    return {
      isConnected: !!enokiAddress || isWalletConnected,
      isUsingEnoki: !!enokiAddress,
      address: enokiAddress || currentAccount?.address,
      logout: () => {
        if (isUsingEnoki) {
          enokiFlow.logout();
        } else {
          disconnect();
          sessionStorage.clear();
        }
      },
    };
  }, [
    enokiAddress,
    currentAccount?.address,
    enokiFlow,
    isWalletConnected,
    disconnect,
  ]);

  const [displayAddress, setDisplayAddress] = useState("");
  useEffect(() => {
    if (address) {
      ConvertAddressSuiNS(address).then((addr) =>
        setDisplayAddress(ConvertAddress(addr))
      );
    }
  }, [address]);

  useEffect(() => {
    if (address && signInWalletAddress !== address) {
      setSignInSignature("");
      setSignInSignatureMessage("");
      sessionStorage.removeItem("signInSignature");
      sessionStorage.removeItem("signInSignatureMessage");
    }
  }, [signInWalletAddress, address]);

  const redirectToAuthUrl = (userRole: UserRole) => {
    const protocol = window.location.protocol;
    const host = window.location.host;
    const customRedirectUri = `${protocol}//${host}/auth`;
    enokiFlow
      .createAuthorizationURL({
        provider: "google",
        network: "mainnet",
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        redirectUrl: customRedirectUri,
        extraParams: {
          scope: ["openid", "email", "profile"],
        },
      })
      .then((url) => {
        sessionStorage.setItem("userRole", userRole);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to generate auth URL");
      });
  };

  const signTransaction = async (bytes: Uint8Array): Promise<string> => {
    if (isUsingEnoki) {
      const signer = await enokiFlow.getKeypair({
        network: "mainnet" as any,
      });
      const signature = await signer.signTransaction(bytes);
      return signature.signature;
    }
    const txBlock = Transaction.from(bytes);
    return signTransactionBlock({
      transaction: txBlock,
      chain: `sui:${"mainnet"}`,
    }).then((resp) => resp.signature);
  };

  const signAndExecuteTransaction = async ({
    tx,
    options,
  }: {
    tx: Transaction;
    options?: SuiTransactionBlockResponseOptions;
  }) => {
    tx.setSender(address!);
    const transactionBlock = await tx.build({ client: suiClient });
    const signature = await signTransaction(transactionBlock);
    return suiClient.executeTransactionBlock({
      transactionBlock,
      signature,
      options,
    });
  };

  const sponsorAndExecuteTransactionBlock = async ({
    tx,
    network,
    options,
    includesTransferTx,
    allowedAddresses = [],
  }: SponsorAndExecuteTransactionBlockProps): Promise<SuiTransactionBlockResponse | void> => {
    if (!isConnected) {
      toast.error("Wallet is not connected");
      return;
    }
    try {
      let digest = "";
      if (!isUsingEnoki || includesTransferTx) {
        const txBytes = await tx.build({
          client: suiClient,
          onlyTransactionKind: true,
        });
        const sponsorTxBody: SponsorTxRequestBody = {
          network,
          txBytes: toB64(txBytes),
          sender: address!,
          allowedAddresses,
        };
        const sponsorResponse: AxiosResponse<CreateSponsoredTransactionApiResponse> =
          await axios.post("/api/sponsor", sponsorTxBody);
        const { bytes, digest: sponsorDigest } = sponsorResponse.data;
        const signature = await signTransaction(fromB64(bytes));
        const executeSponsoredTxBody: ExecuteSponsoredTransactionApiInput = {
          signature,
          digest: sponsorDigest,
        };
        const executeResponse: AxiosResponse<{ digest: string }> =
          await axios.post("/api/execute", executeSponsoredTxBody);
        digest = executeResponse.data.digest;
      } else {
        const response = await enokiFlow.sponsorAndExecuteTransaction({
          network: "mainnet" as any,
          transaction: tx as any,
          client: suiClient as any,
        });
        digest = response.digest;
      }
      await suiClient.waitForTransaction({ digest, timeout: 5_000 });
      return suiClient.getTransactionBlock({
        digest,
        options,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to sponsor and execute transaction block");
    }
  };

  const executeTransactionBlockWithoutSponsorship = async ({
    tx,
    options,
  }: ExecuteTransactionBlockWithoutSponsorshipProps): Promise<SuiTransactionBlockResponse | void> => {
    if (!isConnected) {
      toast.error("Wallet is not connected");
      return;
    }
    tx.setSender(address!);
    const txBytes = await tx.build({ client: suiClient });
    let signature = "";
    let error = null;
    setTimeout(async () => {
      try {
        signature = await signTransaction(txBytes);
      } catch (e) {
        error = e;
      }
    }, 10);
    while (signature === "") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (error) {
        throw error;
      }
    }
    return suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: signature!,
      requestType: "WaitForLocalExecution",
      options,
    });
  };

  const handleEnokiSignIn = () => {
    const protocol = window.location.protocol;
    const host = window.location.host;
    const redirectUrl = `${protocol}//${host}/callback`;
    enokiFlow
      .createAuthorizationURL({
        provider: "google",
        network: "mainnet",
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        redirectUrl,
        extraParams: {
          scope: ["openid", "email", "profile"],
        },
      })
      .then((url) => {
        window.location.href = url;
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const clearSignInSignature = () => {
    setSignInSignature("");
    setSignInSignatureMessage("");
    sessionStorage.removeItem("signInSignature");
    sessionStorage.removeItem("signInSignatureMessage");
  };

  const disconnectWallet = () => {
    disconnect();
    setSignInSignature("");
    setSignInSignatureMessage("");
    sessionStorage.removeItem("signInSignature");
    sessionStorage.removeItem("signInSignatureMessage");
  };

  return (
    <CustomWalletContext.Provider
      value={{
        isConnected,
        isUsingEnoki,
        address,
        jwt: zkLoginSession?.jwt,
        sponsorAndExecuteTransactionBlock,
        executeTransactionBlockWithoutSponsorship,
        logout,
        disconnectWallet,
        redirectToAuthUrl,
        handleEnokiSignIn,
        isSuiWallet,
        signTransaction,
        signAndExecuteTransaction,
        displayAddress,
        walletSignIn,
        signInSignature,
        getSignInSignature,
        checkSignatureDateValid,
        signInSignatureLoaded,
        signInSignatureMessage,
        clearSignInSignature,
      }}
    >
      {children}
    </CustomWalletContext.Provider>
  );
};
