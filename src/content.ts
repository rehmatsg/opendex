// OpenDex Content Script - Exposes commands to window object for Dev Console access

// Get extension ID from runtime
const EXTENSION_ID = chrome.runtime.id;

// Command types for type safety
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

interface CommandArgs {
  open_web_browser: Record<string, never>;
  wait_5_seconds: Record<string, never>;
  go_back: Record<string, never>;
  go_forward: Record<string, never>;
  search: Record<string, never>;
  navigate: { url: string };
  click_at: { x: number; y: number };
  hover_at: { x: number; y: number };
  type_text_at: { x: number; y: number; text: string; press_enter?: boolean; clear_before_typing?: boolean };
  key_combination: { keys: string };
  scroll_document: { direction: "up" | "down" | "left" | "right" };
  scroll_at: { x: number; y: number; direction: "up" | "down" | "left" | "right"; magnitude?: number };
  drag_and_drop: { x: number; y: number; destination_x: number; destination_y: number };
  ask_gemini: { prompt: string };
}

// Generic command executor
async function executeCommand<T extends CommandName>(
  command: T,
  args: CommandArgs[T]
): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { name: command, args },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.ok) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      }
    );
  });
}

// Create OpenDex API object
const OpenDex = {
  // Navigation commands
  async openWebBrowser() {
    return executeCommand("open_web_browser", {});
  },

  async goBack() {
    return executeCommand("go_back", {});
  },

  async goForward() {
    return executeCommand("go_forward", {});
  },

  async search() {
    return executeCommand("search", {});
  },

  async navigate(url: string) {
    return executeCommand("navigate", { url });
  },

  // Interaction commands
  async clickAt(x: number, y: number) {
    return executeCommand("click_at", { x, y });
  },

  async hoverAt(x: number, y: number) {
    return executeCommand("hover_at", { x, y });
  },

  async typeTextAt(x: number, y: number, text: string, options?: { press_enter?: boolean; clear_before_typing?: boolean }) {
    return executeCommand("type_text_at", { 
      x, 
      y, 
      text, 
      press_enter: options?.press_enter ?? true, 
      clear_before_typing: options?.clear_before_typing ?? true 
    });
  },

  async keyCombination(keys: string) {
    return executeCommand("key_combination", { keys });
  },

  // Scrolling commands
  async scrollDocument(direction: "up" | "down" | "left" | "right") {
    return executeCommand("scroll_document", { direction });
  },

  async scrollAt(x: number, y: number, direction: "up" | "down" | "left" | "right", magnitude?: number) {
    return executeCommand("scroll_at", { x, y, direction, magnitude });
  },

  // Drag and drop
  async dragAndDrop(x: number, y: number, destinationX: number, destinationY: number) {
    return executeCommand("drag_and_drop", { x, y, destination_x: destinationX, destination_y: destinationY });
  },

  // Utility commands
  async wait5Seconds() {
    return executeCommand("wait_5_seconds", {});
  },

  async askGemini(prompt: string) {
    return executeCommand("ask_gemini", { prompt });
  },

  // Helper function for text selection summarization
  async summarizeSelection() {
    const sel = window.getSelection()?.toString().trim();
    if (!sel) {
      console.log("No text selected");
      return;
    }
    try {
      const result = await this.askGemini(`Summarize the following text:\n\n${sel}`);
      console.log('Gemini summary:', result);
      alert(result);
      return result;
    } catch (error) {
      console.error('Gemini error:', error);
      throw error;
    }
  }
};

// Expose OpenDex to window object for Dev Console access
(window as any).OpenDex = OpenDex;

// Also create a shorter alias
(window as any).OD = OpenDex;

// Log availability to console
console.log('🚀 OpenDex commands available! Use OpenDex or OD in the console.');
console.log('Available commands:', Object.keys(OpenDex));

// Demo: Alt+S for summarize selection
window.addEventListener('keydown', e => {
  if (e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    OpenDex.summarizeSelection().catch(console.error);
  }
});

// Auto-inject the page API if not already present
if (!(window as any).__OpenDex) {
  // This will be injected by the background script when needed
  console.log('OpenDex page API will be injected on first command execution');
}