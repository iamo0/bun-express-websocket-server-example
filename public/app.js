const PET_HUNGER_LIMIT = 1000;
const PET_HUNGER_THRESHOLD = 75;
const PET_HUNGER_RATE_PER_TICK = 1;
const TICK_DURATION = 100;
const PET_FEEDING_COOLDOWN = 1000;
const POLL_INTERVAL = 500;

const STATE_LABELS = {
  healthy: "здоров",
  hungry: "голоден",
  stasis: "стазис",
};

const MESSAGE_TEXT = {
  "Someone fed the pet": "кто-то покормил питомца",
  "Someone tried to feed the pet when it wasn't hungry": "кто-то пытался покормить, но питомец не голоден",
  "Someone tried to feed the pet right after it was fed by someone else": "кто-то пытался покормить слишком рано после прошлого кормления",
  "Someone tried to feed pet while it's in stasis": "кто-то пытался покормить питомца в стазисе",
};

const JUST_FED_TEXT = "Someone tried to feed the pet right after it was fed by someone else";
const FED_TEXT = "Someone fed the pet";

const els = {
  conn: document.getElementById("conn"),
  face: document.getElementById("face"),
  stateLabel: document.getElementById("state-label"),
  age: document.getElementById("age"),
  status: document.getElementById("status"),
  statusLabel: document.getElementById("status-label"),
  feed: document.getElementById("feed"),
  log: document.getElementById("log"),
};

let ws = null;
let wsUrl = null;
let reconnectDelay = 500;
let reconnectTimer = null;
let cooldownUntil = 0;
let cooldownTimer = null;

let hunger = 0;
let hungerAnchorAt = Date.now();

function log(text) {
  const li = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString();
  li.append(time, document.createTextNode(text));
  els.log.prepend(li);
  while (els.log.children.length > 50) els.log.lastChild.remove();
}

function setConn(state, text) {
  els.conn.dataset.state = state;
  els.conn.textContent = text;
}

function pluralDays(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}

function currentHunger() {
  const elapsed = Date.now() - hungerAnchorAt;
  return Math.min(
    PET_HUNGER_LIMIT,
    hunger + (elapsed / TICK_DURATION) * PET_HUNGER_RATE_PER_TICK
  );
}

function stateToMinHunger(state) {
  if (state === "stasis") return PET_HUNGER_LIMIT;
  if (state === "hungry") return PET_HUNGER_THRESHOLD;
  return 0;
}

function applyServerState(state) {
  hunger = stateToMinHunger(state);
  hungerAnchorAt = Date.now();
  tickIndicator();
}

function renderPet(h, state, age) {
  const faces = { healthy: "🐣", hungry: "🐥", stasis: "🥚" };
  els.face.textContent = faces[state] ?? "🐣";
  els.stateLabel.dataset.state = state;
  els.stateLabel.textContent = state;
  els.age.textContent = `возраст: ${age} ${pluralDays(age)}`;

  els.status.dataset.state = state;
  els.statusLabel.textContent = STATE_LABELS[state] ?? state;
}

function tickIndicator() {
  const h = currentHunger();
  const state =
    h >= PET_HUNGER_LIMIT ? "stasis" :
    h >= PET_HUNGER_THRESHOLD ? "hungry" :
    "healthy";
  renderPet(h, state, 0);
}

setInterval(tickIndicator, 100);

function startCooldown(ms) {
  cooldownUntil = Date.now() + ms;
  els.feed.disabled = true;
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    const left = cooldownUntil - Date.now();
    if (left <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      cooldownUntil = 0;
      els.feed.disabled = false;
      els.feed.textContent = "Покормить";
      return;
    }
    els.feed.textContent = `Подожди ${Math.ceil(left / 1000)} с`;
  }, 100);
}

async function loadState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error(`state ${res.status}`);
    const data = await res.json();
    applyServerState(data.state ?? "healthy");
  } catch (err) {
    log(`не удалось получить состояние: ${err.message}`);
  }
}

async function feed() {
  if (Date.now() < cooldownUntil) {
    return;
  }

  els.feed.disabled = true;
  try {
    const res = await fetch("/api/feed");

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      // наше успешное кормление — запускаем кулдаун
      startCooldown(PET_FEEDING_COOLDOWN);
      if (data.state) {
        applyServerState(data.state);
      }
      return;
    }

    if (res.status === 429) {
      // сервер сказал, что кулдаун ещё активен (мы или кто-то другой кормил)
      startCooldown(PET_FEEDING_COOLDOWN);
      return;
    }

    if (res.status === 409) {
      // не голоден или стазис — кулдаун не наш случай
      return;
    }

    log(`ошибка: ${res.status}`);
  } catch (err) {
    log(`ошибка сети: ${err.message}`);
  } finally {
    if (Date.now() >= cooldownUntil) {
      els.feed.disabled = false;
    }
  }
}

els.feed.addEventListener("click", feed);

async function fetchWsUrl() {
  try {
    const res = await fetch("/api-info");
    if (!res.ok) throw new Error(`api-info ${res.status}`);
    const data = await res.json();
    if (typeof data.ws_url !== "string" || !data.ws_url) {
      throw new Error("api-info did not return ws_url");
    }
    wsUrl = data.ws_url.replace(/^http/, "ws");
    return wsUrl;
  } catch (err) {
    log(`не удалось получить адрес WS: ${err.message}`);
    return null;
  }
}

function handleWSMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); }
  catch { log(`нечитаемое сообщение: ${raw}`); return; }

  if (msg.type !== "notification") return;

  const humanText = MESSAGE_TEXT[msg.text] ?? msg.text;
  log(humanText);

  if (msg.text === FED_TEXT) {
    // кто-то (возможно не мы) покормил — перезапускаем кулдаун
    // от текущего момента и синхронизируем состояние
    loadState();
    startCooldown(PET_FEEDING_COOLDOWN);
    return;
  }

  if (msg.text === JUST_FED_TEXT) {
    // кто-то попытался покормить слишком рано — сервер подтверждает,
    // что кулдаун активен, синхронизируем кнопку
    startCooldown(PET_FEEDING_COOLDOWN);
    return;
  }
}

function connectWS() {
  if (!wsUrl) {
    setConn("closed", "нет адреса WS");
    return;
  }

  setConn("connecting", "соединение…");
  ws = new WebSocket(wsUrl);

  ws.addEventListener("open", () => {
    setConn("open", "на связи");
    log("подключение установлено");
    reconnectDelay = 500;
  });

  ws.addEventListener("message", (event) => {
    handleWSMessage(event.data);
  });

  ws.addEventListener("close", () => {
    setConn("closed", "нет связи");
    log("соединение потеряно, переподключаюсь…");
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    setConn("closed", "ошибка соединения");
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    reconnectDelay = Math.min(reconnectDelay * 2, 10_000);

    if (!wsUrl) {
      const fresh = await fetchWsUrl();
      if (!fresh) {
        scheduleReconnect();
        return;
      }
    }
    connectWS();
  }, reconnectDelay);
}

setInterval(loadState, POLL_INTERVAL);

loadState();

(async () => {
  await fetchWsUrl();
  connectWS();
})();
