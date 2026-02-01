import { $ } from "./dom";
import { addLogEntry, type LogEntry } from "./log";

function getStageCenter(): { x: number; y: number } {
  const stage = $("mainStage");
  if (!stage) return { x: 0, y: 0 };
  const rect = stage.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function getZoneCenter(zoneId: string): { x: number; y: number } {
  const zone = $(zoneId);
  const stage = $("mainStage");
  if (!zone || !stage) return getStageCenter();
  const rect = zone.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  return {
    x: rect.left - stageRect.left + rect.width / 2,
    y: rect.top - stageRect.top + rect.height / 2,
  };
}

function syntaxHighlight(json: unknown): string {
  const jsonText = typeof json === "string" ? json : JSON.stringify(json, undefined, 2);
  return jsonText.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "hl-num";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) cls = "hl-key";
        else cls = "hl-str";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export type PacketData = {
  type: LogEntry["type"];
  title: string;
  content: unknown;
};

export function showPacket(data: PacketData, position: "left" | "center" | "right"): HTMLElement | null {
  const stage = $("packetStage");
  if (!stage) return null;

  stage.innerHTML = "";

  const pkt = document.createElement("div");
  pkt.className = "data-packet " + (data.content && typeof data.content === "object" ? "json" : "");
  pkt.innerHTML = `<strong>${data.title}</strong>${
    typeof data.content === "string" ? data.content : syntaxHighlight(data.content)
  }`;

  const center = getZoneCenter("zoneNetwork");
  const left = getZoneCenter("zoneClient");
  const right = getZoneCenter("zoneServer");

  let startX = center.x;
  let startY = center.y;
  if (position === "left") {
    startX = left.x;
    startY = left.y;
  }
  if (position === "right") {
    startX = right.x;
    startY = right.y;
  }

  pkt.style.left = `${startX}px`;
  pkt.style.top = `${startY}px`;
  pkt.style.transform = "translate(-50%, -50%)";

  stage.appendChild(pkt);
  void pkt.offsetWidth;
  pkt.style.opacity = "1";

  addLogEntry(data);
  return pkt;
}

export function movePacket(from: "left" | "center" | "right", to: "left" | "center" | "right"): void {
  const pkt = document.querySelector<HTMLElement>(".data-packet");
  if (!pkt) return;

  const center = getZoneCenter("zoneNetwork");
  const left = getZoneCenter("zoneClient");
  const right = getZoneCenter("zoneServer");

  const posMap: Record<"left" | "center" | "right", { x: number; y: number }> = { center, left, right };

  const start = posMap[from] ?? center;
  const end = posMap[to] ?? center;

  const anim = pkt.animate(
    [
      { left: `${start.x}px`, top: `${start.y}px` },
      { left: `${end.x}px`, top: `${end.y}px` },
    ],
    {
      duration: 600,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
      fill: "forwards",
    },
  );

  anim.onfinish = () => {
    pkt.style.left = `${end.x}px`;
    pkt.style.top = `${end.y}px`;
  };
}

export function hidePacket(): void {
  const pkt = document.querySelector<HTMLElement>(".data-packet");
  if (!pkt) return;
  pkt.style.opacity = "0";
  setTimeout(() => pkt.remove(), 300);
}

export async function flyToken(text: string): Promise<void> {
  const stage = $("packetStage");
  if (!stage) return;

  const t = document.createElement("div");
  t.className = "data-packet";
  t.style.padding = "4px 8px";
  t.textContent = text;

  const start = getZoneCenter("zoneServer");
  const end = getZoneCenter("zoneClient");
  const midX = (start.x + end.x) / 2;
  const midY = Math.min(start.y, end.y) - 50;

  t.style.left = `${start.x}px`;
  t.style.top = `${start.y}px`;
  t.style.transform = "translate(-50%, -50%)";
  t.style.opacity = "1";
  stage.appendChild(t);

  const anim = t.animate(
    [
      { left: `${start.x}px`, top: `${start.y}px`, transform: "translate(-50%, -50%) scale(1)" },
      { left: `${midX}px`, top: `${midY}px`, transform: "translate(-50%, -50%) scale(1.1)", offset: 0.5 },
      { left: `${end.x}px`, top: `${end.y}px`, transform: "translate(-50%, -50%) scale(1)" },
    ],
    {
      duration: 500,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    },
  );

  await anim.finished;
  t.remove();
}
