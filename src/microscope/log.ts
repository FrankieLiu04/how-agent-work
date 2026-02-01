import { $ } from "./dom";

export type LogEntry = {
  type: "req" | "res" | "info";
  title: string;
  content: unknown;
};

export function addLogEntry(data: LogEntry): void {
  const container = $("logContent");
  if (!container) return;

  const empty = container.querySelector(".log-empty");
  if (empty) empty.remove();

  const div = document.createElement("div");
  div.className = "log-entry";
  div.onclick = () => div.classList.toggle("expanded");

  const time = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const typeLabel = data.type === "req" ? "REQ" : data.type === "res" ? "RES" : "INFO";
  const typeClass = data.type;
  const contentStr = typeof data.content === "string" ? data.content : JSON.stringify(data.content, null, 2);

  div.innerHTML = `
        <div class="log-time">${time}</div>
        <div class="log-type ${typeClass}">${typeLabel}</div>
        <div class="log-summary">${data.title}</div>
    `;

  const detail = document.createElement("div");
  detail.className = "log-detail";
  detail.textContent = contentStr;

  container.appendChild(div);
  container.appendChild(detail);
  container.scrollTop = container.scrollHeight;
}
