import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTwitterAuth } from "@/context/TwitterAuthContext";
import { useSEO } from "@/hooks/use-seo";
import { getPageSEO } from "@/lib/seo-config";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import ProjectLeaderboardView from "@/components/giverep/ProjectLeaderboardView";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Format large numbers with K/M suffixes
const formatNumber = (num: number | null | undefined): string => {
  // Handle invalid numbers, null, or undefined
  const value = Number(num);
  if (!isFinite(value) || isNaN(value)) {
    return '0';
  }
  
  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + 'M';
  } else if (value >= 1000) {
    return (value / 1000).toFixed(2) + 'k';
  }
  return value.toString();
};
import { isRateLimitError, getErrorMessage } from "@/utils/errorHandler";
import { fetchWithRetry, FetchError } from "@/lib/fetchService";
import {
  getTwitterUserInfo,
  getTwitterUserInfoBatch,
  TwitterUserInfo,
} from "@/utils/twitterUserInfo";

import {
  LoyaltyProject,
  LoyaltyMember,
  LeaderboardEntry,
  ProjectTag,
} from "../../types/loyalty";

// Helper function to get CSS class for creator score based on the score value
function getCreatorScoreColorClass(score: number): string {
  // Hot to cold gradient color scheme (higher score = more green/blue, lower = more red)
  if (score >= 900) return "text-blue-400"; // Exceptional (Cool Blue)
  if (score >= 800) return "text-emerald-400"; // Excellent (Emerald)
  if (score >= 700) return "text-green-400"; // Very Good (Green)
  if (score >= 600) return "text-teal-400"; // Good (Teal)
  if (score >= 500) return "text-lime-400"; // Above Average (Lime)
  if (score >= 400) return "text-yellow-400"; // Average (Yellow)
  if (score >= 300) return "text-amber-400"; // Below Average (Amber)
  if (score >= 200) return "text-orange-400"; // Poor (Orange)
  if (score >= 100) return "text-red-400"; // Very Poor (Red)
  return "text-rose-600"; // Extremely Poor (Deep Red)
}
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { DateTimeRangePicker } from "@/components/ui/date-time-range-picker";
import {
  TbStar,
  TbStarFilled,
  TbPlus,
  TbArrowUp,
  TbArrowRight,
  TbBrandTwitter,
  TbBrandX,
  TbEye,
  TbHeart,
  TbThumbUp,
  TbMessageCircle,
  TbRepeat,
  TbSearch,
  TbCalendar,
  TbRefresh,
  TbFilterOff,
  TbFilter,
  TbTags,
  TbExternalLink,
  TbX,
  TbCheck,
  TbLogout,
  TbChevronLeft,
  TbChevronRight,
  TbChevronDown,
  TbChevronUp,
  TbInfoCircle,
  TbLoader2,
} from "react-icons/tb";

