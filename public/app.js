const log = document.querySelector('#log');
const hero = document.querySelector('#hero');
const startBtn = document.querySelector('#startGame');
const newBtn = document.querySelector('#newGame');
const composer = document.querySelector('#composer');
const input = document.querySelector('#message');
const sendBtn = document.querySelector('#send');
const thinking = document.querySelector('#thinking');

const STORAGE_KEY = 'sf-empire-v32-history';
const BACKUP_KEY = 'sf-empire-v32-backup';
const SAVE_VERSION = 2;

/*
  스마트폰 localStorage에 보관할 최대 대화 수.
  API로는 전부 보내지 않고 최근 대화 일부만 보낸다.
*/
const MAX_LOCAL_MESSAGES = 300;
const MAX_API_MESSAGES = 30;

let history = loadHistory();
let busy = false;

/* =========================
   저장 / 복구
========================= */

function validMessage(m) {
  return (
    m &&
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string'
  );
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(validMessage);
  } catch (err) {
    console.error('세이브 불러오기 실패:', err);

    /*
      기본 세이브가 깨졌을 경우
      직전 백업본 복구 시도
    */
    try {
      const backup = localStorage.getItem(BACKUP_KEY);

      if (!backup) return [];

      const parsed = JSON.parse(backup);

      if (!Array.isArray(parsed)) return [];

      return parsed.filter(validMessage);
    } catch {
      return [];
    }
  }
}

function saveHistory() {
  try {
    /*
      새 저장 전에 기존 저장본을 백업
    */
    const oldSave = localStorage.getItem(STORAGE_KEY);

    if (oldSave) {
      localStorage.setItem(BACKUP_KEY, oldSave);
    }

    /*
      너무 커져 브라우저 저장공간을 넘지 않도록
      최근 300개 메시지까지 보존
    */
    if (history.length > MAX_LOCAL_MESSAGES) {
      history = history.slice(-MAX_LOCAL_MESSAGES);
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(history)
    );
  } catch (err) {
    console.error('자동 저장 실패:', err);
  }
}

/*
  앱을 닫거나 다른 앱으로 이동할 때도 저장
*/
window.addEventListener('pagehide', saveHistory);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveHistory();
  }
});

/* =========================
   HTML 출력
========================= */

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

function renderMarkdownLite(text) {
  let s = escapeHtml(text);

  s = s
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

  return s;
}

function addMessage(role, content, persist = true) {
  const wrap = document.createElement('section');

  wrap.className = `msg ${role}`;

  const bubble = document.createElement('div');

  bubble.className = 'bubble';

  bubble.innerHTML =
    role === 'assistant'
      ? renderMarkdownLite(content)
      : escapeHtml(content).replace(/\n/g, '<br>');

  wrap.appendChild(bubble);
  log.appendChild(wrap);

  if (persist) {
    history.push({
      role,
      content
    });

    saveHistory();
  }

  requestAnimationFrame(() => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });
  });
}

/* =========================
   게임 UI
========================= */

function showGameUI() {
  hero?.remove();

  composer.classList.remove('hidden');

  setTimeout(() => {
    input.focus();
  }, 100);
}

function restore() {
  if (!history.length) return;

  showGameUI();

  for (const m of history) {
    addMessage(
      m.role,
      m.content,
      false
    );
  }
}

/* =========================
   Gemini 요청
========================= */

