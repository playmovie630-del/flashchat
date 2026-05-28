const statusEl = document.getElementById("status");
const chatEl = document.getElementById("chat");
const messagesEl = document.getElementById("messages");
const startBtn = document.getElementById("startBtn");
const leaveBtn = document.getElementById("leaveBtn");
const newBtn = document.getElementById("newBtn");
const sendBtn = document.getElementById("sendBtn");
const form = document.getElementById("messageForm");
const input = document.getElementById("messageInput");

const genderMale = document.getElementById("genderMale");
const genderFemale = document.getElementById("genderFemale");
const wantAny = document.getElementById("wantAny");
const wantMale = document.getElementById("wantMale");
const wantFemale = document.getElementById("wantFemale");
const autoReconnectEl = document.getElementById("autoReconnect");

let polling = null;
let lastAt = 0;
let connected = false;
let disconnected = false;
let waiting = false;

let autoReconnect = false;
let myGender = "any";
let wantGender = "any";

function setStatus(text, state = "idle") {
  statusEl.textContent = text;
  statusEl.className = `status status-${state}`;
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(Math.floor(timestamp * 1000));
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function appendMessage(author, text, at) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${author}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  if (at) {
    const ts = document.createElement("span");
    ts.className = "timestamp";
    ts.textContent = formatTime(at);
    bubble.appendChild(ts);
  }

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateUI() {
  sendBtn.disabled = !connected;
  input.disabled = !connected;

  if (connected) {
    chatEl.classList.remove("hidden");
    newBtn.classList.remove("hidden");
    leaveBtn.classList.remove("hidden");
    startBtn.classList.add("hidden");
  } else if (waiting) {
    chatEl.classList.add("hidden");
    newBtn.classList.add("hidden");
    leaveBtn.classList.remove("hidden");
    startBtn.classList.add("hidden");
  } else {
    chatEl.classList.add("hidden");
    newBtn.classList.add("hidden");
    leaveBtn.classList.add("hidden");
    startBtn.classList.remove("hidden");
  }
}

function loadPrefs() {
  try {
    const stored = localStorage.getItem("flashchat_prefs");
    if (stored) {
      const p = JSON.parse(stored);
      autoReconnect = !!p.autoReconnect;
      myGender = p.gender || "any";
      wantGender = p.want || "any";
    }
  } catch (e) {
    console.error("Failed to load prefs", e);
  }
  // apply to UI
  if (myGender === "male") genderMale.checked = true;
  else if (myGender === "female") genderFemale.checked = true;
  if (wantGender === "male") wantMale.checked = true;
  else if (wantGender === "female") wantFemale.checked = true;
  else wantAny.checked = true;
  autoReconnectEl.checked = !!autoReconnect;
}

function savePrefs() {
  const p = { autoReconnect, gender: myGender, want: wantGender };
  try {
    localStorage.setItem("flashchat_prefs", JSON.stringify(p));
  } catch (e) {
    console.error("Failed to save prefs", e);
  }
}

async function joinChat() {
  if (disconnected) {
    await fetch("/leave", { method: "POST" });
    disconnected = false;
  }
  waiting = false;
  setStatus("Searching for a stranger...", "waiting");
  updateUI();
  lastAt = 0;
  messagesEl.innerHTML = "";
  connected = false;

  // send prefs with join request
  const bodyReq = { gender: myGender, want: wantGender, autoReconnect };
  const resp = await fetch("/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyReq) });
  const body = await resp.json();
  if (body.status === "connected") {
    connected = true;
    waiting = false;
    setStatus("Connected — say hi!", "connected");
    updateUI();
    if (body.messages.length) {
      body.messages.forEach((message) => appendMessage(message.author, message.text, message.at));
      lastAt = body.messages[body.messages.length - 1].at;
    }
    startPolling();
  } else if (body.status === "disconnected") {
    connected = false;
    disconnected = true;
    waiting = false;
    setStatus("Partner disconnected. Press Start to try a new chat.", "disconnected");
    updateUI();
  } else {
    connected = false;
    waiting = true;
    const pos = body.position || null;
    const total = body.waiting || null;
    if (pos && total) {
      setStatus(`Waiting for a stranger... (${pos}/${total})`, "waiting");
    } else {
      setStatus("Waiting for a stranger...", "waiting");
    }
    updateUI();
    startPolling();
  }
}

async function poll() {
  const resp = await fetch(`/poll?since=${lastAt}`);
  const body = await resp.json();
  if (body.status === "connected") {
    if (!connected) {
      connected = true;
      waiting = false;
      setStatus("Connected — say hi!", "connected");
      updateUI();
    }
    body.messages.forEach((message) => {
      if (message.author !== "me") {
        appendMessage(message.author, message.text, message.at);
      }
      lastAt = Math.max(lastAt, message.at);
    });
  } else if (body.status === "disconnected") {
    connected = false;
    waiting = false;
    disconnected = true;
    stopPolling();
    setStatus("Partner disconnected. Try a new chat.", "disconnected");
    updateUI();
    // auto-reconnect if enabled
    if (autoReconnect) {
      setTimeout(() => {
        joinChat();
      }, 1200);
    }
  } else {
    if (!connected) {
      waiting = true;
      const pos = body.position || null;
      const total = body.waiting || null;
      if (pos && total) {
        setStatus(`Waiting for a stranger... (${pos}/${total})`, "waiting");
      } else {
        setStatus("Waiting for a stranger...", "waiting");
      }
      updateUI();
    }
  }
}

function startPolling() {
  if (polling) return;
  polling = setInterval(async () => {
    try {
      await poll();
    } catch (error) {
      console.error(error);
      setStatus("Connection error. Retrying...");
    }
  }, 1600);
}

function stopPolling() {
  if (polling) {
    clearInterval(polling);
    polling = null;
  }
}

async function sendMessage(text) {
  if (!connected) return;

  const resp = await fetch("/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    const body = await resp.json();
    setStatus(body.message || "Could not send message.", "disconnected");
    return;
  }
  const body = await resp.json();
  appendMessage("me", text, body.at);
  input.value = "";
  lastAt = Math.max(lastAt, body.at || (Date.now() / 1000));
}

async function leaveChat() {
  await fetch("/leave", { method: "POST" });
  connected = false;
  waiting = false;
  disconnected = false;
  stopPolling();
  setStatus("Press Start to chat with a stranger.", "idle");
  updateUI();
}

startBtn.addEventListener("click", joinChat);
leaveBtn.addEventListener("click", leaveChat);
newBtn.addEventListener("click", async () => {
  await leaveChat();
  await joinChat();
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  await sendMessage(text);
});

// prefs UI handlers
if (genderMale) genderMale.addEventListener('change', () => { myGender = 'male'; savePrefs(); });
if (genderFemale) genderFemale.addEventListener('change', () => { myGender = 'female'; savePrefs(); });
if (wantAny) wantAny.addEventListener('change', () => { wantGender = 'any'; savePrefs(); });
if (wantMale) wantMale.addEventListener('change', () => { wantGender = 'male'; savePrefs(); });
if (wantFemale) wantFemale.addEventListener('change', () => { wantGender = 'female'; savePrefs(); });
if (autoReconnectEl) autoReconnectEl.addEventListener('change', () => { autoReconnect = !!autoReconnectEl.checked; savePrefs(); });

loadPrefs();
updateUI();
