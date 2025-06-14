import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  TbBrandX, TbTrophy, TbStar, TbUserSearch, TbChartBar, TbArrowRight, 
  TbHeart, TbCoin, TbUserCircle, TbThumbUp, TbMessageCircle, TbShare, 
  TbReceipt, TbUsers, TbMessageDots, TbBuildingCommunity
} from "react-icons/tb";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isRateLimitError, getErrorMessage } from "@/utils/errorHandler";
import { useSEO } from "@/hooks/use-seo";
import { getPageSEO } from "@/lib/seo-config";
import { useTranslation } from "react-i18next";

interface LeaderboardUser {
  handle: string;
  reputation?: number;
  profile_url?: string;
  profile_image_url?: string;
  position?: number;
}

export default function Home() {
  // SEO configuration
  useSEO(getPageSEO('home'));
  const { t } = useTranslation();

  // For the animated text
  const [textIndex, setTextIndex] = useState(0);
  const animatedTexts = ["GiveRep", "EarnRep"];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTextIndex((prevIndex) => (prevIndex + 1) % animatedTexts.length);
    }, 3000); // Change every 3 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // Create style to customize header only, don't hide footer
  useEffect(() => {
    // Add class to style the header
    document.body.classList.add('home-header');
    
    // Clean up when component unmounts
    return () => {
      document.body.classList.remove('home-header');
    }
  }, []);
  
  // Fetch trophy leaderboard data for preview
  const { data: trophyData, error: trophyError, isError: isTrophyError } = useQuery({
    queryKey: ['/api/giverep/stats', 'preview'],
    queryFn: async () => {
      const response = await fetch('/api/giverep/stats?limit=5&offset=0');
      if (!response.ok) throw new Error('Failed to fetch trophy leaderboard');
      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
    retry: (failureCount, error) => {
      // If rate limited, retry after a delay
      if (isRateLimitError(error) && failureCount < 3) {
        return true;
      }
      return failureCount < 2;
    },
    retryDelay: 1000, // 1 second between retries
  });

  // Fetch reputation leaderboard data for preview (7 days)
  const { data: reputationData, error: reputationError, isError: isReputationError } = useQuery({
    queryKey: ['/api/giverep/reputation/leaderboard', 'preview', '7_days'],
    queryFn: async () => {
      const response = await fetch('/api/giverep/reputation/leaderboard?limit=5&offset=0&timeRange=7_days');
      if (!response.ok) throw new Error('Failed to fetch reputation leaderboard');
      const data = await response.json();
      
      // Get Twitter handles to fetch profile images from Twitter API
      const handles = data.users?.map((user: LeaderboardUser) => user.handle) || [];
      
      if (handles.length > 0) {
        try {
          // Import the utility function for getting Twitter user info in parallel
          const { getTwitterUserInfoBatch } = await import('@/utils/twitterUserInfo');
          
          // Use the getTwitterUserInfoBatch function which makes parallel individual GET requests
          // for better caching via Cloudflare
          const userInfoMap = await getTwitterUserInfoBatch(handles);
          
          // Update user data with Twitter profile info
          if (userInfoMap.size > 0) {
            data.users = data.users.map((user: LeaderboardUser) => {
              const normalizedHandle = user.handle.toLowerCase();
              const twitterInfo = userInfoMap.get(normalizedHandle);
              
              if (twitterInfo) {
                return {
                  ...user,
                  profile_image_url: twitterInfo.profile_image_url,
                  profile_url: twitterInfo.profile_url || user.profile_url
                };
              }
              return user;
            });
          }
        } catch (err) {
          console.error("Error fetching Twitter user info for homepage:", err);
          // Continue with the original data if Twitter info fetch fails
        }
      }
      
      return data;
    }, 
    staleTime: 60 * 1000, // 1 minute,
    retry: (failureCount, error) => {
      // If rate limited, retry after a delay
      if (isRateLimitError(error) && failureCount < 3) {
        return true;
      }
      return failureCount < 2;
    },
    retryDelay: 1000, // 1 second between retries
  });
  
  // Fetch loyalty preview data
  const { data: loyaltyData, error: loyaltyError, isError: isLoyaltyError } = useQuery({
    queryKey: ['/api/loyalty/projects', 'preview'],
    queryFn: async () => {
      const response = await fetch('/api/loyalty/projects?activeOnly=true');
      if (!response.ok) throw new Error('Failed to fetch loyalty projects');
      let projectData = await response.json();
      
      // Get Twitter handles for projects to fetch their updated profile images
      const handles = projectData
        .filter((project: any) => project.twitter_handle)
        .map((project: any) => project.twitter_handle);
      
      if (handles.length > 0) {
        try {
          // Import the utility function for getting Twitter user info in parallel
          const { getTwitterUserInfoBatch } = await import('@/utils/twitterUserInfo');
          
          // Use the getTwitterUserInfoBatch function which makes parallel individual GET requests
          // for better caching via Cloudflare
          const userInfoMap = await getTwitterUserInfoBatch(handles);
          
          // Update project data with Twitter profile info
          if (userInfoMap.size > 0) {
            projectData = projectData.map((project: any) => {
              if (!project.twitter_handle) return project;
              
              const normalizedHandle = project.twitter_handle.toLowerCase();
              const twitterInfo = userInfoMap.get(normalizedHandle);
              
              if (twitterInfo) {
                return {
                  ...project,
                  profile_image_url: twitterInfo.profile_image_url || project.profile_image_url,
                  banner_url: twitterInfo.banner_url || project.banner_url
                };
              }
              return project;
            });
          }
        } catch (err) {
          console.error("Error fetching Twitter user info for loyalty projects:", err);
          // Continue with the original data if Twitter info fetch fails
        }
      }
      
      return projectData;
    },
    staleTime: 60 * 1000, // 1 minute,
    retry: (failureCount, error) => {
      // If rate limited, retry after a delay
      if (isRateLimitError(error) && failureCount < 3) {
        return true;
      }
      return failureCount < 2;
    },
    retryDelay: 1000, // 1 second between retries
  });

  // Fetch mindshare preview data
  const { data: mindshareData, error: mindshareError, isError: isMindshareError } = useQuery({
    queryKey: ['/api/v1/mindshare/projects', 'preview'],
    queryFn: async () => {
      const response = await fetch('/api/v1/mindshare/projects?days=7');
      if (!response.ok) throw new Error('Failed to fetch mindshare projects');
      let projectData = await response.json();
      
      // Get Twitter handles for projects to fetch their updated profile images
      const handles = projectData.map((project: any) => project.twitter_handle).filter(Boolean);
      
      if (handles.length > 0) {
        try {
          // Import the utility function for getting Twitter user info in parallel
          const { getTwitterUserInfoBatch } = await import('@/utils/twitterUserInfo');
          
          // Use the getTwitterUserInfoBatch function which makes parallel individual GET requests
          // for better caching via Cloudflare
          const userInfoMap = await getTwitterUserInfoBatch(handles);
          
          // Update project data with Twitter profile info
          if (userInfoMap.size > 0) {
            projectData = projectData.map((project: any) => {
              if (!project.twitter_handle) return project;
              
              const normalizedHandle = project.twitter_handle.toLowerCase();
              const twitterInfo = userInfoMap.get(normalizedHandle);
              
              if (twitterInfo) {
                return {
                  ...project,
                  logo_url: twitterInfo.profile_image_url || project.logo_url,
                  banner_url: twitterInfo.banner_url || project.banner_url
                };
              }
              return project;
            });
          }
        } catch (err) {
          console.error("Error fetching Twitter user info for mindshare projects:", err);
          // Continue with the original data if Twitter info fetch fails
        }
      }
      
      return projectData;
    },
    staleTime: 60 * 1000, // 1 minute,
    retry: (failureCount, error) => {
      // If rate limited, retry after a delay
      if (isRateLimitError(error) && failureCount < 3) {
        return true;
      }
      return failureCount < 2;
    },
    retryDelay: 1000, // 1 second between retries
  });
  
  return (
    <div className="min-h-screen relative">
      {/* Full-screen background gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#13141f] via-[#1a1f38] to-[#1e1842] opacity-90 z-0"></div>
      
      {/* Top-to-bottom gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#13141f] via-transparent to-[#13141f] opacity-50 z-0"></div>
      
      {/* Background glow effects */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px] opacity-50 z-0"></div>
      <div className="fixed bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-purple-600/10 blur-[100px] opacity-40 z-0"></div>
      <div className="fixed top-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[80px] opacity-30 z-0"></div>
      
      {/* Main content */}
      <div className="relative z-10 py-8 space-y-8">
        {/* Header Section - GiveRep/EarnRep */}
        <section className="mx-auto max-w-5xl px-0 text-center mb-12">
          {/* Logo with animated text */}
          <h1 className="text-4xl md:text-7xl font-bold mb-4 tracking-tight leading-none pixel-text min-h-[70px] md:min-h-[90px] overflow-hidden flex justify-center">
            <span className="relative inline-block">
              <span className="text-white">{animatedTexts[textIndex].substring(0, 4)}</span>
              <span className="text-primary">{animatedTexts[textIndex].substring(4)}</span>
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-white/80 mb-6 leading-relaxed max-w-2xl mx-auto font-light px-4">
            {t('home.tagline')}
          </p>
        </section>
        
        {/* About GiveRep Section */}
        <section className="mx-auto max-w-5xl px-6 mb-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: What is GiveRep */}
            <Card className="bg-[#1a1b29] border-[#2b2d3c] text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-md flex items-center gap-2">
                  <TbUserCircle className="text-primary h-5 w-5" />
                  {t('home.identity.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/70">
                  {t('home.identity.description')}
                </p>
              </CardContent>
            </Card>
            
            {/* Card 2: Reputation Point */}
            <Card className="bg-[#1a1b29] border-[#2b2d3c] text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-md flex items-center gap-2">
                  <TbStar className="text-amber-500 h-5 w-5" />
                  {t('home.reputationPoint.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/70">
                  {t('home.reputationPoint.description')}
                </p>
              </CardContent>
            </Card>
            
            {/* Card 3: Mindshare Tracking */}
            <Card className="bg-[#1a1b29] border-[#2b2d3c] text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-md flex items-center gap-2">
                  <TbChartBar className="text-purple-500 h-5 w-5" />
                  {t('home.mindshareTracking.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/70">
                  {t('home.mindshareTracking.description')}
                </p>
              </CardContent>
            </Card>
            
            {/* Card 4: Loyalty Program Reward */}
            <Card className="bg-[#1a1b29] border-[#2b2d3c] text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-md flex items-center gap-2">
                  <TbCoin className="text-green-500 h-5 w-5" />
                  {t('home.loyaltyProgramReward.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/70">
                  {t('home.loyaltyProgramReward.description')}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
        
        {/* Leaderboard Section */}
        <section className="mb-10">
          <div className="mx-auto max-w-5xl px-6">
            <div className="grid grid-cols-1 gap-6">
              {/* Reputation Leaderboard */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                    <TbStar className="text-amber-500 h-6 w-6" />
                    {t('home.reputation')}
                  </h2>
                  <Link href="/reputation-leaderboard">
                    <Button variant="link" className="text-amber-500 hover:text-amber-400">
                      {t('home.seeMore')} <TbArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                
                <div className="bg-[#1a1b29] border border-[#2b2d3c] rounded-md p-4">
                  {isReputationError ? (
                    <div className="py-8 text-center">
                      {isRateLimitError(reputationError) ? (
                        <div className="flex flex-col items-center space-y-2">
                          <p className="text-amber-400">API Rate Limit Reached</p>
                          <p className="text-white/50 text-xs max-w-sm">
                            We're experiencing high demand on our Twitter API. 
                            Please wait a moment and refresh the page.
                          </p>
                        </div>
                      ) : (
                        <p className="text-red-400">Error loading reputation data</p>
                      )}
                    </div>
                  ) : reputationData ? (
                    <div className="space-y-4">
                      {reputationData.users?.slice(0, 3).map((user: LeaderboardUser, index: number) => (
                        <div key={index} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-3">
                            <span className="text-white/60 w-6 text-center font-medium">{user.position || index + 1}</span>
                            <Avatar className="h-8 w-8">
                              {user.profile_url || user.profile_image_url ? (
                                <AvatarImage 
                                  src={user.profile_image_url || user.profile_url} 
                                  alt={user.handle} 
                                />
                              ) : null}
                              <AvatarFallback className="bg-amber-500/20 text-amber-500 text-xs">
                                {user.handle?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="text-white font-medium">@{user.handle}</span>
                            </div>
                          </div>
                          <div className="text-white flex items-center gap-2">
                            <span className="font-medium">{(user.reputation || 0).toLocaleString()}</span>
                            <TbStar className="text-amber-500 h-5 w-5" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-white/50">Loading reputation leaderboard...</div>
                  )}
                </div>
              </div>
              
              {/* Trophy Score Leaderboard section is hidden as requested */}
              {/* We're keeping the code in the component but not rendering it */}
              {/* This section will be restored later when needed */}
            </div>
          </div>
        </section>
        
        {/* Loyalty Program Preview */}
        <section className="mb-10 pt-4 border-t border-[#2b2d3c] mt-8">
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex justify-between items-center mb-4 mt-4">
              <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                <TbCoin className="text-green-500 h-6 w-6" />
                {t('home.loyaltyProgramsSection')}
              </h2>
              <Link href="/loyalty">
                <Button variant="link" className="text-green-500 hover:text-green-400">
                  {t('home.seeMore')} <TbArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
            
            <div className="relative">
              {/* Scrollable container for project cards */}
              <div className="overflow-x-auto pb-4 pt-1 pl-4 hide-scrollbar">
                <div className="flex space-x-4 pt-3 mt-1 pl-1" style={{ minWidth: 'min-content' }}>
                  {isLoyaltyError ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      {isRateLimitError(loyaltyError) ? (
                        <div className="flex flex-col items-center space-y-2">
                          <p className="text-amber-400">API Rate Limit Reached</p>
                          <p className="text-white/50 text-xs max-w-sm">
                            We're experiencing high demand on our Twitter API. 
                            Please wait a moment and refresh the page.
                          </p>
                        </div>
                      ) : (
                        <p className="text-red-400">Error loading loyalty programs</p>
                      )}
                    </div>
                  ) : loyaltyData ? (
                    [...loyaltyData]
                      .sort((a: any, b: any) => {
                        // First sort by featured status (featured projects first)
                        if (a.is_featured && !b.is_featured) return -1;
                        if (!a.is_featured && b.is_featured) return 1;
                        // Then sort by ID as a fallback
                        return a.id - b.id;
                      })
                      .slice(0, 5)
                      .map((project: any, index: number) => {
                      // Generate accent colors based on project name for projects without banners
                      const projectNameHash = project.name
                        .split("")
                        .reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                      const hue = projectNameHash % 360;
                      const baseAccent = `hsl(${hue}, 70%, 50%)`;
                      
                      return (
                        <div
                          key={project.id || index}
                          className="flex-none w-64 relative"
                        >
                          <Link href={`/loyalty?view=${project.id}`} className="block h-full w-full">
                            <div 
                              className={`bg-[#12131e] text-white overflow-hidden relative group rounded-md h-full cursor-pointer
                               ${project.is_featured ? 'animate-rainbow-rotate' : ''}`}
                              style={{
                                borderColor: project.is_featured 
                                  ? undefined // No border color when featured (handled by animation)
                                  : project.banner_url
                                    ? `rgba(255, 255, 255, 0.6)`
                                    : baseAccent,
                                borderWidth: project.is_featured ? "3px" : "2px",
                                borderStyle: "solid",
                                boxShadow: project.is_featured
                                  ? "0 4px 25px rgba(138, 43, 226, 0.35)"
                                  : project.banner_url
                                    ? "0 4px 20px rgba(255, 255, 255, 0.15)"
                                    : `0 4px 20px ${baseAccent}25`,
                                transition: "all 0.3s ease-in-out",
                              }}
                              onMouseEnter={(e) => {
                                const target = e.currentTarget;
                                target.style.transform = "translateY(-4px)";
                                target.style.boxShadow = project.is_featured
                                  ? "0 8px 25px rgba(138, 43, 226, 0.45)"
                                  : project.banner_url
                                    ? "0 8px 25px rgba(255, 255, 255, 0.25)"
                                    : `0 8px 25px ${baseAccent}40`;
                              }}
                              onMouseLeave={(e) => {
                                const target = e.currentTarget;
                                target.style.transform = "translateY(0)";
                                target.style.boxShadow = project.is_featured
                                  ? "0 4px 25px rgba(138, 43, 226, 0.35)"
                                  : project.banner_url
                                    ? "0 4px 20px rgba(255, 255, 255, 0.15)"
                                    : `0 4px 20px ${baseAccent}25`;
                              }}
                            >
                              {/* Project banner or background */}
                              {project.banner_url && (
                                <div
                                  className="absolute inset-0 bg-cover bg-center"
                                  style={{
                                    backgroundImage: `url(${project.banner_url})`,
                                    opacity: 0.2,
                                  }}
                                />
                              )}
                              
                              <div className="p-4 relative z-10 flex flex-col h-full">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex-grow">
                                    <h3 className="text-lg font-medium text-white">{project.name}</h3>
                                    <p className="text-white/70 text-xs">
                                      @{project.twitter_handle || "project"}
                                    </p>
                                  </div>
                                  <Avatar className="h-10 w-10 flex-shrink-0">
                                    {project.logo_url || project.profile_image_url ? (
                                      <AvatarImage 
                                        src={project.profile_image_url || project.logo_url} 
                                        alt={project.name} 
                                      />
                                    ) : null}
                                    <AvatarFallback 
                                      className="text-xs"
                                      style={{ 
                                        backgroundColor: `${baseAccent}30`,
                                        color: baseAccent 
                                      }}
                                    >
                                      {project.name?.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                </div>
                                
                                {/* Project description truncated */}
                                <p className="text-sm text-white/60 mb-3 line-clamp-2 h-10">
                                  {project.description || t('home.joinLoyalty')}
                                </p>
                                
                                {/* Push the joined count to the bottom with flex-grow */}
                                <div className="flex-grow"></div>
                                
                                <div className="flex items-center justify-between text-sm mt-auto">
                                  <span className="text-white/60">
                                    {(project.memberCount || 0).toLocaleString()} joined
                                  </span>
                                  {false && project.total_incentive_spent && ( // disable this for now, and will show later
                                    <span className="text-green-400">
                                      ${(project.total_incentive_spent / 100).toLocaleString()} earned
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Link>
                        </div>
                      );
                    })
                  ) : (
                    // Skeleton loaders when data is loading
                    Array(4).fill(0).map((_, i) => (
                      <div key={i} className="flex-none w-64">
                        <div className="bg-[#12131e] border border-[#2b2d3c] rounded-md p-4 h-full">
                          <div className="animate-pulse space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="space-y-2 flex-grow">
                                <div className="h-4 bg-[#2b2d3c] rounded w-3/4"></div>
                                <div className="h-3 bg-[#2b2d3c] rounded w-1/2"></div>
                              </div>
                              <div className="h-10 w-10 bg-[#2b2d3c] rounded-full"></div>
                            </div>
                            <div className="h-10 mt-4">
                              <div className="h-3 bg-[#2b2d3c] rounded w-full"></div>
                              <div className="h-3 bg-[#2b2d3c] rounded w-5/6 mt-2"></div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="h-3 bg-[#2b2d3c] rounded w-1/3"></div>
                              <div className="h-8 bg-[#2b2d3c] rounded w-16"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              {/* Scrollability indicators removed as requested */}
            </div>
          </div>
        </section>
        
        {/* Community Mindshare Preview */}
        <section className="mb-10 pt-4 border-t border-[#2b2d3c] mt-8">
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex justify-between items-center mb-4 mt-4">
              <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                <TbMessageDots className="text-purple-500 h-6 w-6" />
                {t('home.communityMindshare')}
              </h2>
              <Link href="/mindshare-dashboard">
                <Button variant="link" className="text-purple-500 hover:text-purple-400">
                  {t('home.seeMore')} <TbArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
            
            <div className="relative">
              {/* Scrollable container for project cards */}
              <div className="overflow-x-auto pb-4 pt-1 pl-4 hide-scrollbar">
                <div className="flex space-x-4 pt-3 mt-1 pl-1" style={{ minWidth: 'min-content' }}>
                  {isMindshareError ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      {isRateLimitError(mindshareError) ? (
                        <div className="flex flex-col items-center space-y-2">
                          <p className="text-amber-400">API Rate Limit Reached</p>
                          <p className="text-white/50 text-xs max-w-sm">
                            We're experiencing high demand on our Twitter API. 
                            Please wait a moment and refresh the page.
                          </p>
                        </div>
                      ) : (
                        <p className="text-red-400">Error loading mindshare projects</p>
                      )}
                    </div>
                  ) : mindshareData ? (
                    [...mindshareData].sort((a: any, b: any) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((project: any, index: number) => {
                      // Generate accent colors based on project name for projects without banners
                      const projectNameHash = project.name
                        .split("")
                        .reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                      const hue = (projectNameHash % 60) + 240; // Purple range (240-300)
                      const baseAccent = `hsl(${hue}, 70%, 60%)`;
                      
                      // Extract Twitter handle without @ symbol if present
                      const cleanHandle = project.twitter_handle?.startsWith('@') 
                        ? project.twitter_handle.substring(1) 
                        : project.twitter_handle;
                        
                      return (
                        <div
                          key={project.id || index}
                          className="flex-none w-64 relative"
                        >
                          <Link href={`/mindshare-dashboard?view=${project.id}`} className="block h-full w-full">
                            <div 
                              className="bg-[#12131e] text-white overflow-hidden relative group rounded-md h-full cursor-pointer"
                              style={{
                                borderColor: project.banner_url
                                  ? `rgba(190, 130, 255, 0.6)`
                                  : baseAccent,
                                borderWidth: "2px",
                                borderStyle: "solid",
                                boxShadow: project.banner_url
                                  ? "0 4px 20px rgba(190, 130, 255, 0.15)"
                                  : `0 4px 20px ${baseAccent}25`,
                                transition: "all 0.3s ease-in-out",
                              }}
                              onMouseEnter={(e) => {
                                const target = e.currentTarget;
                                target.style.transform = "translateY(-4px)";
                                target.style.boxShadow = project.banner_url
                                  ? "0 8px 25px rgba(190, 130, 255, 0.25)"
                                  : `0 8px 25px ${baseAccent}40`;
                              }}
                              onMouseLeave={(e) => {
                                const target = e.currentTarget;
                                target.style.transform = "translateY(0)";
                                target.style.boxShadow = project.banner_url
                                  ? "0 4px 20px rgba(190, 130, 255, 0.15)"
                                  : `0 4px 20px ${baseAccent}25`;
                              }}
                            >
                              {/* Project banner or background */}
                              {project.banner_url && (
                                <div
                                  className="absolute inset-0 bg-cover bg-center"
                                  style={{
                                    backgroundImage: `url(${project.banner_url})`,
                                    opacity: 0.2,
                                  }}
                                />
                              )}
                              
                              <div className="p-4 relative z-10 flex flex-col h-full">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex-grow">
                                    <h3 className="text-lg font-medium text-white">{project.name}</h3>
                                    <p className="text-white/70 text-xs">
                                      @{cleanHandle || "project"}
                                    </p>
                                  </div>
                                  <Avatar className="h-10 w-10 flex-shrink-0">
                                    {project.logo_url || project.profile_image_url ? (
                                      <AvatarImage 
                                        src={project.profile_image_url || project.logo_url} 
                                        alt={project.name} 
                                      />
                                    ) : null}
                                    <AvatarFallback 
                                      className="text-xs"
                                      style={{ 
                                        backgroundColor: `${baseAccent}30`,
                                        color: baseAccent 
                                      }}
                                    >
                                      {project.name?.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                </div>
                                
                                {/* Project description truncated */}
                                <p className="text-sm text-white/60 mb-3 line-clamp-2 h-10">
                                  {project.description || t('home.shareMindshare')}
                                </p>
                                
                                {/* Push the stats to the bottom with flex-grow */}
                                <div className="flex-grow"></div>
                                
                                <div className="flex items-center justify-between text-sm mt-auto">
                                  <span className="text-white/60">
                                    {(project.tweet_count || 0).toLocaleString()} tweets
                                  </span>
                                  {project.metrics && (
                                    <span className="text-purple-400">
                                      {(project.metrics.views || 0).toLocaleString()} views
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Link>
                        </div>
                      );
                    })
                  ) : (
                    // Skeleton loaders when data is loading
                    Array(4).fill(0).map((_, i) => (
                      <div key={i} className="flex-none w-64">
                        <div className="bg-[#12131e] border border-[#2b2d3c] rounded-md p-4 h-full">
                          <div className="animate-pulse space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="space-y-2 flex-grow">
                                <div className="h-4 bg-[#2b2d3c] rounded w-3/4"></div>
                                <div className="h-3 bg-[#2b2d3c] rounded w-1/2"></div>
                              </div>
                              <div className="h-10 w-10 bg-[#2b2d3c] rounded-full"></div>
                            </div>
                            <div className="h-10 mt-4">
                              <div className="h-3 bg-[#2b2d3c] rounded w-full"></div>
                              <div className="h-3 bg-[#2b2d3c] rounded w-5/6 mt-2"></div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="h-3 bg-[#2b2d3c] rounded w-1/3"></div>
                              <div className="h-8 bg-[#2b2d3c] rounded w-16"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              {/* Scrollability indicators removed as requested */}
            </div>
          </div>
        </section>
        
        {/* Footer */}
        <footer className="py-6 border-t border-[#2b2d3c] text-center text-white/60 text-sm">
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex flex-col items-center">
              <div className="mb-2">
                <span>{t('home.footer.copyright')}</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <TbBrandX className="h-4 w-4" />
                <span>{t('home.footer.tagline')}</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}