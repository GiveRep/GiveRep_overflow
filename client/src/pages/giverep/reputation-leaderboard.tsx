import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fetchWithRetry, FetchError } from "@/lib/fetchService";
import { getWithRetry, isRateLimitError, getErrorMessage } from "@/utils/api";
import {
  getTwitterUserInfo,
  getTwitterUserInfoBatch,
  TwitterUserInfo,
} from "@/utils/twitterUserInfo";
import { Link, useLocation } from "wouter";
import { useSEO } from "@/hooks/use-seo";
import { getPageSEO } from "@/lib/seo-config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  TbStar,
  TbBrandX,
  TbRefresh,
  TbArrowRight,
  TbCheck,
  TbX,
  TbTrendingUp,
  TbPlus,
  TbBadge,
  TbChevronLeft,
  TbChevronRight,
  TbUserSearch,
  TbLoader2,
} from "react-icons/tb";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTwitterAuth } from "@/context/TwitterAuthContext";
import { Loader2 } from "lucide-react";
import { adminGet, adminPost, adminPut, adminDelete } from "@/utils/api";

interface InfluencerDetail {
  handle: string;
  profile_url?: string | null;
  profile_picture?: string | null;
  points?: number;
}

interface ReputationUser {
  handle: string;
  reputation: number;
  profile_url?: string | null;
  follower_count?: number | null;
  trusted_follower_count?: number | null;
  position: number; // Global position in leaderboard
  high_value_givers?: Array<{
    handle: string;
    profile_url?: string | null;
    profile_picture?: string | null;
  }>;
  is_verified?: boolean; // GiveRep verified
  isVerified?: boolean; // Alternative name for GiveRep verified
  isTwitterVerified?: boolean; // Twitter verified (legacy)
  is_twitter_verified?: boolean; // Alternative name for Twitter verified
  isBlueVerified?: boolean; // Twitter Blue verified
  is_blue_verified?: boolean; // Alternative name for Twitter Blue verified
  // All-time data
  all_time_reputation?: number;
  all_time_position?: number;
  // Influencer handles for different time periods
  influencers_last_7d?: string[];
  influencers_last_30d?: string[];
  influencers_last_90d?: string[];
  influencers_last_total?: string[];
}

interface ScanResult {
  scanId: number;
  tweetsProcessed: number;
  reputationAwarded: number;
  newUsers: number;
  status?: string;
  error?: string;
}

interface Keyword {
  id: number;
  keyword: string;
  description: string;
  points_awarded: number;
  active_date: string;
  is_active: boolean;
  created_at: string;
}

interface LeaderboardResponse {
  users: ReputationUser[];
  total: number;
}

interface InfluencerCategory {
  id: number;
  name: string;
  description?: string;
  visible: boolean;
}

