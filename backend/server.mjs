import { createApp } from "./src/app.mjs";
import { createPool } from "./src/db.mjs";
import { createGoogleVerifier } from "./src/services/googleVerifier.mjs";
import { createMentorClient } from "./src/services/mentorClient.mjs";

const PORT = Number(process.env.PORT) || 8787;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Copy .env.example to .env and set it.");
  process.exit(1);
}

if (!process.env.OPENROUTER_API_KEY) {
  console.warn("OPENROUTER_API_KEY is not set: the AI mentor will return an error until it is.");
}

if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn("GOOGLE_CLIENT_ID is not set: Google sign-in is disabled (email/password still works).");
}

const pool = createPool(process.env.DATABASE_URL);

const app = createApp({
  pool,
  verifyGoogleToken: createGoogleVerifier(process.env.GOOGLE_CLIENT_ID),
  askMentor: createMentorClient({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free"
  })
});

// Bind to localhost only; put real auth/HTTPS in front before exposing publicly.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Mentor backend listening on http://127.0.0.1:${PORT}`);
});
