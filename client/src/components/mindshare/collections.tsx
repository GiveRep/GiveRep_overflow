import { useMindshareProjects } from "@/hooks/mindshare/use-projects";
import type { DateRange } from "@/pages/giverep/mindshare-dashboard";
import { ProjectCard } from "./project-card";
import { MindshareNftCollectionUsersData, MindshareProject } from "@/types/mindshare";
import { ProjectsGridSkeleton } from "./projects-skeleton";
import { useMindshareCollections } from "@/hooks/mindshare/use-collections";
import { CollectionCard } from "./collection-card";
import { useState, useEffect } from "react";
import QuickCollectionView from "../dialogs/QuickCollectionView";
import { useInfiniteQuery } from "@tanstack/react-query";

interface ProjectsTabProps {
  dateRange: DateRange;
}

export function CollectionsTab({ dateRange }: ProjectsTabProps) {
  const { collections: data, twitterInfo, isLoading } = useMindshareCollections({
    dateRange,
  })

  const [selectedCollection, setSelectedCollection] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Remove page state, handled by useInfiniteQuery
  
  // Initialize from URL params
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const viewParam = searchParams.get("view");
    const tabParam = searchParams.get("tab");
    
    // Only open dialog if we're on the nft-collections tab
    if (tabParam === "nft-collections" && viewParam && data?.collections) {
      const collectionId = parseInt(viewParam, 10);
      if (!isNaN(collectionId)) {
        const collection = data.collections.find((c: any) => c.id === collectionId);
        if (collection) {
          const twitter = twitterInfo?.get(collection.twitterHandle?.replace("@", "").toLowerCase()) ?? {};
          const combined = { ...collection, twitterInfo: twitter };
          setSelectedCollection(combined);
          setIsModalOpen(true);
        }
      }
    }
  }, [data?.collections, twitterInfo]);

  const handleSelectCollection = (collection: any) => {
    setSelectedCollection(collection);
    setIsModalOpen(true);
    
    // Update URL when opening collection
    const url = new URL(window.location.href);
    url.searchParams.set("view", collection.id.toString());
    window.history.replaceState({}, "", url.toString());
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCollection(null);
    
    // Remove view param when closing dialog
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.searchParams.delete("viewTab");
    window.history.replaceState({}, "", url.toString());
  };

  // Infinite user fetching
  const {
    data: usersData,
    isLoading: usersLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch: refetchUsers,
  } = useInfiniteQuery<MindshareNftCollectionUsersData>({
    initialPageParam: 1,
    queryKey: ['collection-users', selectedCollection?.id],
    queryFn: async ({ pageParam = 1 }) => {
      if (!selectedCollection) return { users: [], pagination: { hasNextPage: false } };
      const response = await fetch(`/api/mindshare/nft-collections/${selectedCollection.id}/users?page=${pageParam}`);
      if (!response.ok) throw new Error('Failed to fetch collection users');
      return response.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage?.pagination?.hasNextPage) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    enabled: !!selectedCollection && isModalOpen,
  });

  // Combine all users into a flat array
  const allUsers = usersData?.pages ? usersData.pages.flatMap(page => page?.users || []) : [];

  if (isLoading) {
    return <ProjectsGridSkeleton />;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {data?.collections?.map((collection: any, index: number) => {
          const twitter = twitterInfo?.get(collection.twitterHandle?.replace("@", "").toLowerCase()) ?? {};
          const combined = { ...collection, twitterInfo: twitter };
          return (
            <CollectionCard
              key={collection.id}
              collection={combined}
              rank={index}
              onSelect={handleSelectCollection}
            />
          );
        })}
      </div>

      <QuickCollectionView
        collection={selectedCollection}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        users={allUsers}
        usersLoading={usersLoading}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
        hasNextPage={hasNextPage}
      />
    </>
  );
}