export default function ReputationLeaderboard() {
  // SEO configuration
  useSEO(getPageSEO("leaderboard"));
  const { t } = useTranslation();

  const [adminPassword, setAdminPassword] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [selectedInfluencers, setSelectedInfluencers] = useState<
    InfluencerDetail[]
  >([]);
  const [influencerDialogOpen, setInfluencerDialogOpen] = useState(false);
  const [selectedUserHandle, setSelectedUserHandle] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [location, setLocation] = useLocation();
  const [isHighlightedUser, setIsHighlightedUser] = useState<string>("");
  const [currentUserData, setCurrentUserData] = useState<ReputationUser | null>(
    null
  );
  const [allTimeUserData, setAllTimeUserData] = useState<ReputationUser | null>(
    null
  );
  const [isLoadingUserData, setIsLoadingUserData] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [categorySearchTerm, setCategorySearchTerm] = useState<string>("");
  const [timeRange, setTimeRange] = useState<string>("7_days");
  const [influencerProfiles, setInfluencerProfiles] = useState<Map<string, TwitterUserInfo>>(new Map());
  const { twitterUserName } = useTwitterAuth();
  const entriesPerPage = 50; // Show 50 entries per page
  const { toast } = useToast();

  // Parse page and time range from URL on initial load
  useEffect(() => {
    const searchParams = new URLSearchParams(location.split("?")[1] || "");
    const pageParam = searchParams.get("page");
    const timeRangeParam = searchParams.get("timeRange");

    if (pageParam && !isNaN(Number(pageParam))) {
      setCurrentPage(Number(pageParam));
    }

    if (
      timeRangeParam &&
      ["7_days", "30_days", "90_days", "all_time"].includes(timeRangeParam)
    ) {
      setTimeRange(timeRangeParam);
    }
  }, []);

  // Update URL when page or time range changes
  useEffect(() => {
    const searchParams = new URLSearchParams(location.split("?")[1] || "");
    searchParams.set("page", currentPage.toString());
    searchParams.set("timeRange", timeRange);

    // Add timestamp to clear cache when needed
    const shouldRefresh = searchParams.get("fresh") === "true";
    if (shouldRefresh) {
      searchParams.set("_t", Date.now().toString());
    }

    setLocation(`/reputation-leaderboard?${searchParams.toString()}`);
  }, [currentPage, timeRange, setLocation]);

  // Fetch leaderboard data with pagination and time range
  const { data, isLoading, refetch, error, isError } =
    useQuery<LeaderboardResponse>({
      queryKey: ["/api/giverep/reputation/leaderboard", currentPage, timeRange],
      queryFn: async () => {
        try {
          const offset = (currentPage - 1) * entriesPerPage;
          console.log(
            `Fetching leaderboard data for page ${currentPage} (offset: ${offset}, limit: ${entriesPerPage}, timeRange: ${timeRange})`
          );

          // Add a timestamp to bust the cache when necessary
          const forceFresh =
            new URLSearchParams(location.split("?")[1] || "").get("fresh") ===
            "true"
              ? `&fresh=true&_t=${Date.now()}`
              : "";

          // Use fetchWithRetry with 429 handling to automatically retry rate limited requests
          const url = `/api/giverep/reputation/leaderboard?limit=${entriesPerPage}&offset=${offset}&includeTotal=true&timeRange=${timeRange}${forceFresh}`;
          const response = await fetchWithRetry(url, {
            credentials: "include",
          });

          if (!response.ok) {
            console.error(
              `Leaderboard API error: ${response.status} ${response.statusText}`
            );
            throw new FetchError(
              `Failed to fetch leaderboard data: ${response.statusText}`,
              response.status,
              response.statusText,
              await response.text()
            );
          }

          const data = await response.json();
          console.log(
            `Leaderboard data received:`,
            data?.users
              ? `${data.users.length} users, total: ${data.total}`
              : "No users array found"
          );

          // Validate received data structure
          if (!data || !data.users || !Array.isArray(data.users)) {
            console.error("Invalid leaderboard data format received:", data);
            throw new Error("Invalid data format received from server");
          }

          // Attempt to enrich data with Twitter profile information
          if (data.users && data.users.length > 0) {
            try {
              // Extract all Twitter handles for batch lookup
              const handles = data.users.map((user) => user.handle);
              
              // Also collect all influencer handles from all users
              const influencerHandles = new Set<string>();
              data.users.forEach(user => {
                if (user.influencers_last_90d && Array.isArray(user.influencers_last_90d)) {
                  user.influencers_last_90d.forEach(handle => influencerHandles.add(handle));
                }
              });
              
              // Combine user handles and influencer handles for batch lookup
              const allHandles = [...handles, ...Array.from(influencerHandles)];

              // Use our improved Twitter user info batch endpoint
              const twitterProfiles = await getTwitterUserInfoBatch(allHandles);

              // Enrich user data with Twitter profile information
              if (twitterProfiles.size > 0) {
                data.users = data.users.map((user) => {
                  const profile = twitterProfiles.get(
                    user.handle.toLowerCase()
                  );
                  if (profile) {
                    // Merge Twitter profile data with user data
                    return {
                      ...user,
                      profile_url:
                        profile.profile_image_url ||
                        profile.profile_url ||
                        user.profile_url,
                      profile_image_url:
                        profile.profile_image_url ||
                        profile.profile_url ||
                        user.profile_image_url ||
                        user.profile_url,
                      follower_count:
                        profile.follower_count || user.follower_count,
                      is_twitter_verified: profile.is_verified,
                      is_blue_verified: profile.is_blue_verified,
                    };
                  }
                  return user;
                });
              }
              
              // Store the enriched Twitter profiles globally for influencer display
              setInfluencerProfiles(twitterProfiles);
            } catch (err) {
              // Non-critical error, just log it
              console.warn(
                "Failed to enrich user data with Twitter profiles:",
                err
              );
            }
          }

          return data;
        } catch (err) {
          // Special handling for rate limit errors to make the message more user-friendly
          if (isRateLimitError(err)) {
            console.warn("Rate limit hit, retrying automatically...");
            toast({
              title: "Rate limit reached",
              description: "Request limit reached. Retrying automatically...",
              variant: "default",
            });
          } else {
            console.error("Error fetching leaderboard data:", err);
          }
          throw err;
        }
      },
      staleTime: 10 * 60 * 1000, // 10 minutes stale time to avoid unnecessary refetches
      // Using our custom retry logic for 429, so we can reduce React Query retries
      retry: 1,
      retryDelay: 3000, // Simple 3s delay for non-429 errors
    });

  // Fetch all influencers with their category information
  const { data: allInfluencersData, isLoading: influencersLoading } = useQuery({
    queryKey: ["/api/giverep/reputation/influencers", "enriched"],
    queryFn: async () => {
      try {
        console.log(
          `[Influencers Query] Fetching all influencers with categories`
        );
        const response = await fetchWithRetry(
          `/api/giverep/reputation/influencers`,
          {
            credentials: "include",
          }
        );

        if (!response.ok) {
          throw new FetchError(
            `Failed to fetch influencers: ${response.statusText}`,
            response.status,
            response.statusText,
            await response.text()
          );
        }

        const data = await response.json();

        // Get the influencers array from the response
        const rawInfluencersData = data.influencers || data || [];

        // Map the data from the new endpoint format to what the frontend expects
        const influencersData = rawInfluencersData.map((influencer: any) => ({
          ...influencer,
          twitter_handle: influencer.handle, // Map handle to twitter_handle
          profile_url: influencer.profileUrl, // Map profileUrl to profile_url
          follower_count: influencer.followerCount, // Map followerCount to follower_count
        }));

        // Enrich influencers data with Twitter profile information
        if (
          influencersData &&
          Array.isArray(influencersData) &&
          influencersData.length > 0
        ) {
          try {
            // Extract all Twitter handles for batch lookup
            const handles = influencersData.map(
              (influencer: any) => influencer.twitter_handle
            );

            // Use our improved Twitter user info batch endpoint
            const twitterProfiles = await getTwitterUserInfoBatch(handles);

            // Enrich influencer data with Twitter profile information
            if (twitterProfiles.size > 0) {
              const enrichedData = influencersData.map((influencer: any) => {
                const profile = twitterProfiles.get(
                  influencer.twitter_handle.toLowerCase()
                );
                if (profile) {
                  // Merge Twitter profile data with influencer data
                  return {
                    ...influencer,
                    profile_url:
                      profile.profile_image_url ||
                      profile.profile_url ||
                      influencer.profileUrl,
                    profile_image_url:
                      profile.profile_image_url ||
                      profile.profile_url ||
                      influencer.profileUrl,
                    follower_count:
                      profile.follower_count || influencer.follower_count,
                    is_verified: profile.is_verified,
                    is_blue_verified: profile.is_blue_verified,
                  };
                }
                return influencer;
              });

              console.log(
                `[Influencers Query] Received ${enrichedData.length} total influencers with categories and Twitter profiles`
              );
              return enrichedData;
            }
          } catch (enrichError) {
            // Non-critical error, just log it and return original data
            console.warn(
              "Failed to enrich influencers data with Twitter profiles:",
              enrichError
            );
          }
        }

        console.log(
          `[Influencers Query] Received ${influencersData.length} total influencers with categories (no Twitter enrichment)`
        );
        return influencersData;
      } catch (err) {
        // Special handling for rate limit errors
        if (isRateLimitError(err)) {
          console.warn(
            "Rate limit hit when fetching influencers, retrying automatically..."
          );
        } else {
          console.error("Error fetching influencers:", err);
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes stale time since we're fetching all at once
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Fetch influencer categories
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["/api/influencer-categories"],
    queryFn: async () => {
      try {
        const response = await fetchWithRetry(`/api/influencer-categories`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new FetchError(
            `Failed to fetch categories: ${response.statusText}`,
            response.status,
            response.statusText,
            await response.text()
          );
        }

        const data = await response.json();
        return data.categories || [];
      } catch (err) {
        console.error("Error fetching categories:", err);
        throw err;
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes stale time
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Filter influencers by selected categories
  const filteredInfluencers = React.useMemo(() => {
    if (!allInfluencersData || !Array.isArray(allInfluencersData)) {
      return [];
    }

    if (selectedCategories.length === 0) {
      return allInfluencersData;
    }

    return allInfluencersData.filter((influencer: any) => {
      return (
        influencer.influencerCategories &&
        influencer.influencerCategories.some((catId: number) =>
          selectedCategories.includes(catId)
        )
      );
    });
  }, [allInfluencersData, selectedCategories]);

  // Filter categories based on search term
  const filteredCategories = React.useMemo(() => {
    if (!categoriesData || !Array.isArray(categoriesData)) {
      return [];
    }

    if (!categorySearchTerm.trim()) {
      return categoriesData;
    }

    const searchTerm = categorySearchTerm.toLowerCase().trim();
    return categoriesData.filter((category: InfluencerCategory) => {
      const nameMatch = category.name.toLowerCase().includes(searchTerm);
      const descriptionMatch =
        category.description?.toLowerCase().includes(searchTerm) || false;
      return nameMatch || descriptionMatch;
    });
  }, [categoriesData, categorySearchTerm]);

  // Reset highlighted user when navigating between pages or when data changes
  useEffect(() => {
    // Only run this effect if we have data and a highlighted user
    if (data?.users && isHighlightedUser) {
      // Check if the highlighted user exists on the current page
      // If not on current page data, clear the highlight
      const userExists = data.users.some(
        (u) => u.handle.toLowerCase() === isHighlightedUser.toLowerCase()
      );

      if (!userExists) {
        setIsHighlightedUser("");
      }
    }
  }, [data, isHighlightedUser]);

  // Fetch user's position when they're logged in
  useEffect(() => {
    if (twitterUserName) {
      const fetchUserPosition = async () => {
        setIsLoadingUserData(true);
        try {
          // Fetch both current time range and all-time data in parallel
          const [currentResponse, allTimeResponse] = await Promise.all([
            fetchWithRetry(
              `/api/giverep/reputation/users/${twitterUserName}?timeRange=${timeRange}`,
              {
                credentials: "include",
              }
            ),
            // Only fetch all-time if current time range is not already all-time
            timeRange !== "all_time"
              ? fetchWithRetry(
                  `/api/giverep/reputation/users/${twitterUserName}?timeRange=all_time`,
                  {
                    credentials: "include",
                  }
                )
              : null,
          ]);

          if (currentResponse.ok) {
            const userData = await currentResponse.json();
            if (userData && userData.reputation) {
              // Enrich user data with Twitter profile information
              try {
                const twitterInfo = await getTwitterUserInfo(userData.handle);
                if (twitterInfo) {
                  // Merge Twitter profile info with user data
                  const enrichedUserData = {
                    ...userData,
                    profile_image_url:
                      twitterInfo.profile_image_url ||
                      userData.profile_image_url,
                    profile_url:
                      twitterInfo.profile_url || userData.profile_url,
                    display_name:
                      twitterInfo.display_name || userData.display_name,
                    username: twitterInfo.username || userData.username,
                  };
                  setCurrentUserData(enrichedUserData);
                  // If current is all-time, also set as all-time data
                  if (timeRange === "all_time") {
                    setAllTimeUserData(enrichedUserData);
                  }
                } else {
                  // If Twitter info fetch failed, use original data
                  setCurrentUserData(userData);
                  if (timeRange === "all_time") {
                    setAllTimeUserData(userData);
                  }
                }
              } catch (error) {
                console.warn(
                  "Failed to enrich current user data with Twitter info:",
                  error
                );
                // Use original data if enrichment fails
                setCurrentUserData(userData);
                if (timeRange === "all_time") {
                  setAllTimeUserData(userData);
                }
              }
            }
          } else {
            console.warn(
              `Received non-OK response for user position: ${currentResponse.status} ${currentResponse.statusText}`
            );
          }

          // Set all-time data for other time ranges
          if (
            timeRange !== "all_time" &&
            allTimeResponse &&
            allTimeResponse.ok
          ) {
            const allTimeData = await allTimeResponse.json();
            if (allTimeData && allTimeData.reputation) {
              // Enrich all-time data with Twitter profile information
              try {
                const twitterInfo = await getTwitterUserInfo(
                  allTimeData.handle
                );
                if (twitterInfo) {
                  const enrichedAllTimeData = {
                    ...allTimeData,
                    profile_image_url:
                      twitterInfo.profile_image_url ||
                      allTimeData.profile_image_url,
                    profile_url:
                      twitterInfo.profile_url || allTimeData.profile_url,
                    display_name:
                      twitterInfo.display_name || allTimeData.display_name,
                    username: twitterInfo.username || allTimeData.username,
                  };
                  setAllTimeUserData(enrichedAllTimeData);
                } else {
                  setAllTimeUserData(allTimeData);
                }
              } catch (error) {
                console.warn(
                  "Failed to enrich all-time user data with Twitter info:",
                  error
                );
                setAllTimeUserData(allTimeData);
              }
            }
          }
        } catch (error) {
          // Check if it's a rate limit error
          if (isRateLimitError(error)) {
            console.warn(
              "[Current User Data] Rate limit hit when fetching user position, retrying automatically..."
            );
          } else {
            console.error(
              "[Current User Data] Error fetching user position:",
              error
            );
          }
        } finally {
          console.log("[Current User Data] Setting loading state to false");
          setIsLoadingUserData(false);
        }
      };

      fetchUserPosition();
    } else {
      console.log("[Current User Data] No twitterUserName, clearing user data");
      setCurrentUserData(null);
      setAllTimeUserData(null);
      setIsLoadingUserData(false);
    }
  }, [twitterUserName, timeRange]);

  // Mutation to run the reputation scan
  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanCompleted(false);
      setScanResult(null);

      // Create a default result structure
      const defaultResult: ScanResult = {
        scanId: Date.now(),
        tweetsProcessed: 0,
        reputationAwarded: 0,
        newUsers: 0,
        status: "error",
        error: "Failed to communicate with the server",
      };

      try {
        console.log("Starting reputation scan...");

        // Make the request with a longer timeout (60 seconds) for Apify calls
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

        console.log("Sending API request to start scan");

        // Use admin API with timeout handling
        const result = await Promise.race([
          adminPost("/api/giverep/reputation/scan", adminPassword),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Request timeout")), 60000)
          ),
        ]).finally(() => clearTimeout(timeoutId));

        console.log("Scan result:", result);
        setScanResult(result);
        setScanCompleted(true);
        return result;
      } catch (error) {
        console.error("Scan operation failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Scan initiated",
        description: `Successfully started scan #${data.scanId}. It will process tweets in the background.`,
      });
      refetch();
      // Don't close dialog automatically - show success message
    },
    onError: (error: any) => {
      toast({
        title: "Scan failed",
        description:
          error.message || "An error occurred while running the scan",
        variant: "destructive",
      });
      setScanCompleted(true);
      setScanResult({
        scanId: -1,
        tweetsProcessed: 0,
        reputationAwarded: 0,
        newUsers: 0,
        status: "error",
        error: error.message || "Unknown error",
      });
    },
  });

  // Reset dialog state when closed
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setScanCompleted(false);
      setScanResult(null);
      setAdminPassword("");
    }
  };

  // Format follower numbers
  const formatNumber = (num: number | undefined | null) => {
    if (num === undefined || num === null) return "-";
    if (num === 0) return "0"; // Explicitly handle 0 case
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  // Handle opening the influencer dialog
  const showInfluencerDetails = (user: ReputationUser) => {
    if (user.influencers_last_90d && user.influencers_last_90d.length > 0) {
      setSelectedUserHandle(user.handle);
      // Map the influencer handles and add profile and multiplier information from allInfluencersData
      setSelectedInfluencers(
        user.influencers_last_90d.map((handle) => {
          // Find the influencer data
          const influencerData = allInfluencersData?.find(
            (inf: any) => inf.handle?.toLowerCase() === handle.toLowerCase()
          );
          const twitterProfile = influencerProfiles.get(handle.toLowerCase());

          return {
            handle: handle,
            profile_url: twitterProfile?.profile_image_url || influencerData?.profileUrl || influencerData?.profile_url || null,
            profile_picture: twitterProfile?.profile_image_url || influencerData?.profileUrl || influencerData?.profile_url || null,
            // Use the multiplier from influencers data, or default to 1
            points: influencerData?.multiplier || 1,
            multiplier: influencerData?.multiplier || 1,
          };
        })
      );
      setInfluencerDialogOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1 text-white">
            Reputation Leaderboard
          </h1>
          <p className="text-white/50 text-sm"></p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <Select
            value={timeRange}
            onValueChange={(value) => {
              setTimeRange(value);
              setCurrentPage(1); // Reset to first page when changing time range
            }}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs bg-[#1a1b29] border-[#2b2d3c] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2b2d3c] border-[#2b2d3c]">
              <SelectItem
                value="7_days"
                className="text-xs text-white hover:bg-[#3a3b4c]"
              >
                Last 7 days
              </SelectItem>
              <SelectItem
                value="30_days"
                className="text-xs text-white hover:bg-[#3a3b4c]"
              >
                Last 30 days
              </SelectItem>
              <SelectItem
                value="90_days"
                className="text-xs text-white hover:bg-[#3a3b4c]"
              >
                Last 90 days
              </SelectItem>
              <SelectItem
                value="all_time"
                className="text-xs text-white hover:bg-[#3a3b4c]"
              >
                All time
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Find My Position Button (Only show if logged in) */}
          {twitterUserName && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs bg-[#1a1b29] border-[#2b2d3c] text-white"
              onClick={async () => {
                if (!twitterUserName) {
                  toast({
                    title: "Not connected",
                    description:
                      "Please connect your Twitter account to find your position",
                    variant: "destructive",
                  });
                  return;
                }

                toast({
                  title: "Finding your position...",
                  description: "Searching for your position on the leaderboard",
                });

                try {
                  // Query the leaderboard to find the user's position with retry for rate limits
                  const response = await fetchWithRetry(
                    `/api/giverep/reputation/users/${twitterUserName}?timeRange=${timeRange}`,
                    {
                      credentials: "include",
                    }
                  );

                  if (!response.ok) {
                    throw new FetchError(
                      "Failed to find user position",
                      response.status,
                      response.statusText,
                      await response.text()
                    );
                  }

                  const userData = await response.json();
                  if (!userData || !userData.reputation) {
                    toast({
                      title: "No ranking found",
                      description:
                        "You're not currently ranked on the leaderboard",
                      variant: "destructive",
                    });
                    return;
                  }

                  const userPosition = userData.position || 0;
                  if (!userPosition) {
                    toast({
                      title: "No ranking found",
                      description:
                        "You're not currently ranked on the leaderboard",
                      variant: "destructive",
                    });
                    return;
                  }

                  const userPage = Math.ceil(userPosition / entriesPerPage);

                  // Set the highlighted user to emphasize their row in the table
                  setIsHighlightedUser(twitterUserName);

                  // Only navigate if we're not already on that page
                  if (userPage !== currentPage) {
                    setCurrentPage(userPage);
                  } else {
                    // If we're already on the correct page, refresh the data to ensure
                    // that the displayed positions match the notification
                    queryClient.invalidateQueries({
                      queryKey: [
                        "/api/giverep/reputation/leaderboard",
                        currentPage,
                        timeRange,
                      ],
                    });
                  }

                  toast({
                    title: "Position found",
                    description: `You're ranked #${
                      userPosition ? userPosition.toLocaleString() : "N/A"
                    } on the leaderboard`,
                  });
                } catch (error) {
                  console.error("Error finding user position:", error);

                  if (isRateLimitError(error)) {
                    toast({
                      title: "Rate Limit Reached",
                      description:
                        "We're experiencing high demand on our Twitter API. Please wait a moment and try again.",
                      variant: "destructive",
                    });
                  } else {
                    toast({
                      title: "Error finding position",
                      description:
                        "Failed to locate your position on the leaderboard",
                      variant: "destructive",
                    });
                  }
                }
              }}
            >
              <TbUserSearch className="mr-1 h-3 w-3" />
              Find my position
            </Button>
          )}
        </div>
      </div>

      {/* Influencers section with multi-select filter */}
      {allInfluencersData && allInfluencersData.length > 0 && (
        <div className="mb-6 bg-[#12131e] border border-[#2b2d3c] rounded-sm overflow-hidden shadow-lg">
          <div className="p-3 border-b border-[#2b2d3c] bg-[#1a1b29]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-white/90">
                  Influencers
                </h3>
                <span className="text-xs text-white/50">
                  {filteredInfluencers.length} influencer
                  {filteredInfluencers.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Multi-select category filter */}
              {categoriesData && categoriesData.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs bg-[#2b2d3c] border-[#2b2d3c] text-white hover:bg-[#3a3b4c]"
                    >
                      <TbPlus className="h-3 w-3 mr-1" />
                      Filter Categories
                      {selectedCategories.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="ml-2 h-4 px-1.5 text-[10px] bg-primary/20 text-primary border-0"
                        >
                          {selectedCategories.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-56 p-0 bg-[#2b2d3c] border-[#2b2d3c]"
                    align="end"
                  >
                    <div className="p-2">
                      <div className="text-xs font-medium text-white/90 mb-2 px-2">
                        Select Categories
                      </div>

                      {/* Search input */}
                      <div className="px-2 mb-2">
                        <Input
                          type="text"
                          placeholder="Search categories..."
                          value={categorySearchTerm}
                          onChange={(e) =>
                            setCategorySearchTerm(e.target.value)
                          }
                          className="h-7 text-xs bg-[#1a1b29] border-[#3a3b4c] text-white placeholder:text-white/40 focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {filteredCategories.length > 0 ? (
                          filteredCategories.map(
                            (category: InfluencerCategory) => (
                              <div
                                key={category.id}
                                className="flex items-center space-x-2 p-2 hover:bg-[#3a3b4c] rounded-sm"
                                onClick={() => {
                                  if (
                                    selectedCategories.includes(category.id)
                                  ) {
                                    setSelectedCategories((prev) =>
                                      prev.filter((id) => id !== category.id)
                                    );
                                  } else {
                                    setSelectedCategories((prev) => [
                                      ...prev,
                                      category.id,
                                    ]);
                                  }
                                }}
                              >
                                <Checkbox
                                  id={`category-${category.id}`}
                                  checked={selectedCategories.includes(
                                    category.id
                                  )}
                                  onCheckedChange={(checked) => {}}
                                  className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <div className="flex-1">
                                  <label
                                    htmlFor={`category-${category.id}`}
                                    className="text-xs text-white cursor-pointer block"
                                  >
                                    {category.name}
                                  </label>
                                  {category.description && (
                                    <div className="text-[10px] text-white/50 mt-0.5 cursor-pointer">
                                      {category.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          )
                        ) : (
                          <div className="p-3 text-center text-xs text-white/50">
                            No categories found matching "{categorySearchTerm}"
                          </div>
                        )}
                      </div>
                      {selectedCategories.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[#3a3b4c]">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCategories([])}
                            className="h-6 px-2 text-xs text-white/70 hover:text-white w-full"
                          >
                            Clear All
                          </Button>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Selected category tags */}
            {selectedCategories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedCategories.map((categoryId) => {
                  const category = categoriesData?.find(
                    (c) => c.id === categoryId
                  );
                  return category ? (
                    <Badge
                      key={categoryId}
                      variant="secondary"
                      className="h-6 px-2 text-xs bg-primary/20 text-primary border-0 hover:bg-primary/30"
                    >
                      {category.name}
                      <button
                        onClick={() =>
                          setSelectedCategories((prev) =>
                            prev.filter((id) => id !== categoryId)
                          )
                        }
                        className="ml-1 hover:text-primary/70"
                      >
                        <TbX className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Influencers grid with max 4 rows and scrolling */}
          <div className="p-3">
            {influencersLoading ? (
              <div className="p-6 flex items-center justify-center">
                <TbLoader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                <span className="text-white/70 text-sm">
                  Loading influencers...
                </span>
              </div>
            ) : filteredInfluencers.length > 0 ? (
              <div className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-1">
                  {filteredInfluencers.map((influencer: any, index: number) => (
                    <div
                      key={index}
                      className="p-2 flex items-center gap-2 hover:bg-[#1a1b29] transition-colors rounded-sm"
                    >
                      <a
                        href={`https://twitter.com/${influencer.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Avatar className="h-7 w-7 border border-[#2b2d3c] hover:border-primary transition-colors">
                          {influencer.profile_url ||
                          influencer.profile_image_url ? (
                            <AvatarImage
                              src={
                                influencer.profile_url ||
                                influencer.profile_image_url
                              }
                              alt={influencer.handle}
                            />
                          ) : null}
                          <AvatarFallback className="bg-[#1a1b29] text-[10px]">
                            {influencer.handle?.slice(0, 2)?.toUpperCase() ||
                              "??"}
                          </AvatarFallback>
                        </Avatar>
                      </a>

                      <div className="flex-1 min-w-0">
                        <a
                          href={`https://twitter.com/${influencer.handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white text-xs hover:text-primary transition-colors block truncate"
                        >
                          @{influencer.handle}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <span className="text-white/50 text-sm">
                  No influencers found in this category
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-white/70 text-sm mb-4">
        <ul className="list-disc pl-5 space-y-1">
          <li>{t("reputationLeaderboard.howItWorks.line1")}</li>
          <li>{t("reputationLeaderboard.howItWorks.line2")}</li>
          <li>{t("reputationLeaderboard.howItWorks.line3")}</li>
        </ul>
      </div>

      {/* User's current position - show when logged in and data is available */}
      {twitterUserName && (
        <div className="mb-4">
          {isLoadingUserData ? (
            <div className="bg-[#1a1b29] border border-[#2b2d3c] rounded-md p-4 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500 mr-2" />
              <span className="text-white/70 text-sm">
                Loading your position...
              </span>
            </div>
          ) : currentUserData ? (
            <div className="bg-[#1a1b29] border border-[#2b2d3c] rounded-md p-4 flex items-center justify-between">
              <div className="flex items-center">
                <Avatar className="h-10 w-10 mr-3">
                  {currentUserData.profile_image_url ||
                  currentUserData.profile_url ? (
                    <AvatarImage
                      src={
                        currentUserData.profile_image_url ||
                        currentUserData.profile_url
                      }
                      alt={currentUserData.handle}
                    />
                  ) : null}
                  <AvatarFallback className="bg-amber-500/20 text-amber-500">
                    {currentUserData.handle?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    {currentUserData.display_name && (
                      <span className="font-medium text-white text-md">
                        {currentUserData.display_name}
                      </span>
                    )}
                    <span className="text-white/70 text-sm">
                      @{currentUserData.handle}
                    </span>
                  </div>
                  <div className="text-white/50 text-sm">
                    Your current ranking:{" "}
                    <span className="text-amber-500 font-medium">
                      #
                      {currentUserData.position
                        ? currentUserData.position.toLocaleString()
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end">
                {/* Current time range reputation (gold) */}
                <div className="flex items-center text-white">
                  <div className="text-lg font-medium mr-2">
                    {currentUserData.reputation
                      ? currentUserData.reputation.toLocaleString()
                      : "0"}
                  </div>
                  <TbStar className="text-amber-500 h-5 w-5" />
                </div>
                {/* All-time reputation (silver) - only show if different from current */}
                {timeRange !== "all_time" && allTimeUserData && (
                  <div className="flex items-center text-white/60 mt-1">
                    <div className="text-sm mr-1">
                      {allTimeUserData.reputation
                        ? allTimeUserData.reputation.toLocaleString()
                        : "0"}
                    </div>
                    <TbStar className="text-white/40 h-4 w-4" />
                    <span className="text-xs text-white/40 ml-1">all time</span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Main leaderboard content */}
      <div className="bg-[#12131e] border border-[#2b2d3c] rounded-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2b2d3c] bg-[#1a1b29]">
              <th className="py-2 px-3 text-center font-medium text-white/70 w-12">
                #
              </th>
              <th className="py-2 px-3 text-left font-medium text-white/70">
                X Handle
              </th>
              <th className="py-2 px-3 text-center font-medium text-white/70 hidden md:table-cell">
                Influence
              </th>
              <th className="py-2 px-3 text-right font-medium text-white/70">
                Rep (Last{" "}
                {timeRange === "7_days"
                  ? "7 days"
                  : timeRange === "30_days"
                  ? "30 days"
                  : timeRange === "90_days"
                  ? "90 days"
                  : "All time"}
                )
              </th>
              <th className="py-2 px-3 text-right font-medium text-white/70 hidden lg:table-cell">
                Total Rep
              </th>
              <th className="py-2 px-3 text-right font-medium text-white/70 hidden xl:table-cell">
                Trusted Followers
              </th>
              <th className="py-2 px-3 text-right font-medium text-white/70 hidden sm:table-cell">
                Followers
              </th>
              <th className="py-2 px-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2b2d3c]">
            {isLoading ? (
              // Loading state
              Array(5)
                .fill(0)
                .map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="h-10 text-center">
                      <div className="flex items-center justify-center py-3">
                        <TbLoader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    </td>
                  </tr>
                ))
            ) : isError ? (
              // Error state
              <tr>
                <td colSpan={8} className="h-20 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    {isRateLimitError(error) ? (
                      // Rate limit specific error message
                      <>
                        <p className="text-amber-400">API Rate Limit Reached</p>
                        <p className="text-white/50 text-xs max-w-sm">
                          We're experiencing high demand on our Twitter API.
                          Please wait a moment and try again.
                        </p>
                      </>
                    ) : (
                      // General error message
                      <>
                        <p className="text-red-400">
                          Error loading reputation data
                        </p>
                        <p className="text-white/50 text-xs">
                          {getErrorMessage(error)}
                        </p>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Show toast to inform user we're retrying
                        toast({
                          title: "Retrying...",
                          description: "Fetching fresh leaderboard data",
                        });

                        // Add force-fresh parameter to URL
                        const searchParams = new URLSearchParams(
                          location.split("?")[1] || ""
                        );
                        searchParams.set("fresh", "true");
                        setLocation(
                          `/reputation-leaderboard?${searchParams.toString()}`
                        );

                        // Invalidate and refetch the data with stronger invalidation
                        queryClient.invalidateQueries({
                          queryKey: ["/api/giverep/reputation/leaderboard"],
                          refetchType: "all",
                        });
                        refetch();
                      }}
                      className="h-8 px-3 text-xs bg-[#1a1b29] border-[#2b2d3c] text-white mt-2"
                    >
                      <TbRefresh className="h-3 w-3 mr-1" />
                      Retry with fresh data
                    </Button>
                  </div>
                </td>
              </tr>
            ) : data?.users &&
              Array.isArray(data.users) &&
              data.users.length > 0 ? (
              // Success state with data
              <TooltipProvider>
                {data.users.map((user: ReputationUser, index: number) => (
                  <tr
                    key={index}
                    className={`hover:bg-[#1a1b29] transition-colors ${
                      isHighlightedUser &&
                      user.handle.toLowerCase() ===
                        isHighlightedUser.toLowerCase()
                        ? "bg-amber-500/20 hover:bg-amber-500/20 font-medium"
                        : ""
                    }`}
                  >
                    <td className="py-2 px-3 text-center text-white/50">
                      {/* Show API-provided position or place users with no reputation at the end */}
                      {
                        user.reputation > 0
                          ? (
                              user.position ||
                              index + 1 + (currentPage - 1) * entriesPerPage
                            )?.toLocaleString() || "0"
                          : data.total?.toLocaleString() ||
                            "0" /* If reputation is 0, show at the bottom using total users count */
                      }
                    </td>
                    <td className="py-2 px-3">
                      <Link
                        href={`/profile/${user.handle}`}
                        className="text-white hover:text-primary transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {user.profile_url || user.profile_image_url ? (
                          <Avatar className="h-4 w-4 rounded-full mr-1">
                            <AvatarImage
                              src={user.profile_url || user.profile_image_url}
                              alt={user.handle}
                              className="h-4 w-4 rounded-full mr-1"
                            />
                            <AvatarFallback>
                              <TbBrandX className="h-3 w-3 text-white/50" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <TbBrandX className="h-3 w-3 text-white/50 mr-1" />
                        )}
                        @{user.handle}
                        {/* Show GiveRep verification (white checkmark) */}
                        {(user.is_verified || user.isVerified) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="ml-1">
                                <TbCheck className="h-3 w-3 text-white inline-block bg-primary/50 rounded-full p-0.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              className="text-xs p-1 px-2"
                              side="top"
                            >
                              GiveRep Verified
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* Show Twitter Blue verification (blue checkmark) */}
                        {(user.isTwitterVerified ||
                          user.is_twitter_verified ||
                          user.isBlueVerified ||
                          user.is_blue_verified) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="ml-1">
                                <TbCheck className="h-3 w-3 text-white inline-block bg-blue-500 rounded-full p-0.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              className="text-xs p-1 px-2"
                              side="top"
                            >
                              Twitter Verified
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </Link>
                    </td>
                    <td className="py-2 px-3 hidden md:table-cell">
                      <div className="flex items-center justify-center gap-1">
                        {user.influencers_last_90d &&
                        user.influencers_last_90d.length > 0 ? (
                          <div className="flex items-center">
                            <div className="flex -space-x-2 mr-2">
                              {/* Show up to 5 avatars, sorted by multiplier (highest first) */}
                              {user.influencers_last_90d
                                // Map handles to influencer data and sort by multiplier
                                .map(handle => {
                                  const influencer = allInfluencersData?.find(
                                    (inf: any) => inf.handle?.toLowerCase() === handle.toLowerCase()
                                  );
                                  const twitterProfile = influencerProfiles.get(handle.toLowerCase());
                                  return {
                                    handle,
                                    profile_url: twitterProfile?.profile_image_url || influencer?.profileUrl || influencer?.profile_url,
                                    multiplier: influencer?.multiplier || 1
                                  };
                                })
                                // Sort by multiplier (highest first)
                                .sort((a, b) => b.multiplier - a.multiplier)
                                .slice(0, 5)
                                .map((giver, idx) => (
                                  <Tooltip key={idx}>
                                    <TooltipTrigger asChild>
                                      <Link
                                        href={`/profile/${giver.handle}`}
                                        className="block transition-transform hover:scale-110 hover:z-20 relative"
                                        style={{ zIndex: 5 - idx }}
                                      >
                                        <Avatar className="w-6 h-6 border border-[#2b2d3c] bg-[#1a1b29]">
                                          {giver.profile_url ? (
                                            <AvatarImage
                                              src={giver.profile_url}
                                              alt={giver.handle}
                                            />
                                          ) : null}
                                          <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
                                            {giver.handle
                                              .slice(0, 2)
                                              .toUpperCase()}
                                          </AvatarFallback>
                                        </Avatar>
                                      </Link>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      className="text-xs p-1 px-2"
                                      side="top"
                                    >
                                      @{giver.handle}
                                    </TooltipContent>
                                  </Tooltip>
                                ))}

                              {/* Show more indicator at the end */}
                              {user.influencers_last_90d.length > 5 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center cursor-pointer hover:border-primary/60 transition-colors relative"
                                      onClick={() =>
                                        showInfluencerDetails(user)
                                      }
                                    >
                                      <span className="text-[9px] text-white font-medium">
                                        +{user.influencers_last_90d.length - 5}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    className="text-xs p-1 px-2"
                                    side="top"
                                  >
                                    {user.influencers_last_90d.length - 5} more
                                    influencers
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>

                            {/* Only show View all button if there are more than 5 influencers */}
                            {user.influencers_last_90d.length > 5 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => showInfluencerDetails(user)}
                                className="h-6 px-2 py-0 text-[10px] rounded hover:bg-[#2b2d3c] hover:text-primary"
                              >
                                View all
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/20 text-xs">-</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-white">
                      {user.reputation?.toLocaleString() || "0"}
                    </td>
                    <td className="py-2 px-3 text-right text-white/50 hidden lg:table-cell">
                      {timeRange !== "all_time" && user.all_time_reputation
                        ? user.all_time_reputation.toLocaleString()
                        : timeRange === "all_time"
                        ? user.reputation?.toLocaleString() || "0"
                        : "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-white hidden xl:table-cell">
                      {user.trusted_follower_count || "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-white/50 hidden sm:table-cell">
                      {formatNumber(user.follower_count)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <Link
                        href={`/profile/${user.handle}`}
                        className="inline-flex items-center justify-center rounded hover:bg-[#2b2d3c] transition-colors px-2 py-1 text-xs text-white/70"
                      >
                        View
                        <TbArrowRight className="h-3 w-3 ml-0.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </TooltipProvider>
            ) : (
              <tr>
                <td colSpan={8} className="h-20 text-center text-white/50">
                  No reputation data found. Users need to be mentioned in tweets
                  with @giverep to gain reputation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {data && data.total > entriesPerPage && (
        <div className="flex justify-center mt-6">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0 text-xs bg-[#1a1b29] border-[#2b2d3c] text-white"
            >
              <TbChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous Page</span>
            </Button>

            <div className="text-xs text-white/70">
              Page {currentPage?.toLocaleString() || "1"} of{" "}
              {Math.ceil(
                (data?.total || 0) / entriesPerPage
              )?.toLocaleString() || "1"}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => prev + 1)}
              disabled={currentPage >= Math.ceil(data.total / entriesPerPage)}
              className="h-8 w-8 p-0 text-xs bg-[#1a1b29] border-[#2b2d3c] text-white"
            >
              <TbChevronRight className="h-4 w-4" />
              <span className="sr-only">Next Page</span>
            </Button>
          </div>
        </div>
      )}

      {/* Admin Scan Dialog - Only available from the leaderboard page */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="bg-[#12131e] border border-[#2b2d3c] text-white p-0 max-w-md">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-lg font-medium">
              Run Reputation Scan
            </DialogTitle>
            <DialogDescription className="text-white/50 text-xs">
              {scanCompleted ? (
                <>
                  Scan {scanResult?.status === "error" ? "failed" : "completed"}
                  .
                  {scanResult?.status !== "error" && (
                    <>
                      Processed{" "}
                      {scanResult?.tweetsProcessed
                        ? scanResult.tweetsProcessed.toLocaleString()
                        : "0"}{" "}
                      tweets, awarded{" "}
                      {scanResult?.reputationAwarded
                        ? scanResult.reputationAwarded.toLocaleString()
                        : "0"}{" "}
                      reputation points, and found{" "}
                      {scanResult?.newUsers
                        ? scanResult.newUsers.toLocaleString()
                        : "0"}{" "}
                      new users.
                    </>
                  )}
                </>
              ) : (
                <>
                  This will scan Twitter for mentions of @giverep and award
                  reputation points.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="p-4">
            {!scanCompleted ? (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="text-xs text-white/70 block mb-1"
                  >
                    Admin Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter admin password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="bg-[#1a1b29] border-[#2b2d3c] text-white text-sm"
                  />
                </div>

                <div className="text-xs text-white/50">
                  <p>The scan takes approximately 30-60 seconds to complete.</p>
                  <p className="mt-1">
                    Results will be reflected in the leaderboard upon
                    completion.
                  </p>
                </div>
              </div>
            ) : scanResult?.status === "error" ? (
              <div className="rounded-md bg-red-950/50 border border-red-800 p-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <TbX className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-400">
                      Scan Failed
                    </h3>
                    <div className="mt-2 text-xs text-red-300">
                      <p>{scanResult?.error || "Unknown error occurred"}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-green-950/50 border border-green-800 p-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <TbCheck className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-400">
                      Scan Completed
                    </h3>
                    <div className="mt-2 text-xs text-green-300">
                      <p>
                        Scan ID:{" "}
                        {scanResult?.scanId
                          ? scanResult.scanId.toLocaleString()
                          : "N/A"}
                      </p>
                      <p>
                        Tweets processed:{" "}
                        {scanResult?.tweetsProcessed
                          ? scanResult.tweetsProcessed.toLocaleString()
                          : "0"}
                      </p>
                      <p>
                        Reputation awarded:{" "}
                        {scanResult?.reputationAwarded
                          ? scanResult.reputationAwarded.toLocaleString()
                          : "0"}
                      </p>
                      <p>
                        New users:{" "}
                        {scanResult?.newUsers
                          ? scanResult.newUsers.toLocaleString()
                          : "0"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t border-[#2b2d3c]">
            {!scanCompleted ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialogOpen(false)}
                  className="h-8 px-3 text-xs text-white/70"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => scanMutation.mutate()}
                  disabled={!adminPassword || scanMutation.isPending}
                  className="h-8 px-3 text-xs"
                >
                  {scanMutation.isPending ? (
                    <>
                      <TbLoader2 className="h-3 w-3 animate-spin mr-1" />
                      Running...
                    </>
                  ) : (
                    <>
                      <TbRefresh className="h-3 w-3 mr-1" />
                      Run Scan
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => setDialogOpen(false)}
                className="h-8 px-3 text-xs"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Influencer Details Dialog */}
      <Dialog
        open={influencerDialogOpen}
        onOpenChange={setInfluencerDialogOpen}
      >
        <DialogContent className="bg-[#12131e] border border-[#2b2d3c] text-white p-0 max-w-md">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-lg font-medium">
              Influencers for @{selectedUserHandle}
            </DialogTitle>
            <DialogDescription className="text-white/50 text-xs">
              These high-value users have contributed to {selectedUserHandle}'s
              reputation score
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 max-h-[400px] overflow-y-auto">
            <div className="space-y-3">
              {selectedInfluencers.map((influencer, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 p-2 rounded-sm hover:bg-[#1a1b29] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-[#2b2d3c]">
                      {influencer.profile_url ? (
                        <AvatarImage
                          src={influencer.profile_url}
                          alt={influencer.handle}
                        />
                      ) : null}
                      <AvatarFallback className="bg-[#1a1b29] text-sm">
                        {influencer.handle.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div>
                      <div className="text-sm font-medium">
                        @{influencer.handle}
                      </div>
                      <div className="text-xs text-white/50">
                        {influencer.points
                          ? `${
                              influencer.points?.toLocaleString() || "0"
                            } points`
                          : "High-value influencer"}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/profile/${influencer.handle}`}
                    className="text-primary text-xs hover:text-primary/80 transition-colors flex items-center"
                  >
                    View
                    <TbArrowRight className="h-3 w-3 ml-0.5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-[#2b2d3c]">
            <Button
              onClick={() => setInfluencerDialogOpen(false)}
              className="bg-[#1a1b29] hover:bg-[#2b2d3c] text-white text-xs py-1.5 px-3 h-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
