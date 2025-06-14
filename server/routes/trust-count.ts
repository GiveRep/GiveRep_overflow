import { Router } from "express";

const trustCountRouter = Router();

// OMITTED: Implement trust count routes
trustCountRouter.get("/", (req, res) => {
  res.json({ message: "Trust Count API" });
});

export default trustCountRouter;
