# SF 우주 제국 시뮬레이션 v3.2 — 모바일 GPT GM

스마트폰 브라우저에서 사용하는 온라인 전용 웹앱입니다.
원본 `rules.txt`를 서버가 OpenAI Responses API의 GM 지침으로 사용합니다.

## 가장 쉬운 배포: Vercel

1. 이 폴더를 GitHub 저장소에 업로드합니다.
2. Vercel에서 저장소를 Import 합니다.
3. Vercel 프로젝트 Settings → Environment Variables에 다음을 추가합니다.
   - `OPENAI_API_KEY` = 본인의 OpenAI API 키
   - 선택: `OPENAI_MODEL` = `gpt-5.6-terra` (기본값)
   - 선택: `OPENAI_REASONING` = `low` (기본값)
4. Deploy 합니다.
5. 생성된 `https://...vercel.app` 주소를 스마트폰에서 엽니다.
6. Safari/Chrome의 '홈 화면에 추가'를 사용하면 앱처럼 실행할 수 있습니다.

## 보안

API 키는 절대로 `public/app.js` 또는 HTML에 넣지 마세요. 이 프로젝트는 서버리스 함수 `api/chat.js`에서만 환경변수로 읽습니다.

## 세이브

대화 진행은 스마트폰 브라우저의 localStorage에 자동 저장됩니다. `새 게임`을 누르면 해당 기기의 저장이 초기화됩니다.

## 비용/모델

기본 모델은 `gpt-5.6-terra`입니다. 비용을 더 줄이려면 Vercel 환경변수 `OPENAI_MODEL`을 `gpt-5.6-luna`로 바꿀 수 있습니다.
