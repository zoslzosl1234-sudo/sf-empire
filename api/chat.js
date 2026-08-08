import fs from "node:fs";
import path from "node:path";

const rules = fs.readFileSync(
  path.join(process.cwd(), "rules.txt"),
  "utf8"
);

const MODEL = "gemini-3.6-flash";

const EXTRA_INSTRUCTIONS = `
너는 모바일 웹게임의 SF 우주 제국 시뮬레이션 GM이다.
아래 원본 규칙을 최우선 게임 규칙으로 사용한다.

중요 운영 규칙:
- 한국어로 응답한다.
- 원본 규칙의 게임 시작 순서와 턴 출력 형식을 지킨다.
- 플레이어가 아직 국가 생성 중이면 한 단계씩만 질문한다.
- 선택지 5개를 제시하되 자유 행동도 허용한다.
- 숫자, 날짜, 자원, 연구, 함대, AI 문명 상태의 연속성을 유지한다.
- 과거 대화와 장기 기억에 확정된 설정을 임의로 바꾸지 않는다.
- 미접촉 문명의 비공개 정보는 플레이어에게 노출하지 않는다.
- 매 턴이 실제로 종료되었을 때만 상태창을 출력한다.
- 사용자가 단순 질문이나 확인을 하는 경우 불필요하게 턴을 진행하지 않는다.
- 모바일 화면에서 읽기 쉽게 작성한다.
- 지나치게 큰 표는 피한다.

장기 게임 기억이 제공되면,
그 내용은 이전 플레이에서 확정된 지속 상태다.
최근 대화에 나오지 않더라도 반드시 유지한다.

응답은 반드시 JSON 하나만 출력한다.

형식은 아래처럼 한다.

{
  "text": "플레이어에게 보여줄 게임 본문",
  "memory": {
    "phase": "",
    "date": "",
    "turn": "",
    "nation": "",
    "leader": "",
    "race": "",
    "government": "",
    "traits": [],
    "capital": "",
    "colonies": [],
    "population": "",
    "resources": {},
    "economy": "",
    "stability": "",
    "navigation": "",
    "technologies": [],
    "research": {},
    "construction": [],
    "fleets": [],
    "diplomacy": [],
    "wars": [],
    "events": [],
    "decisions": [],
    "hiddenState": {}
  }
}

memory 운영 규칙:
- 기존 memory 값은 실제 사건으로 변경되지 않았다면 유지한다.
- 모르는 값을 억지로 만들지 않는다.
- 플레이어에게 공개하면 안 되는 정보는 text에 쓰지 않는다.
- hiddenState는 GM의 연속성 유지용 최소 정보만 저장한다.
`;

function cleanHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-12)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: m.content.slice(0, 12000)
        }
      ]
    }));
}

function cleanMemory(memory) {
  if (
    !memory ||
    typeof memory !== "object" ||
    Array.isArray(memory)
  ) {
    return {};
  }

  try {
    const json = JSON.stringify(memory);

    if (json.length > 35000) {
      return {
        note: "기존 장기 기억이 너무 커서 축약 필요",
        excerpt: json.slice(0, 30000)
      };
    }

    return memory;
  } catch {
    return {};
  }
}

function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  return parts
    .map((part) =>
      typeof part?.text === "string"
        ? part.text
        : ""
    )
    .join("")
    .trim();
}

function parseJsonResponse(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 사용할 수 있습니다."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다."
    });
  }

  try {
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        error: "메시지가 비어 있습니다."
      });
    }

    const history =
      cleanHistory(req.body?.history);

    const memory =
      cleanMemory(req.body?.memory);

    const memoryText =
      JSON.stringify(memory, null, 2);

    const contents = [
      ...history,
      {
        role: "user",
        parts: [
          {
            text:
              `===== 장기 게임 기억 =====\n` +
              `${memoryText}\n\n` +
              `===== 현재 플레이어 입력 =====\n` +
              message
          }
        ]
      }
    ];

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    const requestBody = {
      systemInstruction: {
        parts: [
          {
            text:
              `${EXTRA_INSTRUCTIONS}\n\n` +
              `===== 원본 게임 규칙 =====\n` +
              rules
          }
        ]
      },

      contents,

      generationConfig: {
        maxOutputTokens: 6500,
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API Error:",
        JSON.stringify(data)
      );

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          `Gemini API 오류 (${response.status})`
      });
    }

    const rawText =
      extractGeminiText(data);

    if (!rawText) {
      console.error(
        "Gemini empty response:",
        JSON.stringify(data)
      );

      return res.status(500).json({
        error: "Gemini가 응답을 생성하지 못했습니다."
      });
    }

    const parsed =
      parseJsonResponse(rawText);

    if (!parsed) {
      console.error(
        "JSON parse failed:",
        rawText
      );

      return res.status(500).json({
        error:
          "Gemini 응답을 JSON 게임 데이터로 해석하지 못했습니다."
      });
    }

    const text =
      typeof parsed.text === "string"
        ? parsed.text.trim()
        : "";

    if (!text) {
      return res.status(500).json({
        error:
          "Gemini 응답에 게임 본문 text가 없습니다."
      });
    }

    const newMemory =
      parsed.memory &&
      typeof parsed.memory === "object" &&
      !Array.isArray(parsed.memory)
        ? parsed.memory
        : memory;

    return res.status(200).json({
      text,
      memory: newMemory,
      model: MODEL
    });

  } catch (err) {
    console.error(
      "Server Error:",
      err
    );

    return res.status(500).json({
      error:
        err?.message ||
        "Gemini API 요청 중 서버 오류가 발생했습니다."
    });
  }
}
