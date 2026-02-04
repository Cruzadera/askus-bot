import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import dotenv from "dotenv";
import { Pool } from "pg";
import { Server } from "socket.io";
import type {
  CreatePollRequest,
  CreatePollResponse,
  VoteRequest,
  VoteResults,
} from "@askus/shared/types.js";

dotenv.config();

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let activePollId: number | null = null;

type PollRow = {
  id: number;
  question: string;
  created_at: Date;
  closed_at: Date | null;
};

const mapPoll = (row: PollRow) => ({
  id: row.id,
  question: row.question,
  createdAt: row.created_at.toISOString(),
  closedAt: row.closed_at ? row.closed_at.toISOString() : null,
});

const hashUserId = (userId: string) =>
  crypto.createHash("sha256").update(userId).digest("hex");

app.post("/poll", async (req, res) => {
  const body = req.body as CreatePollRequest;

  if (!body?.question || !body.question.trim()) {
    return res.status(400).json({ error: "Question is required." });
  }

  try {
    const result = await pool.query<PollRow>(
      "INSERT INTO polls (question) VALUES ($1) RETURNING id, question, created_at, closed_at",
      [body.question.trim()],
    );

    const poll = mapPoll(result.rows[0]);
    activePollId = poll.id;

    const payload: CreatePollResponse = {
      poll,
      activePollId: poll.id,
    };

    io.emit("pollStarted", payload);

    return res.status(201).json(payload);
  } catch (error) {
    console.error("Failed to create poll", error);
    return res.status(500).json({ error: "Failed to create poll." });
  }
});

app.post("/vote", async (req, res) => {
  const body = req.body as VoteRequest;

  if (!activePollId) {
    return res.status(400).json({ error: "No active poll." });
  }

  if (!body?.userId || !body?.option) {
    return res
      .status(400)
      .json({ error: "User ID and option are required." });
  }

  const userHash = hashUserId(body.userId);
  const option = body.option.trim();

  if (!option) {
    return res.status(400).json({ error: "Option is required." });
  }

  try {
    const insertResult = await pool.query<{ id: number }>(
      "INSERT INTO votes (poll_id, user_hash, option) VALUES ($1, $2, $3) ON CONFLICT (poll_id, user_hash) DO NOTHING RETURNING id",
      [activePollId, userHash, option],
    );

    if (insertResult.rowCount === 0) {
      return res.status(409).json({ error: "User already voted." });
    }

    const totalsResult = await pool.query<{ option: string; count: string }>(
      "SELECT option, COUNT(*)::text AS count FROM votes WHERE poll_id = $1 GROUP BY option ORDER BY option ASC",
      [activePollId],
    );

    const totals = totalsResult.rows.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.option] = Number(row.count);
        return acc;
      },
      {},
    );

    const payload: VoteResults = {
      pollId: activePollId,
      totals,
    };

    io.emit("voteUpdate", payload);

    return res.status(201).json(payload);
  } catch (error) {
    console.error("Failed to save vote", error);
    return res.status(500).json({ error: "Failed to save vote." });
  }
});

const port = Number(process.env.PORT ?? 3001);

server.listen(port, () => {
  console.log(`API listening on ${port}`);
});
