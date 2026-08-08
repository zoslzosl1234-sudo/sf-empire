import fs from "node:fs";
import path from "node:path";

const rules = fs.readFileSync(
  path.join(process.cwd(), "rules.txt"),
  "utf8"
);

const EXTRA_INSTRUCTIONS = `
너는 모바일 웹게임의 SF 우주 제국 시뮬레이션 GM이다.
아래 원본 규칙을 최우선 게임 규칙으로 사용한다.

중요 운영 규칙:
- 한국어로 응답한다.
- 원본 규칙의 게임 시작 순서와 턴 출력 형식을 지킨다.
- 플레이어가 아직 국가 생성 중이면 한 단계씩만 질문한다.
- 선택지 5개를 제시하되 자유 행동도 허용한다.
- 숫자, 날짜, 자원, 연구, 함대, AI 문명 상태의 연속성을 유지한다.
- 과거 대화에 확정된 설정을 임의로 바꾸지 않는다.
- 미접촉 문명의 비공개 정보는 플레이어에게 노출하지 않는다.
- 매 턴이 실제로 종료되었을 때만 상태창을 출력한다.
- 사용자가 단순 질문/확인을 하는 경우 불필요하게 턴을 진행하지 않는다.
- Markdown을 사용할 수 있지만 모바일 화면에서 읽기 쉽게 지나치게 큰 표는 피한다.
`;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-30)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: m.content.slice(0, 20000),
        },
      ],
    }));
}

function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  const text = parts
    .map((part) =>
      typeof part?.text === "string" ? part.text : ""
    )
    .join("")
    .trim();

  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only",
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error:
        "서버에 GEMINI_API_KEY가 설정되지 않았습니다.",
    });
  }

  try {
    const history = cleanHistory(req.body?.history);

    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        error: "메시지가 비어 있습니다.",
      });
    }

    const model =
      process.env.GEMINI_MODEL ||
      "gemini-2.5-flash";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const contents = [
      ...history,
      {
        role: "user",
        parts: [
          {
            text: message,
          },
        ],
      },
    ];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key":
          process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                `${EXTRA_INSTRUCTIONS}\n\n` +
                `===== 원본 게임 규칙 =====\n` +
                rules,
            },
          ],
        },

        contents,

        generationConfig: {
          maxOutputTokens: 6000,
          temperature: 0.8,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        JSON.stringify(data)
      );

      const message =
        data?.error?.message ||
        `Gemini API 오류 (${response.status})`;

      return res.status(response.status).json({
        error: message,
      });
    }

    const text = extractGeminiText(data);

    if (!text) {
      console.error(
        "No Gemini text:",
        JSON.stringify(data)
      );

      return res.status(500).json({
        error:
          "Gemini가 텍스트 응답을 생성하지 못했습니다.",
      });
    }

    return res.status(200).json({
      text,
      model,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error:
        err?.message ||
        "Gemini API 요청 중 오류가 발생했습니다.",
    });
  }
}
