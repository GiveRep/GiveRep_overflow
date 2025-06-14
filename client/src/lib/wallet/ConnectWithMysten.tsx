// src/components/wallet/ConnectWithMysten.tsx
import { ConnectModal } from "@mysten/dapp-kit";
import { useEnokiFlow } from "@mysten/enoki/react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "react-toastify";

const ConnectWithMysten = ({ buttonClass = "", multiLine = false }) => {
  const t = (s: string) => s;
  const isSuiWallet =
    typeof window !== "undefined" && navigator.userAgent.includes("Sui-Wallet");
  const [showConnectModal, setShowConnectModal] = useState(false);

  const handleConnectError = (error: any) => {
    if (error) {
      toast.error(t("Cancelled"));
    }
  };

  const enokiFlow = useEnokiFlow();

  const handleEnokiSignIn = () => {
    const protocol = window.location.protocol;
    const host = window.location.host;
    const redirectUrl = `${protocol}//${host}/callback`;
    sessionStorage.setItem("enoki_success_redirect_url", window.location.href);
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

  const renderConnectButton = () => {};

  return (
    <div
      className={`${
        multiLine ? "" : "md:flex flex-row-reverse"
      } md:justify-center md:items-center`}
    >
      <div className="m-4 text-black">
        {" "}
        <ConnectModal
          // open={showConnectModal}
          trigger={
            <motion.button
              whileHover={{ scale: 1.1 }}
              id="connect-wallet-button"
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className={
                buttonClass ||
                "h-[45px] md:w-[150px] rounded-xl bg-primary font-semibold text-black p-3 w-full"
              }
            >
              {t("Connect Wallet")}
            </motion.button>
          }
          // onOpenChange={(open) => setShowConnectModal(open)}
          // onConnectError={handleConnectError}
        ></ConnectModal>
      </div>
      {false && !isSuiWallet && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="text-white m-4 p-3 bg-secondary rounded-xl flex items-center justify-center"
          onClick={handleEnokiSignIn}
        >
          <img
            src="/assets/icons/google-icon.png"
            alt={t("Enoki")}
            className="mr-2"
            width={20}
            height={20}
          />
          <div className="text-lg">{t("Login with Google")}</div>
        </motion.button>
      )}
    </div>
  );
};

export default ConnectWithMysten;
