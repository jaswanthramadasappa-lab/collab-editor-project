import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import documentRoutes from "./routes/documents.js";
import { collaborationServer } from "./collaboration.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174"
];
if (process.env.CLIENT_URL && !allowedOrigins.includes(process.env.CLIENT_URL)) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get("/api/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    service: "collab-editor-api",
    database: connected ? "connected" : "disconnected"
  });
});
app.get("/", (_req, res) => {
  res.json({
    name: "CollabSpace API Server",
    status: "online",
    frontendUrl: process.env.CLIENT_URL || "http://localhost:5173",
    healthCheck: "/api/health",
    message: "CollabSpace backend API is running. Open http://localhost:5173 in your browser to access the collaborative document editor."
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

const port = Number(process.env.PORT) || 5000;
export async function startServer() {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be configured with at least 32 characters");
    }
    await connectDB();
    const server = app.listen(port, () => {
      console.log(`API running at http://localhost:${port}`);
    });

    collaborationServer.listen().then(() => {
      console.log(
        `Collaboration server running at ws://localhost:${Number(process.env.COLLAB_PORT) || 1234}`
      );
    }).catch((err) => {
      console.error("Collaboration server startup error:", err.message);
    });

    return server;
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

export { app };

const isTest =
  process.env.NODE_ENV === "test" ||
  process.execArgv.includes("--test") ||
  process.argv.some((arg) => arg.includes("test"));

if (!isTest) {
  startServer();
}
