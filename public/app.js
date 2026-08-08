const log =
  document.querySelector(
    '#log'
  );

const hero =
  document.querySelector(
    '#hero'
  );

const startBtn =
  document.querySelector(
    '#startGame'
  );

const newBtn =
  document.querySelector(
    '#newGame'
  );

const composer =
  document.querySelector(
    '#composer'
  );

const input =
  document.querySelector(
    '#message'
  );

const sendBtn =
  document.querySelector(
    '#send'
  );

const thinking =
  document.querySelector(
    '#thinking'
  );


const STORAGE_KEY =
  'sf-empire-v32-history';

const BACKUP_KEY =
  'sf-empire-v32-backup';

const MEMORY_KEY =
  'sf-empire-v32-memory';


const SAVE_VERSION = 4;

const MAX_LOCAL_MESSAGES =
  300;

const MAX_API_MESSAGES =
  12;

/*
  무료 API 제한 자동 재시도 횟수
*/
const MAX_AUTO_RETRIES =
  2;


let history =
  loadHistory();

let memory =
  loadMemory();

let busy =
  false;


/* ========================================
   메시지 검증
======================================== */

function validMessage(m) {
  return (
    m &&
    (
      m.role === 'user' ||
      m.role === 'assistant'
    ) &&
    typeof m.content ===
      'string'
  );
}


/* ========================================
   대화 저장
======================================== */

function loadHistory() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    if (
      !Array.isArray(
        parsed
      )
    ) {
      return [];
    }

    return parsed.filter(
      validMessage
    );

  } catch (err) {
    console.error(
      '기록 불러오기 실패:',
      err
    );

    try {
      const backup =
        localStorage.getItem(
          BACKUP_KEY
        );

      if (!backup) {
        return [];
      }

      const parsed =
        JSON.parse(
          backup
        );

      if (
        !Array.isArray(
          parsed
        )
      ) {
        return [];
      }

      return parsed.filter(
        validMessage
      );

    } catch {
      return [];
    }
  }
}


function saveHistory() {
  try {
    const old =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (old) {
      localStorage.setItem(
        BACKUP_KEY,
        old
      );
    }

    if (
      history.length >
      MAX_LOCAL_MESSAGES
    ) {
      history =
        history.slice(
          -MAX_LOCAL_MESSAGES
        );
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        history
      )
    );

  } catch (err) {
    console.error(
      '자동 저장 실패:',
      err
    );
  }
}


/* ========================================
   장기 기억
======================================== */

function loadMemory() {
  try {
    const raw =
      localStorage.getItem(
        MEMORY_KEY
      );

    if (!raw) {
      return {};
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed;

  } catch (err) {
    console.error(
      '장기 기억 불러오기 실패:',
      err
    );

    return {};
  }
}


function saveMemory() {
  try {
    localStorage.setItem(
      MEMORY_KEY,
      JSON.stringify(
        memory
      )
    );

  } catch (err) {
    console.error(
      '장기 기억 저장 실패:',
      err
    );
  }
}


function saveAll() {
  saveHistory();
  saveMemory();
}


/* ========================================
   앱 종료 / 백그라운드 저장
======================================== */

window.addEventListener(
  'pagehide',
  saveAll
);


document.addEventListener(
  'visibilitychange',
  () => {

    if (
      document.visibilityState ===
      'hidden'
    ) {
      saveAll();
    }

  }
);


/* ========================================
   HTML 보호
======================================== */

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c]
  );
}


/* ========================================
   간단 Markdown
======================================== */

