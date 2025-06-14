import { Router } from "express";

export const reputationDirectRouter = Router();

// OMITTED: Implement reputation direct routes
reputationDirectRouter.get("/direct", (req, res) => {
  res.json({ message: "Reputation Direct API" });
});
