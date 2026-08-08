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

[게임 운영]
- 반드시 한국어로 응답한다.
- 원본 규칙의 게임 시작 순서와 턴 출력 형식을 지킨다.
- 국가 생성 중에는 한 단계씩만 진행한다.
- 원본에서 선택지가 필요한 단계라면 선택지를 명확하게 보여준다.
- 플레이어는 선택지 밖의 자유 행동도 할 수 있다.
- 날짜, 자원, 연구, 함대, 인구, 외교 등 확정된 상태를 임의로 변경하지 않는다.
- 장기 기억에 저장된 확정 사실을 우선 유지한다.
- 미접촉 문명의 비공개 정보는 플레이어 본문에 공개하지 않는다.
- 사용자의 단순 질문이나 확인만으로 턴을 진행시키지 않는다.
- 실제 행동이 끝난 경우에만 시간과 턴을 진행한다.
- 턴 종료 시 원본 규칙에 따라 상태창을 출력한다.
- 모바일에서 읽기 좋게 출력한다.
- 지나치게 큰 표는 피한다.

[장기 기억]
입력에 "현재 장기 게임 기억"이 제공된다.
이 정보는 오래된 대화보다 우선하는 현재 세이브 상태다.

기억에는 필요에 따라 다음을 유지한다:
- phase
- date
- turn
- nation
- leader
- race
- government
- traits
- capital
- colonies
- population
- resources
- economy
- stability
- navigation
- technologies
- research
- construction
- fleets
- diplomacy
- wars
- events
- decisions
- hiddenState

기존 장기 기억은 실제 게임 사건으로 변경되지 않았다면 그대로 유지한다.
모르는 값을 억지로 만들어 채우지 않는다.

[출력 형식]

플레이어에게 보여줄 정상적인 게임 내용을 먼저 출력한다.

