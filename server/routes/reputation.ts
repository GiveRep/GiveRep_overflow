import { Router } from "express";

export const reputationRouter = Router();

// OMITTED: Implement reputation routes
reputationRouter.get("/", (req, res) => {
  res.json({ message: "Reputation API" });
});
