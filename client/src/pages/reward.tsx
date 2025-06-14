import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useCustomWallet } from "@/context/CustomWallet";
import { useTwitterAuth } from "@/context/TwitterAuthContext";
import { useToast } from "@/hooks/use-toast";
import { getEnv } from "@/lib/env";
import { useSignTransaction, useSuiClient } from "@mysten/dapp-kit";
import { CoinMetadata } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle,
  Gift,
  Loader2,
  Wallet,
} from "lucide-react";
import { TbBrandX } from "react-icons/tb";
import { useEffect, useState } from "react";
import { claim } from "../lib/move/GiveRepClaim/giverep_claim/giverep-claim/functions";
import { ConnectWalletButton } from "../lib/wallet/ConnectWalletButton";

interface RewardData {
  id: number;
  project_id: number;
  project_name: string;
  project_logo: string | null;
  twitter_handle: string;
  twitter_id: number | null;
  token_type: string;
  amount: number;
  claimed: boolean;
  claimer: string | null;
  claimed_at: string | null;
  claim_transaction_digest: string | null;
  created_at: string;
  updated_at: string;
  status: "available" | "not_available" | "claimed";
  reason: string | null;
  contract_available: boolean;
  pool_object_id: string | null;
}

interface RewardsResponse {
  success: boolean;
  rewards: RewardData[];
  summary: {
    total: number;
    available: number;
    not_available: number;
    claimed: number;
  };
}

