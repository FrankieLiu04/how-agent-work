import { $, $input } from "./dom";
import { hidePacket } from "./packet";

export function highlight(cardId: string): void {
  document.querySelectorAll(".card").forEach((c) => c.classList.remove("highlight"));
  document.querySelectorAll(".network-stage").forEach((s) => s.classList.remove("highlight"));
  if (cardId === "network-stage") {
    const stage = document.querySelector<HTMLElement>(".network-stage");
    if (stage) stage.classList.add("highlight");
    return;
  }
  const el = $(cardId);
  if (el) el.classList.add("highlight");
}

export function clearUI(): void {
  const chatList = $("chatList");
  if (chatList) chatList.innerHTML = "";

  const contextContent = $("contextContent");
  if (contextContent) contextContent.textContent = "(Empty)";

  const tokenStream = $("tokenStream");
  if (tokenStream) tokenStream.innerHTML = "";

  hidePacket();

  const ideEditor = document.querySelector<HTMLElement>(".ide-editor");
  if (ideEditor) ideEditor.textContent = "";

  const termScreen = document.querySelector<HTMLElement>(".client-screen.terminal");
  if (termScreen) termScreen.innerHTML = "";

  const logContent = $("logContent");
  if (logContent) logContent.innerHTML = '<div class="log-empty">No traffic yet.</div>';
}

export function setClientTheme(theme: "phone" | "ide" | "terminal"): void {
  const card = $("clientCard");
  if (!card) return;
  card.innerHTML = "";

  const screen = document.createElement("div");
  screen.className = `client-screen ${theme}`;

  if (theme === "phone") {
    screen.innerHTML = `
            <div class="chat-bubbles" id="chatList"></div>
            <div class="input-mock">
              <div class="input-bar"></div>
              <div class="input-btn"></div>
            </div>
        `;
  } else if (theme === "ide") {
    screen.innerHTML = `
            <div class="ide-sidebar">
                <div class="ide-icon"></div>
                <div class="ide-icon"></div>
                <div class="ide-icon" style="margin-top:auto; margin-bottom:10px;"></div>
            </div>
            <div class="ide-main">
                <div class="ide-tabs">
                    <div class="ide-tab">utils.js</div>
                </div>
                <div class="ide-editor" id="ideEditor"></div>
            </div>
        `;
  } else if (theme === "terminal") {
    screen.classList.add("terminal");
  }

  card.appendChild(screen);
}

function getBubbleTextEl(bubble: Element | null): HTMLElement | null {
  if (!bubble) return null;
  let el = bubble.querySelector<HTMLElement>(".bubble-text");
  if (el) return el;

  el = document.createElement("span");
  el.className = "bubble-text";
  if (bubble.children.length === 0) {
    el.textContent = bubble.textContent ?? "";
    bubble.textContent = "";
  }
  bubble.appendChild(el);
  return el;
}

export function addBubble(role: string, text: string): void {
  const list = $("chatList");
  if (!list) return;

  const div = document.createElement("div");
  div.className = `bubble ${role}`;

  const textEl = document.createElement("span");
  textEl.className = "bubble-text";
  textEl.textContent = text;

  div.appendChild(textEl);
  list.appendChild(div);
  div.scrollIntoView({ behavior: "smooth" });
}

export function updateLastBubble(text: string, role?: string): void {
  const list = $("chatList");
  if (!list) return;

  const last = list.lastElementChild;
  if (!last || (role && !last.classList.contains(role))) {
    addBubble(role || "ai", text);
    return;
  }

  const textEl = getBubbleTextEl(last);
  if (textEl) textEl.textContent = text;
}

export function appendBubble(role: string, text: string): void {
  const list = $("chatList");
  if (!list) return;

  const targetRole = role || "ai";
  const last = list.lastElementChild;
  if (!last || !last.classList.contains(targetRole)) {
    addBubble(targetRole, text);
    return;
  }

  const textEl = getBubbleTextEl(last);
  if (textEl) textEl.textContent = (textEl.textContent ?? "") + text;
}

export function appendClientThinking(text: string): void {
  const list = $("chatList");
  if (!list) return;

  let last = list.lastElementChild;
  if (!last || !last.classList.contains("ai")) {
    addBubble("ai", "");
    last = list.lastElementChild;
  }
  if (!last) return;

  let thinkingBlock = last.querySelector<HTMLDetailsElement>(".thinking-block");
  if (!thinkingBlock) {
    thinkingBlock = document.createElement("details");
    thinkingBlock.className = "thinking-block";
    thinkingBlock.open = true;
    thinkingBlock.innerHTML = `
            <summary>Thinking Process</summary>
            <div class="thinking-content"></div>
        `;
    if (last.firstChild) last.insertBefore(thinkingBlock, last.firstChild);
    else last.appendChild(thinkingBlock);
  }

  const content = thinkingBlock.querySelector<HTMLElement>(".thinking-content");
  if (!content) return;
  content.textContent = (content.textContent ?? "") + text + " ";
  content.scrollTop = content.scrollHeight;
  last.scrollIntoView({ behavior: "smooth" });
}

export function setIdeContent(text: string): void {
  const editor = document.getElementById("ideEditor");
  if (editor) editor.textContent = text;
}

export function appendIdeGhost(text: string): void {
  const editor = document.getElementById("ideEditor");
  if (!editor) return;

  let ghost = editor.querySelector<HTMLElement>(".ide-copilot-ghost");
  if (!ghost) {
    ghost = document.createElement("span");
    ghost.className = "ide-copilot-ghost";
    editor.appendChild(ghost);
  }
  ghost.textContent = (ghost.textContent ?? "") + text;
}

export function acceptIdeGhost(): void {
  const editor = document.getElementById("ideEditor");
  if (!editor) return;

  const ghost = editor.querySelector<HTMLElement>(".ide-copilot-ghost");
  if (!ghost) return;

  const text = ghost.textContent ?? "";
  ghost.remove();
  editor.appendChild(document.createTextNode(text));
}

export function addTermLine(type: "user" | "agent" | "system" | "success", text: string): void {
  const screen = document.querySelector<HTMLElement>(".client-screen.terminal");
  if (!screen) return;

  const line = document.createElement("div");
  line.className = "term-line";

  if (type === "user" || type === "agent") {
    const prompt = document.createElement("span");
    prompt.className = "term-prompt";
    prompt.textContent = type === "user" ? ">" : "$";

    const content = document.createElement("span");
    content.className = "term-text";
    content.textContent = text;

    line.appendChild(prompt);
    line.appendChild(content);
  } else {
    const content = document.createElement("span");
    content.className = "term-text";
    content.textContent = text;
    line.appendChild(content);
    line.style.color = type === "success" ? "#34c759" : "#ccc";
  }

  screen.appendChild(line);
  screen.scrollTop = screen.scrollHeight;
}

export function setContext(text: string): void {
  const el = $("contextContent");
  if (el) el.textContent = text;
}

export function addToken(text: string, isThinking?: boolean): void {
  const stream = $("tokenStream");
  if (!stream) return;

  const span = document.createElement("span");
  span.className = "token" + (isThinking ? " think" : "");
  span.textContent = text;
  stream.appendChild(span);
  stream.scrollTop = stream.scrollHeight;
}

export function getThinkingEnabled(): boolean {
  const el = $input("thinkingToggle");
  return Boolean(el?.checked);
}