async function send(message) {
  if (
    busy ||
    !message ||
    !message.trim()
  ) {
    return;
  }

  busy = true;

  sendBtn.disabled = true;

  if (startBtn) {
    startBtn.disabled = true;
  }

  thinking.classList.remove('hidden');

  /*
    서버에는 최근 30개 메시지만 전달.
    스마트폰에는 최대 300개까지 저장.
  */
  const prior = history.slice(
    -MAX_API_MESSAGES
  );

  showGameUI();

  addMessage(
    'user',
    message.trim()
  );

  input.value = '';

  autoGrow();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        message: message.trim(),
        history: prior
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.error ||
        `HTTP ${res.status}`
      );
    }

    addMessage(
      'assistant',
      data.text
    );
  } catch (e) {
    addMessage(
      'assistant',
      `⚠️ 연결 오류: ${e.message}\n\n게임 기록은 스마트폰에 저장되어 있습니다. 잠시 후 같은 행동을 다시 보내세요.`
    );
  } finally {
    busy = false;

    sendBtn.disabled = false;

    thinking.classList.add('hidden');

    input.focus();
  }
}

/* =========================
   텍스트 입력창
========================= */

function autoGrow() {
  input.style.height = 'auto';

  input.style.height =
    Math.min(
      input.scrollHeight,
      150
    ) + 'px';
}

/* =========================
   세이브 파일 내보내기
========================= */

function exportSave() {
  saveHistory();

  const saveData = {
    game: 'SF Empire v3.2',
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    history
  };

  const blob = new Blob(
    [
      JSON.stringify(
        saveData,
        null,
        2
      )
    ],
    {
      type: 'application/json'
    }
  );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement('a');

  const date =
    new Date()
      .toISOString()
      .slice(0, 10);

  a.href = url;

  a.download =
    `sf-empire-save-${date}.json`;

  document.body.appendChild(a);

  a.click();

  a.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/* =========================
   세이브 파일 불러오기
========================= */

function importSave(file) {
  const reader =
    new FileReader();

  reader.onload = () => {
    try {
      const data =
        JSON.parse(reader.result);

      const imported =
        Array.isArray(data)
          ? data
          : data?.history;

      if (
        !Array.isArray(imported)
      ) {
        throw new Error(
          '올바른 SF Empire 세이브 파일이 아닙니다.'
        );
      }

      const cleaned =
        imported.filter(validMessage);

      if (!cleaned.length) {
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

      history = cleaned.slice(
        -MAX_LOCAL_MESSAGES
      );

      saveHistory();

      location.reload();
    } catch (err) {
      alert(
        `세이브 불러오기 실패\n\n${err.message}`
      );
    }
  };

  reader.readAsText(file);
}

/* =========================
   저장 / 불러오기 버튼 생성
========================= */

function createSaveButtons() {
  if (!newBtn) return;

  const container =
    newBtn.parentElement;

  if (!container) return;

  const saveBtn =
    document.createElement('button');

  saveBtn.type = 'button';

  saveBtn.textContent = '저장';

  saveBtn.title =
    '세이브 파일 다운로드';

  /*
    기존 새 게임 버튼의 스타일을 최대한 재사용
  */
  saveBtn.className =
    newBtn.className;

  saveBtn.addEventListener(
    'click',
    exportSave
  );

  const loadBtn =
    document.createElement('button');

  loadBtn.type = 'button';

  loadBtn.textContent = '불러오기';

  loadBtn.title =
    '세이브 파일 불러오기';

  loadBtn.className =
    newBtn.className;

  const fileInput =
    document.createElement('input');

  fileInput.type = 'file';

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
        importSave(file);
      }

      fileInput.value = '';
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

/* =========================
   이벤트
========================= */

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

    send(input.value);
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
      e.key === 'Enter' &&
      !e.shiftKey
    ) {
      e.preventDefault();

      composer.requestSubmit();
    }
  }
);

newBtn.addEventListener(
  'click',
  () => {
    if (
      !confirm(
        '현재 진행 기록을 지우고 새 게임을 시작할까요?\n\n필요하면 먼저 저장 버튼으로 세이브 파일을 받아두세요.'
      )
    ) {
      return;
    }

    localStorage.removeItem(
      STORAGE_KEY
    );

    localStorage.removeItem(
      BACKUP_KEY
    );

    location.reload();
  }
);

/* =========================
   시작
========================= */

createSaveButtons();

restore();
