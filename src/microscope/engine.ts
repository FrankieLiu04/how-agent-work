import { appState, type Mode } from "./state";
import { $input, $ } from "./dom";
import { clearUI } from "./ui";
import { SCENARIOS, getReasoningStep } from "./scenarios";

export type EngineAPI = {
  toggleThinking: () => void;
  setMode: (mode: Mode) => void;
  nextStep: () => void;
  prevStep: () => void;
};

function toggleThinking(): void {
  const el = $input("thinkingToggle");
  appState.isThinkingEnabled = Boolean(el?.checked);
  setMode(appState.currentMode);
}

function setMode(mode: Mode): void {
  appState.currentMode = mode;
  const rawSteps = SCENARIOS[mode];
  appState.activeSteps = [];

  for (const step of rawSteps) {
    if (
      appState.isThinkingEnabled &&
      (step.title.includes("TTFB") || step.title.includes("代码生成") || step.title.includes("模型推理"))
    ) {
      const reasoning = getReasoningStep(mode);
      if (reasoning) appState.activeSteps.push(reasoning);
    }
    appState.activeSteps.push(step);
  }

  appState.activeSteps = appState.activeSteps.filter(Boolean);
  appState.currentStep = -1;
  appState.currentStepId++;
  appState.isStepLocked = false;

  document.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
  const btns = document.querySelectorAll<HTMLButtonElement>(".seg-btn");
  if (mode === "chat") btns[0]?.classList.add("active");
  if (mode === "agent") btns[1]?.classList.add("active");
  if (mode === "ide") btns[2]?.classList.add("active");
  if (mode === "cli") btns[3]?.classList.add("active");

  clearUI();
  updateControls();
  nextStep();
}

function nextStep(): void {
  if (appState.isStepLocked) {
    const btn = $("nextBtn") as HTMLButtonElement | null;
    if (!btn) return;
    const originalText = btn.textContent ?? "";
    btn.textContent = "⏳ Thinking/Generating...";
    btn.classList.add("shaking");
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove("shaking");
    }, 1000);
    return;
  }

  if (appState.currentStep < appState.activeSteps.length - 1) {
    appState.currentStep++;
    void executeStep();
  }
}

function prevStep(): void {
  if (appState.isStepLocked) return;
  if (appState.currentStep > 0) {
    appState.currentStep--;
    void executeStep();
  }
}

async function executeStep(): Promise<void> {
  appState.currentStepId++;
  updateControls();
  const step = appState.activeSteps[appState.currentStep];
  if (!step) return;

  const title = $("stepTitle");
  const desc = $("stepDesc");
  const progress = $("progressFill") as HTMLElement | null;

  if (title) title.textContent = `${appState.currentStep + 1}. ${step.title}`;
  if (desc) desc.textContent = step.desc;
  if (progress) progress.style.width = `${((appState.currentStep + 1) / appState.activeSteps.length) * 100}%`;

  if (!step.onEnter) return;

  const isAsync = step.onEnter.constructor && step.onEnter.constructor.name === "AsyncFunction";
  if (isAsync || step.title.includes("Thinking") || step.title.includes("思维链") || step.title.includes("Streaming") || step.title.includes("流式")) {
    appState.isStepLocked = true;
    updateControls();
    await step.onEnter(appState.currentStepId);
    appState.isStepLocked = false;
    updateControls();
    return;
  }

  step.onEnter(appState.currentStepId);
}

function updateControls(): void {
  const prev = $("prevBtn") as HTMLButtonElement | null;
  const next = $("nextBtn") as HTMLButtonElement | null;
  if (!prev || !next) return;

  prev.disabled = appState.currentStep <= 0 || appState.isStepLocked;
  next.disabled = appState.currentStep >= appState.activeSteps.length - 1 || appState.isStepLocked;
  next.textContent = appState.isStepLocked
    ? "⏳ 请等待..."
    : appState.currentStep >= appState.activeSteps.length - 1
      ? "演示结束"
      : "下一步 →";
}

export function init(): EngineAPI {
  setMode("chat");
  return { toggleThinking, setMode, nextStep, prevStep };
}
