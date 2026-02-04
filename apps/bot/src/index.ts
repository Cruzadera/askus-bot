import dotenv from "dotenv";
import qrcode from "qrcode-terminal";
import { Client, LocalAuth, type Message } from "whatsapp-web.js";
import { io, Socket } from "socket.io-client";
import type {
  CreatePollResponse,
  VoteRequest,
  VoteResults,
} from "@askus/shared/types.js";

dotenv.config();

const apiBaseUrl = process.env.API_URL ?? "http://localhost:3001";

const client = new Client({
  authStrategy: new LocalAuth(),
});

let socket: Socket | null = null;
let activePollId: number | null = null;
let activePollQuestion: string | null = null;
let activePollMessage: Message | null = null;

const formatResults = (totals: Record<string, number>) => {
  const entries = Object.entries(totals);

  if (entries.length === 0) {
    return "No votes yet.";
  }

  return entries
    .map(([option, count]) => `${option} ${"█".repeat(count)} ${count}`)
    .join("\n");
};

const formatPollMessage = (question: string, totals: Record<string, number>) => {
  return `🗳️ ${question}\n\n📊 Results:\n${formatResults(totals)}`;
};

const connectSocket = () => {
  socket = io(apiBaseUrl, {
    transports: ["websocket"],
  });

  socket.on("pollStarted", (payload: CreatePollResponse) => {
    activePollId = payload.activePollId;
    activePollQuestion = payload.poll.question;
  });

  socket.on("voteUpdate", async (payload: VoteResults) => {
    if (!activePollMessage || payload.pollId !== activePollId) {
      return;
    }

    if (!activePollQuestion) {
      return;
    }

    const updatedText = formatPollMessage(
      activePollQuestion,
      payload.totals,
    );

    try {
      await activePollMessage.edit(updatedText);
    } catch (error) {
      console.error("Failed to edit poll message", error);
    }
  });
};

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("WhatsApp client ready");
  connectSocket();
});

client.on("message", async (message) => {
  const chat = await message.getChat();
  const body = message.body.trim();

  if (chat.isGroup && body.startsWith("/ask ")) {
    const question = body.replace("/ask ", "").trim();

    if (!question) {
      await message.reply("Please include a question after /ask");
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/poll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        const error = await response.json();
        await message.reply(error.error ?? "Failed to create poll.");
        return;
      }

      const payload = (await response.json()) as CreatePollResponse;
      activePollId = payload.activePollId;
      activePollQuestion = payload.poll.question;

      const pollMessage = await message.reply(
        formatPollMessage(payload.poll.question, {}),
      );

      activePollMessage = pollMessage;
    } catch (error) {
      console.error("Failed to create poll", error);
      await message.reply("Failed to create poll.");
    }

    return;
  }

  if (!chat.isGroup && body.toLowerCase().startsWith("voto ")) {
    const option = body.slice(5).trim();

    if (!option) {
      await message.reply("Please include an option after 'voto'.");
      return;
    }

    const payload: VoteRequest = {
      userId: message.from,
      option,
    };

    try {
      const response = await fetch(`${apiBaseUrl}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        await message.reply(data.error ?? "Failed to submit vote.");
        return;
      }

      await message.reply("Your vote has been recorded.");
    } catch (error) {
      console.error("Failed to send vote", error);
      await message.reply("Failed to send vote.");
    }
  }
});

client.initialize();
