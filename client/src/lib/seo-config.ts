import { SEOData } from '@/hooks/use-seo';

const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://giverep.xyz';
const defaultImage = '/giverep/giverep_picture.jpeg';

export const seoConfig: Record<string, SEOData> = {
  home: {
    title: 'GiveRep - Crypto Reputation & Influence Platform',
    description: 'Track and build your crypto reputation through social influence, trading activity, and community engagement. Join the future of decentralized reputation systems.',
    keywords: ['crypto reputation', 'social influence', 'blockchain', 'defi', 'trading reputation', 'web3 social', 'sui blockchain'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/`,
    type: 'website',
    canonical: `${baseUrl}/`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "GiveRep",
      "description": "Crypto Reputation & Influence Platform",
      "url": baseUrl,
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${baseUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    }
  },

  leaderboard: {
    title: 'Crypto Reputation Leaderboard - Top Influencers | GiveRep',
    description: 'Discover the top crypto influencers and traders ranked by reputation score. See who leads in social influence, trading performance, and community engagement.',
    keywords: ['crypto leaderboard', 'top crypto influencers', 'reputation ranking', 'trading leaderboard', 'defi leaders', 'crypto rankings'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/reputation-leaderboard`,
    canonical: `${baseUrl}/reputation-leaderboard`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Crypto Reputation Leaderboard",
      "description": "Top crypto influencers ranked by reputation score",
      "url": `${baseUrl}/reputation-leaderboard`
    }
  },

  mindshare: {
    title: 'Mindshare Analytics - Track Crypto Social Influence | GiveRep',
    description: 'Analyze social media influence and mindshare in the crypto space. Track mentions, engagement, and trending topics across Twitter and social platforms.',
    keywords: ['crypto mindshare', 'social analytics', 'crypto influence tracking', 'twitter analytics', 'social media metrics', 'crypto trends'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/mindshare`,
    canonical: `${baseUrl}/mindshare`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Crypto Mindshare Analytics",
      "description": "Track social influence and mindshare in crypto",
      "url": `${baseUrl}/mindshare`
    }
  },

  loyalty: {
    title: 'Loyalty Rewards Program - Earn Points & Tokens | GiveRep',
    description: 'Join GiveRep loyalty program to earn rewards for your crypto activities. Get points for trading, social engagement, and referrals.',
    keywords: ['crypto loyalty program', 'rewards program', 'earn crypto tokens', 'loyalty points', 'referral rewards', 'crypto incentives'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/loyalty`,
    canonical: `${baseUrl}/loyalty`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "GiveRep Loyalty Program",
      "description": "Earn rewards for crypto activities and social engagement",
      "url": `${baseUrl}/loyalty`
    }
  },

  circles: {
    title: 'Reputation Circles - Build Your Crypto Network | GiveRep',
    description: 'Create and join reputation circles with other crypto enthusiasts. Build trust networks and collaborate with verified community members.',
    keywords: ['reputation circles', 'crypto network', 'trust network', 'crypto community', 'verified members', 'decentralized identity'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/circles`,
    canonical: `${baseUrl}/circles`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Reputation Circles",
      "description": "Build trust networks in the crypto community",
      "url": `${baseUrl}/circles`
    }
  },

  xpump: {
    title: 'XPump - Meme Token Trading Platform | GiveRep',
    description: 'Trade meme tokens and build your trading reputation on XPump. Create, launch, and trade community-driven tokens with transparency.',
    keywords: ['meme token trading', 'token creation', 'crypto trading platform', 'defi trading', 'community tokens', 'trading reputation'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/xpump`,
    canonical: `${baseUrl}/xpump`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "XPump Trading Platform",
      "description": "Trade meme tokens and build trading reputation",
      "url": `${baseUrl}/xpump`
    }
  },

  snapshot: {
    title: 'Crypto Snapshot Tool - Portfolio Analytics | GiveRep',
    description: 'Take snapshots of crypto portfolios and analyze holdings across multiple wallets. Track performance and generate reports.',
    keywords: ['crypto portfolio snapshot', 'wallet analytics', 'portfolio tracking', 'crypto holdings', 'portfolio analysis', 'wallet tracker'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/snapshot`,
    canonical: `${baseUrl}/snapshot`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Crypto Portfolio Snapshot",
      "description": "Analyze crypto portfolios and track holdings",
      "url": `${baseUrl}/snapshot`
    }
  },

  airdrop: {
    title: 'Crypto Airdrop Tool - Distribute Tokens | GiveRep',
    description: 'Distribute crypto airdrops efficiently with our airdrop tool. Manage token distributions, whitelist management, and airdrop campaigns.',
    keywords: ['crypto airdrop', 'token distribution', 'airdrop tool', 'token airdrop', 'crypto distribution', 'whitelist management'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/airdrop`,
    canonical: `${baseUrl}/airdrop`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Crypto Airdrop Tool",
      "description": "Distribute crypto tokens efficiently with airdrop campaigns",
      "url": `${baseUrl}/airdrop`
    }
  },

  admin: {
    title: 'Admin Dashboard - GiveRep Management | GiveRep',
    description: 'Administrative dashboard for managing GiveRep platform features, user analytics, and system monitoring.',
    keywords: ['admin dashboard', 'platform management', 'user analytics', 'system monitoring', 'giverep admin'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/admin`,
    canonical: `${baseUrl}/admin`,
    robots: 'noindex, nofollow',
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "GiveRep Admin Dashboard",
      "description": "Administrative interface for platform management",
      "url": `${baseUrl}/admin`
    }
  },

  profile: {
    title: 'Crypto Profile - View Reputation & Stats | GiveRep',
    description: 'View detailed crypto reputation profiles including trading history, social influence metrics, and community engagement scores.',
    keywords: ['crypto profile', 'reputation profile', 'trading history', 'social metrics', 'user profile', 'crypto stats'],
    image: `${baseUrl}${defaultImage}`,
    url: `${baseUrl}/profile`,
    canonical: `${baseUrl}/profile`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "name": "Crypto Reputation Profile",
      "description": "Detailed crypto reputation and trading statistics",
      "url": `${baseUrl}/profile`
    }
  }
};

export const getPageSEO = (pageKey: string, dynamicData?: Partial<SEOData>): SEOData => {
  const baseSEO = seoConfig[pageKey] || seoConfig.home;
  
  if (dynamicData) {
    return {
      ...baseSEO,
      ...dynamicData,
      keywords: [...(baseSEO.keywords || []), ...(dynamicData.keywords || [])],
      url: dynamicData.url || baseSEO.url,
      canonical: dynamicData.canonical || baseSEO.canonical,
    };
  }
  
  return baseSEO;
};

export default seoConfig;