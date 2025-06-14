/**
 * Utilities to separate automatic reply‑prefix mentions from the real tweet body.
 * Implements Twitter's logic for distinguishing between reply-prefix mentions and body mentions.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Basic Types (simplified shape taken from Twitter v1.1 / v2 APIs) ────────────
// ──────────────────────────────────────────────────────────────────────────────

export interface Mention {
  /** Twitter user ID as a string (e.g. "1802098947030130688") */
  id_str: string;
  /** Screen‑name without the leading "@" (e.g. "GiveRep") */
  screen_name: string;
  /** Start‑inclusive / end‑exclusive offsets inside tweet.text */
  indices: [number, number];
}

export interface Tweet {
  text: string;
  entities: {
    user_mentions: Mention[];
  };
}

// For compatibility with our existing tweet format
export interface ApiTweet {
  id: string;
  text: string;
  createdAt: string;
  author: {
    userName: string;
    followers?: number;
  };
  entities?: {
    user_mentions: Array<{
      id_str: string;
      screen_name: string;
      indices: [number, number];
    }>;
  };
  isRetweet: boolean;
  isQuote: boolean;
  inReplyToStatusId?: string | null;
  inReplyToUserId?: string | null;
  inReplyToUserName?: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core Helper ─────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns the @mentions that live *inside* the tweet body.
 * These are mentions explicitly added by the user and not carried over from reply context.
 * 
 * @example
 *   const body = bodyMentions(tweet);
 *   console.log(body.map(m => m.screen_name));
 */
export function bodyMentions(tweet: Tweet): Mention[] {
  const mentions = [...tweet.entities.user_mentions].sort(
    (a, b) => a.indices[0] - b.indices[0]
  );

  const seen = new Set<string>();
  let cursor = 0;        // where we are in the text while scanning prefix
  let bodyStart = 0;     // to be set when the prefix ends

  for (const m of mentions) {
    const gap = tweet.text.slice(cursor, m.indices[0]);

    // True if the gap contains any non‑whitespace character.
    const gapHasText = /\S/.test(gap);
    const isDuplicate = seen.has(m.id_str);

    // Either condition ends the prefix.
    if (gapHasText || isDuplicate) {
      // If we broke because of text, body starts at the first *non‑space* char
      if (gapHasText) {
        bodyStart = cursor + gap.search(/\S/);
      } else {
        // broke because of duplicate → body starts at this mention
        bodyStart = m.indices[0];
      }
      break;
    }

    // Still in prefix: remember this handle and advance.
    seen.add(m.id_str);
    cursor = m.indices[1];
    bodyStart = cursor;   // tentative until we know prefix ends here
  }

  // Skip any whitespace that immediately follows the prefix.
  while (bodyStart < tweet.text.length && /\s/.test(tweet.text[bodyStart])) {
    bodyStart++;
  }

  // Mentions whose start index ≥ bodyStart live in the body.
  const bodyMentionsList = mentions.filter(m => m.indices[0] >= bodyStart);
  
  // Debug logging
  if (mentions.length > 0) {
    console.log(`[bodyMentions] Tweet text: "${tweet.text}"`);
    console.log(`[bodyMentions] All mentions:`, mentions.map(m => `@${m.screen_name} at ${m.indices[0]}-${m.indices[1]}`));
    console.log(`[bodyMentions] Body starts at index: ${bodyStart}`);
    console.log(`[bodyMentions] Body text: "${tweet.text.slice(bodyStart)}"`);
    console.log(`[bodyMentions] Body mentions:`, bodyMentionsList.map(m => `@${m.screen_name}`));
  }
  
  return bodyMentionsList;
}

// ──────────────────────────────────────────────────────────────────────────────
// Convenience helper for debugging / analytics. ───────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────

export interface SplitMentionsResult {
  replyMentions: Mention[];
  bodyMentions: Mention[];
  bodyText: string;
}

/**
 * Splits a tweet into reply‑prefix vs body mentions and returns the body text.
 */
export function splitMentions(tweet: Tweet): SplitMentionsResult {
  const body = bodyMentions(tweet);
  const bodySet = new Set(body);

  const replyMentions = tweet.entities.user_mentions.filter(m => !bodySet.has(m));
  const bodyText = tweet.text.slice(body.length ? body[0].indices[0] : tweet.text.length).trimStart();

  return { replyMentions, bodyMentions: body, bodyText };
}

/**
 * Gets ALL mentions from a tweet (both reply prefix and body).
 * Returns array of lowercase handles with @ symbol (e.g. ["@user1", "@user2"])
 * 
 * @param tweet Tweet from API
 */
export function getAllMentions(tweet: ApiTweet): string[] {
  if (!tweet.entities || !tweet.entities.user_mentions) {
    // Extract all @mentions with regex if no entities
    const mentions = tweet.text.match(/@(\w+)/g) || [];
    return mentions.map(m => m.toLowerCase());
  }
  
  return tweet.entities.user_mentions.map(m => `@${m.screen_name.toLowerCase()}`);
}

/**
 * Gets only explicitly mentioned handles from the body of a tweet, not the reply prefix.
 * Returns array of lowercase handles with @ symbol (e.g. ["@giverep", "@user123"])
 * 
 * @param tweet Tweet from API
 */
export function getExplicitBodyMentions(tweet: ApiTweet): string[] {
  
  // If no entities data is available, we'll build it ourselves using regex
  if (!tweet.entities || !tweet.entities.user_mentions) {
    console.log(`Tweet ${tweet.id} doesn't have entities data, constructing it from text`);
    
    // Extract all @mentions with their positions
    const mentions: Mention[] = [];
    const regex = /@(\w+)/g;
    let match;
    
    while ((match = regex.exec(tweet.text)) !== null) {
      mentions.push({
        id_str: `${match[1]}_${match.index}`, // Use username + position as unique ID
        screen_name: match[1], // The username without @
        indices: [match.index, match.index + match[0].length] // Start and end positions
      });
    }
    
    // Create entities data
    tweet.entities = {
      user_mentions: mentions
    };
  }

  // Convert to the expected Tweet format
  const tweetWithEntities: Tweet = {
    text: tweet.text,
    entities: {
      user_mentions: tweet.entities.user_mentions.map((m: any) => ({
        id_str: m.id_str,
        screen_name: m.screen_name,
        indices: m.indices
      }))
    }
  };

  // Get only mentions in the body (not reply prefix)
  const bodyMentionsArray = bodyMentions(tweetWithEntities);
  
  // Convert to the format we need (lowercase @handle)
  return bodyMentionsArray.map(mention => `@${mention.screen_name.toLowerCase()}`);
}

/**
 * Checks if a tweet explicitly mentions a specific handle (not in reply prefix)
 * 
 * @param tweet Tweet from API
 * @param handle Handle to check for (with or without @ symbol)
 */
export function hasExplicitMention(tweet: ApiTweet, handle: string): boolean {
  const normalizedHandle = handle.startsWith('@') ? handle.toLowerCase() : `@${handle.toLowerCase()}`;
  const explicitMentions = getExplicitBodyMentions(tweet);
  
  return explicitMentions.includes(normalizedHandle);
}


/**
 * Validates if a tweet is a valid GiveRep tweet using the explicit mention detection
 * 
 * @param tweet Tweet from API
 */
export function isValidGiveRepTweet(tweet: ApiTweet): boolean {
  // Log the full tweet for debugging
  console.log(`Analyzing tweet ${tweet.id} with text: ${tweet.text}`);
  
  // Skip retweets
  if (tweet.isRetweet) {
    console.log(`Tweet ${tweet.id} is a retweet - INVALID`);
    return false;
  }
  
  // Check if this is a reply using API-provided fields first
  const isReplyFromAPI = !!(tweet.inReplyToStatusId || tweet.inReplyToUserId || tweet.inReplyToUserName);
  
  // Also check if text starts with @ (fallback for when API fields are missing)
  const isReplyFromText = tweet.text.trim().startsWith('@');
  
  // A tweet is considered a reply if either condition is true
  const isReply = isReplyFromAPI || isReplyFromText;
  
  // For quote tweets, they're valid if they quote someone and mention @giverep
  if (tweet.isQuote) {
    const hasGiveRepMention = tweet.text.toLowerCase().includes('@giverep');
    console.log(`Quote tweet ${tweet.id}: has @giverep = ${hasGiveRepMention}`);
    return hasGiveRepMention;
  }
  
  // IMPORTANT: Only replies and quote tweets can give reputation points
  if (!isReply) {
    console.log(`Tweet ${tweet.id} is not a reply or quote tweet - INVALID (only replies/quotes can give reputation)`);
    return false;
  }
  
  // Get body mentions and all mentions
  const explicitMentions = getExplicitBodyMentions(tweet);
  const allMentions = getAllMentions(tweet);
  
  console.log(`Explicit body mentions: ${JSON.stringify(explicitMentions)}`);
  console.log(`All mentions (including reply prefix): ${JSON.stringify(allMentions)}`);
  console.log(`Is reply (from API): ${isReplyFromAPI}, Is reply (from text): ${isReplyFromText}`);
  if (isReplyFromAPI) {
    console.log(`Reply details - ID: ${tweet.inReplyToStatusId}, User: ${tweet.inReplyToUserName}`);
  }
  
  // Check if @giverep is explicitly mentioned in the body
  const hasExplicitGiveRep = explicitMentions.includes('@giverep');
  
  // VALIDATION RULES:
  // 1. Must be a reply (checked above)
  // 2. @giverep must be explicitly typed in the body (not just in reply prefix)
  const isValid = hasExplicitGiveRep;
  
  // Log the decision reasoning
  console.log(`Tweet ${tweet.id} analysis:
    - Has explicit @giverep mention in body: ${hasExplicitGiveRep}
    - Is retweet: ${tweet.isRetweet}
    - Is quote: ${tweet.isQuote}
    - Is reply: ${isReply}
    - Final decision: ${isValid ? 'VALID' : 'INVALID'}`);
  
  return isValid;
}