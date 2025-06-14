import { Router } from "express";

export const loyaltyV1Router = Router();

// OMITTED: Implement loyalty v1 routes
loyaltyV1Router.get("/", (req, res) => {
  res.json({ message: "Loyalty V1 API" });
});
