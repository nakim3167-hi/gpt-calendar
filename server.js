const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ===== 환경변수 =====
const PORT = process.env.PORT || 10000;

// 반드시 Render에 아래 3개가 있어야 함
// GOOGLE_CLIENT_ID
// GOOGLE_CLIENT_SECRET
// GOOGLE_REDIRECT_URI
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ===== 토큰 저장 (임시: 메모리) =====
let tokens = null;

// ===== 기본 확인 =====
app.get("/", (req, res) => {
  res.send("Server is running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ===== 개인정보 처리방침 =====
app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>개인정보 처리방침</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
        <h1>개인정보 처리방침</h1>
        <p>이 서비스는 Google Calendar 일정 조회/생성 기능을 제공합니다.</p>
        <p>사용자 인증 정보는 캘린더 작업 수행에 필요한 범위 내에서만 사용됩니다.</p>
        <p>사용자 데이터는 일정 생성/조회 목적 외에는 사용하지 않습니다.</p>
        <p>문의: admin@example.com</p>
      </body>
    </html>
  `);
});

// ===== OAuth 로그인 시작 =====
app.get("/auth", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
  res.redirect(authUrl);
});

// 예전 주소도 같이 살림
app.get("/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
  res.redirect(authUrl);
});

// ===== OAuth 콜백 =====
app.get("/oauth2callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Missing code");
    }

    const { tokens: newTokens } = await oauth2Client.getToken(code);
    tokens = newTokens;
    oauth2Client.setCredentials(tokens);

    res.send("인증 완료! 이제 GPT에서 사용 가능합니다.");
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).send(`OAuth callback failed: ${error.message}`);
  }
});

// ===== 인증 체크 =====
function ensureAuth(req, res, next) {
  if (!tokens) {
    return res.status(401).json({ error: "먼저 Google 로그인 필요" });
  }
  oauth2Client.setCredentials(tokens);
  next();
}

// ===== 일정 조회 =====
app.get("/events", ensureAuth, async (req, res) => {
  try {
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    const result = await calendar.events.list({
      calendarId: "primary",
      timeMin: req.query.timeMin || new Date().toISOString(),
      timeMax: req.query.timeMax || undefined,
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime",
    });

    res.json(result.data.items || []);
  } catch (error) {
    console.error("GET /events error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== 일정 생성 =====
app.post("/events", ensureAuth, async (req, res) => {
  try {
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    const { summary, description, location, start, end, attendees } = req.body;

    if (!summary || !start || !end) {
      return res.status(400).json({
        error: "summary, start, end are required",
      });
    }

    const event = {
      summary,
      description,
      location,
      start: typeof start === "string" ? { dateTime: start } : start,
      end: typeof end === "string" ? { dateTime: end } : end,
      attendees,
    };

    const result = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.status(201).json({
      message: "일정 생성 완료",
      id: result.data.id,
      htmlLink: result.data.htmlLink,
      event: result.data,
    });
  } catch (error) {
    console.error("POST /events error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== 서버 시작 =====
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
