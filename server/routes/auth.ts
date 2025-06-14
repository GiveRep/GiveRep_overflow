import { Router } from "express";

export const authRouter = Router();

// OMITTED: Implement auth routes
authRouter.get("/status", (req, res) => {
  res.json({ authenticated: false });
});
