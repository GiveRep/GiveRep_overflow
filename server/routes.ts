import type { Express } from "express";
import { createServer } from "http";
import { authRouter } from "./routes/auth";
import { giverepRouter } from "./routes/giverep";
import { healthRouter } from "./routes/health";
import legalTermsRouter from "./routes/legal-terms";
import { loyaltyRouter } from "./routes/loyalty";
import loyaltyRewardsRoutes from "./routes/loyalty-rewards";
import { loyaltyV1Router } from "./routes/loyalty-v1";
import { mindshareRouter } from "./routes/mindshare";
import { mindshareSnapshotRouter } from "./routes/mindshare-snapshot";
import mindshareV1Router from "./routes/mindshare-v1";
import nftCollectionsRouter from "./routes/nft-collections";
import { reputationRouter } from "./routes/reputation";
import { reputationDirectRouter } from "./routes/reputation-direct";
import { tagsRouter } from "./routes/tags";
import trustCountRouter from "./routes/trust-count";
import twitterUserInfoRouter from "./routes/twitter-user-info";

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Add a basic health check API endpoint
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", message: "GiveRep API is running" });
  });

  // Register GiveRep routes with standardized paths
  app.use("/api/giverep", giverepRouter);

  // Register GiveRep Reputation routes with standardized path
  app.use("/api/giverep/reputation", reputationRouter);
  app.use("/api/giverep/reputation", reputationDirectRouter);

  // Register Tag Management routes
  app.use("/api/giverep/tags", tagsRouter);

  // Register Mindshare Snapshot routes (must be before base mindshare route)
  app.use("/api/mindshare/snapshot", mindshareSnapshotRouter);

  // Register Mindshare routes
  app.use("/api/mindshare", mindshareRouter);

  // Register Auth routes with standardized path
  app.use("/api/auth", authRouter);

  // Register Loyalty Program routes
  app.use("/api/loyalty", loyaltyRouter);

  // Register Loyalty Program V1 routes (using tweets_schema.ts)
  app.use("/api/v1/loyalty", loyaltyV1Router);

  // Register Mindshare V1 routes (using tweets_schema.ts directly)
  app.use("/api/v1/mindshare", mindshareV1Router);

  // Register Loyalty Rewards routes
  app.use("/api/v1/loyalty-rewards", loyaltyRewardsRoutes);

  // Register Twitter User Info routes
  app.use("/api/twitter-user-info", twitterUserInfoRouter);

  // Register extended Health check routes
  app.use("/api/health", healthRouter);

  // Register NFT Collections routes
  app.use("/api/nft-collections", nftCollectionsRouter);

  // Register Trust Count routes (optimized version)
  app.use("/api/trust-count", trustCountRouter);

  // Register Legal Terms routes
  app.use("/api/legal-terms", legalTermsRouter);

  return httpServer;
}
