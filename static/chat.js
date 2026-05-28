const statusEl = document.getElementById("status");
const chatEl = document.getElementById("chat");
const messagesEl = document.getElementById("messages");
const startBtn = document.getElementById("startBtn");
const newBtn = document.getElementById("newBtn");
const form = document.getElementById("messageForm");
const input = document.getElementById("messageInput");

let polling = null;
let lastAt = 0;
let connected = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function appendMessage(author, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${author}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateUI() {
  if (connected) {
    chatEl.classList.remove("hidden");
    newBtn.classList.remove("hidden");
    startBtn.classList.add("hidden");
  } else {
    chatEl.classList.add("hidden");
    newBtn.classList.add("hidden");
    startBtn.classList.remove("hidden");
  }
}

async function joinChat() {
  setStatus("Searching for a stranger...");
  updateUI();
  lastAt = 0;
  messagesEl.innerHTML = "";
  connected = false;

  const resp = await fetch("/join", { method: "POST" });
  const body = await resp.json();
  if (body.status === "connected") {
    connected = true;
    setStatus("Connected — say hi!");
    updateUI();
    if (body.messages.length) {
      body.messages.forEach((message) => appendMessage(message.author, message.text));
      lastAt = body.messages[body.messages.length - 1].at;
    }
    startPolling();
  } else {
    setStatus("Waiting for a stranger...");
    startPolling();
  }
}

async function poll() {
  const resp = await fetch(`/poll?since=${lastAt}`);
  const body = await resp.json();
  if (body.status === "connected") {
    if (!connected) {
      connected = true;
      setStatus("Connected — say hi!");
      updateUI();
    }
    body.messages.forEach((message) => {
      if (message.author !== "me") {
        appendMessage(message.author, message.text);
      }
      lastAt = Math.max(lastAt, message.at);
    });
  } else {
    if (!connected) {
      setStatus("Waiting for a stranger...");
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
  const resp = await fetch("/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    const body = await resp.json();
    setStatus(body.message || "Could not send message.");
    return;
  }
  const body = await resp.json();
  appendMessage("me", text);
  input.value = "";
  lastAt = Math.max(lastAt, body.at || (Date.now() / 1000));
}

async function leaveChat() {
  await fetch("/leave", { method: "POST" });
  connected = false;
  stopPolling();
  setStatus("Press Start to chat with a stranger.");
  updateUI();
}

startBtn.addEventListener("click", joinChat);
newBtn.addEventListener("click", async () => {
  await leaveChat();
  joinChat();
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  await sendMessage(text);
});

updateUI();
