export interface AssetItem {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  verified: boolean;
  logo: string;
  usdValue: string;
  price: string;
  priceChangePercentage24H: string;
  objects: number;
  scam: boolean;
  // Optional properties for NFT assets
  isNFT?: boolean;
  displayName?: string;
  collectionName?: string;
}

export interface NFTItem {
  objectId: string;
  name: string;
  collection: string;
  displayCollectionName: string;
  description: string;
  image: string;
  attributes: NFTAttribute[];
  lastPrice: string;
  creator: string;
  url: string;
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

export interface NFTCollection {
  [collectionName: string]: NFTItem[];
}