import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import { 
  TbBrandX, 
  TbLoader2, 
  TbArrowUp, 
  TbArrowDown, 
  TbChartBar, 
  TbEye, 
  TbHeart,
  TbStar,
  TbExternalLink,
  TbSearch,
  TbX,
  TbCalendar,
  TbRepeat,
  TbMessage2,
  TbChevronDown,
  TbChevronUp
} from 'react-icons/tb';
import { api } from '@/utils/api';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LeaderboardUser {
  twitter_handle: string;
  twitter_id: string;
  author_name: string;
  tweet_count: number;
  total_views: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
  total_engagement: number;
  avg_engagement: number;
  engagement_rate: number;
  first_tweet: string;
  last_tweet: string;
  profile_image_url: string | null;
  follower_count: number;
  verified: boolean;
  description: string | null;
}

interface ProjectLeaderboardData {
  project_id: number;
  project_name: string;
  project_handle: string;
  total_users: number;
  date_range: {
    start_date: string;
    end_date: string;
    days: number;
  };
  leaderboard: LeaderboardUser[];
  // Loyalty-specific fields
  totalMembers?: number;
  metrics?: {
    totalTweets: number;
    totalViews: number;
    totalLikes: number;
    totalRetweets: number;
    totalReplies: number;
  };
}

interface ProjectLeaderboardViewProps {
  projectId: number;
  days: number;
  onDaysChange?: (days: number) => void;
  startDate?: Date;
  endDate?: Date;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoyaltyContext?: boolean; // true for loyalty admin, false for mindshare
  projectStartTime?: Date;
  projectEndTime?: Date;
}

const formatNumber = (num: number): string => {
  // Handle invalid numbers
  if (!isFinite(num) || isNaN(num)) {
    return '0';
  }
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
};

