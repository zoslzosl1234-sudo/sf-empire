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
- 확정된 설정과 과거 사건을 임의로 바꾸지 않는다.
- 미접촉 문명의 비공개 정보는 플레이어에게 노출하지 않는다.
- 실제 턴이 종료되었을 때만 상태창을 출력한다.
- 단순 질문이나 확인에는 불필요하게 시간을 진행시키지 않는다.
- 모바일에서 읽기 쉽게 작성한다.

아래에 "장기 게임 기억"이 제공되면 이것은 과거 플레이에서 확정된
지속 상태다. 최근 대화보다 오래된 내용이라도 이를 반드시 유지한다.

너의 출력은 반드시 JSON 하나여야 한다.

형식:
{
  "text": "플레이어에게 보여줄 게임 응답",
  "memory": {
    ...현재 시점의 장기 게임 상태...
  }
}

memory에는 가능한 범위에서 다음을 유지한다:
- phase: 현재 게임 생성/진행 단계
- date: 현재 날짜
- turn: 현재 턴
- nation: 국가명
- leader: 지도자
- race: 종족
- government: 정치체계
- traits: 추가 특성
- capital: 수도/모행성
- colonies: 알려진 플레이어 식민지
- population: 총 인구와 중요 인구 상태
- resources: 현재 주요 자원
- economy: 경제력
- stability: 국가 및 주요 행성 안정도
- navigation: 현재 항행 단계
- technologies: 완료 기술
- research: 현재 연구 및 진행도
- construction: 진행 중 건설
- fleets: 주요 함대/함선/준비도
- diplomacy: 접촉한 문명과 알려진 외교관계
- wars: 현재 전쟁
- events: 진행 중 중요 사건
- decisions: 장기적으로 기억할 플레이어의 중요한 결정
- hiddenState: 플레이어에게 공개하면 안 되지만 GM이 연속성을 위해 기억해야 할 최소 정보

기존 memory 값은 사건으로 변경되지 않았다면 그대로 유지한다.
모르는 값을 지어내서 채우지 않는다.
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
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) {
    return {};
  }

  try {
    const text = JSON.stringify(memory);

    if (text.length > 40000) {
      return {
        note: "기존 memory가 너무 커서 축약 필요",
        previousMemoryExcerpt: text.slice(0, 35000)
      };
    }

    return memory;
  } catch {
    return {};
  }
}

function extractText(data) {
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

function safeJsonParse(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    /*
      혹시 모델이 ```json 코드블록을 붙인 경우 대비
    */
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
      error:
        "서버에 GEMINI_API_KEY가 설정되지 않았습니다."
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
              `===== 플레이어의 현재 입력 =====\n` +
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
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",

          properties: {
            text: {
              type: "STRING"
            },

            memory: {
              type: "OBJECT",
              additionalProperties: true
            }
          },

          required: [
            "text",
            "memory"
          ]
        }
      }
    };

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "x-goog-api-key":
          apiKey
      },

      body:
        JSON.stringify(requestBody)
    });

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API Error:",
        JSON.stringify(data)
      );

      return res
        .status(response.status)
        .json({
          error:
            data?.error?.message ||
            `Gemini API 오류 (${response.status})`
        });
    }

    const raw =
      extractText(data);

    const parsed =
      safeJsonParse(raw);

    if (!parsed) {
      console.error(
        "JSON parse failed:",
        raw
      );

      return res.status(500).json({
        error:
          "Gemini 응답을 게임 데이터로 해석하지 못했습니다."
      });
    }

    const text =
      typeof parsed.text === "string"
        ? parsed.text.trim()
        : "";

    if (!text) {
      return res.status(500).json({
        error:
          "Gemini가 게임 본문을 생성하지 못했습니다."
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
