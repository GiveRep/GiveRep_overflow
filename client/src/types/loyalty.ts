export interface ProjectTag {
  id: number;
  name: string;
  description: string | null;
  visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyProject {
  id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url?: string | null;
  website_url: string | null;
  twitter_handle: string | null;
  is_active: boolean;
  is_featured?: boolean;
  is_incentivized?: boolean;
  incentive_type?: string; // "usdc" or "points"
  points_name?: string; // Custom name for points (e.g., "Pawtato Points")
  incentive_budget?: number;
  price_per_view?: number;
  total_incentive_spent?: number;
  min_follower_count?: number;
  tag_ids?: number[]; // Array of project tag IDs
  tags?: ProjectTag[]; // Populated tags (from join)
  hashtags?: string[]; // Array of required hashtags for tweets
  start_time?: string; // When the loyalty program starts
  end_time?: string; // When the loyalty program ends (null = no end date)
  created_at: string;
  updated_at: string;
  memberCount?: number;
  isUserMember?: boolean;
}

export interface LoyaltyMember {
  id: number;
  project_id: number;
  twitter_handle: string;
  joined_at: string;
  is_active: boolean;
  username?: string;
  profilePicture?: string;
  profileUrl?: string;
  metrics?: LoyaltyMetrics;
}

export interface LoyaltyMetrics {
  id: number;
  project_id: number;
  twitter_handle: string;
  tweet_count: number;
  views: number;
  likes: number;
  retweets: number;
  replies: number;
  last_updated: string;
}

export interface LeaderboardEntry {
  twitter_handle: string;
  username?: string;
  profilePicture?: string;
  profileUrl?: string;
  tweet_count: number;
  views: number;
  likes: number;
  retweets: number;
  replies: number;
  joined_at: string;
  twitterUrl?: string;
  estimated_pay?: number; // Estimated payment in dollars for incentivized projects
  creator_score?: number; // Creator score from AI analysis (0-1000)
  isCurrentUser?: boolean; // Flag to indicate if this entry is the current logged-in user
  rank?: number; // Position in the leaderboard
  follower_count?: number; // Twitter follower count for the user
}