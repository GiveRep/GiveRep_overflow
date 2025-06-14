import { useQuery } from "@tanstack/react-query";
import { getTwitterUserInfoBatch } from "@/utils/twitterUserInfo";
import { DateRange } from "@/pages/giverep/mindshare-dashboard";

interface MindshareCollectionOptions {
  dateRange: DateRange;
}

interface TradeportCollectionData {
  slug: string;
  title: string;
  description?: string;
  cover_url?: string;
  floor?: number;
  supply?: number;
  volume?: number;
  usd_volume?: number;
  contract_id?: string;
  discord?: string;
  website?: string;
  twitter?: string;
  formattedFloor?: string | null;
  formattedVolume?: string | null;
}

export function useMindshareCollections({ dateRange }: MindshareCollectionOptions) {
  // @dev we prefix the queryKey with 'mindshare' so we can invalidate both
  // projects & future mindshare queries for refetching directly from the client.
  const collectionsQuery = useQuery({
    queryKey: ["mindshare", "collections", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams({
        days: dateRange,
      });

      const response = await fetch(`/api/mindshare/nft-collections?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch collections");
      }

      return response.json();
    },
  });

  const twitterQuery = useQuery({
    queryKey: ["twitter-info", collectionsQuery.data],
    queryFn: async () => {
      const handles = collectionsQuery.data.collections
        ?.filter((collection: any) => collection.twitterHandle)
        .map((collection: any) =>
            collection.twitterHandle!.replace("@", "").toLowerCase()
        );

      return getTwitterUserInfoBatch(handles);
    },
    enabled: !!collectionsQuery.data,
  });

  // Fetch Tradeport data for collections with nftType (used as slug)
  const tradeportQuery = useQuery({
    queryKey: ["tradeport-details", collectionsQuery.data?.collections],
    queryFn: async () => {
      const slugs = collectionsQuery.data.collections
        ?.filter((collection: any) => collection.nftType)
        .map((collection: any) => collection.nftType);

      if (!slugs || slugs.length === 0) {
        return { collections: [] };
      }

      const params = new URLSearchParams({
        slugs: slugs.join(','),
      });

      const response = await fetch(`/api/mindshare/nft-collections/tradeport-details?${params}`);
      if (!response.ok) {
        // Don't throw error, just return empty data
        console.error('Failed to fetch Tradeport data');
        return { collections: [] };
      }

      return response.json();
    },
    enabled: !!collectionsQuery.data?.collections,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Combine all data
  const collectionsWithAllData = collectionsQuery.data?.collections?.map((collection: any) => {
    // Try to find tradeport data by exact match or by contract address
    const tradeportData = tradeportQuery.data?.collections?.find(
      (tp: TradeportCollectionData) => {
        // First try exact match
        if (tp.slug === collection.nftType) return true;
        
        // If collection.nftType contains '::', check if tp.slug matches the contract address part
        if (collection.nftType && collection.nftType.includes('::')) {
          const contractAddress = collection.nftType.split('::')[0];
          return tp.slug === contractAddress;
        }
        
        return false;
      }
    );

    return {
      ...collection,
      // Add Tradeport data if available
      tradeportData: tradeportData || null,
      // Merge specific fields for easier access
      floor: tradeportData?.floor || null,
      volume: tradeportData?.volume || null,
      usdVolume: tradeportData?.usd_volume || null,
      coverUrl: tradeportData?.cover_url || null,
      discord: tradeportData?.discord || null,
      website: tradeportData?.website || null,
    };
  });

  return {
    collections: collectionsQuery.data ? {
      ...collectionsQuery.data,
      collections: collectionsWithAllData || collectionsQuery.data.collections
    } : null,
    twitterInfo: twitterQuery.data,
    tradeportData: tradeportQuery.data,
    isLoading: collectionsQuery.isLoading || tradeportQuery.isLoading,
    isError: collectionsQuery.isError,
    refetch: () => {
      collectionsQuery.refetch();
      tradeportQuery.refetch();
    },
  };
}