그 뒤 맨 마지막에 반드시 아래 형식을 사용한다.

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
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      m =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-12)
    .map(m => ({
      role:
        m.role === "assistant"
          ? "model"
          : "user",

      parts: [
        {
          text:
            m.content.slice(
              0,
              12000
            )
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
    const json =
      JSON.stringify(memory);

    if (json.length <= 35000) {
      return memory;
    }

    return {
      note:
        "이전 장기 기억이 너무 커 일부만 보존됨.",

      previousMemory:
        json.slice(0, 32000)
    };

  } catch {
    return {};
  }
}

function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]
      ?.content?.parts || [];

  return parts
    .map(part => {
      if (
        typeof part?.text ===
        "string"
      ) {
        return part.text;
      }

      return "";
    })
    .join("")
    .trim();
}

function extractGameAndMemory(
  rawText,
  previousMemory
) {
  if (!rawText) {
    return {
      text: "",
      memory: previousMemory
    };
  }

  const startMarker =
    "<<<MEMORY>>>";

  const endMarker =
    "<<<END_MEMORY>>>";

  const start =
    rawText.indexOf(
      startMarker
    );

  /*
    MEMORY 마커를 Gemini가 빼먹어도
    게임 본문은 그대로 살린다.
  */
  if (start === -1) {
    return {
      text: rawText.trim(),
      memory: previousMemory
    };
  }

  const gameText =
    rawText
      .slice(0, start)
      .trim();

  const afterStart =
    start +
    startMarker.length;

  const end =
    rawText.indexOf(
      endMarker,
      afterStart
    );

  const memoryText =
    (
      end === -1
        ? rawText.slice(
            afterStart
          )
        : rawText.slice(
            afterStart,
            end
          )
    )
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();

  let parsedMemory =
    previousMemory;

  if (memoryText) {
    try {
      const candidate =
        JSON.parse(
          memoryText
        );

      if (
        candidate &&
        typeof candidate ===
          "object" &&
        !Array.isArray(
          candidate
        )
      ) {
        parsedMemory =
          candidate;
      }

    } catch (err) {
      /*
        MEMORY JSON이 깨져도
        게임 자체는 실패시키지 않는다.
      */
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

    memory:
      parsedMemory
  };
}

function getRetryAfterSeconds(
  data,
  response
) {
  /*
    HTTP Retry-After가 있으면 우선 사용
  */
  const headerValue =
    response.headers.get(
      "retry-after"
    );

  if (headerValue) {
    const n =
      Number(headerValue);

    if (
      Number.isFinite(n) &&
      n > 0
    ) {
      return Math.ceil(n);
    }
  }

  /*
    Google RetryInfo 확인
  */
  const details =
    data?.error?.details;

  if (
    Array.isArray(details)
  ) {
    for (
      const detail of details
    ) {
      const delay =
        detail?.retryDelay;

      if (
        typeof delay ===
          "string"
      ) {
        const match =
          delay.match(
            /([\d.]+)s/
          );

        if (match) {
          return Math.ceil(
            Number(match[1])
          );
        }
      }
    }
  }

  /*
    오류 문장에서
    "retry in 17.8s" 같은 값 추출
  */
  const message =
    data?.error?.message ||
    "";

  const match =
    message.match(
      /retry\s+in\s+([\d.]+)\s*s/i
    );

  if (match) {
    return Math.ceil(
      Number(match[1])
    );
  }

  /*
    알 수 없는 경우
    안전하게 30초
  */
  return 30;
}

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .json({
        error:
          "POST 요청만 사용할 수 있습니다."
      });
  }

  const apiKey =
    process.env
      .GEMINI_API_KEY;

  if (!apiKey) {
    return res
      .status(500)
      .json({
        error:
          "서버에 GEMINI_API_KEY가 설정되지 않았습니다."
      });
  }

  try {
    const message =
      typeof req.body
        ?.message ===
        "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res
        .status(400)
        .json({
          error:
            "메시지가 비어 있습니다."
        });
    }

    const history =
      cleanHistory(
        req.body?.history
      );

    const memory =
      cleanMemory(
        req.body?.memory
      );

    const contents = [
      ...history,

      {
        role: "user",

        parts: [
          {
            text:
              `===== 현재 장기 게임 기억 =====\n` +
              `${JSON.stringify(memory, null, 2)}\n\n` +
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
        maxOutputTokens: 6500
      }
    };

    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey
          },

          body:
            JSON.stringify(
              requestBody
            )
        }
      );

    const data =
      await response.json();

    /*
      무료 API 한도
    */
    if (
      response.status === 429
    ) {
      const retryAfter =
        getRetryAfterSeconds(
          data,
          response
        );

      return res
        .status(429)
        .json({
          error:
            "Gemini 무료 API 사용량이 잠시 가득 찼습니다.",

          code:
            "RATE_LIMIT",

          retryAfter
        });
    }

    if (!response.ok) {
      console.error(
        "Gemini API Error:",
        JSON.stringify(
          data
        )
      );

      return res
        .status(
          response.status
        )
        .json({
          error:
            data?.error
              ?.message ||
            `Gemini API 오류 (${response.status})`
        });
    }

    const rawText =
      extractGeminiText(
        data
      );

    if (!rawText) {
      return res
        .status(500)
        .json({
          error:
            "Gemini가 게임 응답을 생성하지 못했습니다."
        });
    }

    const parsed =
      extractGameAndMemory(
        rawText,
        memory
      );

    /*
      MEMORY가 깨져도
      text는 반드시 돌려준다.
    */
    return res
      .status(200)
      .json({
        text: parsed.text,

        memory:
          parsed.memory,

        model:
          MODEL
      });

  } catch (err) {
    console.error(
      "Server Error:",
      err
    );

    return res
      .status(500)
      .json({
        error:
          err?.message ||
          "Gemini API 요청 중 서버 오류가 발생했습니다."
      });
  }
}
