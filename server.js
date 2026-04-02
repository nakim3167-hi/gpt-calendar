const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ====== Google OAuth 설정 ======
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// ====== 토큰 저장 (임시: 메모리) ======
let tokens = null;

// ====== 루트 확인 ======
app.get("/", (req, res) => {
  res.send("Server is running");
});

// ====== 🔥 개인정보 처리방침 (이게 지금 핵심) ======
app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>개인정보 처리방침</title>
      </head>
      <body style="font-family: Arial; padding: 40px;">
        <h1>개인정보 처리방침</h1>
        <p>이 서비스는 Google Calendar 일정 조회 및 생성 기능을 제공합니다.</p>
        <p>사용자 인증 정보는 캘린더 작업 수행에 필요한 범위 내에서만 사용됩니다.</p>
        <p>사용자 데이터는 일정 생성 및 조회 목적 외에는 사용하지 않습니다.</p>
        <p>문의: admin@example.com</p>
      </body>
    </html>
  `);
});

// ====== OAuth 로그인 시작 ======
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
  res.redirect(url);
});

// ====== OAuth 콜백 ======
app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens: newTokens } = await oauth2Client.getToken(code);
  tokens = newTokens;
  oauth2Client.setCredentials(tokens);

  res.send("인증 완료! 이제 GPT에서 사용 가능");
});

// ====== 인증 체크 ======
function ensureAuth(req, res, next) {
  if (!tokens) {
    return res.status(401).json({ error: "먼저 로그인 필요" });
  }
  oauth2Client.setCredentials(tokens);
  next();
}

// ====== 일정 조회 ======
app.get("/events", ensureAuth, async (req, res) => {
  try {
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    const result = await calendar.events.list({
      calendarId: "primary",
      timeMin: req.query.timeMin || new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    res.json(result.data.items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== 일정 생성 ======
app.post("/events", ensureAuth, async (req, res) => {
  try {
    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    const { summary, description, start, end } = req.body;

    const event = {
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
    };

    const result = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.json({
      message: "일정 생성 완료",
      link: result.data.htmlLink,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====== 서버 시작 ======
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
