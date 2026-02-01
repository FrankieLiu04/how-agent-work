export type Mode = "chat" | "agent" | "ide" | "cli";

export type StepOnEnter = (stepId: number) => void | Promise<void>;

export type Step = {
  title: string;
  desc: string;
  onEnter?: StepOnEnter;
};

export type ActiveStream = {
  abort: AbortController;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
};

export type AppState = {
  isThinkingEnabled: boolean;
  currentMode: Mode;
  currentStep: number;
  activeSteps: Step[];
  currentStepId: number;
  isStepLocked: boolean;
  activeStream: ActiveStream | null;
  lastTraceId: string | null;
};

export const appState: AppState = {
  isThinkingEnabled: false,
  currentMode: "chat",
  currentStep: -1,
  activeSteps: [],
  currentStepId: 0,
  isStepLocked: false,
  activeStream: null,
  lastTraceId: null,
};
