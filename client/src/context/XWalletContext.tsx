import {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from "react";
import { useTwitterAuth } from "./TwitterAuthContext";
import { getTwitterUserInfo, TwitterUserInfo } from "../utils/twitterUserInfo";

interface XWalletResponse {
  success: boolean;
  wallet?: {
    address: string;
    username: string;
  };
  message?: string;
}

interface XWalletContextType {
  wallet: {
    address: string;
    username: string;
  } | null;
  loading: boolean;
  error: string | null;
  refreshWallet: () => Promise<void>;
  connectingTwitter: boolean;
  setConnectingTwitter: (connecting: boolean) => void;
  userInfo: TwitterUserInfo | null;
}

const XWalletContext = createContext<XWalletContextType>({
  wallet: null,
  loading: false,
  error: null,
  refreshWallet: async () => {},
  connectingTwitter: false,
  setConnectingTwitter: () => {},
  userInfo: null,
});

export const useXWallet = () => useContext(XWalletContext);

interface XWalletProviderProps {
  children: ReactNode;
}

export const XWalletProvider = ({ children }: XWalletProviderProps) => {
  const [wallet, setWallet] = useState<{
    address: string;
    username: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectingTwitter, setConnectingTwitter] = useState(false);
  const [userInfo, setUserInfo] = useState<TwitterUserInfo | null>(null);
  const { twitterCookieIsReady, twitterUserName, twitterIsLogin } =
    useTwitterAuth();

  // Fetch Twitter user info
  useEffect(() => {
    async function fetchTwitterUserInfo() {
      if (!twitterUserName) {
        setUserInfo(null);
        return;
      }

      try {
        console.log(`[XWallet] Fetching Twitter user info for: ${twitterUserName}`);
        const info = await getTwitterUserInfo(twitterUserName);
        
        if (info) {
          console.log(`[XWallet] Twitter user info received for ${twitterUserName}:`, info);
          setUserInfo(info);
        } else {
          console.warn(`[XWallet] No Twitter user info found for ${twitterUserName}`);
          setUserInfo(null);
        }
      } catch (error) {
        console.error("[XWallet] Error fetching Twitter user info:", error);
        setUserInfo(null);
      }
    }

    if (twitterIsLogin && twitterCookieIsReady) {
      fetchTwitterUserInfo();
    } else {
      setUserInfo(null);
    }
  }, [twitterIsLogin, twitterCookieIsReady, twitterUserName]);

  const fetchWallet = async (): Promise<void> => {
    if (!twitterCookieIsReady || !twitterUserName) {
      console.log('[XWallet] No Twitter cookie or username, not fetching wallet');
      setWallet(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`[XWallet] Fetching wallet for: ${twitterUserName}`);
      const response = await fetch(
        `/api/xwallet/userWallet?twitterHandle=${encodeURIComponent(twitterUserName)}`
      );

      // Check if the response status is in the error range
      if (!response.ok) {
        console.error(`[XWallet] API error: ${response.status} ${response.statusText}`);
        throw new Error(`API returned error ${response.status}: ${response.statusText}`);
      }

      const data: XWalletResponse = await response.json();
      console.log("[XWallet] Wallet data received:", data);

      if (data.success && data.wallet) {
        console.log(`[XWallet] Setting wallet: ${data.wallet.address}`);
        setWallet(data.wallet);
      } else {
        console.log('[XWallet] No wallet data or success=false, clearing wallet');
        setWallet(null);
        if (data.message) {
          console.log(`[XWallet] Setting error: ${data.message}`);
          setError(data.message);
        }
      }
    } catch (err) {
      console.error("[XWallet] Error fetching wallet:", err);
      setWallet(null);
      setError("Failed to fetch wallet information. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (twitterIsLogin && twitterCookieIsReady) {
      // Initial fetch when component mounts (only once)
      fetchWallet();
      
      // No automatic refresh - removed interval
      // Users will need to manually refresh using the refresh button
      
      // No cleanup needed since we don't set up any interval
    } else {
      setWallet(null);
      setError(null);
    }
  }, [twitterIsLogin, twitterCookieIsReady]);

  return (
    <XWalletContext.Provider
      value={{
        wallet,
        loading,
        error,
        refreshWallet: fetchWallet,
        connectingTwitter,
        setConnectingTwitter,
        userInfo,
      }}
    >
      {children}
    </XWalletContext.Provider>
  );
};
