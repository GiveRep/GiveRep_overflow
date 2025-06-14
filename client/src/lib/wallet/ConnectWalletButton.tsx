import { AppContext } from "@/context/AppContext";
import { useCustomWallet } from "@/context/CustomWallet";
import { useContext, useState } from "react";
import { TbWallet } from "react-icons/tb";

export function ConnectWalletButton() {
  const { setWalletOpen } = useContext(AppContext);
  const { isConnected, address, disconnectWallet } = useCustomWallet();
  const [isHovering, setIsHovering] = useState(false);

  return (
    <>
      {!isConnected && (
        <button
          className="text-primary-foreground bg-primary h-[36px] px-3 sm:px-4 rounded cursor-pointer text-sm hover:bg-primary/90 transition-colors flex items-center justify-center flex-1 sm:flex-initial"
          onClick={() => setWalletOpen(true)}
        >
          <span className="flex items-center gap-1.5 sm:gap-2">
            <TbWallet className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Connect Wallet</span>
            <span className="sm:hidden">Connect Wallet</span>
          </span>
        </button>
      )}
      {isConnected && (
        <button
          className={`text-primary-foreground h-[36px] px-3 sm:px-4 rounded cursor-pointer text-sm transition-colors flex items-center justify-center flex-1 sm:flex-initial ${
            isHovering ? "bg-primary/90" : "bg-primary"
          }`}
          onClick={() => disconnectWallet()}
          onMouseEnter={() => {
            setIsHovering(true);
          }}
          onMouseLeave={() => setIsHovering(false)}
        >
          {isHovering
            ? "Disconnect"
            : `${address?.slice(0, 4)}...${address?.slice(-4)}`}
        </button>
      )}
    </>
  );
}
