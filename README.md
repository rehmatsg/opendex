# 🤖 OpenDex - AI-Powered Browser Automation

OpenDex is a Chrome extension that leverages Google's Gemini AI with Computer Use capabilities to automate browser tasks through natural language commands. Simply describe what you want to do, and the AI will perform the actions for you.

## ✨ Features

### 🧠 AI-Powered Automation
- **Natural Language Commands**: Describe tasks in plain English
- **Computer Use Integration**: AI can see and interact with web pages
- **Smart Task Execution**: Multi-step workflows with automatic screenshots
- **Gemini AI Chat**: Direct conversation with Google's Gemini model

### 🎯 Available Commands
The extension supports a comprehensive set of browser automation commands:

| Command | Description | Parameters |
|---------|-------------|------------|
| `open_web_browser` | Open a new browser window | None |
| `navigate` | Navigate to a specific URL | `url` (string) |
| `search` | Open Google search | None |
| `click_at` | Click at specific coordinates | `x`, `y` (0-999) |
| `hover_at` | Hover at specific coordinates | `x`, `y` (0-999) |
| `type_text_at` | Type text at coordinates | `x`, `y`, `text`, `press_enter`, `clear_before_typing` |
| `key_combination` | Press key combinations | `keys` (e.g., "Ctrl+A", "Enter") |
| `scroll_document` | Scroll the entire page | `direction` ("up", "down", "left", "right") |
| `scroll_at` | Scroll at specific coordinates | `x`, `y`, `direction`, `magnitude` |
| `drag_and_drop` | Drag and drop between coordinates | `x`, `y`, `destination_x`, `destination_y` |
| `go_back` | Navigate back in browser history | None |
| `go_forward` | Navigate forward in browser history | None |
| `wait_5_seconds` | Wait for 5 seconds | None |
| `ask_gemini` | Ask Gemini AI a question | `prompt` (string) |

## 🚀 Quick Start

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rehmatsg/opendex
   cd opendex
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run build
   ```

4. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

### Configuration

1. **Get Gemini API Key**:
   - Visit [Google AI Studio](https://aistudio.google.com/)
   - Create an API key for Gemini

2. **Update API Key**:
   - Open `src/background.ts`
   - Replace `<GEMINI_API_KEY>` with your actual API key
   - Rebuild the extension

## 📖 Usage

### Basic Usage

1. **Click the OpenDex extension icon** in your browser toolbar
2. **Enter a task description** in the text area, such as:
   - "Open Google and search for weather forecast"
   - "Navigate to YouTube and play a music video"
   - "Fill out the contact form on this website"
3. **Click "🚀 Run Task"** to execute
4. **Watch the AI work** - it will take screenshots and perform actions automatically

### Quick Presets

Use the preset buttons for common tasks:
- 📰 **Search News** - Opens Google and searches for latest news
- 🎵 **YouTube Music** - Navigates to YouTube and searches for music
- 💻 **Open GitHub** - Opens a new tab with GitHub
- 🌤️ **Check Weather** - Searches for weather forecast
- 📚 **AI on Wikipedia** - Searches for artificial intelligence on Wikipedia
- 🔴 **Browse Reddit** - Opens Reddit and browses the front page

### Advanced Examples

```javascript
// Complex multi-step tasks
"Open a new tab, navigate to GitHub, search for 'react', click on the first repository, and scroll down to read the README"

// Form automation
"Fill out the contact form: name 'John Doe', email 'john@example.com', message 'Hello from OpenDex'"

// Data extraction
"Navigate to the news website, click on the first article, and scroll down to read the full content"

// Social media automation
"Go to Twitter, search for 'AI news', and scroll down to see the latest tweets"
```

## 🏗️ Architecture

### Project Structure
```
opendex/
├── src/
│   ├── background.ts      # Main extension logic & AI integration
│   ├── content.ts         # Content script for page interaction
│   └── popup/
│       ├── index.html     # Popup UI
│       └── popup.js       # Popup functionality (legacy)
├── dist/                  # Built extension files
├── manifest.json          # Extension manifest
├── vite.config.ts         # Build configuration
└── package.json           # Dependencies
```

### Key Components

#### Background Script (`background.ts`)
- **AI Integration**: Handles Gemini API calls and Computer Use
- **Command Execution**: Maps AI function calls to browser actions
- **Message Handling**: Processes requests from popup and content scripts
- **Screenshot Capture**: Takes screenshots for AI vision

#### Content Script (`content.ts`)
- **Page Interaction**: Executes browser actions on web pages
- **Coordinate Mapping**: Handles click, type, and scroll actions
- **Event Simulation**: Creates realistic user interactions

#### Popup UI (`popup/index.html`)
- **User Interface**: Modern, responsive design
- **Task Input**: Text area for natural language commands
- **Status Display**: Real-time feedback and results
- **Quick Actions**: Preset buttons for common tasks

## 🔧 Development

### Build Commands
```bash
# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run type-check
```

### Adding New Commands

1. **Define the command type** in `background.ts`:
   ```typescript
   type CommandName = 
     | "existing_command"
     | "your_new_command";  // Add here
   ```

2. **Add command arguments**:
   ```typescript
   interface CommandArgs {
     // existing args...
     your_new_command: {
       param1: string;
       param2?: number;
     };
   }
   ```

3. **Implement the command**:
   ```typescript
   const COMMANDS = {
     // existing commands...
     async your_new_command({ param1, param2 }) {
       // Implementation here
       return { result: "success" };
     }
   };
   ```

4. **Add content script support** (if needed):
   ```typescript
   // In content.ts
   case "your_new_command":
     // Handle page interaction
     break;
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.