function renderMarkdownLite(
  text
) {
  let s =
    escapeHtml(text);

  s = s
    .replace(
      /^### (.+)$/gm,
      '<h3>$1</h3>'
    )
    .replace(
      /^## (.+)$/gm,
      '<h2>$1</h2>'
    )
    .replace(
      /^# (.+)$/gm,
      '<h1>$1</h1>'
    )
    .replace(
      /^---$/gm,
      '<hr>'
    )
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong>$1</strong>'
    )
    .replace(
      /`([^`]+)`/g,
      '<code>$1</code>'
    )
    .replace(
      /\n/g,
      '<br>'
    );

  return s;
}


/* ========================================
   메시지 표시
======================================== */

function addMessage(
  role,
  content,
  persist = true
) {
  const wrap =
    document.createElement(
      'section'
    );

  wrap.className =
    `msg ${role}`;

  const bubble =
    document.createElement(
      'div'
    );

  bubble.className =
    'bubble';

  bubble.innerHTML =
    role === 'assistant'
      ? renderMarkdownLite(
          content
        )
      : escapeHtml(
          content
        ).replace(
          /\n/g,
          '<br>'
        );

  wrap.appendChild(
    bubble
  );

  log.appendChild(
    wrap
  );

  if (persist) {
    history.push({
      role,
      content
    });

    saveHistory();
  }

  requestAnimationFrame(
    () => {

      window.scrollTo({
        top:
          document.body
            .scrollHeight,

        behavior:
          'smooth'
      });

    }
  );
}


/* ========================================
   UI
======================================== */

function showGameUI() {
  hero?.remove();

  composer.classList.remove(
    'hidden'
  );

  setTimeout(
    () => {
      input.focus();
    },
    100
  );
}


function restore() {
  if (
    !history.length
  ) {
    return;
  }

  showGameUI();

  for (
    const m of history
  ) {
    addMessage(
      m.role,
      m.content,
      false
    );
  }
}


/* ========================================
   Thinking 표시
======================================== */

function setThinking(
  text
) {
  thinking.classList.remove(
    'hidden'
  );

  const textEl =
    thinking.querySelector(
      '.thinking-text'
    );

  if (textEl) {
    textEl.textContent =
      text;
  }
}


/* ========================================
   기다리기
======================================== */

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


/* ========================================
   429 카운트다운
======================================== */

async function waitForRetry(
  seconds
) {
  let remaining =
    Math.max(
      1,
      Math.ceil(seconds)
    );

  while (
    remaining > 0
  ) {
    setThinking(
      `무료 API 사용량이 잠시 가득 찼습니다. ${remaining}초 후 자동으로 다시 시도합니다...`
    );

    await sleep(
      1000
    );

    remaining--;
  }

  setThinking(
    'GM에게 다시 연결하고 있습니다...'
  );
}


/* ========================================
   실제 API 한 번 요청
======================================== */

async function requestGame(
  message,
  prior
) {
  const res =
    await fetch(
      '/api/chat',
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify({
            message,
            history:
              prior,
            memory
          })
      }
    );

  let data;

  try {
    data =
      await res.json();
  } catch {
    data = {};
  }

  return {
    res,
    data
  };
}


/* ========================================
   메시지 전송
======================================== */

async function send(
  message
) {
  if (
    busy ||
    !message ||
    !message.trim()
  ) {
    return;
  }

  busy = true;

  sendBtn.disabled =
    true;

  if (startBtn) {
    startBtn.disabled =
      true;
  }

  const cleanMessage =
    message.trim();

  /*
    현재 메시지를 넣기 전
    과거 기록만 서버에 보냄
  */
  const prior =
    history.slice(
      -MAX_API_MESSAGES
    );

  showGameUI();

  /*
    사용자 메시지는 한 번만 추가
    자동 재시도 때 중복 추가 안 됨
  */
  addMessage(
    'user',
    cleanMessage
  );

  input.value =
    '';

  autoGrow();

  setThinking(
    'GM이 상황을 계산하고 있습니다...'
  );

  let attempt =
    0;

  try {

    while (true) {

      const {
        res,
        data
      } =
        await requestGame(
          cleanMessage,
          prior
        );

      /*
        Gemini 무료 한도
      */
      if (
        res.status ===
          429 &&
        data.code ===
          'RATE_LIMIT'
      ) {

        if (
          attempt >=
          MAX_AUTO_RETRIES
        ) {
          throw new Error(
            '무료 API 요청 한도가 계속 가득 차 있습니다. 잠시 후 다시 시도해주세요.'
          );
        }

        attempt++;

        const retryAfter =
          Number(
            data.retryAfter
          ) || 30;

        /*
          서버가 알려준 시간보다
          2초 더 기다림
        */
        await waitForRetry(
          retryAfter + 2
        );

        continue;
      }

      if (!res.ok) {
        throw new Error(
          data.error ||
          `HTTP ${res.status}`
        );
      }

      /*
        새 장기 기억 저장
      */
      if (
        data.memory &&
        typeof data.memory ===
          'object' &&
        !Array.isArray(
          data.memory
        )
      ) {
        memory =
          data.memory;

        saveMemory();
      }

      /*
        게임 본문 출력
      */
      if (
        typeof data.text !==
          'string' ||
        !data.text.trim()
      ) {
        throw new Error(
          'GM의 게임 응답이 비어 있습니다.'
        );
      }

      addMessage(
        'assistant',
        data.text
      );

      break;
    }

  } catch (e) {

    addMessage(
      'assistant',

      `⚠️ 연결 오류: ${e.message}\n\n게임 기록과 장기 기억은 스마트폰에 저장되어 있습니다. 잠시 후 같은 행동을 다시 보내세요.`
    );

  } finally {

    busy =
      false;

    sendBtn.disabled =
      false;

    thinking.classList.add(
      'hidden'
    );

    input.focus();
  }
}


/* ========================================
   입력창 높이
======================================== */

function autoGrow() {
  input.style.height =
    'auto';

  input.style.height =
    Math.min(
      input.scrollHeight,
      150
    ) +
    'px';
}


/* ========================================
   세이브 내보내기
======================================== */

function exportSave() {
  saveAll();

  const saveData = {
    game:
      'SF Empire v3.2',

    version:
      SAVE_VERSION,

    savedAt:
      new Date()
        .toISOString(),

    history,

    memory
  };

  const blob =
    new Blob(
      [
        JSON.stringify(
          saveData,
          null,
          2
        )
      ],

      {
        type:
          'application/json'
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      'a'
    );

  const date =
    new Date()
      .toISOString()
      .slice(
        0,
        10
      );

  a.href =
    url;

  a.download =
    `sf-empire-save-${date}.json`;

  document.body
    .appendChild(a);

  a.click();

  a.remove();

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );
}


/* ========================================
   세이브 불러오기
======================================== */

function importSave(
  file
) {
  const reader =
    new FileReader();

  reader.onload =
    () => {

      try {

        const data =
          JSON.parse(
            reader.result
          );

        const importedHistory =
          Array.isArray(data)
            ? data
            : data?.history;

        if (
          !Array.isArray(
            importedHistory
          )
        ) {
          throw new Error(
            '올바른 SF Empire 세이브 파일이 아닙니다.'
          );
        }

        const cleaned =
          importedHistory.filter(
            validMessage
          );

        if (
          !cleaned.length
        ) {
          throw new Error(
            '세이브 기록이 비어 있습니다.'
          );
        }

        if (
          !confirm(
            '현재 게임을 이 세이브 파일로 교체할까요?'
          )
        ) {
          return;
        }

        history =
          cleaned.slice(
            -MAX_LOCAL_MESSAGES
          );

        if (
          data?.memory &&
          typeof data.memory ===
            'object' &&
          !Array.isArray(
            data.memory
          )
        ) {
          memory =
            data.memory;
        } else {
          memory = {};
        }

        saveAll();

        location.reload();

      } catch (err) {

        alert(
          `세이브 불러오기 실패\n\n${err.message}`
        );

      }
    };

  reader.readAsText(
    file
  );
}


/* ========================================
   저장 / 불러오기 버튼
======================================== */

function createSaveButtons() {
  if (!newBtn) {
    return;
  }

  const container =
    newBtn.parentElement;

  if (!container) {
    return;
  }

  if (
    document.querySelector(
      '#saveGame'
    )
  ) {
    return;
  }

  const saveBtn =
    document.createElement(
      'button'
    );

  saveBtn.id =
    'saveGame';

  saveBtn.type =
    'button';

  saveBtn.textContent =
    '저장';

  saveBtn.className =
    newBtn.className;

  saveBtn.addEventListener(
    'click',
    exportSave
  );


  const loadBtn =
    document.createElement(
      'button'
    );

  loadBtn.id =
    'loadGame';

  loadBtn.type =
    'button';

  loadBtn.textContent =
    '불러오기';

  loadBtn.className =
    newBtn.className;


  const fileInput =
    document.createElement(
      'input'
    );

  fileInput.type =
    'file';

  fileInput.accept =
    '.json,application/json';

  fileInput.style.display =
    'none';


  fileInput.addEventListener(
    'change',
    () => {

      const file =
        fileInput.files?.[0];

      if (file) {
        importSave(
          file
        );
      }

      fileInput.value =
        '';

    }
  );


  loadBtn.addEventListener(
    'click',
    () => {

      fileInput.click();

    }
  );


  container.insertBefore(
    saveBtn,
    newBtn
  );

  container.insertBefore(
    loadBtn,
    newBtn
  );

  container.appendChild(
    fileInput
  );
}


/* ========================================
   새 게임
======================================== */

function resetGame() {
  localStorage.removeItem(
    STORAGE_KEY
  );

  localStorage.removeItem(
    BACKUP_KEY
  );

  localStorage.removeItem(
    MEMORY_KEY
  );

  history = [];

  memory = {};

  location.reload();
}


/* ========================================
   이벤트
======================================== */

startBtn?.addEventListener(
  'click',
  () => {

    send(
      '게임을 시작한다. 원본 규칙에 따라 첫 단계인 종족 선택부터 진행해줘.'
    );

  }
);


composer.addEventListener(
  'submit',
  e => {

    e.preventDefault();

    send(
      input.value
    );

  }
);


input.addEventListener(
  'input',
  autoGrow
);


input.addEventListener(
  'keydown',
  e => {

    if (
      e.key ===
        'Enter' &&
      !e.shiftKey
    ) {

      e.preventDefault();

      composer
        .requestSubmit();

    }

  }
);


newBtn.addEventListener(
  'click',
  () => {

    if (
      !confirm(
        '현재 진행 기록과 장기 기억을 모두 지우고 새 게임을 시작할까요?\n\n필요하면 먼저 저장 버튼으로 세이브 파일을 받아두세요.'
      )
    ) {
      return;
    }

    resetGame();

  }
);


/* ========================================
   시작
======================================== */

createSaveButtons();

restore();
