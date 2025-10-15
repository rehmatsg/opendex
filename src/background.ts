import { GoogleGenAI, ComputerUse, Environment, Tool, FunctionCallingConfigMode } from '@google/genai';

// For prototyping only: consider fetching this from chrome.storage at runtime,
// but do NOT ship real secrets client-side in production.
const API_KEY = '<GEMINI_API_KEY>';

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Example helper
async function askGemini(prompt: string) {
  console.log('🤖 [GEMINI] Starting askGemini with prompt:', prompt);
  try {
    console.log('🤖 [GEMINI] Calling generateContent API...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
    });
    console.log('🤖 [GEMINI] API response received:', response);
    console.log('🤖 [GEMINI] Response text:', response.text);
    return response.text;
  } catch (error) {
    console.error('🤖 [GEMINI] API error:', error);
    throw error;
  }
}

/**
 * The Computer Use tool is enabled by putting a `computerUse` object
 * inside `config.tools`. You can (optionally) exclude specific built-ins.
 */
const computerUseTool: Tool = {
  computerUse: {
    environment: Environment.ENVIRONMENT_BROWSER,           // ← enum, not string
    excludedPredefinedFunctions: ['drag_and_drop']           // optional
  }
};

// --- Computer-Use loop utilities ---

type FunctionCall = { name: keyof typeof COMMANDS; args?: Record<string, any> };
type FunctionResponsePart = {
  functionResponse: { name: string; response: any };
};

