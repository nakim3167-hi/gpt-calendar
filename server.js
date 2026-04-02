const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const { google } = require("googleapis");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN_FILE = "tokens.json";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 서버 시작 시 저장된 토큰 불러오기
let tokens = null;
if (fs.existsSync(TOKEN_FILE)) {
  try {
    tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    oauth2Client.setCredentials(tokens);
    console.log("Saved tokens loaded");
  } catch (err) {
    console.error("Failed to load saved tokens:", err);
  }
}

app.get("/", (req, res) => {
  res.send("Server running");
});

app.get("/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"]
  });

  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).send("Missing code");
    }

    const tokenResponse = await oauth2Client.getToken(code);
    tokens = tokenResponse.tokens;

    oauth2Client.setCredentials(tokens);

    // 토큰 파일 저장
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
    console.log("Tokens saved to file");

    res.send("인증 완료");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("OAuth failed");
  }
});

app.get("/events", async (req, res) => {
  try {
    if (!tokens) {
      return res.status(401).json({ error: "Google 로그인 필요" });
    }

    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client
    });

    const result = await calendar.events.list({
      calendarId: "primary",
      timeMin: req.query.timeMin || new Date().toISOString(),
      timeMax: req.query.timeMax || undefined,
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime"
    });

    res.json(result.data.items || []);
  } catch (err) {
    console.error("GET /events error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/events", async (req, res) => {
  try {
    console.log("POST /events called");
    console.log("Request body:", req.body);

    if (!tokens) {
      console.log("No tokens found");
      return res.status(401).json({ error: "Google 로그인 필요" });
    }

    oauth2Client.setCredentials(tokens);

    const { summary, description, location, start, end, attendees } = req.body;

    if (!summary || !start || !end) {
      console.log("Missing required fields");
      return res.status(400).json({
        error: "summary, start, end are required"
      });
    }

    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client
    });

    console.log("Calling Google Calendar insert");

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description,
        location,
        start,
        end,
        attendees
      }
    });

    console.log("Event created:", response.data?.id);

    res.status(201).json(response.data);
  } catch (err) {
    console.error("POST /events error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on ${PORT}`);
});
