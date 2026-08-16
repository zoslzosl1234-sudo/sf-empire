from pathlib import Path

code = """import fs from "node:fs";
import path from "node:path";

const rules = fs.readFileSync(
  path.join(process.cwd(), "rules.txt"),
  "utf8"
);

const MODEL = "gemini-3.6-flash";

const EXTRA_INSTRUCTIONS = `
너는 모바일 웹게임 "SF 우주 제국 시뮬레이션 v3.2"의 GM이다.
아래 원본 규칙을 최우선 게임 규칙으로 사용한다.

[핵심 운영]
- 반드시 한국어로 응답한다.
- 확정된 설정, 숫자, 날짜, 연구, 함대, 외교 상태를 임의로 바꾸지 않는다.
- 국가 생성 중에는 한 단계씩만 진행한다.
- 플레이어가 단순 질문/확인만 하면 턴을 진행하지 않는다.
- 실제 행동이 끝난 경우에만 시간과 턴을 진행한다.
- 미접촉 문명의 비공개 정보는 플레이어에게 공개하지 않는다.
- 선택지가 필요한 경우 5개를 제시하고 자유 행동도 허용한다.
- 모바일 화면에서 읽기 쉽게 작성한다.
- 표는 가능하면 사용하지 않는다.

[매우 중요한 출력 길이 규칙]
이 게임은 스마트폰에서 플레이한다.
원본 규칙의 계산과 상태 관리는 내부적으로 모두 적용하되,
화면에 보여주는 답변은 반드시 간결하게 요약한다.

일반적인 한 턴 응답:
- 전체 분량을 대략 600~1200자 안쪽으로 유지한다.
- 특별한 전쟁/대형 사건이 아니라면 1500자를 넘기지 않는다.
- 같은 설명을 반복하지 않는다.
- 배경설명은 필요한 만큼만 2~5문장으로 요약한다.
- 계산식은 결과 이해에 꼭 필요한 경우에만 한두 줄 표시한다.
- 자원/수치가 변했다면 "변화한 값" 위주로 보여준다.
- 변하지 않은 모든 세부 수치를 매번 다시 나열하지 않는다.
- 플레이어가 "자세히", "전체 상태", "계산 과정", "보고서" 등을 요구할 때만 상세 출력한다.

[권장 화면 형식]
1. 현재 상황: 2~5문장
2. 핵심 변화: 최대 5줄
3. 다음 행동: 선택지 5개, 각 1줄
4. 실제 턴이 종료된 경우에만 간략 상태:
   - 날짜 / 턴
   - 경제력 / 안정도
   - 핵심 자원 몇 개
   - 현재 연구
   - 핵심 함대
   - 중요한 외교/사건
상태창은 최대 8~10줄 정도로 요약한다.

국가 생성 단계에서는 더 짧게 답한다.
한 단계 설명 + 선택지만 보여주고,
다음 단계 정보는 미리 길게 설명하지 않는다.

[장기 기억]
입력에 "현재 장기 게임 기억"이 제공되면
그 정보는 현재 세이브 상태이며 최근 대화보다 우선한다.

기존 기억은 실제 사건으로 바뀌지 않았다면 유지한다.
모르는 값을 억지로 만들지 않는다.

[출력 형식]
플레이어에게 보여줄 게임 본문을 먼저 출력한다.

맨 마지막에 반드시 아래 형식을 붙인다.

<<<MEMORY>>>
{
  "현재 게임 상태": "JSON 객체"
}
<<<END_MEMORY>>>

중요:
- <<<MEMORY>>> 앞의 내용만 플레이어에게 보여진다.
- MEMORY 안에는 유효한 JSON 객체만 넣는다.
- MEMORY 안에 Markdown 코드블록을 사용하지 않는다.
- MEMORY 뒤에는 아무 말도 쓰지 않는다.
`;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      m =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-10)
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: m.content.slice(0, 8000)
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

    if (json.length <= 30000) {
      return memory;
    }

    return {
      note: "이전 장기 기억이 너무 커 일부만 보존됨.",
      previousMemory: json.slice(0, 28000)
    };
  } catch {
    return {};
  }
}

function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  return parts
    .map(part =>
      typeof part?.text === "string"
        ? part.text
        : ""
    )
    .join("")
    .trim();
}

function extractGameAndMemory(rawText, previousMemory) {
  if (!rawText) {
    return {
      text: "",
      memory: previousMemory
    };
  }

  const startMarker = "<<<MEMORY>>>";
  const endMarker = "<<<END_MEMORY>>>";

  const start = rawText.indexOf(startMarker);

  if (start === -1) {
    return {
      text: rawText.trim(),
      memory: previousMemory
    };
  }

  const gameText = rawText.slice(0, start).trim();
  const memoryStart = start + startMarker.length;
  const end = rawText.indexOf(endMarker, memoryStart);

  const memoryText = (
    end === -1
      ? rawText.slice(memoryStart)
      : rawText.slice(memoryStart, end)
  )
    .replace(/^```json\\s*/i, "")
    .replace(/^```\\s*/i, "")
    .replace(/\\s*```$/i, "")
    .trim();

  let parsedMemory = previousMemory;

  if (memoryText) {
    try {
      const candidate = JSON.parse(memoryText);

      if (
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
      ) {
        parsedMemory = candidate;
      }
    } catch (err) {
      console.warn(
        "Memory JSON parse failed:",
        err.message
      );
    }
  }

  return {
    text:
      gameText ||
      "게임 진행 결과를 생성했습니다.",
    memory: parsedMemory
  };
}

function getRetryAfterSeconds(data, response) {
  const headerValue =
    response.headers.get("retry-after");

  if (headerValue) {
    const n = Number(headerValue);

    if (Number.isFinite(n) && n > 0) {
      return Math.ceil(n);
    }
  }

  const details = data?.error?.details;

  if (Array.isArray(details)) {
    for (const detail of details) {
      const delay = detail?.retryDelay;

      if (typeof delay === "string") {
        const match = delay.match(/([\\d.]+)s/);

        if (match) {
          return Math.ceil(Number(match[1]));
        }
      }
    }
  }

  const message = data?.error?.message || "";
  const match =
    message.match(/retry\\s+in\\s+([\\d.]+)\\s*s/i);

  if (match) {
    return Math.ceil(Number(match[1]));
  }

  return 30;
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

    const contents = [
      ...history,
      {
        role: "user",
        parts: [
          {
            text:
              `===== 현재 장기 게임 기억 =====\\n` +
              `${JSON.stringify(memory, null, 2)}\\n\\n` +
              `===== 현재 플레이어 입력 =====\\n` +
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
              `${EXTRA_INSTRUCTIONS}\\n\\n` +
              `===== 원본 게임 규칙 =====\\n` +
              rules
          }
        ]
      },

      contents,

      generationConfig: {
        maxOutputTokens: 2600,
        temperature: 0.8
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

    if (response.status === 429) {
      const retryAfter =
        getRetryAfterSeconds(data, response);

      return res.status(429).json({
        error:
          "Gemini 무료 API 사용량이 잠시 가득 찼습니다.",
        code: "RATE_LIMIT",
        retryAfter
      });
    }

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
      return res.status(500).json({
        error:
          "Gemini가 게임 응답을 생성하지 못했습니다."
      });
    }

    const parsed =
      extractGameAndMemory(
        rawText,
        memory
      );

    return res.status(200).json({
      text: parsed.text,
      memory: parsed.memory,
      model: MODEL
    });
  } catch (err) {
    console.error("Server Error:", err);

    return res.status(500).json({
      error:
        err?.message ||
        "Gemini API 요청 중 서버 오류가 발생했습니다."
    });
  }
}
"""

path = Path("/mnt/data/chat.js")
path.write_text(code, encoding="utf-8")
print(f"Created {path}")