async function captureActiveTabPngBase64(): Promise<string> {
  // Requires "tabs" permission and an active tab.
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
    
    // Validate the dataUrl format
    if (!dataUrl || typeof dataUrl !== "string") {
      throw new Error("Failed to capture tab - no data URL returned");
    }
    
    // dataUrl: "data:image/png;base64,...."
    const parts = dataUrl.split(",");
    if (parts.length !== 2 || !parts[0].includes("data:image/png;base64")) {
      throw new Error("Invalid data URL format returned from captureVisibleTab");
    }
    
    const base64 = parts[1];
    if (!base64) {
      throw new Error("No base64 data found in capture result");
    }
    
    return base64;
  } catch (error) {
    console.error("Error capturing active tab:", error);
    throw new Error(`Failed to capture tab screenshot: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toFunctionResponseParts(executed: Array<{ name: string; result: any }>): FunctionResponsePart[] {
  return executed.map(({ name, result }) => ({
    functionResponse: {
      name,
      response: { result }
    }
  }));
}

/**
 * Single request to Gemini (Computer-Use enabled).
 * You pass:
 *  - the original goal (text)
 *  - zero or more function responses (from the previous turn)
 *  - an optional screenshot (base64 PNG) representing current UI state
 *
 * Returns any next function calls the model asks for, plus any free-text.
 */
async function computerUseTurn(
  goal: string,
  priorFunctionResponses: FunctionResponsePart[] = [],
  screenshotPngBase64?: string
) {
  console.log('🤖 [COMPUTER_USE] Starting computerUseTurn');
  console.log('🤖 [COMPUTER_USE] Goal:', goal);
  console.log('🤖 [COMPUTER_USE] Prior function responses count:', priorFunctionResponses.length);
  console.log('🤖 [COMPUTER_USE] Has screenshot:', !!screenshotPngBase64);
  
  const parts: any[] = [{ text: goal }];

  if (priorFunctionResponses.length) {
    console.log('🤖 [COMPUTER_USE] Adding prior function responses:', priorFunctionResponses);
    // As model "output" from the last turn
    parts.push(...priorFunctionResponses);
  }

  if (screenshotPngBase64) {
    console.log('🤖 [COMPUTER_USE] Adding screenshot (base64 length):', screenshotPngBase64.length);
    parts.push({
      inlineData: { data: screenshotPngBase64, mimeType: "image/png" }
    });
  }

  console.log('🤖 [COMPUTER_USE] Parts to send:', parts);
  console.log('🤖 [COMPUTER_USE] Calling generateContent with Computer Use tools...');

  const res = await ai.models.generateContent({
    model: "gemini-2.5-computer-use-preview-10-2025",
    contents: [{ role: "user", parts }],
    config: {
      tools: [computerUseTool],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.ANY }
      }
    }
  });

  console.log('🤖 [COMPUTER_USE] Raw API response:', res);

  // Depending on SDK version, you may access calls via res.functionCalls or res.response.functionCalls.
  // We'll support both shapes defensively.
  const calls: FunctionCall[] =
    (res as any).functionCalls ??
    (res as any).response?.functionCalls ??
    [];

  const text: string | undefined =
    (res as any).text ??
    (res as any).response?.text ??
    "";

  console.log('🤖 [COMPUTER_USE] Extracted function calls:', calls);
  console.log('🤖 [COMPUTER_USE] Extracted text:', text);

  // Optional: if the model asks for confirmation/risky action, your policy gate can check here.
  // const safety = (res as any).response?.safetyDecision;

  return { calls, text };
}

/**
 * Execute one function call with OpenDex COMMANDS.
 * Throws if the command is unknown or fails.
 */
async function executeWithOpenDex(name: keyof typeof COMMANDS, args: Record<string, any>) {
  console.log(`⚡ [OPENDEX] Executing command: ${name} with args:`, args);
  const handler = COMMANDS[name];
  if (!handler) {
    console.error(`⚡ [OPENDEX] Unknown function: ${name}`);
    throw new Error(`Unknown function: ${name}`);
  }
  // Narrow the args if you want stricter runtime checks per command.
  const result = await (handler as any)(args ?? {});
  console.log(`⚡ [OPENDEX] Command ${name} completed with result:`, result);
  return result;
}

/**
 * Full loop: keep asking the model, execute tool calls, feed back results + screenshots.
 * Stop when the model produces no more function calls (i.e., it’s done),
 * or when maxTurns is reached.
 */
export async function runComputerUse(goal: string, opts?: { maxTurns?: number; includeInitialScreenshot?: boolean }) {
  console.log('🚀 [COMPUTER_USE] Starting runComputerUse');
  console.log('🚀 [COMPUTER_USE] Goal:', goal);
  console.log('🚀 [COMPUTER_USE] Options:', opts);
  
  const maxTurns = opts?.maxTurns ?? 8;
  console.log('🚀 [COMPUTER_USE] Max turns:', maxTurns);

  // Optional: seed with an initial screenshot so the model sees current UI.
  const initialShot = opts?.includeInitialScreenshot ? await captureActiveTabPngBase64() : undefined;
  console.log('🚀 [COMPUTER_USE] Initial screenshot captured:', !!initialShot);

  // First turn: ask for actions
  console.log('🚀 [COMPUTER_USE] Starting first turn...');
  let { calls } = await computerUseTurn(goal, [], initialShot);
  console.log('🚀 [COMPUTER_USE] First turn calls:', calls);

  let priorResponses: FunctionResponsePart[] = [];
  let turn = 1;

  while (calls.length && turn <= maxTurns) {
    console.log(`🚀 [COMPUTER_USE] Turn ${turn}/${maxTurns} - Processing ${calls.length} function calls`);
    
    // 1) Execute each call
    const executed: Array<{ name: string; result: any }> = [];
    for (const call of calls) {
      console.log(`🚀 [COMPUTER_USE] Executing function call: ${call.name} with args:`, call.args);
      try {
        // Map model call → your COMMANDS
        const name = call.name as keyof typeof COMMANDS;
        const args = call.args ?? {};
        const result = await executeWithOpenDex(name, args);
        console.log(`🚀 [COMPUTER_USE] Function ${call.name} executed successfully:`, result);
        executed.push({ name, result });
      } catch (err: any) {
        console.error(`🚀 [COMPUTER_USE] Function ${call.name} failed:`, err);
        executed.push({ name: call.name, result: { error: String(err?.message || err) } });
      }
    }

    // 2) Take a fresh screenshot to show resulting UI state
    console.log('🚀 [COMPUTER_USE] Capturing screenshot for next turn...');
    const screenshot = await captureActiveTabPngBase64();
    console.log('🚀 [COMPUTER_USE] Screenshot captured (base64 length):', screenshot.length);

    // 3) Convert executions → functionResponse parts
    priorResponses = toFunctionResponseParts(executed);
    console.log('🚀 [COMPUTER_USE] Function responses prepared:', priorResponses);

    // 4) Ask again, providing function responses + latest screenshot
    console.log(`🚀 [COMPUTER_USE] Starting turn ${turn + 1}...`);
    const next = await computerUseTurn(goal, priorResponses, screenshot);
    calls = next.calls;
    console.log(`🚀 [COMPUTER_USE] Turn ${turn + 1} calls:`, calls);

    turn += 1;
  }

  console.log('🚀 [COMPUTER_USE] Main loop completed. Taking final screenshot and summary...');
  
  // Final explanatory text (if any) from a last no-tool call turn:
  // One more ask to let the model summarize after actions.
  const finalShot = await captureActiveTabPngBase64().catch(() => undefined);
  console.log('🚀 [COMPUTER_USE] Final screenshot captured:', !!finalShot);
  
  const final = await computerUseTurn(goal, priorResponses, finalShot);
  console.log('🚀 [COMPUTER_USE] Final summary:', final.text);
  
  const result = { done: true, turns: turn - 1, finalText: final.text ?? "" };
  console.log('🚀 [COMPUTER_USE] Completed runComputerUse:', result);
  
  return result;
}

// --- Example wiring: start a run via runtime message ---
// Send from popup/page: chrome.runtime.sendMessage({ type: 'RUN_COMPUTER_USE', goal: 'Open google.com and search weather' }, console.log)

chrome.runtime.onMessageExternal.addListener((msg: any, _sender, sendResponse) => {
  (async () => {
    console.log('📨 [MESSAGE] Received message:', msg);
    
    // Handle RUN_COMPUTER_USE messages
    if (msg?.type === "RUN_COMPUTER_USE") {
      console.log('📨 [MESSAGE] Processing RUN_COMPUTER_USE message');
      try {
        const out = await runComputerUse(String(msg.goal || ""));
        sendResponse({ ok: true, out });
      } catch (e: any) {
        console.error('📨 [MESSAGE] RUN_COMPUTER_USE error:', e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return;
    }
    
    // Handle ASK_GEMINI messages
    if (msg?.type === "ASK_GEMINI") {
      console.log('📨 [MESSAGE] Processing ASK_GEMINI message');
      try {
        const text = await askGemini(String(msg.prompt || ""));
        sendResponse({ ok: true, text });
      } catch (e: any) {
        console.error('📨 [MESSAGE] ASK_GEMINI error:', e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return;
    }
    
    // Handle individual command messages
    if (msg?.name && typeof msg.name === 'string') {
      console.log('📨 [MESSAGE] Processing individual command:', msg.name);
      try {
        const { name, args } = msg as CommandPayload;
        if (!(name in COMMANDS)) throw new Error("Unknown command: " + name);
        const result = await (COMMANDS[name as keyof typeof COMMANDS] as any)(args);
        sendResponse({ ok: true, result });
      } catch (err: any) {
        console.error('📨 [MESSAGE] Command error:', err);
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
      return;
    }
    
    console.warn('📨 [MESSAGE] Unknown message format:', msg);
    sendResponse({ ok: false, error: "Unknown message format" });
  })();
  return true;
});

// ---------- Shared types ----------
type GridCoord = { x: number; y: number };

type CommandName =
  | "open_web_browser"
  | "wait_5_seconds"
  | "go_back"
  | "go_forward"
  | "search"
  | "navigate"
  | "click_at"
  | "hover_at"
  | "type_text_at"
  | "key_combination"
  | "scroll_document"
  | "scroll_at"
  | "drag_and_drop"
  | "ask_gemini";

interface CommandPayload<TName extends CommandName = CommandName> {
  name: TName;
  args: CommandArgs[TName];
}

type Direction = "up" | "down" | "left" | "right";

interface CommandArgs {
  open_web_browser: Record<string, never>;
  wait_5_seconds: Record<string, never>;
  go_back: Record<string, never>;
  go_forward: Record<string, never>;
  search: Record<string, never>;
  navigate: { url: string };
  click_at: GridCoord;
  hover_at: GridCoord;
  type_text_at: GridCoord & {
    text: string;
    press_enter?: boolean;
    clear_before_typing?: boolean;
  };
  key_combination: { keys: string };
  scroll_document: { direction: Direction };
  scroll_at: GridCoord & { direction: Direction; magnitude?: number };
  drag_and_drop: GridCoord & { destination_x: number; destination_y: number };
  ask_gemini: { prompt: string };
}

type CommandResult =
  | boolean
  | { windowId: number | undefined; tabId: number | null }
  | string
  | unknown;

// Page-side API exposed on window.__OpenDex
interface PageAPI {
  click_at: (args: CommandArgs["click_at"]) => boolean;
  hover_at: (args: CommandArgs["hover_at"]) => boolean;
  type_text_at: (args: CommandArgs["type_text_at"]) => boolean;
  key_combination: (args: CommandArgs["key_combination"]) => boolean;
  scroll_document: (args: CommandArgs["scroll_document"]) => boolean;
  scroll_at: (args: CommandArgs["scroll_at"]) => boolean;
  drag_and_drop: (args: CommandArgs["drag_and_drop"]) => boolean;
}

declare global {
  interface Window {
    __OpenDex?: PageAPI;
  }
}

// ---------- Helpers (extension side) ----------
async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") throw new Error("No active tab found");
  return tab;
}

function normalizeUrl(input: string): string {
  try {
    return new URL(input).toString();
  } catch {
    return "https://" + String(input).replace(/^\/+/, "");
  }
}

/**
 * Inject (once) a page-side bundle with all helpers and call a method by name.
 * Use world: "MAIN" for maximum compatibility with site handlers.
 */
async function execInActiveTab<T extends keyof PageAPI>(
  methodName: T,
  args: Parameters<PageAPI[T]>[0]
): Promise<ReturnType<PageAPI[T]>> {
  const tab = await getActiveTab();

  // In @types/chrome, use chrome.scripting.ExecutionWorld.MAIN.
  const res = await chrome.scripting
    .executeScript({
      target: { tabId: tab.id! },
      // Cast to any to avoid type friction across Chrome versions.
      world: "MAIN" as any,
      args: [methodName, args] as const,
      func: (methodNameInner: keyof PageAPI, argsInner: any) => {
        // Install bundle once per page
        if (!(window as any).__OpenDex) {
          (window as any).__OpenDex = (() => {
            // ----- helpers -----
            const clamp = (v: number, lo: number, hi: number) =>
              Math.min(Math.max(v, lo), hi);

            function gridToViewport(x: number, y: number) {
              const w = window.innerWidth || document.documentElement.clientWidth;
              const h =
                window.innerHeight || document.documentElement.clientHeight;
              const px = clamp(
                Math.round((x / 999) * Math.max(1, w - 1)),
                0,
                Math.max(0, w - 1)
              );
              const py = clamp(
                Math.round((y / 999) * Math.max(1, h - 1)),
                0,
                Math.max(0, h - 1)
              );
              return { px, py };
            }

            function elementAt(x: number, y: number) {
              const { px, py } = gridToViewport(x, y);
              return { el: document.elementFromPoint(px, py) as HTMLElement | null, px, py };
            }

            function dispatchMouse(type: string, x: number, y: number) {
              const { px, py } = gridToViewport(x, y);
              const ev = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: px,
                clientY: py
              });
              const target = (document.elementFromPoint(px, py) as HTMLElement) || document.body;
              target.dispatchEvent(ev);
              return true;
            }

            function focusAt(x: number, y: number) {
              const { el } = elementAt(x, y);
              if (!el) return false;
              const focusable = el.closest(
                "input, textarea, [contenteditable=''], [contenteditable='true'], select, button, a, [tabindex]"
              ) as HTMLElement | null;
              (focusable || el).focus?.({ preventScroll: true });
              return true;
            }

            function setValueOn(el: Element | null, text: string, clearFirst: boolean) {
              if (!el) return false;

              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                if (clearFirst) {
                  el.value = "";
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                }
                const ok = (document as any).execCommand?.("insertText", false, text);
                if (!ok) {
                  const start = el.selectionStart ?? el.value.length;
                  const end = el.selectionEnd ?? el.value.length;
                  el.value = el.value.slice(0, start) + text + el.value.slice(end);
                  const pos = start + text.length;
                  el.setSelectionRange?.(pos, pos);
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                }
                return true;
              }

              const ce =
                (el as HTMLElement).isContentEditable ||
                (el as HTMLElement).closest?.(
                  "[contenteditable=''], [contenteditable='true']"
                );
              if (ce) {
                const target =
                  (el as HTMLElement).isContentEditable
                    ? (el as HTMLElement)
                    : ((el as HTMLElement).closest(
                        "[contenteditable=''], [contenteditable='true']"
                      ) as HTMLElement);
                target.focus();
                if (clearFirst) {
                  (document as any).execCommand?.("selectAll");
                  (document as any).execCommand?.("delete");
                }
                (document as any).execCommand?.("insertText", false, text);
                return true;
              }
              return false;
            }

            function pressEnter() {
              const el = (document.activeElement as HTMLElement) || document.body;
              const k = {
                bubbles: true,
                cancelable: true,
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13
              } as KeyboardEventInit & { keyCode: number; which: number };
              el.dispatchEvent(new KeyboardEvent("keydown", k));
              el.dispatchEvent(new KeyboardEvent("keypress", k));
              el.dispatchEvent(new KeyboardEvent("keyup", k));
              (el as HTMLInputElement)?.form?.requestSubmit?.();
              return true;
            }

            function findScrollableAncestor(node: Element | null) {
              const isScrollable = (elem: Element | null) => {
                if (!elem || elem === document.documentElement) return false;
                const s = getComputedStyle(elem);
                const y =
                  (s.overflowY === "auto" || s.overflowY === "scroll") &&
                  (elem as HTMLElement).scrollHeight > (elem as HTMLElement).clientHeight;
                const x =
                  (s.overflowX === "auto" || s.overflowX === "scroll") &&
                  (elem as HTMLElement).scrollWidth > (elem as HTMLElement).clientWidth;
                return y || x;
              };
              let el = node as HTMLElement | null;
              while (el && el !== document.body && el !== document.documentElement) {
                if (isScrollable(el)) return el;
                el = el.parentElement;
              }
              return (document.scrollingElement as HTMLElement) || document.documentElement;
            }

            // ----- API methods (page-side) -----
            function click_at({ x, y }: CommandArgs["click_at"]) {
              dispatchMouse("mousemove", x, y);
              dispatchMouse("mousedown", x, y);
              dispatchMouse("mouseup", x, y);
              dispatchMouse("click", x, y);
              return true;
            }

            function hover_at({ x, y }: CommandArgs["hover_at"]) {
              dispatchMouse("mousemove", x, y);
              dispatchMouse("mouseover", x, y);
              dispatchMouse("mouseenter", x, y);
              return true;
            }

            function type_text_at({
              x,
              y,
              text,
              press_enter = true,
              clear_before_typing = true
            }: CommandArgs["type_text_at"]) {
              focusAt(x, y);
              const ok = setValueOn(document.activeElement, text, clear_before_typing);
              if (press_enter) pressEnter();
              return ok;
            }

            function key_combination({ keys }: CommandArgs["key_combination"]) {
              const parts = String(keys).split("+").map(s => s.trim().toLowerCase());
              const meta = {
                ctrlKey: parts.includes("control") || parts.includes("ctrl"),
                altKey: parts.includes("alt") || parts.includes("option"),
                shiftKey: parts.includes("shift"),
                metaKey: parts.includes("meta") || parts.includes("command") || parts.includes("cmd")
              };
              const baseKey = parts[parts.length - 1];
              const active = (document.activeElement as HTMLElement) || document.body;
              const opts = (k: string) =>
                ({
                  bubbles: true,
                  cancelable: true,
                  key: k.length === 1 ? k : k[0].toUpperCase() + k.slice(1),
                  code: k.length === 1 ? "Key" + k.toUpperCase() : k.toUpperCase(),
                  ...meta
                } as KeyboardEventInit);

              const press = (k: string) => {
                active.dispatchEvent(new KeyboardEvent("keydown", opts(k)));
                active.dispatchEvent(new KeyboardEvent("keypress", opts(k)));
                active.dispatchEvent(new KeyboardEvent("keyup", opts(k)));
              };

              const norm = parts.join("+");
              if (norm === "control+a" || norm === "ctrl+a") {
                (document as any).execCommand?.("selectAll");
                return true;
              }
              if (norm === "enter") return pressEnter();
              press(baseKey);
              return true;
            }

            function scroll_document({ direction }: CommandArgs["scroll_document"]) {
              const by = 800;
              switch (direction) {
                case "up":
                  window.scrollBy({ top: -by, left: 0, behavior: "smooth" });
                  break;
                case "down":
                  window.scrollBy({ top: by, left: 0, behavior: "smooth" });
                  break;
                case "left":
                  window.scrollBy({ top: 0, left: -by, behavior: "smooth" });
                  break;
                case "right":
                  window.scrollBy({ top: 0, left: by, behavior: "smooth" });
                  break;
              }
              return true;
            }

            function scroll_at({ x, y, direction, magnitude = 800 }: CommandArgs["scroll_at"]) {
              const { el } = elementAt(x, y);
              const target = findScrollableAncestor(el || document.body) as HTMLElement;
              const dx = direction === "left" ? -magnitude : direction === "right" ? magnitude : 0;
              const dy = direction === "up" ? -magnitude : direction === "down" ? magnitude : 0;
              target.scrollBy({ left: dx, top: dy, behavior: "smooth" });
              return true;
            }

            function drag_and_drop({
              x,
              y,
              destination_x,
              destination_y
            }: CommandArgs["drag_and_drop"]) {
              const start = gridToViewport(x, y);
              const end = gridToViewport(destination_x, destination_y);
              const startTarget = (document.elementFromPoint(start.px, start.py) as HTMLElement) || document.body;
              const endTarget = (document.elementFromPoint(end.px, end.py) as HTMLElement) || document.body;

              const dt = new DataTransfer();
              const mouse = (type: string, px: number, py: number) =>
                new MouseEvent(type, { bubbles: true, cancelable: true, clientX: px, clientY: py, view: window });
              const drag = (type: string, px: number, py: number) =>
                new DragEvent(type, { bubbles: true, cancelable: true, clientX: px, clientY: py, dataTransfer: dt });

              startTarget.dispatchEvent(mouse("mousemove", start.px, start.py));
              startTarget.dispatchEvent(mouse("mousedown", start.px, start.py));
              startTarget.dispatchEvent(drag("dragstart", start.px, start.py));

              endTarget.dispatchEvent(drag("dragenter", end.px, end.py));
              endTarget.dispatchEvent(drag("dragover", end.px, end.py));
              endTarget.dispatchEvent(drag("drop", end.px, end.py));
              startTarget.dispatchEvent(mouse("mouseup", end.px, end.py));

              document.dispatchEvent(mouse("mousemove", end.px, end.py));
              document.dispatchEvent(mouse("mouseup", end.px, end.py));
              return true;
            }

            // Expose page API
            return {
              click_at,
              hover_at,
              type_text_at,
              key_combination,
              scroll_document,
              scroll_at,
              drag_and_drop
            } as PageAPI;
          })();
        }

        const api = (window as any).__OpenDex!;
        if (!api[methodNameInner]) throw new Error("No such page API: " + String(methodNameInner));
        return (api[methodNameInner] as any)(argsInner);
      }
    })
    .catch((err) => {
      throw new Error(
        "Cannot inject into this page (restricted or not ready): " + (err as Error).message
      );
    });

  return (res?.[0] as any)?.result as ReturnType<PageAPI[T]>;
}

// ---------- Command implementations (extension side) ----------
type CommandHandler<T extends CommandName> = (
  args: CommandArgs[T]
) => Promise<CommandResult>;

const COMMANDS: { [K in CommandName]: CommandHandler<K> } = {
  async open_web_browser() {
    const win = await chrome.windows.create({ url: "about:blank", focused: true });
    if (!win) throw new Error("Failed to create window");
    return { windowId: win.id, tabId: win.tabs?.[0]?.id ?? null };
  },

  async wait_5_seconds() {
    await new Promise((r) => setTimeout(r, 5000));
    return true;
  },

  async go_back() {
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      world: "MAIN" as any,
      func: () => history.back()
    });
    return true;
  },

  async go_forward() {
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      world: "MAIN" as any,
      func: () => history.forward()
    });
    return true;
  },

  async search() {
    const tab = await getActiveTab();
    await chrome.tabs.update(tab.id!, { url: "https://www.google.com/" });
    return true;
  },

  async navigate({ url }) {
    if (!url || typeof url !== "string") throw new Error("Missing 'url' (string)");
    const tab = await getActiveTab();
    await chrome.tabs.update(tab.id!, { url: normalizeUrl(url) });
    return true;
  },

  async click_at({ x, y }) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error("x,y must be integers 0..999");
    return execInActiveTab("click_at", { x, y });
  },

  async hover_at({ x, y }) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error("x,y must be integers 0..999");
    return execInActiveTab("hover_at", { x, y });
  },

  async type_text_at({ x, y, text, press_enter = true, clear_before_typing = true }) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error("x,y must be integers 0..999");
    if (typeof text !== "string") throw new Error("text must be a string");
    return execInActiveTab("type_text_at", { x, y, text, press_enter, clear_before_typing });
  },

  async key_combination({ keys }) {
    if (!keys) throw new Error("Missing 'keys' (e.g., 'Enter', 'Control+A')");
    return execInActiveTab("key_combination", { keys });
  },

  async scroll_document({ direction }) {
    const dirs: Direction[] = ["up", "down", "left", "right"];
    if (!dirs.includes(direction)) throw new Error("direction must be one of " + dirs.join(", "));
    return execInActiveTab("scroll_document", { direction });
  },

  async scroll_at({ x, y, direction, magnitude = 800 }) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error("x,y must be integers 0..999");
    const dirs: Direction[] = ["up", "down", "left", "right"];
    if (!dirs.includes(direction)) throw new Error("direction must be one of " + dirs.join(", "));
    const mag = Math.max(0, Math.min(999, Number(magnitude) || 800));
    return execInActiveTab("scroll_at", { x, y, direction, magnitude: mag });
  },

  async drag_and_drop({ x, y, destination_x, destination_y }) {
    for (const v of [x, y, destination_x, destination_y]) {
      if (!Number.isInteger(v)) throw new Error("All coords must be integers 0..999");
    }
    return execInActiveTab("drag_and_drop", { x, y, destination_x, destination_y });
  },

  async ask_gemini({ prompt }) {
    return await askGemini(prompt);
  }
};