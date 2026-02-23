# Course Video Queue Recorder

A Chrome Manifest V3 extension that records course videos from a dynamic queue with auto-play and silence detection.

## Features

- **Queue-based Recording**: Add multiple URLs/tabs to a queue and record them one by one automatically
- **Auto-play**: Automatically clicks play buttons using configurable CSS selectors
- **Video End Detection**: Automatically stops recording when video ends
- **Silence Detection**: Automatically stops recording after detecting prolonged silence (10 seconds)
- **Max Duration**: Configure maximum recording duration (default: 90 minutes)
- **Drag-and-Drop Reordering**: Reorder waiting items in the queue with drag-and-drop
- **Status Tracking**: Track each item's status (waiting, recording, uploading, done, error)
- **Google Drive Integration**: Save recordings directly to your Google Drive with folder selection
- **Local Downloads**: Saves recordings as .webm files to your local CourseRecordings folder

## Installation

1. Clone or download this repository
2. Create placeholder icon files (see Icons section below)
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked"
6. Select the `QueueRecord` folder

## Usage

### Settings

1. Click the extension icon to open the popup
2. Configure the **Play Button CSS Selector** (default: `video`)
   - Examples: `video`, `button.play-btn`, `.vjs-big-play-button`
3. Set the **Max Duration** in minutes (default: 90)
4. Click **Save Settings**

### Adding Items to Queue

**Add by URL:**
1. Enter a URL in the URL input field
2. Click **Add URL**

**Add Current Tab:**
1. Navigate to the page you want to record
2. Click **Add Current Tab** in the popup

### Recording

1. Click **▶ Start Queue** to begin processing the queue
2. The extension will:
   - Activate each tab
   - Auto-click the play button
   - Start recording audio and video
   - Stop after 90 minutes OR when silence is detected
   - Save the video locally
   - Move to the next item
3. Click **⏹ Stop After Current** to stop processing after the current recording completes

### Managing Queue

- **Reorder**: Drag and drop items in "waiting" state to reorder them
- **Remove**: Click the **✕ Remove** button on waiting or errored items
- **Status Icons**:
  - ⏱ Gray = Waiting
  - 🔴 Blue (pulsing) = Recording
  - ✅ Green = Done
  - ⚠️ Red = Error

## File Structure

```
QueueRecord/
├── manifest.json          # Extension manifest (MV3)
├── popup.html             # Popup UI
├── popup.js               # Popup logic and drag-and-drop
├── background.js          # Service worker, queue management
├── content.js             # Auto-play logic in web pages
├── offscreen.html         # Offscreen document
├── offscreen.js           # MediaRecorder and silence detection
├── icons/                 # Extension icons (16x16, 48x48, 128x128)
└── README.md              # This file
```

## Icons

You need to create three icon files in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can use any image editing tool to create simple placeholder icons, or use online tools like:
- [Favicon.io](https://favicon.io/)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

## Technical Details

### Architecture

- **Manifest V3**: Uses modern Chrome extension APIs
- **Service Worker**: Background.js runs as a service worker (no persistent background page)
- **Offscreen Document**: Handles MediaRecorder API (required for tabCapture in MV3)
- **Content Script**: Injected into all pages to handle auto-play
- **Permissions**: tabs, activeTab, scripting, downloads, offscreen, tabCapture, storage

### Recording Process

1. **Queue Management**: Background service worker maintains queue state
2. **Tab Activation**: Activates or creates tab for each queue item
3. **Auto-play**: Content script finds and clicks play button
4. **Stream Capture**: Uses `chrome.tabCapture.getMediaStreamId()`
5. **Recording**: Offscreen document creates MediaRecorder with the stream
6. **Silence Detection**: AudioContext + AnalyserNode monitors audio levels
7. **Download**: Creates Blob, generates object URL, triggers download

### Message Protocol

**Popup → Background:**
- `get-state`: Request current state
- `add-url`: Add URL to queue
- `add-current-tab`: Add active tab to queue
- `reorder-queue`: Reorder waiting items
- `remove-from-queue`: Remove item
- `start-queue`: Start processing
- `stop-queue`: Stop after current
- `update-settings`: Update user settings

**Background → Popup:**
- `state-update`: Broadcast state changes

**Background → Content:**
- `trigger-play`: Trigger auto-play

**Background → Offscreen:**
- `start-recording`: Start recording with stream ID

**Offscreen → Background:**
- `download-blob`: Download recorded video
- `recording-complete`: Notify completion (success/error)

## Future Enhancements

- **Google Drive Upload**: OAuth integration (stub in `uploadToDrive()`)
- **Pause/Resume**: Ability to pause and resume recordings
- **Custom Domains**: Restrict content script to specific course platforms
- **Recording Quality**: Configurable video bitrate and resolution
- **Playlist Support**: Import multiple URLs from a playlist
- **Chapters/Markers**: Mark important timestamps during recording

## Troubleshooting

**Recording doesn't start:**
- Ensure the page has loaded completely
- Check if the CSS selector matches the play button
- Try fallback selectors (video, button[aria-label*="play"])

**No audio in recording:**
- Make sure the tab has audio enabled
- Check browser audio settings
- Verify the video player is not muted

**Recording stops too early:**
- Adjust silence detection threshold (currently 30 seconds)
- Check if the video actually ended
- Increase max duration if needed

**Downloads not saving:**
- Check Chrome's download settings
- Ensure you have write permissions to the downloads folder
- Check for disk space

## License

MIT License - Feel free to modify and use as needed.

## Credits

Built with Chrome Extension Manifest V3 APIs:
- Tab Capture API
- Offscreen Documents API
- MediaRecorder API
- Web Audio API (for silence detection)
