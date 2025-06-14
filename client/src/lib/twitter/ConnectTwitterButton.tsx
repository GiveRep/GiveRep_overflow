import { useTwitterAuth } from "@/context/TwitterAuthContext";
import { useCustomWallet } from "@/context/CustomWallet";
import { useWalletProfile } from "@/hooks/use-wallet-profile";
import { TbBrandX } from "react-icons/tb";

export function ConnectTwitterButton() {
  const { handleTwitterLogin, twitterIsLogin } = useTwitterAuth();
  const { isConnected, address } = useCustomWallet();
  const { twitterHandle: walletLinkedTwitter } = useWalletProfile(address);

  // If user is already logged in with Twitter, don't show any button
  if (twitterIsLogin) {
    return null;
  }
  
  // If wallet is connected with a linked Twitter account and we're not already logged in with Twitter,
  // don't show this button to avoid confusion. The user already has a Twitter account linked via wallet.
  if (isConnected && walletLinkedTwitter) {
    return null;
  }

  // Show the X connect button only when not logged in
  return (
    <button
      className="text-white bg-black h-[36px] px-3 sm:px-4 rounded cursor-pointer text-sm hover:bg-gray-900 transition-colors flex items-center justify-center flex-1 sm:flex-initial"
      onClick={() => handleTwitterLogin()}
    >
      <span className="flex items-center gap-1.5 sm:gap-2">
        <TbBrandX className="h-4 w-4" />
        <span className="hidden sm:inline">Connect</span>
        <span className="sm:hidden">Connect X</span>
      </span>
    </button>
  );
}