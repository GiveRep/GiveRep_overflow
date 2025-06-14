import { ProjectTag } from "./loyalty";

export interface MindshareProject {
  id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  twitter_handle: string;
  tag_ids: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  keywords?: MindshareKeyword[];
  metrics?: MindshareMetrics;
  tweet_count?: number;
  keyword_count?: number;
  rank?: number;
  sparkline?: number[];
  tags?: ProjectTag[]; // For UI display
}

export interface MindshareKeyword {
  id: number;
  project_id: number;
  keyword: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface MindshareMetrics {
  project_id: number;
  timeframe: string;
  start_date: string;
  end_date: string;
  tweet_count: number;
  engagement_count: number;
  engagement_rate: number;
  total_views: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
  total_engagement: number;
  share_percentage: number;
  created_at: string;
}

export interface ExtendedMindshareMetrics extends MindshareMetrics {
  new_tweets?: number;
  total_tweets?: number;
  new_engagement?: number;
  sparkline?: number[];
}

export interface MindshareTweet {
  id: number;
  project_id: number;
  tweet_id: string;
  author_id: string;
  author_username: string;
  author_name: string;
  author_profile_image_url: string;
  text: string;
  content: string; // Content field is used for display in the tweet component
  created_at: string;
  views: number;
  likes: number;
  retweets: number;
  replies: number;
  keyword: string;
  tweet_url?: string; // URL to the tweet on X/Twitter
}

export interface MindshareProjectTweets {
  project_id: number;
  project_name: string;
  tweet_count: number;
  tweets: MindshareTweet[];
}

// NFT Mindshare
export interface MindshareNftCollection {
  id: number;
  nftName: string;
  nftType: string;
  twitterHandle: string | null;
  totalSupply: number | null;
  price: string | null;
  userCount: number;
  mindsharePercentage: number;
  totalActiveUsers: number;
  totalUsersWithNFTs: number;
  imageUrl: string | null;
}

export interface MindshareNftCollectionUsersData {
  collection: any;
  users: MindshareNftCollectionUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface MindshareNftCollectionUser {
  id: number;
  twitterHandle: string;
  profileImageUrl: string | null;
  pfpLastCheck: string;
  reputation: number;
  lastActiveAt: string;
}