export default function LoyaltyPage() {
  // SEO configuration
  useSEO(getPageSEO('loyalty'));
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    twitterUserName: twitterHandle,
    twitterIsLogin,
    syncTwitterSession,
  } = useTwitterAuth();

  const [searchProject, setSearchProject] = useState<string>("");
  const [leaderboardDialogOpen, setLeaderboardDialogOpen] =
    useState<boolean>(false);
  const [selectedProject, setSelectedProject] = useState<LoyaltyProject | null>(
    null
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [userTweets, setUserTweets] = useState<Record<string, any>>({});
  const [mindshareProjectId, setMindshareProjectId] = useState<number | null>(null);
  const [tweetsSortBy, setTweetsSortBy] = useState<'engagement' | 'views' | 'date'>('engagement');
  const [tweetUserInfo, setTweetUserInfo] = useState<Map<string, TwitterUserInfo>>(new Map());
  const [displayedTweetsCount, setDisplayedTweetsCount] = useState<number>(10);
  const TWEETS_PER_PAGE = 10;

  // Date range state for filtering leaderboard data - default to last 30 days
  const getLastMonthDate = () => {
    // Get the current date and go back 30 days
    const now = new Date();
    // Use UTC date to avoid timezone issues
    const thirtyDaysAgo = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 30,
        12,
        0,
        0 // Use noon UTC to avoid any day boundary issues
      )
    );
    return format(thirtyDaysAgo, "yyyy-MM-dd");
  };

  const getCurrentDate = () => {
    // Get current date in UTC to avoid timezone issues
    const now = new Date();
    const today = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        12,
        0,
        0 // Use noon UTC to avoid any day boundary issues
      )
    );
    console.log(
      "Current UTC date:",
      today.toISOString(),
      "Local Time:",
      today.toString()
    );

    return format(today, "yyyy-MM-dd");
  };

  // This is our "today" reference for the calendar
  const today = useMemo(() => {
    const now = new Date();
    // Return a date object with the time set to noon UTC
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        12,
        0,
        0
      )
    );
  }, []);

  // Initialize dates when the component mounts - today and last month
  const [startDate, setStartDate] = useState<string>(getLastMonthDate());
  const [endDate, setEndDate] = useState<string>(getCurrentDate());
  
  // Memoize the date objects to prevent unnecessary re-renders
  const startDateObj = useMemo(() => startDate ? new Date(startDate) : undefined, [startDate]);
  const endDateObj = useMemo(() => endDate ? new Date(endDate) : undefined, [endDate]);

  // Keep dates initialized using the helper functions

  // Sync Twitter session with the server when the component loads
  useEffect(() => {
    if (twitterIsLogin && twitterHandle) {
      console.log("Auto-syncing Twitter session on page load...");
      syncTwitterSession().then((success) => {
        if (success) {
          console.log("Twitter session synced successfully on page load");
        } else {
          console.warn("Failed to sync Twitter session on page load");
        }
      });
    }
  }, [twitterIsLogin, twitterHandle, syncTwitterSession]);

  // State for active vs inactive tab selection
  const [projectsTab, setProjectsTab] = useState<"active" | "inactive">(
    "active"
  );

  // State for tag filtering
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  // State for Twitter user info
  const [twitterUserInfo, setTwitterUserInfo] = useState<
    Map<string, TwitterUserInfo>
  >(new Map());

  // Helper function to get banner URL from Twitter user info only (no fallback to project.banner_url)
  const getBannerUrl = useCallback(
    (project: LoyaltyProject) => {
      if (!project) return null;
      const handle = project.twitter_handle?.replace("@", "").toLowerCase();
      const userInfo = handle ? twitterUserInfo.get(handle) : null;

      // Debug to understand what values we have
      if (project.id === 28) {
        // For example, debug one specific project
        console.log(`Project ${project.name} - Twitter handle: ${handle}`);
        console.log(`Twitter user info available: ${!!userInfo}`);
        console.log(`Twitter banner URL: ${userInfo?.banner_url || "null"}`);
        console.log(`Project banner URL: ${project.banner_url || "null"}`);
      }

      return userInfo?.banner_url || null; // Only use Twitter banner URL, no fallback
    },
    [twitterUserInfo]
  );

  // Fetch all loyalty projects (both active and inactive) - now without membership info
  const {
    data: allProjects,
    isLoading: projectsLoading,
    refetch: refetchProjects,
    error: projectsError,
    isError: isProjectsError,
  } = useQuery<LoyaltyProject[]>({
    queryKey: ["/api/loyalty/projects", "all"],
    queryFn: async () => {
      try {
        // Now using a simpler URL without the twitterHandle parameter - better caching
        const url = "/api/loyalty/projects?activeOnly=false";

        const response = await fetchWithRetry(url);

        if (!response.ok) {
          console.error(
            `Projects API error: ${response.status} ${response.statusText}`
          );
          throw new FetchError(
            `Failed to fetch loyalty projects: ${response.statusText}`,
            response.status,
            response.statusText,
            await response.text()
          );
        }

        return response.json();
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
          console.error("Error fetching loyalty projects:", err);
          toast({
            title: "Error loading projects",
            description: getErrorMessage(err),
            variant: "destructive",
          });
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes,
    enabled: true,
    retry: (failureCount, error) => {
      // If rate limited, retry after a delay
      if (isRateLimitError(error) && failureCount < 3) {
        return true;
      }
      return failureCount < 2;
    },
    retryDelay: 1000, // 1 second between retries
  });

  // Fetch all project tags
  const { data: projectTags, isLoading: tagsLoading } = useQuery<ProjectTag[]>({
    queryKey: ["/api/giverep/tags"],
    queryFn: async () => {
      try {
        const response = await fetchWithRetry("/api/giverep/tags");

        if (!response.ok) {
          throw new FetchError(
            `Failed to fetch project tags: ${response.statusText}`,
            response.status,
            response.statusText,
            await response.text()
          );
        }

        return response.json();
      } catch (err) {
        console.error("Error fetching project tags:", err);
        return []; // Return empty array on error
      }
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });

  // Fetch user memberships separately (only if user is logged in)
  // Use POST method to avoid any caching from CDN, proxies, or middleware
  const { data: userMemberships, isLoading: membershipsLoading } = useQuery<
    { projectId: number }[]
  >({
    queryKey: ["/api/loyalty/user-memberships", twitterHandle],
    queryFn: async () => {
      try {
        // Using POST method to avoid any caching from CDN or proxies
        const response = await fetch("/api/loyalty/user-memberships", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          // No body needed, authentication is done via session cookie
          credentials: "same-origin",
        });

        if (!response.ok) {
          // If unauthorized, just return empty array (user not logged in)
          if (response.status === 401) {
            return [];
          }

          throw new FetchError(
            `Failed to fetch user memberships: ${response.statusText}`,
            response.status,
            response.statusText,
            await response.text()
          );
        }

        return response.json();
      } catch (err) {
        console.error("Error in user memberships query:", err);
        return []; // Return empty array on error
      }
    },
    enabled: !!twitterIsLogin && !!twitterHandle, // Only run if user is logged in
    retry: (failureCount, error) => {
      // If rate limited, retry after a delay
      if (isRateLimitError(error) && failureCount < 3) {
        return true;
      }
      return failureCount < 2;
    },
    retryDelay: 1000, // 1 second between retries
    // Shorter staleTime to refresh more often
    staleTime: 5000, // 5 seconds
  });

  // Fetch Twitter user info for all projects
  useEffect(() => {
    if (!projectsLoading && allProjects && allProjects.length > 0) {
      // Extract all Twitter handles
      const handles = allProjects
        .filter((project) => project.twitter_handle)
        .map((project) =>
          project.twitter_handle!.replace("@", "").toLowerCase()
        );

      if (handles.length > 0) {
        // Fetch Twitter user info in batch
        getTwitterUserInfoBatch(handles)
          .then((userInfoMap) => {
            // Update state with fetched info
            setTwitterUserInfo(userInfoMap);
          })
          .catch((error) => {
            console.error("Error fetching Twitter user info:", error);
          });
      }
    }
  }, [allProjects, projectsLoading]);

  // Check URL parameters on component mount to open project view if specified
  useEffect(() => {
    // Only run this effect once projects are loaded
    if (!projectsLoading && allProjects && allProjects.length > 0) {
      const searchParams = new URLSearchParams(window.location.search);
      const viewParam = searchParams.get("view");

      if (viewParam) {
        const projectId = parseInt(viewParam, 10);

        // Find the project with the matching ID
        const projectToView = allProjects.find((p) => p.id === projectId);

        if (projectToView) {
          // Open the dialog with the selected project
          setSelectedProject(projectToView);
          setEndDate(getCurrentDate());
          setLeaderboardDialogOpen(true);

          // If it's an inactive project, switch to the inactive tab
          if (!projectToView.is_active) {
            setProjectsTab("inactive");
          }
        }
      }
    }
  }, [projectsLoading, allProjects]);

  // Initialize tag filters from URL parameters on mount
  // This allows sharing filtered views via URL (e.g., /giverep/loyalty?tags=1,2,3)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tagsParam = searchParams.get("tags");
    
    if (tagsParam) {
      // Parse comma-separated tag IDs from URL
      const tagIds = tagsParam.split(",").map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (tagIds.length > 0) {
        setSelectedTagIds(tagIds);
      }
    }
  }, []); // Run only once on mount

  // Update URL when tags change to maintain shareable links
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;
    
    if (selectedTagIds.length > 0) {
      // Add tags parameter to URL
      searchParams.set("tags", selectedTagIds.join(","));
    } else {
      // Remove tags parameter if no tags selected
      searchParams.delete("tags");
    }
    
    // Update URL without reloading the page
    const newUrl = `${currentUrl.pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [selectedTagIds]);

  // Combine projects with user membership data and apply filters
  const projects = useMemo(() => {
    if (!allProjects) return [];

    // First filter by active/inactive state
    let filteredProjects = allProjects.filter((project) =>
      projectsTab === "active" ? project.is_active : !project.is_active
    );

    // Then filter by tags if any are selected
    if (selectedTagIds.length > 0) {
      filteredProjects = filteredProjects.filter((project) => {
        // If the project has tag_ids and at least one matches the selected tags
        return (
          project.tag_ids &&
          project.tag_ids.some((tagId) => selectedTagIds.includes(tagId))
        );
      });
    }

    // If user is logged in and we have membership data, merge it with projects
    if (twitterIsLogin && userMemberships) {
      // Create a Set of project IDs the user is a member of for O(1) lookups
      const membershipSet = new Set(userMemberships.map((m) => m.projectId));

      // Add isUserMember property to each project
      return filteredProjects.map((project) => ({
        ...project,
        isUserMember: membershipSet.has(project.id),
      }));
    }

    // If not logged in or no membership data, just mark all as not joined
    return filteredProjects.map((project) => ({
      ...project,
      isUserMember: false,
    }));
  }, [
    allProjects,
    projectsTab,
    userMemberships,
    twitterIsLogin,
    selectedTagIds,
  ]);

  // State for pagination and search
  const [pageSize, setPageSize] = useState<number>(20); // Display 20 entries per page
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalEntries, setTotalEntries] = useState<number>(0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMoreEntries, setHasMoreEntries] = useState<boolean>(true);
  const [userEntry, setUserEntry] = useState<LeaderboardEntry | null>(null);

  // Stats state to manage project stats completely independent from leaderboard pagination
  const [statsState, setStatsState] = useState<{
    tweets: number;
    views: number;
    likes: number;
    retweets: number;
    replies: number;
    loading: boolean;
    error: string | null;
    projectId: number | null; // Track current project ID to avoid unnecessary refetches
    statsStartDate: string; // Track date range to avoid unnecessary refetches
    statsEndDate: string; // Track date range to avoid unnecessary refetches
  }>({
    tweets: 0,
    views: 0,
    likes: 0,
    retweets: 0,
    replies: 0,
    loading: false,
    error: null,
    projectId: null,
    statsStartDate: "",
    statsEndDate: "",
  });

  // Separate function to fetch stats that can be called independently
  const fetchProjectStatsData = useCallback(
    async (projectId: number, start: string, end: string) => {
      // If we already have stats for this project and date range, don't refetch
      if (
        statsState.projectId === projectId &&
        statsState.statsStartDate === start &&
        statsState.statsEndDate === end &&
        !statsState.loading &&
        !statsState.error
      ) {
        console.log("Using cached stats data - no refetch needed");
        return;
      }

      setStatsState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        projectId,
        statsStartDate: start,
        statsEndDate: end,
      }));

      try {
        // Use V1 API endpoint to get eligible tweets only
        // Old endpoint /api/loyalty/projects/:id/stats is @deprecated
        const url = `/api/v1/loyalty/leaderboard/${projectId}?startDate=${start}&endDate=${end}`;
        const response = await fetchWithRetry(url);

        if (!response.ok) {
          throw new FetchError(
            `Failed to fetch project stats: ${response.statusText}`,
            response.status,
            response.statusText,
            await response.text()
          );
        }

        const data = await response.json();

        if (data.success && data.metrics) {
          setStatsState((prev) => ({
            ...prev,
            tweets: Number(data.metrics.totalTweets || 0),
            views: Number(data.metrics.totalViews || 0),
            likes: Number(data.metrics.totalLikes || 0),
            retweets: Number(data.metrics.totalRetweets || 0),
            replies: Number(data.metrics.totalReplies || 0),
            loading: false,
            error: null,
          }));
        } else {
          throw new Error("Invalid stats data received");
        }
      } catch (err) {
        console.error("Error fetching project stats:", err);
        setStatsState((prev) => ({
          ...prev,
          loading: false,
          error: getErrorMessage(err),
        }));
      }
    },
    []
  );

  // Effect to fetch stats when project or date range changes (NOT on pagination)
  useEffect(() => {
    // Only fetch stats when project is selected and dialog is open
    if (!selectedProject || !leaderboardDialogOpen) return;

    // Fetch project stats independent of leaderboard data
    fetchProjectStatsData(selectedProject.id, startDate, endDate);

    // This effect only runs when the project, dialog state, or date range changes
    // NOT when changing leaderboard pages
  }, [
    selectedProject?.id,
    leaderboardDialogOpen,
    startDate,
    endDate,
    fetchProjectStatsData,
  ]);

  // Update dates when a project is selected based on its start_time and end_time
  useEffect(() => {
    if (!selectedProject || !leaderboardDialogOpen) return;
    
    // Only constrain dates if project has BOTH start_time AND end_time
    if (selectedProject.start_time && selectedProject.end_time) {
      const projectStartDate = new Date(selectedProject.start_time);
      const projectEndDate = new Date(selectedProject.end_time);
      
      // Set initial dates to project's duration or last 30 days within the duration
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Use the later of project start or 30 days ago
      const effectiveStartDate = projectStartDate > thirtyDaysAgo ? projectStartDate : thirtyDaysAgo;
      
      // Use the earlier of project end or today
      const today = new Date();
      const effectiveEndDate = projectEndDate < today ? projectEndDate : today;
      
      setStartDate(format(effectiveStartDate, "yyyy-MM-dd"));
      setEndDate(format(effectiveEndDate, "yyyy-MM-dd"));
    } else {
      // No date constraints - use default last month
      setStartDate(getLastMonthDate());
      setEndDate(getCurrentDate());
    }
  }, [selectedProject, leaderboardDialogOpen]);

  // Fetch mindshare project ID when loyalty project is selected
  useEffect(() => {
    if (!selectedProject?.twitter_handle || !leaderboardDialogOpen) {
      setMindshareProjectId(null);
      return;
    }

    // Fetch mindshare project by twitter handle
    const fetchMindshareProject = async () => {
      try {
        const response = await fetch('/api/v1/mindshare/projects');
        if (!response.ok) throw new Error('Failed to fetch mindshare projects');
        
        const projects = await response.json();
        const matchingProject = projects.find((p: any) => 
          p.twitter_handle?.toLowerCase() === selectedProject.twitter_handle?.toLowerCase()
        );
        
        if (matchingProject) {
          setMindshareProjectId(matchingProject.id);
        } else {
          console.error('No matching mindshare project found for:', selectedProject.twitter_handle);
          setMindshareProjectId(null);
        }
      } catch (error) {
        console.error('Error fetching mindshare project:', error);
        setMindshareProjectId(null);
      }
    };

    fetchMindshareProject();
  }, [selectedProject?.twitter_handle, leaderboardDialogOpen]);

  // Fetch project tweets using V1 API with eligibility info
  // Old endpoint /api/loyalty/projects/:id/tweets is @deprecated
  const {
    data: projectTweetsData,
    isLoading: isLoadingTweets,
    error: tweetsError,
    refetch: refetchTweets
  } = useQuery({
    queryKey: [`/api/v1/loyalty/projects/${selectedProject?.id}/tweets`, startDate, endDate, tweetsSortBy],
    queryFn: async () => {
      if (!selectedProject) return null;
      
      const params = new URLSearchParams({
        startDate: startDate,
        endDate: endDate,
        sortBy: tweetsSortBy,
        limit: '100'
      });
      
      const response = await fetch(
        `/api/v1/loyalty/projects/${selectedProject.id}/tweets?${params}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch project tweets');
      }
      return response.json();
    },
    enabled: !!selectedProject && leaderboardDialogOpen,
  });

  // Fetch Twitter user info for tweet authors
  useEffect(() => {
    if (projectTweetsData?.tweets && projectTweetsData.tweets.length > 0) {
      const uniqueHandles = [...new Set(projectTweetsData.tweets.map((t: any) => 
        t.author_handle.replace('@', '').toLowerCase()
      ))];
      
      getTwitterUserInfoBatch(uniqueHandles).then(userInfos => {
        const newMap = new Map(tweetUserInfo);
        userInfos.forEach(info => {
          if (info && info.screen_name) {
            newMap.set(info.screen_name.toLowerCase(), info);
          }
        });
        setTweetUserInfo(newMap);
      }).catch(error => {
        console.error('Error fetching Twitter user info:', error);
      });
    }
  }, [projectTweetsData]);

  // Reset displayed tweets count when project or sort changes
  useEffect(() => {
    setDisplayedTweetsCount(10);
  }, [selectedProject?.id, tweetsSortBy]);

  // Fetch leaderboard for a project
  const {
    data: leaderboardResponse,
    isLoading: leaderboardLoading,
    refetch: refetchLeaderboard,
    error: leaderboardError,
    isError: isLeaderboardError,
  } = useQuery({
    queryKey: [
      "/api/loyalty/projects",
      selectedProject?.id,
      "leaderboard",
      startDate,
      endDate,
      pageSize,
      currentPage,
    ],
    queryFn: async () => {
      try {
        if (!selectedProject) return [];

        // Build URL based on current pagination state and search parameters
        // Using V1 endpoint - Old endpoint /api/loyalty/projects/:id/leaderboard is @deprecated
        let url = `/api/v1/loyalty/leaderboard/${selectedProject.id}?startDate=${startDate}&endDate=${endDate}`;

        // For pagination, calculate offset based on current page and page size
        const offset = (currentPage - 1) * pageSize;
        url += `&limit=${pageSize}&offset=${offset}`;

        const response = await fetchWithRetry(url);

        if (!response.ok) {
          console.error(
            `Leaderboard API error: ${response.status} ${response.statusText}`
          );
          throw new FetchError(
            `Failed to fetch leaderboard: ${response.statusText}`,
            response.status,
            response.statusText,
            await response.text()
          );
        }

        const responseData = await response.json();

        // Log the response structure to debug
        console.log("Leaderboard API response:", responseData);

        // Extract entries array and pagination metadata from the response
        // V1 endpoint returns { leaderboard: [...] }, old endpoint returns { entries: [...] } or array directly
        const leaderboardData = responseData.leaderboard || responseData.entries || responseData;
        const totalCount = responseData.totalMembers || responseData.total || leaderboardData.length;

        // Update state with pagination info
        setTotalEntries(totalCount);
        setHasMoreEntries(offset + pageSize < totalCount);

        // If we got user position in search results, update current page
        if (responseData.userPosition && responseData.currentPage) {
          setCurrentPage(responseData.currentPage);
        }

        // Ensure leaderboardData is an array
        if (!Array.isArray(leaderboardData)) {
          console.error("Leaderboard data is not an array:", leaderboardData);
          throw new Error("Invalid leaderboard data format");
        }

        // Get all Twitter handles from the leaderboard to fetch user info
        const twitterHandles = leaderboardData.map(
          (entry: LeaderboardEntry) => entry.twitter_handle
        );

        // Also check if current user is in the leaderboard
        if (
          twitterIsLogin &&
          twitterHandle &&
          !twitterHandles.includes(twitterHandle.toLowerCase())
        ) {
          // Fetch the user's position separately if they're not in the top entries
          try {
            const userUrl = `/api/loyalty/projects/${selectedProject.id}/user-position?startDate=${startDate}&endDate=${endDate}&twitterHandle=${twitterHandle}`;
            const userResponse = await fetchWithRetry(userUrl);

            if (userResponse.ok) {
              const userData = await userResponse.json();
              if (userData) {
                setUserEntry(userData);
                // Add user's handle to the list of handles to fetch Twitter info for
                twitterHandles.push(userData.twitter_handle);
              }
            }
          } catch (userError) {
            console.warn("Error fetching user position:", userError);
          }
        }

        // Fetch Twitter user info for all handles in parallel
        if (twitterHandles.length > 0) {
          try {
            console.log(
              `Fetching Twitter info for ${twitterHandles.length} users from leaderboard`
            );

            // Get Twitter info for all handles at once using our new batch function
            const twitterInfoMap = await getTwitterUserInfoBatch(
              twitterHandles
            );

            // Update user entry with Twitter info if it exists
            if (userEntry && twitterIsLogin && twitterHandle) {
              const userTwitterInfo = twitterInfoMap.get(
                userEntry.twitter_handle.toLowerCase()
              );
              if (userTwitterInfo) {
                setUserEntry({
                  ...userEntry,
                  username: userTwitterInfo.display_name,
                  profilePicture: userTwitterInfo.profile_image_url,
                  profileUrl: userTwitterInfo.profile_url,
                  follower_count: userTwitterInfo.follower_count,
                  creator_score: userTwitterInfo.creator_score,
                  twitterUrl: `https://twitter.com/${userEntry.twitter_handle}`,
                });
              }
            }

            // Enhance leaderboard entries with Twitter user info
            return leaderboardData.map((entry: LeaderboardEntry) => {
              const twitterInfo = twitterInfoMap.get(
                entry.twitter_handle.toLowerCase()
              );

              // Add "you" flag if this entry matches the current user
              const isCurrentUser =
                twitterIsLogin &&
                twitterHandle &&
                entry.twitter_handle.toLowerCase() ===
                  twitterHandle.toLowerCase();

              if (twitterInfo) {
                return {
                  ...entry,
                  username: twitterInfo.display_name,
                  profilePicture: twitterInfo.profile_image_url,
                  profileUrl: twitterInfo.profile_url,
                  follower_count: twitterInfo.follower_count,
                  creator_score: twitterInfo.creator_score,
                  twitterUrl: `https://twitter.com/${entry.twitter_handle}`,
                  isCurrentUser,
                };
              }

              return {
                ...entry,
                isCurrentUser,
              };
            });
          } catch (twitterError) {
            console.warn(
              "Error enhancing leaderboard with Twitter info:",
              twitterError
            );
            // Return the original data if Twitter enhancement fails, but mark current user
            if (twitterIsLogin && twitterHandle) {
              return leaderboardData.map((entry: LeaderboardEntry) => ({
                ...entry,
                isCurrentUser:
                  entry.twitter_handle.toLowerCase() ===
                  twitterHandle.toLowerCase(),
              }));
            }
            return leaderboardData;
          }
        }

        // Mark current user even without Twitter info
        if (twitterIsLogin && twitterHandle) {
          return leaderboardData.map((entry: LeaderboardEntry) => ({
            ...entry,
            isCurrentUser:
              entry.twitter_handle.toLowerCase() ===
              twitterHandle.toLowerCase(),
          }));
        }

        return leaderboardData;
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
          console.error("Error fetching leaderboard:", err);
          toast({
            title: "Error loading leaderboard",
            description: getErrorMessage(err),
            variant: "destructive",
          });
        }
        throw err;
      }
    },
    enabled: !!selectedProject && leaderboardDialogOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // If rate limited, retry after a delay
      if (isRateLimitError(error) && failureCount < 3) {
        return true;
      }
      return failureCount < 2;
    },
    retryDelay: 1000, // 1 second between retries
  });

  // Memoize leaderboard to avoid unnecessary re-renders
  const leaderboard: LeaderboardEntry[] = useMemo(() => {
    if (!leaderboardResponse) return [];
    if (Array.isArray(leaderboardResponse)) return leaderboardResponse;
    // Handle V1 endpoint response format
    if (
      leaderboardResponse.leaderboard &&
      Array.isArray(leaderboardResponse.leaderboard)
    )
      return leaderboardResponse.leaderboard;
    // Handle old endpoint response format
    if (
      leaderboardResponse.entries &&
      Array.isArray(leaderboardResponse.entries)
    )
      return leaderboardResponse.entries;
    return [];
  }, [leaderboardResponse]);
  console.log("Processed leaderboard data:", leaderboard);

  // Handle pagination
  const handlePageChange = async (newPage: number) => {
    setCurrentPage(newPage);
    setIsLoadingMore(true);
    await refetchLeaderboard();
    setIsLoadingMore(false);
  };

  // Join a project mutation
  const joinProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      if (!twitterIsLogin) {
        throw new Error("You must be logged in with Twitter to join a project");
      }

      // First, sync the Twitter session with the server
      console.log("Syncing Twitter session before joining project...");
      const syncResult = await syncTwitterSession();

      if (!syncResult) {
        console.warn(
          "Failed to sync Twitter session, but will try to join project anyway"
        );
      } else {
        console.log("Twitter session synced successfully");
      }

      // Now try to join the project
      const response = await fetch(`/api/loyalty/projects/${projectId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          twitterHandle: twitterHandle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to join project");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "You have successfully joined the project",
      });

      // Invalidate user memberships query to refresh membership data
      queryClient.invalidateQueries({
        queryKey: ["/api/loyalty/user-memberships", twitterHandle],
      });
    },
    onError: (error: any) => {
      // Check if this is a standard error or an API response error
      const errorMessage = error.response?.data?.error || error.message;

      // Check if this is a follower count error
      if (errorMessage.includes("follower count requirement not met")) {
        // Extract the follower counts from the error message if available
        const countMatch = errorMessage.match(/(\d+)\/(\d+)/);
        const currentCount = countMatch?.[1] || "0";
        const requiredCount = countMatch?.[2] || "0";

        toast({
          title: "Unable to Join",
          description: (
            <div>
              <p>You need more Twitter followers to join this program.</p>
              <p className="mt-1">
                <span className="font-semibold">Current:</span>{" "}
                {parseInt(currentCount).toLocaleString()} followers
              </p>
              <p>
                <span className="font-semibold">Required:</span>{" "}
                {parseInt(requiredCount).toLocaleString()} followers
              </p>
            </div>
          ),
          variant: "destructive",
          duration: 6000,
        });
      } else {
        toast({
          title: t('common.error'),
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  // Leave a project mutation
  const leaveProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      if (!twitterIsLogin) {
        throw new Error(
          "You must be logged in with Twitter to leave a project"
        );
      }

      // First, sync the Twitter session with the server
      console.log("Syncing Twitter session before leaving project...");
      const syncResult = await syncTwitterSession();

      if (!syncResult) {
        console.warn(
          "Failed to sync Twitter session, but will try to leave project anyway"
        );
      } else {
        console.log("Twitter session synced successfully");
      }

      // Now try to leave the project
      const response = await fetch(`/api/loyalty/projects/${projectId}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          twitterHandle: twitterHandle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to leave project");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "You have successfully left the project",
      });

      // Invalidate user memberships query to refresh membership data
      queryClient.invalidateQueries({
        queryKey: ["/api/loyalty/user-memberships", twitterHandle],
      });
    },
    onError: (error: any) => {
      // Display error message
      toast({
        title: "Error",
        description: error.message || "Failed to leave project",
        variant: "destructive",
      });
    },
  });

  // Join all projects mutation
  const joinAllProjectsMutation = useMutation({
    mutationFn: async () => {
      if (!twitterIsLogin) {
        throw new Error("You must be logged in with Twitter to join projects");
      }

      // First, sync the Twitter session with the server
      console.log("Syncing Twitter session before joining all projects...");
      const syncResult = await syncTwitterSession();

      if (!syncResult) {
        console.warn(
          "Failed to sync Twitter session, but will try to join projects anyway"
        );
      } else {
        console.log("Twitter session synced successfully");
      }

      const response = await fetch("/api/loyalty/join-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          twitterHandle: twitterHandle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to join projects");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `You have successfully joined ${data.joinedCount} projects`,
      });

      // Invalidate user memberships query to refresh membership data
      queryClient.invalidateQueries({
        queryKey: ["/api/loyalty/user-memberships", twitterHandle],
      });
    },
    onError: (error: any) => {
      // Check if this is a standard error or an API response error
      const errorMessage = error.response?.data?.error || error.message;

      // Check if this is a follower count error
      if (errorMessage.includes("follower count requirement not met")) {
        toast({
          title: "Some Programs Require More Followers",
          description:
            "One or more programs require a higher follower count than you currently have. You were only joined to programs where you meet the requirements.",
          variant: "destructive",
          duration: 6000,
        });
      } else {
        toast({
          title: t('common.error'),
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const handleJoinProject = (project: LoyaltyProject) => {
    joinProjectMutation.mutate(project.id);
  };

  const handleLeaveProject = (project: LoyaltyProject) => {
    leaveProjectMutation.mutate(project.id);
  };

  const handleJoinAll = () => {
    joinAllProjectsMutation.mutate();
  };

  // Get current location for URL manipulation
  const [location, setLocation] = useLocation();

  // Helper function to update URL parameters
  const updateURLParams = (tagIds: number[]) => {
    const url = new URL(window.location.href);
    
    // Remove existing tags parameter if no tags selected
    if (tagIds.length === 0) {
      url.searchParams.delete('tags');
    } else {
      // Set tags parameter as comma-separated values
      url.searchParams.set('tags', tagIds.join(','));
    }
    
    // Update the URL without navigating
    window.history.replaceState({}, '', url.toString());
  };

  const handleViewLeaderboard = (project: LoyaltyProject) => {
    setSelectedProject(project);
    setEndDate(getCurrentDate()); // Update to current date when opening dialog
    setLeaderboardDialogOpen(true);
    setExpandedRows(new Set()); // Clear expanded rows when opening dialog
    setUserTweets({}); // Clear user tweets

    // Update the URL with the project ID without navigating away from the page
    const url = new URL(window.location.href);
    url.searchParams.set("view", project.id.toString());
    window.history.pushState({}, "", url.toString());
  };

  const toggleRowExpansion = async (handle: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(handle)) {
      newExpanded.delete(handle);
    } else {
      newExpanded.add(handle);
      
      // Fetch user tweets if not already fetched
      if (!userTweets[handle] && selectedProject) {
        try {
          const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
          const response = await fetch(`/api/loyalty/projects/${selectedProject.id}/tweets?days=${days}&limit=5&authorHandle=${encodeURIComponent(handle)}`);
          if (response.ok) {
            const data = await response.json();
            setUserTweets(prev => ({
              ...prev,
              [handle]: data.tweets || []
            }));
          }
        } catch (error) {
          console.error('Failed to fetch user tweets:', error);
        }
      }
    }
    setExpandedRows(newExpanded);
  };

  // Filter projects based on search
  const filteredProjects = projects
    ?.filter(
      (project) =>
        project.name.toLowerCase().includes(searchProject.toLowerCase()) ||
        (project.twitter_handle &&
          project.twitter_handle
            .toLowerCase()
            .includes(searchProject.toLowerCase()))
    )
    .sort((a, b) => a.id - b.id);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div className="mr-10">
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <TbStar className="text-primary h-8 w-8" />
            {t('loyalty.title')}
          </h1>
          <p className="text-white/70 mt-2 text-justify">
            {t('loyalty.description')}
          </p>
          <p className="text-white/70 mt-3 text-justify">
            <span className="text-primary font-semibold">{t('loyalty.reputationBoost.title')}</span>{" "}
            {t('loyalty.reputationBoost.description')}
            <span className="text-green-400 font-semibold">{t('loyalty.reputationBoost.points')}</span>
            {t('loyalty.reputationBoost.suffix')}
          </p>
        </div>

        <div>
          <Button
            onClick={() =>
              window.open(
                "https://docs.google.com/forms/d/e/1FAIpQLSfNXhyQMo2IKLEzB-tiuZGUZ9mYH_17rbh5WS-gy4eoHkQEXw/viewform?usp=dialog",
                "_blank"
              )
            }
            className="mt-4 md:mt-0 bg-transparent border-[#2b2d3c] text-white hover:bg-[#1a1b29] m-2"
            variant="outline"
          >
            <TbExternalLink className="h-4 w-4" />
            {t('loyalty.interestForm')}
          </Button>

          <Button
            onClick={handleJoinAll}
            className="mt-4 md:mt-0 bg-primary hover:bg-primary/90 m-2 text-primary-foreground"
            disabled={!twitterIsLogin || joinAllProjectsMutation.isPending}
          >
            <TbPlus className="mr-2 h-4 w-4" />
            {t('loyalty.joinAllPrograms')}
          </Button>
        </div>
      </div>

      <Separator className="mb-8 bg-white/10" />

      {/* Tab navigation between active and inactive programs */}
      <Tabs
        value={projectsTab}
        onValueChange={(value) =>
          setProjectsTab(value as "active" | "inactive")
        }
        className="mb-6 w-full"
      >
        <div className="flex items-center mb-4">
          <TabsList className="grid grid-cols-2 w-80 p-1 rounded-xl border-b border-[#2b2d3c] bg-transparent">
            <TabsTrigger
              value="active"
              className="text-white/90 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary bg-transparent rounded-none py-2 font-medium"
            >
              <TbStarFilled className="mr-2 h-4 w-4" />
              Active Programs
            </TabsTrigger>
            <TabsTrigger
              value="inactive"
              className="text-white/90 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary bg-transparent rounded-none py-2 font-medium"
            >
              <TbStar className="mr-2 h-4 w-4" />
              Completed Programs
            </TabsTrigger>
          </TabsList>

          {/* Tag filter dropdown */}
          {projectTags && projectTags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "ml-4 bg-transparent border-[#2b2d3c] text-white hover:bg-[#1a1b29]",
                    selectedTagIds.length > 0 && "border-primary text-primary"
                  )}
                >
                  <TbTags className="mr-2 h-4 w-4" />
                  Filter by Tags
                  {selectedTagIds.length > 0 && (
                    <span className="ml-2 bg-[#2b2d3c] text-white text-xs px-2 py-0.5 rounded-full">
                      {selectedTagIds.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[320px] bg-[#1a1b29] border-[#2b2d3c] text-white"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuLabel className="text-white font-semibold">
                  Project Tags
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#2b2d3c]" />
                {projectTags
                  .filter((tag) => tag.visible)
                  .map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.id}
                      checked={selectedTagIds.includes(tag.id)}
                      onCheckedChange={(checked) => {
                        let newTagIds: number[];
                        if (checked) {
                          newTagIds = [...selectedTagIds, tag.id];
                        } else {
                          newTagIds = selectedTagIds.filter((id) => id !== tag.id);
                        }
                        setSelectedTagIds(newTagIds);
                        updateURLParams(newTagIds);
                      }}
                      className="text-white hover:bg-[#2b2d3c] focus:bg-[#2b2d3c] focus:text-white py-2"
                      // Prevent closing dropdown after clicking
                      onSelect={(e) => e.preventDefault()}
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold text-[15px] leading-tight">
                          {tag.name}
                        </span>
                        {tag.description && (
                          <span className="text-xs text-white/70 mt-1.5">
                            {tag.description}
                          </span>
                        )}
                      </div>
                    </DropdownMenuCheckboxItem>
                  ))}
                {selectedTagIds.length > 0 && (
                  <>
                    <DropdownMenuSeparator className="bg-[#2b2d3c]" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center text-white/90 hover:text-white hover:bg-[#2b2d3c]"
                      onClick={() => {
                        setSelectedTagIds([]);
                        updateURLParams([]);
                      }}
                    >
                      <TbX className="mr-2 h-4 w-4" />
                      Clear Filters
                    </Button>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Tabs>

      {/* Display selected tags as filters */}
      {selectedTagIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <span className="text-sm text-white/60">Filtering by tags:</span>
          {selectedTagIds.map((tagId) => {
            const tag = projectTags?.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <Badge
                key={tag.id}
                className="bg-primary/20 text-primary border-primary/30 py-1 pl-2 pr-1 gap-1 flex items-center"
              >
                {tag.name}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const newTagIds = selectedTagIds.filter((id) => id !== tagId);
                    setSelectedTagIds(newTagIds);
                    updateURLParams(newTagIds);
                  }}
                  className="h-4 w-4 p-0 ml-1 rounded-full hover:bg-primary/20"
                >
                  <span className="sr-only">Remove</span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3"
                  >
                    <path
                      d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                      fill="currentColor"
                    />
                  </svg>
                </Button>
              </Badge>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedTagIds([]);
              updateURLParams([]);
            }}
            className="text-white/60 hover:text-white text-xs py-1 h-7"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Search and info section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="relative w-full md:w-1/3">
          <TbSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" />
          <Input
            placeholder="Search programs..."
            value={searchProject}
            onChange={(e) => setSearchProject(e.target.value)}
            className="pl-10 bg-[#1a1b29] border-[#2b2d3c] text-white"
          />
        </div>
      </div>

      {/* Projects Grid */}
      {projectsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <Card key={i} className="bg-[#12131e] border-[#2b2d3c]">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <Skeleton className="h-6 w-32 bg-[#1a1b29] mb-2" />
                      <Skeleton className="h-4 w-24 bg-[#1a1b29]" />
                    </div>
                    <Skeleton className="h-10 w-10 rounded-full bg-[#1a1b29]" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full bg-[#1a1b29] mb-2" />
                  <Skeleton className="h-4 w-5/6 bg-[#1a1b29]" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-9 w-full bg-[#1a1b29]" />
                </CardFooter>
              </Card>
            ))}
        </div>
      ) : isProjectsError ? (
        <div className="bg-[#12131e] border border-[#2b2d3c] p-6 rounded-md text-center">
          <div className="flex flex-col items-center justify-center py-8 text-white/70">
            {isRateLimitError(projectsError) ? (
              <>
                <p className="text-amber-400 text-lg mb-2">
                  API Rate Limit Reached
                </p>
                <p className="text-white/50 text-sm max-w-sm mb-4">
                  We're experiencing high demand on our Twitter API. Please wait
                  a moment and try again.
                </p>
              </>
            ) : (
              <>
                <p className="text-red-400 text-lg mb-2">
                  Error Loading Loyalty Programs
                </p>
                <p className="text-white/50 text-sm mb-4">
                  {getErrorMessage(projectsError)}
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
                  description: "Fetching fresh loyalty program data",
                });

                refetchProjects();
              }}
              className="h-8 px-3 text-xs bg-[#1a1b29] border-[#2b2d3c] text-white"
            >
              <TbRefresh className="h-4 w-4 mr-2" />
              Retry with fresh data
            </Button>
          </div>
        </div>
      ) : !filteredProjects || filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-white/50 text-lg">
            {searchProject && selectedTagIds.length > 0
              ? "No projects match your search and selected tags."
              : searchProject
              ? "No projects match your search."
              : selectedTagIds.length > 0
              ? "No projects match the selected tags."
              : projectsTab === "active"
              ? "No active loyalty programs available."
              : "No inactive loyalty programs available."}
          </p>
          <div className="flex justify-center mt-4 gap-2">
            {searchProject && (
              <Button
                variant="ghost"
                onClick={() => setSearchProject("")}
                className="text-white/70 hover:text-white"
              >
                <TbX className="mr-2 h-4 w-4" />
                Clear Search
              </Button>
            )}
            {selectedTagIds.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedTagIds([]);
                  updateURLParams([]);
                }}
                className="text-white/70 hover:text-white"
              >
                <TbX className="mr-2 h-4 w-4" />
                Clear Tag Filters
              </Button>
            )}
          </div>
          {!searchProject && projectsTab === "inactive" && (
            <p className="text-white/40 text-sm mt-2">
              Inactive programs have ended their campaigns but are shown here
              for historical reference.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {/* Sort featured projects to the top */}
          {filteredProjects
            .sort((a, b) => {
              // First by featured status (featured first)
              if (a.is_featured && !b.is_featured) return -1;
              if (!a.is_featured && b.is_featured) return 1;
              // Then by active status (active first)
              if (a.is_active && !b.is_active) return -1;
              if (!a.is_active && b.is_active) return 1;
              // Finally by name alphabetically
              return a.name.localeCompare(b.name);
            })
            .map((project) => {
              // Generate accent colors based on project name for projects without banners
              const projectNameHash = project.name
                .split("")
                .reduce((acc, char) => acc + char.charCodeAt(0), 0);
              const hue = projectNameHash % 360;

              // Base colors for cards without banner
              const baseAccent = project.is_featured
                ? `hsl(270, 70%, 50%)` // Purple for featured projects
                : `hsl(${hue}, 70%, 50%)`;
              const baseLightAccent = project.is_featured
                ? `hsl(270, 70%, 80%)` // Light purple for featured projects
                : `hsl(${hue}, 70%, 80%)`;
              const baseDarkAccent = project.is_featured
                ? `hsl(270, 70%, 30%)` // Dark purple for featured projects
                : `hsl(${hue}, 70%, 30%)`;

              return (
                <Card
                  key={project.id}
                  className={`bg-[#12131e] text-white overflow-hidden relative group hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-between ${
                    project.is_featured && projectsTab === "active"
                      ? "animate-pulse-subtle"
                      : ""
                  } ${
                    project.is_featured && projectsTab === "active"
                      ? "animate-rainbow-rotate border-3 border-solid"
                      : ""
                  }`}
                  style={{
                    borderColor: !(
                      project.is_featured && projectsTab === "active"
                    )
                      ? getBannerUrl(project)
                        ? `rgba(255, 255, 255, 0.3)`
                        : baseAccent
                      : undefined, // No borderColor when featured (handled by animation)
                    borderWidth:
                      project.is_featured && projectsTab === "active"
                        ? "3px"
                        : "2px",
                    borderStyle: "solid",
                    boxShadow:
                      project.is_featured && projectsTab === "active"
                        ? "0 4px 25px rgba(138, 43, 226, 0.35)"
                        : getBannerUrl(project)
                        ? "0 4px 20px rgba(255, 255, 255, 0.1)"
                        : `0 4px 20px ${baseAccent}25`,
                  }}
                >
                  {/* Animated glow/gradient effect on hover that matches the card theme */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none z-0 transition-opacity duration-300"
                    style={{
                      background: getBannerUrl(project)
                        ? "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.1) 100%)"
                        : `linear-gradient(135deg, ${baseAccent}00 0%, ${baseAccent}0D 50%, ${baseAccent}1A 100%)`,
                    }}
                  ></div>

                  {(() => {
                    const bannerUrl = getBannerUrl(project);

                    return bannerUrl ? (
                      <div
                        className="relative w-full h-24 overflow-hidden rounded-t-lg"
                        style={{ clipPath: "inset(0 0 0 0 round 8px 8px 0 0)" }}
                      >
                        <img
                          src={bannerUrl}
                          alt={`${project.name} banner`}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-103"
                          style={{ transformOrigin: "center center" }}
                        />
                      </div>
                    ) : null;
                  })()}
                  <CardHeader
                    className={`${
                      getBannerUrl(project) ? "relative z-10" : ""
                    } py-2 px-3`}
                  >
                    {/* Featured badge */}
                    {project.is_featured && (
                      <div className="absolute -top-1 -left-1 z-20">
                        <div className="text-white font-bold text-[10px] px-2 py-0.5 rounded-bl-md rounded-tr-md shadow-lg transform -rotate-12 bg-gradient-to-r from-purple-600 to-violet-600 animate-pulse-slow">
                          FEATURED
                        </div>
                      </div>
                    )}

                    {/* Incentivized badge */}
                    {project.is_incentivized && (
                      <div className="absolute -top-1 -right-1 z-20">
                        <div
                          className={`text-black font-bold text-[10px] px-2 py-0.5 rounded-bl-md rounded-tr-md shadow-lg transform rotate-12 animate-pulse ${
                            project.incentive_type === "points"
                              ? "bg-gradient-to-r from-purple-500 to-indigo-500"
                              : project.incentive_type === "token"
                              ? "bg-gradient-to-r from-cyan-500 to-blue-500"
                              : "bg-gradient-to-r from-yellow-500 to-amber-500"
                          }`}
                        >
                          {project.incentive_type === "points"
                            ? "AIRDROP POINTS"
                            : project.incentive_type === "token"
                            ? project.points_name || "TOKEN" // Show just the token name, no "Airdrop Points" suffix
                            : "USDC"}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <a
                        href={`https://x.com/${project.twitter_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        <CardTitle className="text-lg">
                          {project.name}
                        </CardTitle>
                        <CardDescription className="text-white/70 text-xs">
                          @{project.twitter_handle || "No Twitter handle"}
                        </CardDescription>
                      </a>
                      {(() => {
                        // Check if we have Twitter user info for this project
                        const handle = project.twitter_handle
                          ?.replace("@", "")
                          .toLowerCase();
                        const userInfo = handle
                          ? twitterUserInfo.get(handle)
                          : null;
                        const imageUrl =
                          userInfo?.profile_image_url || project.logo_url;

                        return imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={project.name}
                            className={`h-10 w-10 rounded-full object-cover border-2 border-[#12131e] ${
                              getBannerUrl(project) ? "shadow-md" : ""
                            }`}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary border-2 border-[#12131e]">
                            {project.name.charAt(0).toUpperCase()}
                          </div>
                        );
                      })()}
                    </div>
                  </CardHeader>

                  <CardContent
                    className={`${
                      getBannerUrl(project) ? "-mt-2" : ""
                    } py-2 px-3`}
                  >
                    <p className="text-white/70 text-xs" style={{}}>
                      {project.description || "No description available."}
                    </p>

                    {/* Display program duration if configured */}
                    {project.start_time && project.end_time && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-white/60">
                        <TbCalendar className="h-3 w-3" />
                        <span>
                          {format(new Date(project.start_time), 'MMM d, yyyy')} - {format(new Date(project.end_time), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}

                    {/* Display project tags if available */}
                    {projectTags &&
                      projectTags.length > 0 &&
                      project.tag_ids &&
                      project.tag_ids.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(() => {
                            // Get all tags for this project and sort them alphabetically
                            const projectTagsSorted = project.tag_ids
                              .map((tagId) => projectTags.find((t) => t.id === tagId))
                              .filter((tag) => tag && tag.visible)
                              .sort((a, b) => a!.name.localeCompare(b!.name));
                            
                            return projectTagsSorted.map((tag) => (
                              <span
                                key={tag!.id}
                                className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-sm"
                                style={{
                                  background: getBannerUrl(project)
                                    ? "rgba(255, 255, 255, 0.1)"
                                    : `${baseAccent}15`,
                                  borderWidth: "1px",
                                  borderStyle: "solid",
                                  borderColor: getBannerUrl(project)
                                    ? "rgba(255, 255, 255, 0.2)"
                                    : `${baseAccent}30`,
                                  color: getBannerUrl(project)
                                    ? "rgba(255, 220, 230, 0.9)"
                                    : baseLightAccent,
                                }}
                              >
                                <TbTags className="mr-1 h-2 w-2" />
                                {tag!.name}
                              </span>
                            ));
                          })()}
                        </div>
                      )}

                    {/* Project-specific instructions for clear guidance */}
                    <div
                      className="mt-2 p-2 rounded-lg shadow-inner transition-all duration-300"
                      style={{
                        background: getBannerUrl(project)
                          ? "linear-gradient(to right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.1))"
                          : `linear-gradient(to right, ${baseAccent}15, ${baseAccent}25)`,
                        borderWidth: "1px",
                        borderStyle: "solid",
                        borderColor: getBannerUrl(project)
                          ? "rgba(255, 255, 255, 0.2)"
                          : `${baseAccent}40`,
                        boxShadow: getBannerUrl(project)
                          ? "inset 0 2px 4px rgba(255, 255, 255, 0.05)"
                          : `inset 0 2px 4px ${baseAccent}20`,
                      }}
                    >
                      <div className="flex items-start gap-1">
                        <div className="shrink-0 mt-0.5">
                          <div
                            className="h-4 w-4 rounded-full flex items-center justify-center"
                            style={{
                              background: (() => {
                                const handle = project.twitter_handle
                                  ?.replace("@", "")
                                  .toLowerCase();
                                const userInfo = handle
                                  ? twitterUserInfo.get(handle)
                                  : null;
                                const bannerUrl =
                                  userInfo?.banner_url || project.banner_url;

                                return bannerUrl
                                  ? "linear-gradient(to top right, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.5))"
                                  : `linear-gradient(to top right, ${baseAccent}, ${baseLightAccent})`;
                              })(),
                            }}
                          >
                            <span className="text-black text-[9px] font-bold">
                              ✓
                            </span>
                          </div>
                        </div>
                        <div>
                          <p
                            className="text-[10px] leading-tight"
                            style={{
                              color: getBannerUrl(project)
                                ? "rgba(255, 220, 230, 0.9)"
                                : baseLightAccent,
                            }}
                          >
                            Click Join, follow and tweet about{" "}
                            <span className="font-medium">{project.name}</span>,
                            tag{" "}
                            <span
                              className="font-medium"
                              style={{
                                color: getBannerUrl(project)
                                  ? "rgba(255, 255, 255, 0.95)"
                                  : "white",
                              }}
                            >
                              @{project.twitter_handle}
                            </span>{" "}
                            — earn rewards.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Minimum follower count info - only show if greater than 0 */}
                    {typeof project.min_follower_count === "number" &&
                      project.min_follower_count > 0 && (
                        <div
                          className="mt-2 py-1 px-2 rounded-md text-[10px] font-medium"
                          style={{
                            background: getBannerUrl(project)
                              ? "rgba(255, 220, 230, 0.1)"
                              : `${baseAccent}10`,
                            borderLeft: `2px solid ${
                              getBannerUrl(project)
                                ? "rgba(255, 255, 255, 0.3)"
                                : baseAccent
                            }`,
                          }}
                        >
                          <span
                            style={{
                              color: getBannerUrl(project)
                                ? "rgba(255, 220, 230, 0.9)"
                                : baseLightAccent,
                            }}
                          >
                            Min. {project.min_follower_count.toLocaleString()}{" "}
                            followers required
                          </span>
                        </div>
                      )}
                  </CardContent>

                  <div className="flex items-center justify-between mt-2 px-4 py-2">
                    {project.website_url && (
                      <a
                        href={
                          project.website_url.startsWith("http")
                            ? project.website_url
                            : `https://${project.website_url}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary/90 hover:text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        <TbExternalLink className="h-2.5 w-2.5" />
                        Website
                      </a>
                    )}

                    {project.memberCount !== undefined && (
                      <div className="ml-2 text-[10px] text-white/50">
                        {project.memberCount}{" "}
                        {project.memberCount === 1 ? "joined" : "joined"}
                      </div>
                    )}
                  </div>

                  <CardFooter className="flex justify-between gap-2 py-2 px-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-1/2 text-white border text-xs h-8 px-2 hover:text-white hover:bg-opacity-70"
                      style={{
                        background: getBannerUrl(project)
                          ? "rgba(40, 40, 50, 0.9)"
                          : "#1a1b29",
                        borderColor: getBannerUrl(project)
                          ? "rgba(255, 255, 255, 0.2)"
                          : "#2b2d3c",
                        display: "inline-block",
                        textAlign: "center",
                      }}
                      onClick={() => handleViewLeaderboard(project)}
                    >
                      Leaderboard
                    </Button>

                    {project.isUserMember ? (
                      <Button
                        size="sm"
                        className="w-1/2 text-white/80 text-xs h-8 px-2 hover:text-white"
                        style={{
                          background: getBannerUrl(project)
                            ? "rgba(255, 255, 255, 0.25)"
                            : `${baseAccent}30`,
                          color: getBannerUrl(project)
                            ? "rgba(255, 255, 255, 0.9)"
                            : "rgba(255, 255, 255, 0.9)",
                          display: "inline-block",
                          textAlign: "center",
                          border: "1px solid",
                          borderColor: getBannerUrl(project)
                            ? "rgba(255, 255, 255, 0.3)"
                            : `${baseAccent}50`,
                        }}
                        onClick={() => handleLeaveProject(project)}
                        disabled={
                          !twitterIsLogin || leaveProjectMutation.isPending
                        }
                      >
                        Leave
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-1/2 text-black border text-xs h-8 px-2 hover:text-black hover:bg-gray-100"
                        style={{
                          background: "white",
                          borderColor: "#d4d4d8",
                          display: "inline-block",
                          textAlign: "center",
                        }}
                        onClick={() => handleJoinProject(project)}
                        disabled={
                          !twitterIsLogin || joinProjectMutation.isPending
                        }
                      >
                        Join
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
        </div>
      )}

      {/* Leaderboard Dialog */}
      <Dialog
        open={leaderboardDialogOpen}
        onOpenChange={(open) => {
          setLeaderboardDialogOpen(open);
          if (!open) {
            // Remove the 'view' parameter from the URL when closing the dialog
            const url = new URL(window.location.href);
            url.searchParams.delete("view");
            window.history.pushState({}, "", url.toString());
          }
        }}
      >
        <DialogContent
          className="bg-[#12131e] text-white max-w-4xl p-0 max-h-[90vh] flex flex-col overflow-hidden"
          style={{
            borderColor: selectedProject
              ? getBannerUrl(selectedProject)
                ? `rgba(255, 255, 255, 0.3)`
                : `hsl(${
                    selectedProject.name
                      .split("")
                      .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360
                  }, 70%, 50%)`
              : "#2b2d3c",
            borderWidth: "2px",
            borderStyle: "solid",
            boxShadow: selectedProject
              ? getBannerUrl(selectedProject)
                ? "0 4px 20px rgba(255, 255, 255, 0.1)"
                : `0 4px 20px hsla(${
                    selectedProject.name
                      .split("")
                      .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360
                  }, 70%, 50%, 0.15)`
              : "none",
          }}
        >
          <div className="flex flex-col flex-1 overflow-y-auto">
            {(() => {
              if (!selectedProject) return null;

              const bannerUrl = getBannerUrl(selectedProject);

              return bannerUrl ? (
                <div className="relative w-full flex-shrink-0">
                  <img
                    src={bannerUrl}
                    alt={`${selectedProject?.name} banner`}
                    className="w-full h-full"
                  />
                </div>
              ) : null;
            })()}
            
            <DialogHeader className="mb-2 px-6 pt-6">
              <h2 className="text-xl font-semibold">
                {selectedProject?.name} Leaderboard
              </h2>

              {/* Display project tags in dialog */}
              {projectTags &&
                projectTags.length > 0 &&
                selectedProject?.tag_ids &&
                selectedProject.tag_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedProject.tag_ids.map((tagId) => {
                      const tag = projectTags.find((t) => t.id === tagId);
                      if (!tag || !tag.visible) return null;

                      const projectNameHash = selectedProject.name
                        .split("")
                        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
                      const hue = projectNameHash % 360;
                      const baseAccent = selectedProject.is_featured
                        ? `hsl(270, 70%, 50%)`
                        : `hsl(${hue}, 70%, 50%)`;
                      const baseLightAccent = selectedProject.is_featured
                        ? `hsl(270, 70%, 80%)`
                        : `hsl(${hue}, 70%, 80%)`;

                      return (
                        <span
                          key={tagId}
                          className="inline-flex items-center text-xs px-2 py-0.5 rounded-sm"
                          style={{
                            background: selectedProject.banner_url
                              ? "rgba(255, 255, 255, 0.1)"
                              : `${baseAccent}15`,
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderColor: selectedProject.banner_url
                              ? "rgba(255, 255, 255, 0.2)"
                              : `${baseAccent}30`,
                            color: selectedProject.banner_url
                              ? "rgba(255, 220, 230, 0.9)"
                              : baseLightAccent,
                          }}
                        >
                          <TbTags className="mr-1.5 h-3 w-3" />
                          {tag.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              {selectedProject?.description && (
                <p className="text-sm text-white/70 mt-2">
                  {selectedProject.description}
                </p>
              )}
            </DialogHeader>

            {/* Date Range Selection */}
            <div className="flex justify-end mt-3 px-6">
              <div>
                <DateTimeRangePicker
                  value={{
                    from: startDateObj || null,
                    to: endDateObj || null
                  }}
                  onChange={(value) => {
                    if (value.from && value.to) {
                      setStartDate(format(value.from, "yyyy-MM-dd"));
                      setEndDate(format(value.to, "yyyy-MM-dd"));
                    }
                  }}
                  fromDate={selectedProject?.start_time && selectedProject?.end_time ? new Date(selectedProject.start_time) : undefined}
                  toDate={selectedProject?.start_time && selectedProject?.end_time ? new Date(selectedProject.end_time) : undefined}
                  className="w-full"
                />
              </div>
            </div>

            {/* Tabs for Leaderboard and Tweets */}
            <Tabs defaultValue="leaderboard" className="mt-4 flex-1 flex flex-col">
              <TabsList className="grid grid-cols-2 mb-4 mx-6">
                <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
                <TabsTrigger value="tweets">Tweets</TabsTrigger>
              </TabsList>

              <TabsContent value="leaderboard" className="flex-1 flex flex-col px-6">
                  {/* Database re-indexing warning */}
                  <div className="mb-4 p-3 border border-amber-500/30 rounded-md bg-amber-500/10">
                    <div className="flex items-center">
                      <TbInfoCircle className="h-5 w-5 text-amber-400 mr-2 flex-shrink-0" />
                      <p className="text-sm text-amber-100">
                        We are currently re-indexing our tweets database and adding
                        bot detection filters. The metrics displayed below may not
                        reflect the final results.
                      </p>
                    </div>
                  </div>

                  {leaderboardLoading ? (
                    <div className="space-y-3 mt-4">
                      {Array(5)
                        .fill(0)
                        .map((_, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <Skeleton className="h-8 w-8 rounded-full bg-[#1a1b29]" />
                              <Skeleton className="h-4 w-[120px] bg-[#1a1b29]" />
                            </div>
                            <Skeleton className="h-4 w-[80px] bg-[#1a1b29]" />
                          </div>
                        ))}
                    </div>
                  ) : isLeaderboardError ? (
              <div className="bg-[#1a1b29] border border-[#2b2d3c] p-6 rounded-md text-center mt-4 mx-6">
                <div className="flex flex-col items-center justify-center py-6 text-white/70">
                  {isRateLimitError(leaderboardError) ? (
                    <>
                      <p className="text-amber-400 text-lg mb-2">
                        API Rate Limit Reached
                      </p>
                      <p className="text-white/50 text-sm max-w-sm mb-4">
                        We're experiencing high demand on our Twitter API.
                        Please wait a moment and try again.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-red-400 text-lg mb-2">
                        Error Loading Leaderboard
                      </p>
                      <p className="text-white/50 text-sm mb-4">
                        {getErrorMessage(leaderboardError)}
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

                      refetchLeaderboard();
                    }}
                    className="h-8 px-3 text-xs bg-[#1a1b29] border-[#2b2d3c] text-white"
                  >
                    <TbRefresh className="h-4 w-4 mr-2" />
                    Retry with fresh data
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                {/* Use ProjectLeaderboardView component with loyalty context */}
                {selectedProject ? (
                  <ProjectLeaderboardView
                    projectId={selectedProject.id}
                    days={30}
                    startDate={startDateObj}
                    endDate={endDateObj}
                    isLoyaltyContext={true}
                    projectStartTime={selectedProject.start_time && selectedProject.end_time ? new Date(selectedProject.start_time) : undefined}
                    projectEndTime={selectedProject.start_time && selectedProject.end_time ? new Date(selectedProject.end_time) : undefined}
                    onDaysChange={(newDays) => {
                      const now = new Date();
                      const newStartDate = new Date(now);
                      newStartDate.setDate(now.getDate() - newDays);
                      setStartDate(format(newStartDate, "yyyy-MM-dd"));
                      setEndDate(format(now, "yyyy-MM-dd"));
                    }}
                    onDateRangeChange={(range) => {
                      if (range?.from && range?.to) {
                        setStartDate(format(range.from, "yyyy-MM-dd"));
                        setEndDate(format(range.to, "yyyy-MM-dd"));
                      }
                    }}
                  />
                ) : (
                  <div className="text-center py-8 px-6">
                    <p className="text-white/50">
                      No data available yet.
                    </p>
                  </div>
                )}
              </div>
            )}
              </TabsContent>

              <TabsContent value="tweets" className="flex-1 px-6 pb-6">
                <div className="space-y-4">
                  {/* Sort controls */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-white/70">
                      {projectTweetsData?.eligibleTweets || 0} eligible tweets out of {projectTweetsData?.totalTweets || 0} total mentions
                    </div>
                    <Select value={tweetsSortBy} onValueChange={(value: any) => setTweetsSortBy(value)}>
                      <SelectTrigger className="w-[180px] bg-[#1a1b29] border-[#2b2d3c] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1b29] border-[#2b2d3c] text-white">
                        <SelectItem value="engagement">Sort by Engagement</SelectItem>
                        <SelectItem value="views">Sort by Views</SelectItem>
                        <SelectItem value="date">Sort by Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tweets list */}
                  {isLoadingTweets ? (
                    <div className="flex items-center justify-center p-8">
                      <TbLoader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : tweetsError ? (
                    <div className="text-center py-8 text-red-400">
                      Failed to load tweets. Please try again.
                    </div>
                  ) : projectTweetsData && projectTweetsData.tweets && projectTweetsData.tweets.length > 0 ? (
                    <div className="space-y-3">
                      {projectTweetsData.tweets.slice(0, displayedTweetsCount).map((tweet: any) => {
                        // Ensure we have valid numbers to prevent NaN
                        const views = Number(tweet.views) || 0;
                        const engagement = Number(tweet.engagement) || 0;
                        const engagementRate = views > 0 ? ((engagement / views) * 100).toFixed(2) : '0';
                        const userInfo = tweetUserInfo.get(tweet.author_handle.replace('@', '').toLowerCase());
                        
                        return (
                          <Card 
                            key={tweet.id} 
                            className="p-4 border transition-colors bg-[#1a1b29] border-[#2b2d3c] hover:border-[#3b3d4c]"
                          >
                            
                            <div className="flex items-start gap-3">
                              <a
                                href={`https://x.com/${tweet.author_handle.replace('@', '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0"
                              >
                                <Avatar className="h-10 w-10 border border-[#2b2d3c] cursor-pointer hover:border-[#3b3d4c] transition-colors">
                                  <AvatarImage 
                                    src={userInfo?.profile_image_url_https || `https://unavatar.io/twitter/${tweet.author_handle}`}
                                    alt={tweet.author_handle}
                                  />
                                  <AvatarFallback className="bg-[#2b2d3c] text-white">
                                    {tweet.author_handle.substring(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              </a>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={`https://x.com/${tweet.author_handle.replace('@', '')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 hover:underline"
                                    >
                                      <span className="font-semibold text-white">{userInfo?.name || tweet.author_handle}</span>
                                      <span className="text-sm text-white/60">@{tweet.author_handle.replace('@', '')}</span>
                                    </a>
                                  </div>
                                  <a
                                    href={tweet.tweet_link || `https://x.com/${tweet.author_handle.replace('@', '')}/status/${tweet.tweet_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                  >
                                    <TbBrandX className="h-3 w-3" />
                                    View
                                  </a>
                                </div>
                                
                                <p className="text-sm mb-2 whitespace-pre-wrap break-words text-white/90">
                                  {tweet.content}
                                </p>
                                
                                <div className="flex items-center gap-4 text-xs text-white/60">
                                  <span className="flex items-center gap-1">
                                    <TbEye className="h-3 w-3" />
                                    {formatNumber(tweet.views)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <TbHeart className="h-3 w-3" />
                                    {formatNumber(tweet.likes)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <TbRepeat className="h-3 w-3" />
                                    {formatNumber(tweet.retweets)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <TbMessageCircle className="h-3 w-3" />
                                    {formatNumber(tweet.replies)}
                                  </span>
                                  <Badge variant="secondary" className="ml-auto bg-[#2b2d3c] text-white/70 border-[#3b3d4c]">
                                    {engagementRate}% engagement
                                  </Badge>
                                </div>
                                
                                <div className="flex items-center gap-2 mt-2 text-xs text-white/50">
                                  <span>{format(new Date(tweet.posted_at), 'MMM d, h:mm a')}</span>
                                  {tweet.is_retweet && (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-600/40 text-amber-400">
                                      Retweet
                                    </Badge>
                                  )}
                                  {tweet.mentioned_handles && tweet.mentioned_handles.length > 0 && (
                                    <span className="text-xs">
                                      Mentioned: {tweet.mentioned_handles.length} {tweet.mentioned_handles.length === 1 ? 'account' : 'accounts'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                      
                      {/* Load More Button */}
                      {projectTweetsData.tweets.length > displayedTweetsCount && (
                        <div className="flex justify-center mt-6 pb-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDisplayedTweetsCount(prev => prev + TWEETS_PER_PAGE)}
                            className="bg-[#1a1b29] border-[#2b2d3c] text-white hover:bg-[#2b2d3c] hover:border-[#3b3d4c]"
                          >
                            Load More ({projectTweetsData.tweets.length - displayedTweetsCount} remaining)
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/50">
                      No tweets found from members in the selected period.
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
