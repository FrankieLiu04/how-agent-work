export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function $input(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  if (!el) return null;
  return el instanceof HTMLInputElement ? el : null;
}