// Component to display user tweets
const UserTweetsSection = ({ projectId, userHandle, days, startDate, endDate, isLoyaltyContext }: {
  projectId: number;
  userHandle: string;
  days: number;
  startDate?: Date;
  endDate?: Date;
  isLoyaltyContext?: boolean;
}) => {
  const [timeFilter, setTimeFilter] = useState<'interval' | 'all'>('interval');
  const [sortBy, setSortBy] = useState<'views' | 'engagement' | 'time'>('views');

  const { data: userTweetsData, isLoading } = useQuery({
    queryKey: [isLoyaltyContext ? `/api/v1/loyalty/projects/${projectId}/tweets/user` : `/api/v1/mindshare/projects/${projectId}/tweets/user`, userHandle, startDate, endDate, days, timeFilter],
    queryFn: async () => {
      let url = isLoyaltyContext 
        ? `/api/v1/loyalty/projects/${projectId}/tweets?authorHandle=${encodeURIComponent(userHandle)}&`
        : `/api/v1/mindshare/projects/${projectId}/tweets?`;
      
      // For interval tweets, we need to fetch with date parameters to avoid getting ALL tweets ever
      // But we'll increase the limit to ensure we get all tweets in the date range
      if (timeFilter === 'interval') {
        if (startDate && endDate) {
          url += `startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&`;
        } else {
          url += `days=${days}&`;
        }
        // Use a very high limit to ensure we get all tweets in the date range
        url += `limit=999999`;
      } else {
        // Show all tweets
        url += `all=true`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch user tweets');
      }
      const data = await response.json();
      
      // For mindshare API, we need to filter tweets by user
      // For loyalty API with authorHandle param, tweets are already filtered
      if (!isLoyaltyContext && data.tweets) {
        // Normalize the handle for case-insensitive comparison
        const normalizedHandle = userHandle.toLowerCase().replace('@', '');
        
        data.tweets = data.tweets.filter((tweet: any) => {
          // Check all possible handle fields and normalize them
          const tweetAuthor = (tweet.author_handle || tweet.user_handle || '').toLowerCase().replace('@', '');
          return tweetAuthor === normalizedHandle;
        });
      }
      
      return data;
    },
  });

  // Sort tweets based on selected option
  const sortedTweets = React.useMemo(() => {
    if (!userTweetsData?.tweets) return [];
    
    const tweets = [...userTweetsData.tweets];
    
    switch (sortBy) {
      case 'views':
        return tweets.sort((a: any, b: any) => (b.views || 0) - (a.views || 0));
      case 'engagement':
        const getEngagement = (tweet: any) => (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
        return tweets.sort((a: any, b: any) => getEngagement(b) - getEngagement(a));
      case 'time':
        return tweets.sort((a: any, b: any) => new Date(b.created_at || b.posted_at).getTime() - new Date(a.created_at || a.posted_at).getTime());
      default:
        return tweets;
    }
  }, [userTweetsData?.tweets, sortBy]);

  if (isLoading) {
    return (
      <div className="px-4 py-8">
        <div className="flex items-center justify-center">
          <TbLoader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  if (!sortedTweets.length) {
    return (
      <div className="px-4 py-8">
        <p className="text-center text-white/50">No tweets found from this user{timeFilter === 'interval' ? ' in the selected time period' : ''}.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white">
          {sortedTweets.length} {sortedTweets.length === 1 ? 'Tweet' : 'Tweets'} (Ordered by {sortBy === 'views' ? 'Views' : sortBy === 'engagement' ? 'Engagement' : 'Time'})
        </h4>
        <div className="flex items-center gap-3">
          {/* Time filter */}
          <Select value={timeFilter} onValueChange={(value) => setTimeFilter(value as 'interval' | 'all')}>
            <SelectTrigger className="h-8 w-36 bg-[#12131e] border-[#2b2d3c] text-white text-xs hover:bg-[#1a1b29]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#12131e] border-[#2b2d3c] text-white">
              <SelectItem value="interval" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29] text-xs">During interval</SelectItem>
              <SelectItem value="all" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29] text-xs">All tweets</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort by */}
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'views' | 'engagement' | 'time')}>
            <SelectTrigger className="h-8 w-32 bg-[#12131e] border-[#2b2d3c] text-white text-xs hover:bg-[#1a1b29]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#12131e] border-[#2b2d3c] text-white">
              <SelectItem value="views" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29] text-xs">By Views</SelectItem>
              <SelectItem value="engagement" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29] text-xs">By Engagement</SelectItem>
              <SelectItem value="time" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29] text-xs">By Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-[#2b2d3c] scrollbar-track-[#12131e]">
        <div className="flex gap-3 pb-2" style={{ minWidth: 'max-content' }}>
          {sortedTweets.map((tweet: any) => (
            <Card key={tweet.tweet_id} className="bg-[#1a1b29] border-[#2b2d3c] p-4 flex-shrink-0" style={{ width: '400px' }}>
              <div className="flex flex-col h-full">
                {/* Tweet metadata */}
                <div className="flex items-center justify-between text-xs text-white/60 mb-3">
                  <div className="flex items-center gap-4">
                    <span>Per 1k views:</span>
                    <span className="flex items-center gap-1">
                      <TbEye className="h-3 w-3" />
                      {formatNumber(tweet.views || 0)}
                    </span>
                    <span className="text-white/30">•</span>
                    <span className="flex items-center gap-1">
                      <TbHeart className="h-3 w-3" />
                      {tweet.likes || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <TbRepeat className="h-3 w-3" />
                      {tweet.retweets || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <TbMessage2 className="h-3 w-3" />
                      {tweet.replies || 0}
                    </span>
                  </div>
                </div>
                
                {/* Tweet content */}
                <div className="text-sm text-white/90 flex-grow mb-3" style={{ 
                  display: '-webkit-box',
                  WebkitLineClamp: 6,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {tweet.content}
                </div>
                
                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-white/60 mt-auto">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <TbEye className="h-3 w-3" />
                      {formatNumber(tweet.views || 0)}
                    </span>
                    <span className="text-white/30">•</span>
                    <span className="flex items-center gap-1">
                      <TbHeart className="h-3 w-3" />
                      {formatNumber(tweet.likes || 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <TbRepeat className="h-3 w-3" />
                      {tweet.retweets || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <TbMessage2 className="h-3 w-3" />
                      {tweet.replies || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>
                      {(() => {
                        const dateStr = tweet.created_at || tweet.posted_at;
                        if (!dateStr) return 'Date unavailable';
                        try {
                          const date = new Date(dateStr);
                          if (isNaN(date.getTime())) return 'Date unavailable';
                          return format(date, 'M/d/yyyy');
                        } catch {
                          return 'Date unavailable';
                        }
                      })()}
                    </span>
                    <a
                      href={tweet.tweet_link || `https://x.com/${tweet.author_handle?.replace('@', '')}/status/${tweet.tweet_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TbBrandX className="h-3 w-3" />
                      View
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function ProjectLeaderboardView({ 
  projectId, 
  days, 
  onDaysChange,
  startDate,
  endDate,
  onDateRangeChange,
  isLoyaltyContext = false,
  projectStartTime,
  projectEndTime
}: ProjectLeaderboardViewProps) {
  // Debug logging
  console.log('[ProjectLeaderboardView] Rendered with:', {
    projectId,
    days,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
    isLoyaltyContext
  });
  
  const [location, setLocation] = useLocation();
  
  // Parse URL query params
  const getQueryParams = () => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    return {
      page: parseInt(params.get('page') || '1', 10) - 1, // Convert to 0-based
      limit: parseInt(params.get('limit') || '50', 10),
      sortBy: (params.get('sortBy') || 'views') as 'views' | 'engagement' | 'tweets'
    };
  };
  
  const urlParams = getQueryParams();
  
  const [sortBy, setSortBy] = useState<'views' | 'engagement' | 'tweets'>(urlParams.sortBy);
  const [page, setPage] = useState(urlParams.page);
  const [limit, setLimit] = useState(urlParams.limit);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<string>(
    startDate && endDate ? 'custom' : days.toString()
  );
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(
    startDate && endDate ? { from: startDate, to: endDate } : undefined
  );
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    isLoyaltyContext ? new Date() : subDays(new Date(), 30)
  );
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  
  // Update URL when params change
  const updateUrlParams = (newPage?: number, newLimit?: number, newSortBy?: string) => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    
    if (newPage !== undefined) {
      params.set('page', String(newPage + 1)); // Convert to 1-based for URL
    }
    if (newLimit !== undefined) {
      params.set('limit', String(newLimit));
    }
    if (newSortBy !== undefined) {
      params.set('sortBy', newSortBy);
    }
    
    const baseUrl = location.split('?')[0];
    setLocation(`${baseUrl}?${params.toString()}`);
  };

  // Fetch leaderboard data
  const { data, isLoading, error, refetch } = useQuery<ProjectLeaderboardData>({
    queryKey: [isLoyaltyContext ? `/api/v1/loyalty/leaderboard/${projectId}` : `/api/v1/mindshare/projects/${projectId}/leaderboard`, days, sortBy, page, limit, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let url = isLoyaltyContext 
        ? `/api/v1/loyalty/leaderboard/${projectId}?limit=${limit}&offset=${page * limit}`
        : `/api/v1/mindshare/projects/${projectId}/leaderboard?sortBy=${sortBy}&limit=${limit}&offset=${page * limit}`;
      
      // If we have custom dates, use them; otherwise use days
      if (startDate && endDate) {
        url += `&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
      } else {
        url += `&days=${days}`;
      }
      
      console.log('[ProjectLeaderboardView] Fetching:', url, { startDate, endDate, days });
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch project leaderboard');
      }
      const result = await response.json();
      console.log('[ProjectLeaderboardView] Result:', { 
        totalMembers: result.totalMembers,
        metrics: result.metrics,
        leaderboardCount: result.leaderboard?.length,
        firstUser: result.leaderboard?.[0]
      });
      return result;
    },
  });

  // Fetch aggregate stats separately (only for mindshare, loyalty includes metrics in main response)
  const { data: statsData } = useQuery({
    queryKey: [`/api/v1/mindshare/projects/${projectId}/leaderboard-stats`, days, startDate, endDate],
    queryFn: async () => {
      let url = `/api/v1/mindshare/projects/${projectId}/leaderboard-stats?`;
      
      // If we have custom dates, use them; otherwise use days
      if (startDate && endDate) {
        url += `startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
      } else {
        url += `days=${days}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard stats');
      }
      return response.json();
    },
    enabled: !isLoyaltyContext && !!data, // Only fetch stats for mindshare after we have leaderboard data
  });

  // Helper function to toggle user expansion
  const toggleUserExpansion = (userHandle: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userHandle)) {
      newExpanded.delete(userHandle);
    } else {
      newExpanded.add(userHandle);
    }
    setExpandedUsers(newExpanded);
  };

  // Reset page when sort, limit, or search changes
  useEffect(() => {
    setPage(0);
  }, [sortBy, limit, searchQuery]);

  // Filter leaderboard data based on search query
  const filteredLeaderboard = data?.leaderboard.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.twitter_handle.toLowerCase().includes(query) ||
      user.author_name?.toLowerCase().includes(query)
    );
  }) || [];

  // Calculate filtered totals
  // When searching, we only know about the current page's results
  const totalUsers = isLoyaltyContext ? (data?.totalMembers || 0) : (data?.total_users || 0);
  const filteredTotalUsers = searchQuery ? filteredLeaderboard.length : totalUsers;
  // Don't slice again - data is already paginated from the API
  const paginatedLeaderboard = searchQuery ? filteredLeaderboard : (data?.leaderboard || []);
  const totalPages = searchQuery 
    ? 1 // When searching, we only show results from the current page
    : Math.ceil(totalUsers / limit);

  // Handle search submit
  const handleSearch = () => {
    setSearchQuery(searchInput);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const getRankColor = (index: number): string => {
    if (index === 0) return 'text-yellow-500';
    if (index === 1) return 'text-gray-400';
    if (index === 2) return 'text-amber-700';
    return 'text-white/60';
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <TbStar className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <TbStar className="h-4 w-4 text-gray-400" />;
    if (index === 2) return <TbStar className="h-4 w-4 text-amber-700" />;
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <TbLoader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">
          Error: {error instanceof Error ? error.message : 'Failed to load leaderboard'}
        </p>
      </div>
    );
  }

  if (!data || data.leaderboard.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-white/50">No users found for this project in the selected time period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort and Period Controls - Moved to top */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">Sort by</span>
            <Select value={sortBy} onValueChange={(value) => {
              setSortBy(value as 'views' | 'engagement' | 'tweets');
              updateUrlParams(page, limit, value);
            }}>
              <SelectTrigger className="h-8 w-40 bg-[#12131e] border-[#2b2d3c] text-white text-sm hover:bg-[#1a1b29]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#12131e] border-[#2b2d3c] text-white">
                <SelectItem value="views" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Most Views</SelectItem>
                <SelectItem value="engagement" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Most Engagement</SelectItem>
                <SelectItem value="tweets" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Most Tweets</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <TbCalendar className="h-4 w-4 text-white/60" />
            <span className="text-xs text-white/60">Period</span>
            <Popover open={showCustomDatePicker} onOpenChange={setShowCustomDatePicker}>
              <PopoverTrigger asChild>
                <div>
                  <Select 
                    value={dateRange} 
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        setDateRange('custom');
                        setShowCustomDatePicker(true);
                      } else {
                        setDateRange(value);
                        setShowCustomDatePicker(false);
                        if (onDaysChange) {
                          onDaysChange(parseInt(value));
                        }
                        if (onDateRangeChange) {
                          onDateRangeChange(undefined); // Clear custom date range
                        }
                      }
                    }}
                  >
                    <SelectTrigger 
                      className="h-8 w-40 bg-[#12131e] border-[#2b2d3c] text-white text-sm hover:bg-[#1a1b29]"
                      onClick={() => {
                        if (dateRange === 'custom') {
                          setShowCustomDatePicker(true);
                        }
                      }}
                    >
                      <SelectValue>
                        {dateRange === 'custom' && customDateRange?.from && customDateRange?.to
                          ? `${format(customDateRange.from, 'MMM d')} - ${format(customDateRange.to, 'MMM d')}`
                          : dateRange === 'custom'
                          ? 'Custom dates'
                          : dateRange === '1'
                          ? 'Last 24 hours'
                          : dateRange === '7'
                          ? 'Last 7 days'
                          : dateRange === '14'
                          ? 'Last 14 days'
                          : dateRange === '30'
                          ? 'Last 30 days'
                          : dateRange === '90'
                          ? 'Last 90 days'
                          : `Last ${dateRange} days`}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-[#12131e] border-[#2b2d3c] text-white">
                      <SelectItem value="1" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Last 24 hours</SelectItem>
                      <SelectItem value="7" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Last 7 days</SelectItem>
                      <SelectItem value="14" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Last 14 days</SelectItem>
                      <SelectItem value="30" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Last 30 days</SelectItem>
                      <SelectItem value="90" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Last 90 days</SelectItem>
                      <SelectItem value="custom" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">Custom dates...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-[#12131e] border-[#2b2d3c]" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  defaultMonth={isLoyaltyContext ? new Date() : subDays(new Date(), 30)}
                  selected={customDateRange}
                  onSelect={(range) => {
                    setCustomDateRange(range);
                  }}
                  numberOfMonths={2}
                  className="rounded-md border border-[#2b2d3c]"
                  fromDate={projectStartTime}
                  toDate={projectEndTime || new Date()}
                />
                <div className="p-3 border-t border-[#2b2d3c] space-y-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowCustomDatePicker(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setCustomDateRange(undefined);
                        setDateRange('7');
                        setShowCustomDatePicker(false);
                        if (onDaysChange) {
                          onDaysChange(7);
                        }
                        if (onDateRangeChange) {
                          onDateRangeChange(undefined);
                        }
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-primary text-black hover:bg-primary/90"
                      onClick={() => {
                        if (customDateRange?.from && customDateRange?.to) {
                          setShowCustomDatePicker(false);
                          if (onDateRangeChange) {
                            onDateRangeChange(customDateRange);
                          }
                        }
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                  
                  {/* Quick select options */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs justify-start hover:bg-[#1a1b29]"
                      onClick={() => {
                        const today = new Date();
                        setCustomDateRange({
                          from: startOfDay(today),
                          to: endOfDay(today)
                        });
                      }}
                    >
                      Today
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs justify-start hover:bg-[#1a1b29]"
                      onClick={() => {
                        const end = new Date();
                        const start = subDays(end, 6);
                        setCustomDateRange({
                          from: startOfDay(start),
                          to: endOfDay(end)
                        });
                      }}
                    >
                      Last 7 days
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs justify-start hover:bg-[#1a1b29]"
                      onClick={() => {
                        const end = new Date();
                        const start = subDays(end, 29);
                        setCustomDateRange({
                          from: startOfDay(start),
                          to: endOfDay(end)
                        });
                      }}
                    >
                      Last 30 days
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">Rows per page</span>
          <Select value={limit.toString()} onValueChange={(value) => {
            const newLimit = Number(value);
            setLimit(newLimit);
            setPage(0); // Reset to first page when changing limit
            updateUrlParams(0, newLimit, sortBy);
          }}>
            <SelectTrigger className="h-8 w-20 bg-[#12131e] border-[#2b2d3c] text-white text-sm hover:bg-[#1a1b29]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#12131e] border-[#2b2d3c] text-white">
              <SelectItem value="10" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">10</SelectItem>
              <SelectItem value="25" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">25</SelectItem>
              <SelectItem value="50" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">50</SelectItem>
              <SelectItem value="100" className="hover:bg-[#1a1b29] focus:bg-[#1a1b29]">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Header Stats */}
      <Card className="bg-[#12131e] border-[#2b2d3c] p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">
              {isLoyaltyContext 
                ? (data?.totalMembers || 0)
                : (statsData?.total_users || data?.total_users || 0)
              }
            </div>
            <div className="text-xs text-white/50">Total Users</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {isLoyaltyContext 
                ? (data?.metrics ? formatNumber(data.metrics.totalViews) : <TbLoader2 className="h-5 w-5 text-primary animate-spin inline" />)
                : (statsData ? formatNumber(statsData.total_views) : <TbLoader2 className="h-5 w-5 text-primary animate-spin inline" />)
              }
            </div>
            <div className="text-xs text-white/50">Total Views</div>
          </div>
          <div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <div className="text-2xl font-bold text-white">
                      {isLoyaltyContext 
                        ? (data?.metrics ? formatNumber((data.metrics.totalLikes || 0) + (data.metrics.totalRetweets || 0) + (data.metrics.totalReplies || 0)) : <TbLoader2 className="h-5 w-5 text-primary animate-spin inline" />)
                        : (statsData ? formatNumber(statsData.total_engagement) : <TbLoader2 className="h-5 w-5 text-primary animate-spin inline" />)
                      }
                    </div>
                    <div className="text-xs text-white/50">Total Engagement</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-[#1a1b29] border-[#2b2d3c] text-white">
                  <div className="space-y-1 text-sm">
                    {isLoyaltyContext && data?.metrics ? (
                      <>
                        <div className="flex items-center gap-2">
                          <TbHeart className="h-3 w-3" />
                          <span>{formatNumber(data.metrics.totalLikes || 0)} Likes</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TbRepeat className="h-3 w-3" />
                          <span>{formatNumber(data.metrics.totalRetweets || 0)} Retweets</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TbMessage2 className="h-3 w-3" />
                          <span>{formatNumber(data.metrics.totalReplies || 0)} Replies</span>
                        </div>
                      </>
                    ) : statsData ? (
                      <span>Total likes, retweets, and replies</span>
                    ) : null}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </Card>

      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            placeholder="Search by username or handle..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
              }
            }}
            className="bg-[#12131e] border-[#2b2d3c] text-white placeholder:text-white/40 pr-10"
          />
          {searchQuery && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearSearch}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-[#1a1b29]"
            >
              <TbX className="h-4 w-4 text-white/60" />
            </Button>
          )}
        </div>
        <Button
          onClick={handleSearch}
          className="bg-[#2b2d3c] hover:bg-[#3b3d4c] text-white"
        >
          <TbSearch className="h-4 w-4 mr-2" />
          Search
        </Button>
      </div>

      {/* Show search results info */}
      {searchQuery && (
        <div className="text-sm text-white/60">
          Found {filteredTotalUsers} user{filteredTotalUsers !== 1 ? 's' : ''} matching "{searchQuery}"
        </div>
      )}


      {/* Leaderboard Table */}
      <div>
        {paginatedLeaderboard.length === 0 && searchQuery ? (
          <Card className="bg-[#12131e] border-[#2b2d3c] p-8 text-center">
            <p className="text-white/50">No users found matching "{searchQuery}"</p>
          </Card>
        ) : (
          paginatedLeaderboard.map((user, index) => {
          const globalRank = page * limit + index;
          const isFirst = index === 0;
          const isLast = index === paginatedLeaderboard.length - 1;
          return (
            <Card
              key={user.twitter_handle}
              className={cn(
                "bg-[#12131e] border-[#2b2d3c] transition-colors overflow-hidden",
                "rounded-none border-x border-t",
                isFirst && "rounded-t-lg",
                isLast && "rounded-b-lg border-b",
                !isFirst && "-mt-[1px]"
              )}
            >
              <div 
                className="hover:bg-[#1a1b29] cursor-pointer"
                onClick={() => toggleUserExpansion(user.twitter_handle)}
              >
                <div className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4">
                {/* Rank */}
                <div className={cn("flex items-center gap-1 sm:gap-2 w-12 sm:w-16", getRankColor(globalRank))}>
                  <span className="text-sm sm:text-lg font-bold">#{globalRank + 1}</span>
                  {getRankIcon(globalRank)}
                </div>

                {/* User Info */}
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                    <AvatarImage src={user.profile_image_url || user.profilePicture || undefined} />
                    <AvatarFallback className="bg-[#1a1b29] text-white border border-[#2b2d3c] text-xs sm:text-base">
                      {(user.author_name || user.username || user.twitter_handle)?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <a
                        href={`https://x.com/${user.twitter_handle.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-xs sm:text-sm text-white hover:underline truncate max-w-[120px] sm:max-w-[200px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {user.author_name || user.username || user.twitter_handle}
                      </a>
                      {user.verified && (
                        <Badge variant="secondary" className="bg-blue-600 text-white text-[10px] sm:text-xs py-0 px-0.5 sm:px-1">
                          ✓
                        </Badge>
                      )}
                      <TbExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white/40 flex-shrink-0" />
                    </div>
                    <div className="text-[10px] sm:text-xs text-white/60 truncate">
                      <span className="hidden sm:inline">{user.twitter_handle} · </span>
                      <span>{user.follower_count ? `${formatNumber(user.follower_count)} followers` : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-4 gap-2 sm:gap-6 text-center">
                  <div>
                    <div className="text-xs sm:text-sm font-medium text-white">{user.tweet_count || 0}</div>
                    <div className="text-[10px] sm:text-xs text-white/50">Tweets</div>
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-medium text-white">{formatNumber(user.total_views || user.views || 0)}</div>
                    <div className="text-[10px] sm:text-xs text-white/50">Views</div>
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-medium text-white">{formatNumber(user.total_engagement || ((user.likes || 0) + (user.retweets || 0) + (user.replies || 0)) || 0)}</div>
                    <div className="text-[10px] sm:text-xs text-white/50">Engagement</div>
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-medium text-white">{user.engagement_rate || (user.views ? (((user.likes || 0) + (user.retweets || 0) + (user.replies || 0)) / user.views * 100).toFixed(2) : 0)}%</div>
                    <div className="text-[10px] sm:text-xs text-white/50">Eng. Rate</div>
                  </div>
                </div>
                
                {/* Expand/Collapse indicator */}
                <div className="ml-2 sm:ml-4">
                  {expandedUsers.has(user.twitter_handle) ? (
                    <TbChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-white/60" />
                  ) : (
                    <TbChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-white/60" />
                  )}
                </div>
                </div>
              </div>
              
              {/* Expandable section - shows additional metrics and tweets */}
              {expandedUsers.has(user.twitter_handle) && (
                <>
                  {/* Additional metrics section */}
                  <div className="px-4 py-3 border-t border-[#2b2d3c]">
                    <div className="grid grid-cols-4 gap-6 text-xs text-white/60">
                      <div className="flex items-center">
                        <TbHeart className="h-3 w-3 mr-1" />
                        {formatNumber(user.total_likes || user.likes || 0)} likes
                      </div>
                      <div className="flex items-center">
                        <TbRepeat className="h-3 w-3 mr-1" />
                        {formatNumber(user.total_retweets || user.retweets || 0)} retweets
                      </div>
                      <div className="flex items-center">
                        <TbMessage2 className="h-3 w-3 mr-1" />
                        {formatNumber(user.total_replies || user.replies || 0)} replies
                      </div>
                      <div>
                        Last tweet: {user.last_tweet || user.last_activity 
                          ? format(new Date(user.last_tweet || user.last_activity), 'MMM d, yyyy')
                          : 'No tweets yet'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Tweets section */}
                  <div className="border-t border-[#2b2d3c] bg-[#0d0e18]">
                    <UserTweetsSection
                      projectId={projectId}
                      userHandle={user.twitter_handle}
                      days={days}
                      startDate={startDate}
                      endDate={endDate}
                      isLoyaltyContext={isLoyaltyContext}
                    />
                  </div>
                </>
              )}
            </Card>
          );
        })
        )}
      </div>

      {/* Pagination */}
      {data && totalUsers > 0 && (
        <div className="mt-6 px-4 pb-8">
          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mb-4">
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  const newPage = page - 1;
                  setPage(newPage);
                  updateUrlParams(newPage, limit, sortBy);
                }}
                disabled={page === 0}
                className="text-white hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent px-6 py-2 text-base font-normal"
              >
                Previous
              </Button>
              
              <span className="text-base text-white/80 px-4">
                Page {page + 1} of {totalPages}
              </span>
              
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  const newPage = page + 1;
                  setPage(newPage);
                  updateUrlParams(newPage, limit, sortBy);
                }}
                disabled={page >= totalPages - 1}
                className="text-white hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent px-6 py-2 text-base font-normal"
              >
                Next
              </Button>
            </div>
          )}
          
          {/* Showing users text */}
          <div className="text-sm text-white/60 text-center">
            {searchQuery ? (
              `Found ${paginatedLeaderboard.length} user${paginatedLeaderboard.length !== 1 ? 's' : ''} matching "${searchQuery}" on this page`
            ) : (
              `Showing ${page * limit + 1}-${Math.min((page + 1) * limit, totalUsers)} of ${totalUsers} users`
            )}
          </div>
        </div>
      )}
    </div>
  );
}