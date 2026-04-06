import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import cors from "cors";
import fs from "fs";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { connectDB } from "./lib/db.js";
import { ENV } from "./lib/env.js";
import { app, server } from "./lib/socket.js";

const __dirname = path.resolve();
const frontendDistPath = path.join(__dirname, "../frontend/dist");
const hasFrontendBuild = fs.existsSync(frontendDistPath);

const PORT = ENV.PORT || 3000;
const hasConfiguredOrigins = ENV.ALLOWED_ORIGINS.length > 0;
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (!hasConfiguredOrigins) return true;
  if (ENV.ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview domains when any vercel.app origin is configured.
  if (origin.endsWith(".vercel.app")) {
    return ENV.ALLOWED_ORIGINS.some((allowedOrigin) => allowedOrigin.endsWith(".vercel.app"));
  }
  return false;
};
const corsOptions = {
  origin: (origin, callback) => {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
};

app.use(express.json({ limit: "5mb" })); // req.body
app.use(cors(corsOptions));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// make ready for deployment
if (ENV.NODE_ENV === "production" && hasFrontendBuild) {
  app.use(express.static(frontendDistPath));

  app.get("*", (_, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

server.listen(PORT, () => {
  console.log("Server running on port: " + PORT);
  connectDB();
});
