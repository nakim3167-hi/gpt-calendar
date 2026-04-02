const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

let tokens = null;

app.get("/", (req, res) => {
  res.send("Server running");
});

app.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"]
  });
  res.redirect(url);
});

app.get("/oauth2callback", async (req, res) => {
  try {
    const code = req.query.code;
    const { tokens: t } = await oauth2Client.getToken(code);
    tokens = t;
    oauth2Client.setCredentials(tokens);
    res.send("인증 완료");
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth failed");
  }
});

function ensureAuth(req, res, next) {
  if (!tokens) {
    return res.status(401).json({ error: "먼저 로그인 필요" });
  }
  oauth2Client.setCredentials(tokens);
  next();
}

app.get("/events", ensureAuth, async (req, res) => {
  try {
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/events", async (req, res) => {
  try {
    const { summary, description, location, start, end, attendees } = req.body;

    if (!summary || !start || !end) {
      return res.status(400).json({
        error: "summary, start, end are required"
      });
    }

    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client
    });

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

    res.status(201).json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on ${PORT}`);
});
