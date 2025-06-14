import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface WalletProfileData {
  twitterHandle: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to check if a wallet address is associated with a Twitter profile
 * Returns the Twitter handle if found
 */
export function useWalletProfile(walletAddress: string | undefined): WalletProfileData {
  const [twitterHandle, setTwitterHandle] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['wallet-profile', walletAddress || ''],
    queryFn: async () => {
      if (!walletAddress) return null;
      
      try {
        // Try to fetch users by wallet address
        const response = await fetch(`/api/giverep/users?wallet_address=${walletAddress}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }
        
        const data = await response.json();
        return data;
      } catch (err) {
        console.error('Error fetching wallet profile:', err);
        throw err;
      }
    },
    enabled: !!walletAddress,
  });

  useEffect(() => {
    if (data && Array.isArray(data.users) && data.users.length > 0) {
      // Find a verified user with this wallet address
      const verifiedUser = data.users.find(
        (user: any) => user.is_verified && user.wallet_address === walletAddress
      );

      if (verifiedUser) {
        setTwitterHandle(verifiedUser.twitter_handle || null);
      } else {
        setTwitterHandle(null);
      }
    } else {
      setTwitterHandle(null);
    }
  }, [data, walletAddress]);

  return { twitterHandle, isLoading, error };
}