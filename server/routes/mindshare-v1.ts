import { Router } from "express";

const mindshareV1Router = Router();

// OMITTED: Implement mindshare v1 routes
mindshareV1Router.get("/", (req, res) => {
  res.json({ message: "Mindshare V1 API" });
});

export default mindshareV1Router;
