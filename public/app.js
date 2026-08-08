const log = document.querySelector('#log');
const hero = document.querySelector('#hero');
const startBtn = document.querySelector('#startGame');
const newBtn = document.querySelector('#newGame');
const composer = document.querySelector('#composer');
const input = document.querySelector('#message');
const sendBtn = document.querySelector('#send');
const thinking = document.querySelector('#thinking');

const STORAGE_KEY = 'sf-empire-v32-history';
let history = loadHistory();
let busy = false;

function loadHistory(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveHistory(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40))); }

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderMarkdownLite(text){
  let s = escapeHtml(text);
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>')
       .replace(/^## (.+)$/gm, '<h2>$1</h2>')
       .replace(/^# (.+)$/gm, '<h1>$1</h1>')
       .replace(/^---$/gm, '<hr>')
       .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
       .replace(/`([^`]+)`/g, '<code>$1</code>')
       .replace(/\n/g, '<br>');
  return s;
}

function addMessage(role, content, persist=true){
  const wrap = document.createElement('section');
  wrap.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = role === 'assistant' ? renderMarkdownLite(content) : escapeHtml(content).replace(/\n/g,'<br>');
  wrap.appendChild(bubble);
  log.appendChild(wrap);
  if (persist) { history.push({ role, content }); saveHistory(); }
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
}

function showGameUI(){
  hero?.remove();
  composer.classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
}

function restore(){
  if (!history.length) return;
  showGameUI();
  for (const m of history) addMessage(m.role, m.content, false);
}

async function send(message){
  if (busy || !message.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  startBtn && (startBtn.disabled = true);
  thinking.classList.remove('hidden');

  const prior = history.slice(-30);
  if (hero) showGameUI();
  addMessage('user', message);
  input.value = '';
  autoGrow();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: prior })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    addMessage('assistant', data.text);
  } catch (e) {
    addMessage('assistant', `⚠️ 연결 오류: ${e.message}\n\n잠시 후 같은 행동을 다시 보내세요.`);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    thinking.classList.add('hidden');
    input.focus();
  }
}

function autoGrow(){
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 150) + 'px';
}

startBtn?.addEventListener('click', () => send('게임을 시작한다. 원본 규칙에 따라 첫 단계인 종족 선택부터 진행해줘.'));
composer.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
input.addEventListener('input', autoGrow);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); }
});
newBtn.addEventListener('click', () => {
  if (!confirm('현재 진행 기록을 지우고 새 게임을 시작할까요?')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

restore();