export default function RewardPage() {
  const { toast } = useToast();
  const {
    twitterIsLogin: isTwitterConnected,
    twitterUserName,
    handleTwitterLogin: connectTwitter,
    logoutTwitter: disconnectTwitter,
  } = useTwitterAuth();
  const { isConnected: isSuiConnected, address: suiAddress } =
    useCustomWallet();
  const suiClient = useSuiClient();

  const [coinMetadataMap, setCoinMetadataMap] = useState<
    Map<string, CoinMetadata>
  >(new Map());
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false);
  const [claimingRewardId, setClaimingRewardId] = useState<number | null>(null);

  // Format amounts using coin metadata
  const formatAmount = (amount: number, tokenType: string) => {
    const metadata = coinMetadataMap.get(tokenType);
    const decimals =
      metadata?.decimals || (tokenType.toLowerCase().includes("usdc") ? 6 : 9);
    const divisor = Math.pow(10, decimals);
    const formattedAmount = amount / divisor;
    return parseFloat(formattedAmount.toFixed(6)).toString();
  };

  const { mutateAsync: signTransaction } = useSignTransaction();

  // Check if user has already agreed to terms
  const { data: termsAgreement } = useQuery({
    queryKey: ['/api/legal-terms/check', twitterUserName, suiAddress],
    queryFn: async () => {
      if (!twitterUserName || !suiAddress) return null;
      
      const response = await fetch(
        `/api/legal-terms/check/${twitterUserName}/${suiAddress}`
      );
      if (!response.ok) throw new Error('Failed to check terms agreement');
      return response.json();
    },
    enabled: !!twitterUserName && !!suiAddress,
  });

  // Update hasAgreedToTerms state when termsAgreement changes
  useEffect(() => {
    if (termsAgreement?.hasAgreed) {
      setHasAgreedToTerms(true);
    }
  }, [termsAgreement]);

  // Mutation to record terms agreement
  const { mutate: recordTermsAgreement } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/legal-terms/agree', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userHandle: twitterUserName,
          walletAddress: suiAddress,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to record terms agreement');
      }
      
      return response.json();
    },
    onSuccess: () => {
      setHasAgreedToTerms(true);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to record agreement",
        variant: "destructive",
      });
    },
  });

  // Get coin display info
  const getCoinDisplay = (tokenType: string) => {
    const metadata = coinMetadataMap.get(tokenType);
    if (metadata) {
      return {
        symbol: metadata.symbol,
        name: metadata.name,
        iconUrl: metadata.iconUrl,
      };
    }
    // Fallback for common coins
    if (tokenType.toLowerCase().includes("usdc")) {
      return {
        symbol: "USDC",
        name: "USD Coin",
        iconUrl: "/images/coins/USDC.png", // Use local USDC icon
      };
    }
    if (tokenType.toLowerCase().includes("sui")) {
      return {
        symbol: "SUI",
        name: "Sui",
        iconUrl: "/images/coins/SUI.png", // Use local SUI icon
      };
    }
    return {
      symbol: tokenType.split("::").pop() || tokenType,
      name: tokenType,
      iconUrl: null,
    };
  };

  // Fetch user rewards when both accounts are connected
  const {
    data: rewardsData,
    isLoading: isLoadingRewards,
    refetch: refetchRewards,
  } = useQuery<RewardsResponse>({
    queryKey: ["/api/v1/loyalty-rewards/user-rewards", twitterUserName],
    queryFn: async () => {
      if (!twitterUserName) throw new Error("X account not connected");

      // Use POST request to bypass Cloudflare cache
      const response = await fetch(
        `/api/v1/loyalty-rewards/user-rewards`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            twitterHandle: twitterUserName,
          }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch rewards");
      }
      return response.json();
    },
    enabled: isTwitterConnected && !!twitterUserName,
  });

  const rewards: RewardData[] = rewardsData?.rewards || [];
  const availableRewards = rewards.filter(
    (reward) => reward.status === "available"
  );
  const claimedRewards = rewards.filter(
    (reward) => reward.status === "claimed"
  );

  // Fetch coin metadata for all unique coin types
  useEffect(() => {
    const fetchCoinMetadata = async () => {
      if (!rewards || rewards.length === 0) return;

      const uniqueCoinTypes = Array.from(
        new Set(rewards.map((r) => r.token_type).filter(Boolean))
      );
      const newMetadataMap = new Map<string, CoinMetadata>();

      for (const coinType of uniqueCoinTypes) {
        try {
          const metadata = await suiClient.getCoinMetadata({ coinType });
          if (metadata) {
            newMetadataMap.set(coinType, metadata);
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for ${coinType}:`, error);
        }
      }

      setCoinMetadataMap(newMetadataMap);
    };

    fetchCoinMetadata();
  }, [rewards, suiClient]);

  const handleConnectTwitter = async () => {
    try {
      await connectTwitter();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect X account",
        variant: "destructive",
      });
    }
  };


  const handleClaimReward = async (reward: RewardData) => {
    if (!isSuiConnected || !suiAddress) {
      toast({
        title: "Error",
        description: "Please connect your Sui Wallet first",
        variant: "destructive",
      });
      return;
    }
    
    // Check if user has agreed to terms
    if (!hasAgreedToTerms) {
      toast({
        title: "Error", 
        description: "Please agree to the terms first",
        variant: "destructive",
      });
      return;
    }
    
    if (!reward.pool_object_id) {
      toast({
        title: "Error",
        description: "No pool object id found",
        variant: "destructive",
      });
      return;
    }

    if (reward.amount === null || reward.amount === undefined) {
      toast({
        title: "Error",
        description: "Invalid reward amount",
        variant: "destructive",
      });
      return;
    }

    // Set loading state
    setClaimingRewardId(reward.id);

    try {
      const tx = new Transaction();

      claim(tx, reward.token_type, {
        pool: reward.pool_object_id as string,
        u64: BigInt(reward.amount),
      });

      // Get admin address with fallback for production
      const adminAddress = getEnv("VITE_ADMIN_SUI_WALLET_PUBLIC_ADDRESS", "0x02e48a5f5156b3db622be157065ea3e931a8e63de3dcc443869285c5518be79c");
      tx.setSender(adminAddress);
      tx.setGasOwner(suiAddress);

      const result = await signTransaction({
        transaction: tx,
      });
      const txBytes = result.bytes;
      const userSignature = result.signature;

      const response = await fetch(
        `/api/v1/loyalty-rewards/${reward.project_id}/contract/claim-reward`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transactionBytes: txBytes,
            userSignature: userSignature,
            twitterHandle: twitterUserName,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to claim reward");
      }

      // Show success toast with transaction digest
      toast({
        title: "Reward Claimed Successfully! 🎉",
        description: (
          <div className="space-y-2">
            <p>
              Successfully claimed {formatAmount(
                reward.amount,
                reward.token_type
              )} {getCoinDisplay(reward.token_type).symbol}!
            </p>
            <p className="text-sm">
              Transaction: {" "}
              <a 
                href={`https://suiscan.xyz/mainnet/tx/${data.digest}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {data.digest.slice(0, 8)}...{data.digest.slice(-6)}
              </a>
            </p>
          </div>
        ),
      });

      refetchRewards();
      setClaimingRewardId(null);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to claim reward",
        variant: "destructive",
      });
      setClaimingRewardId(null);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Your Rewards</h1>
          <p className="text-muted-foreground">
            Connect your accounts to view and claim your loyalty rewards
          </p>
        </div>

        {/* Connection Status Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TbBrandX className="h-5 w-5" />
                X (Twitter) Account
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between">
              {isTwitterConnected && twitterUserName ? (
                <div className="flex flex-col justify-between h-full">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <p>Connected as @{twitterUserName}</p>
                  </div>

                  <div className="flex items-center gap-2 w-full justify-center">
                    <button
                      onClick={disconnectTwitter}
                      className="text-primary-foreground bg-primary py-2 px-4 rounded-lg cursor-pointer"
                    >
                      Disconnect X
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between h-full">
                  <p className="text-muted-foreground mb-4">
                    Connect your X account
                  </p>
                  <Button onClick={handleConnectTwitter} className="w-full">
                    <TbBrandX className="mr-2 h-4 w-4" />
                    Connect X
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Sui Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between">
              <div className="flex flex-col justify-between h-full">
                <div className="flex items-center gap-2 mb-4">
                  {isSuiConnected ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <p>Connected</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Connect your Sui wallet</p>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full justify-center">
                  <ConnectWalletButton />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rewards Section */}
        {isTwitterConnected && twitterUserName ? (
          <div className="space-y-6">
            {isLoadingRewards ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <>
                {/* Summary - Always show */}
                {rewardsData?.summary && rewards.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold">
                          {rewardsData.summary.available}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Available
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold">
                          {rewardsData.summary.claimed}
                        </div>
                        <p className="text-xs text-muted-foreground">Claimed</p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Terms Agreement Section - Show after summary */}
                {rewards.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        Terms Agreement Required
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          To view and claim rewards, you must read and agree to our Reward Claim Terms.
                        </p>
                        
                        <div className="flex items-start space-x-2">
                          <Checkbox 
                            id="terms-top"
                            checked={hasAgreedToTerms}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                recordTermsAgreement();
                              } else {
                                setHasAgreedToTerms(false);
                              }
                            }}
                          />
                          <label 
                            htmlFor="terms-top" 
                            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            I have read and agree to the{" "}
                            <a href="/legal/loyalty-terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                              Reward Claim Terms
                            </a>
                          </label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Available Rewards - Only show when terms agreed */}
                {availableRewards.length > 0 && hasAgreedToTerms && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Gift className="h-5 w-5" />
                        Available Rewards ({availableRewards.length})
                      </CardTitle>
                      <CardDescription>
                        Claim your rewards individually
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {availableRewards.map((reward) => (
                          <div
                            key={reward.id}
                            className="p-4 border rounded-lg"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">
                                    {reward.project_name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="flex items-center gap-1"
                                  >
                                    {getCoinDisplay(reward.token_type)
                                      .iconUrl && (
                                      <img
                                        src={
                                          getCoinDisplay(reward.token_type)
                                            .iconUrl || ""
                                        }
                                        alt={
                                          getCoinDisplay(reward.token_type)
                                            .symbol
                                        }
                                        className="w-3 h-3"
                                      />
                                    )}
                                    {getCoinDisplay(reward.token_type).symbol}
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Amount:{" "}
                                  {formatAmount(
                                    reward.amount,
                                    reward.token_type
                                  )}{" "}
                                  {getCoinDisplay(reward.token_type).symbol}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClaimReward(reward);
                                }}
                                disabled={!isSuiConnected || !hasAgreedToTerms || claimingRewardId === reward.id}
                              >
                                {claimingRewardId === reward.id ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Claiming...
                                  </>
                                ) : (
                                  "Claim"
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}


                {/* Claimed Rewards - Only show when terms agreed */}
                {claimedRewards.length > 0 && hasAgreedToTerms && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        Claimed Rewards ({claimedRewards.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {claimedRewards.map((reward) => (
                          <div
                            key={reward.id}
                            className="p-4 border rounded-lg bg-muted/30"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">
                                    {reward.project_name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="flex items-center gap-1"
                                  >
                                    {getCoinDisplay(reward.token_type)
                                      .iconUrl && (
                                      <img
                                        src={
                                          getCoinDisplay(reward.token_type)
                                            .iconUrl || ""
                                        }
                                        alt={
                                          getCoinDisplay(reward.token_type)
                                            .symbol
                                        }
                                        className="w-3 h-3"
                                      />
                                    )}
                                    {getCoinDisplay(reward.token_type).symbol}
                                  </Badge>
                                  <Badge variant="secondary">Claimed</Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Amount:{" "}
                                  {formatAmount(
                                    reward.amount,
                                    reward.token_type
                                  )}{" "}
                                  {getCoinDisplay(reward.token_type).symbol}
                                </div>
                                {reward.claimer && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Claimed by:{" "}
                                    <a
                                      href={`https://suivision.xyz/account/${reward.claimer}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {reward.claimer.slice(0, 6)}...
                                      {reward.claimer.slice(-4)}
                                    </a>
                                  </div>
                                )}
                                {reward.claimed_at && (
                                  <div className="text-xs text-muted-foreground">
                                    Claimed on:{" "}
                                    {new Date(
                                      reward.claimed_at
                                    ).toLocaleDateString()}{" "}
                                    at{" "}
                                    {new Date(
                                      reward.claimed_at
                                    ).toLocaleTimeString()}
                                  </div>
                                )}
                                {reward.claim_transaction_digest && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Transaction:{" "}
                                    <a
                                      href={`https://suivision.xyz/txblock/${reward.claim_transaction_digest}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {reward.claim_transaction_digest.slice(0, 8)}...
                                      {reward.claim_transaction_digest.slice(-6)}
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* No Rewards */}
                {rewards.length === 0 && (
                  <Card>
                    <CardContent className="text-center py-8">
                      <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">
                        No Rewards Found
                      </h3>
                      <p className="text-muted-foreground">
                        You don't have any rewards yet. Keep engaging with
                        projects to earn rewards!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              Please connect your X account to view your rewards.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
