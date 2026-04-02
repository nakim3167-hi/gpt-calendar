const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

let tokens = null;

app.get("/", (req, res) => {
  res.send("서버 정상 작동");
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
  const code = req.query.code;

  const { tokens: t } = await oauth2Client.getToken(code);
  tokens = t;

  res.send("인증 완료");
});

app.get("/events", async (req, res) => {
  if (!tokens) {
    return res.json({ error: "먼저 로그인 필요" });
  }

  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({
    version: "v3",
    auth: oauth2Client
  });

  const result = await calendar.events.list({
    calendarId: "primary",
    maxResults: 10
  });

  res.json(result.data.items);
});

app.listen(PORT, () => {
  console.log("서버 실행됨");
});