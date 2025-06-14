import { CollectionsTab } from "@/components/mindshare/collections";
import { ProjectsTab } from "@/components/mindshare/projects";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsTrigger, TabsList, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useSEO from "@/hooks/use-seo";
import { queryClient } from "@/lib/queryClient";
import { getPageSEO } from "@/lib/seo-config";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  LayoutDashboard,
  Library,
  RefreshCcw,
  Users,
  Beaker,
  Search,
  Tags,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useMindshareCollections } from "@/hooks/mindshare/use-collections";
import { useTranslation } from "react-i18next";
import { ProjectTag } from "@/types/loyalty";

export type DateRange = "7" | "14" | "30";

export default function MindshareDashboard() {
  useSEO(getPageSEO("mindshare"));
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>("7");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  
  // Get initial tab from URL params
  const getInitialTab = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get("tab");
    return tabParam === "nft-collections" ? "nft-collections" : "projects";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Fetch collections data to get active users count
  const { collections, isLoading: isLoadingCollections } = useMindshareCollections({ dateRange });

  // Fetch tags on mount
  useEffect(() => {
    async function fetchTags() {
      try {
        const res = await fetch("/api/giverep/tags");
        if (!res.ok) throw new Error("Failed to fetch tags");

        const data: ProjectTag[] = await res.json();
        setProjectTags(data.filter((tag) => tag.visible));
      } catch (e) {
        console.error(e);
      }
    }
    fetchTags();
  }, []);

  // Initialize selected tags from URL params
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tagsParam = searchParams.get("tags");
    
    if (tagsParam) {
      const tagIds = tagsParam.split(',')
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));
      setSelectedTagIds(tagIds);
    }
  }, []);

  // Update URL when tags change
  const updateTagsInUrl = (tagIds: number[]) => {
    const url = new URL(window.location.href);
    if (tagIds.length > 0) {
      url.searchParams.set("tags", tagIds.join(','));
    } else {
      url.searchParams.delete("tags");
    }
    window.history.replaceState({}, "", url.toString());
  };

  const handleDateRangeChange = (value: string) =>
    setDateRange(value as DateRange);

  // @dev invalidate all queries that have a `mindshare` tag.
  // this will cause a refetch of that query. - matical
  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["mindshare"] });
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const url = new URL(window.location.href);
    
    if (value === "projects") {
      url.searchParams.delete("tab"); // Remove tab param for projects (default)
    } else {
      url.searchParams.set("tab", value);
    }
    
    // Remove view param when switching tabs
    url.searchParams.delete("view");
    
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <div className="flex-1">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-b-muted backdrop-blur">
        <div className="mx-auto flex h-auto sm:h-16 max-w-7xl items-center justify-between px-2 py-2 sm:py-0 flex-wrap sm:flex-nowrap gap-2">
          <div className="flex flex-col items-start">
            <h1 className="text-xl font-semibold">{t('mindshare.title')}</h1>
            <p className="text-muted-foreground text-sm hidden sm:block">
              {t('mindshare.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
            {/* Active Users Display */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-background/80 backdrop-blur-sm border border-input rounded-md shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/20">
                    <Users className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="flex items-baseline gap-1 sm:gap-1.5">
                      {isLoadingCollections ? (
                        <Skeleton className="h-5 w-14 sm:w-16" />
                      ) : (
                        <span className="font-bold text-xs sm:text-sm transition-all duration-300">
                          {collections?.totalActiveUsers?.toLocaleString() || "—"}
                        </span>
                      )}
                      <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                        {t('mindshare.activeUsers')}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {t('mindshare.activeUsersTooltip', { days: dateRange })}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={handleDateRangeChange}>
                <SelectTrigger className="h-9 w-[140px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t('mindshare.last7Days')}</SelectItem>
                  <SelectItem value="14">{t('mindshare.last14Days')}</SelectItem>
                  <SelectItem value="30">{t('mindshare.last30Days')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto px-2 py-4">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex flex-col lg:flex-row lg:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <TabsList className="inline-flex h-9 items-center justify-center rounded-lg p-1">
                <TabsTrigger value="projects" className="flex-1 lg:flex-initial">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <span>{t('mindshare.projects')}</span>
                </TabsTrigger>

                <TabsTrigger value="nft-collections" className="flex-1 lg:flex-initial">
                  <Library className="mr-2 h-4 w-4" />
                  <span>{t('mindshare.nftCollections')}</span>
                </TabsTrigger>
              </TabsList>
              
              {/* Tag filter dropdown - only show for projects tab */}
              {activeTab === "projects" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 gap-1.5 px-3",
                        selectedTagIds.length > 0 && "border-primary text-primary"
                      )}
                    >
                      <Tags className="h-4 w-4" />
                      <span>{t('mindshare.filterByTags')}</span>
                      {selectedTagIds.length > 0 && (
                        <span className="ml-1.5 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full">
                          {selectedTagIds.length}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[320px]"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <DropdownMenuLabel className="font-semibold">
                      {t('mindshare.projectTags')}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {projectTags.map((tag) => (
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
                          updateTagsInUrl(newTagIds);
                        }}
                        className="py-2"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-[15px] leading-tight">
                            {tag.name}
                          </span>
                          {tag.description && (
                            <span className="text-xs text-muted-foreground mt-1.5">
                              {tag.description}
                            </span>
                          )}
                        </div>
                      </DropdownMenuCheckboxItem>
                    ))}
                    {selectedTagIds.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedTagIds([]);
                            updateTagsInUrl([]);
                          }}
                          className="mx-auto block w-full text-xs py-1.5"
                        >
                          {t('mindshare.clearAllFilters')}
                        </Button>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex justify-between lg:justify-start lg:gap-2 w-full lg:w-auto">
                <div className="flex gap-2">
                  {activeTab === "nft-collections" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      asChild
                    >
                      <a href="/mindshare/profile-nft-checker" target="_blank" rel="noopener noreferrer">
                        <Search className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('mindshare.checkProfileNFT')}</span>
                        <span className="sm:hidden">{t('mindshare.checkNFT')}</span>
                      </a>
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    onClick={() =>
                      window.open(
                        "https://docs.google.com/forms/d/e/1FAIpQLSfVVZLj6m-FO1cGdFJm5Jz7mZl1rncV8fwyeJY3WXhiL-w1PA/viewform",
                        "_blank"
                      )
                    }
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('mindshare.requestListing')}</span>
                    <span className="sm:hidden">{t('mindshare.request')}</span>
                  </Button>
                </div>

                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={isRefreshing}
                  onClick={handleRefreshData}
                >
                  <RefreshCcw
                    className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                  />
                  <span className="hidden sm:inline">{isRefreshing ? t('mindshare.refreshing') : t('mindshare.refresh')}</span>
                </Button>
            </div>
          </div>

          <TabsContent value="projects">
            <ProjectsTab 
              dateRange={dateRange} 
              selectedTagIds={selectedTagIds}
              setSelectedTagIds={setSelectedTagIds}
              projectTags={projectTags}
            />
          </TabsContent>

          <TabsContent value="nft-collections">
            <CollectionsTab dateRange={dateRange} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
