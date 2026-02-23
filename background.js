// Global state
let state = {
  queue: [],
  currentRecordingId: null,
  userSettings: {
    playButtonSelector: 'video',
    maxDurationMinutes: 90
  },
  isProcessing: false,
  shouldStopAfterCurrent: false
};

// Constants
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const STORAGE_KEY = 'queueRecorderState';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

// ============================================
// Google Drive API Functions
// ============================================

/**
 * Get OAuth token for Google Drive access
 */
async function getDriveTokenForBackground(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Upload a blob to Google Drive using fetch API (MV3 compatible)
 */
async function uploadBlobToDrive(blob, fileName, folderId) {
  try {
    const token = await getDriveTokenForBackground(false);
    
    if (!token) {
      throw new Error('Not authenticated with Google Drive');
    }
    
    console.log(`Uploading ${fileName} to Drive folder ${folderId}...`);
    
    // Create metadata
    const metadata = {
      name: fileName,
      parents: [folderId]
    };
    
    // Create multipart body
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    
    const metadataPart = delimiter + 
      'Content-Type: application/json\r\n\r\n' + 
      JSON.stringify(metadata);
    
    // Determine MIME type from filename
    const mimeType = fileName.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    
    const mediaPart = delimiter + 
      `Content-Type: ${mimeType}\r\n\r\n`;
    
    // Combine parts into single blob
    const blobArray = await blob.arrayBuffer();
    const encoder = new TextEncoder();
    const metadataBytes = encoder.encode(metadataPart);
    const mediaHeaderBytes = encoder.encode(mediaPart);
    const closeDelimBytes = encoder.encode(close_delim);
    
    const totalLength = metadataBytes.length + mediaHeaderBytes.length + blobArray.byteLength + closeDelimBytes.length;
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    
    combined.set(metadataBytes, offset);
    offset += metadataBytes.length;
    combined.set(mediaHeaderBytes, offset);
    offset += mediaHeaderBytes.length;
    combined.set(new Uint8Array(blobArray), offset);
    offset += blobArray.byteLength;
    combined.set(closeDelimBytes, offset);
    
    // Upload using fetch
    const response = await fetch(`${DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,name,webViewLink`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: combined
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('Drive upload successful:', result.name, result.webViewLink);
    return result;
  } catch (error) {
    console.error('Drive upload error:', error);
    throw error;
  }
}

// ============================================
// End Google Drive API Functions
// ============================================

// Load state immediately when service worker starts (including after termination)
(async () => {
  await loadState();
  updateBadge();
})();

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated');
  await loadState();
  updateBadge();
});

// Load state on startup
chrome.runtime.onStartup.addListener(async () => {
  await loadState();
  updateBadge();
});

// Load state from storage
async function loadState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      const savedState = result[STORAGE_KEY];
      state.queue = savedState.queue || [];
      state.userSettings = savedState.userSettings || state.userSettings;
      // Don't restore currentRecordingId - we're not recording after restart
      state.currentRecordingId = null;
      state.isProcessing = false;
      state.shouldStopAfterCurrent = false;
      
      // Reset any recording or waiting items to error state after restart
      // Also clear streamIds as they become invalid
      state.queue = state.queue.map(item => {
        if (item.status === 'recording') {
          return { ...item, status: 'error', streamId: null, updatedAt: Date.now() };
        }
        // Clear streamId from all items (they become invalid after restart)
        return { ...item, streamId: null };
      });
      
      await saveState();
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

// Save state to storage
async function saveState() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        queue: state.queue,
        userSettings: state.userSettings
      }
    });
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

// Broadcast state update to all popups
function broadcastStateUpdate() {
  chrome.runtime.sendMessage({
    type: 'state-update',
    queue: state.queue,
    currentRecordingId: state.currentRecordingId,
    userSettings: state.userSettings
  }).catch(() => {
    // Ignore errors when no popup is open
  });
}

// Update extension badge
function updateBadge() {
  const waitingCount = state.queue.filter(item => item.status === 'waiting').length;
  const activeItem = state.queue.find(item => 
    item.status === 'recording' || item.status === 'uploading'
  );
  
  if (activeItem) {
    if (activeItem.status === 'recording') {
      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
    } else if (activeItem.status === 'uploading') {
      chrome.action.setBadgeText({ text: 'UP' });
      chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
    }
  } else if (waitingCount > 0) {
    chrome.action.setBadgeText({ text: `${waitingCount}` });
    chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Generate unique ID
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Validate URL (reject Chrome internal pages)
function isValidRecordableUrl(url) {
  if (!url) return false;
  const invalidPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'file://',
    'view-source:'
  ];
  return !invalidPrefixes.some(prefix => url.startsWith(prefix));
}

// Wait for tab to be fully loaded
function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, timeoutMs);
    
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };
    
    // Check if already loaded
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      } else {
        chrome.tabs.onUpdated.addListener(listener);
      }
    }).catch(reject);
  });
}

// Function to inject into page to auto-play video
function autoPlayVideo(playButtonSelector) {
  const FALLBACK_SELECTORS = [
    playButtonSelector,
    '.vjs-big-play-button',
    'button.vjs-big-play-button',
    '.video-js .vjs-big-play-button',
    'video',
    'button[aria-label*="play" i]',
    '.play-button',
    '[data-testid*="play" i]',
    '.plyr__control--overlaid'
  ];
  
  // Function to check if element is visible
  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }
  
  // Function to click element with multiple methods
  function forceClick(element) {
    // Method 1: Direct click
    try {
      element.click();
    } catch (e) {
      // Silent fail
    }
    
    // Method 2: Mouse events
    try {
      const events = ['mousedown', 'mouseup', 'click'];
      events.forEach(eventType => {
        const event = new MouseEvent(eventType, {
          view: window,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(event);
      });
    } catch (e) {
      // Silent fail
    }
  }
  
  // Function to play all videos
  function playAllVideos() {
    const videos = document.querySelectorAll('video');
    
    videos.forEach((video, index) => {
      if (isVisible(video)) {
        // Mute first to bypass autoplay policy
        video.muted = true;
        video.play()
          .then(() => {
            // Unmute after a short delay
            setTimeout(() => {
              video.muted = false;
            }, 500);
          })
          .catch(err => {});
      }
    });
  }
  
  // Try to find and click play button
  let clicked = false;
  
  for (const selector of FALLBACK_SELECTORS) {
    if (clicked) break;
    
    try {
      const elements = document.querySelectorAll(selector);
      
      for (const element of elements) {
        if (!isVisible(element)) {
          continue;
        }
        
        // If it's a video, try to play it directly
        if (element.tagName === 'VIDEO') {
          playAllVideos();
          clicked = true;
          break;
        }
        
        // If it's a button or clickable, click it
        if (element.tagName === 'BUTTON' || element.onclick || element.click) {
          forceClick(element);
          clicked = true;
          
          // Wait and then try to play videos
          setTimeout(() => {
            playAllVideos();
          }, 1000);
          break;
        }
      }
    } catch (err) {
      // Silent fail
    }
  }
  
  if (!clicked) {
    playAllVideos();
  }
}

// Function to inject into page to monitor video end
function monitorVideoEnd(recordingItemId) {
  // Find all video elements
  const videos = document.querySelectorAll('video');
  
  if (videos.length === 0) {
    return;
  }
  
  let videoEndSent = false;
  
  function notifyVideoEnd() {
    if (videoEndSent) return;
    videoEndSent = true;
    
    console.log('🎬 VIDEO ENDED - Stopping recording...');
    
    try {
      chrome.runtime.sendMessage({
        type: 'video-ended',
        itemId: recordingItemId
      });
    } catch (error) {
      // Silent fail
    }
  }
  
  // Monitor each video for 'ended' event
  videos.forEach((video, index) => {
    video.addEventListener('ended', () => {
      notifyVideoEnd();
    });
    
    // Also monitor timeupdate event for near-end detection
    video.addEventListener('timeupdate', () => {
      if (video.currentTime > 0 && video.duration > 0) {
        const remaining = video.duration - video.currentTime;
        if (remaining <= 0.5) {
          notifyVideoEnd();
        }
      }
    });
    
    // Periodic check as backup - every 3 seconds
    const checkInterval = setInterval(() => {
      if (video.ended || (video.duration > 0 && video.currentTime >= video.duration - 0.5)) {
        clearInterval(checkInterval);
        notifyVideoEnd();
      }
    }, 3000);
    
    // Status logging every 1 minute
    const statusInterval = setInterval(() => {
      if (video.currentTime > 0 && video.duration > 0) {
        const currentMin = Math.floor(video.currentTime / 60);
        const currentSec = Math.floor(video.currentTime % 60);
        const durationMin = Math.floor(video.duration / 60);
        const durationSec = Math.floor(video.duration % 60);
        const percent = ((video.currentTime / video.duration) * 100).toFixed(1);
        
        console.log(`📹 Video ${index + 1}: ${currentMin}:${currentSec.toString().padStart(2, '0')} / ${durationMin}:${durationSec.toString().padStart(2, '0')} (${percent}%)`);
      }
    }, 60000); // Every 60 seconds
    
    // Clean up intervals after max duration (2 hours)
    setTimeout(() => {
      clearInterval(checkInterval);
      clearInterval(statusInterval);
    }, 2 * 60 * 60 * 1000);
  });
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

// Handle messages
async function handleMessage(message, sender) {
  try {
    switch (message.type) {
      case 'get-state':
        return {
          queue: state.queue,
          currentRecordingId: state.currentRecordingId,
          userSettings: state.userSettings
        };
      
      case 'add-url':
        return await addToQueue(message.url, null, null);
      
      case 'add-current-tab':
        return await addToQueue(message.url, message.tabId, message.title);
      
      case 'reorder-queue':
        return await reorderQueue(message.ids);
      
      case 'remove-from-queue':
        return await removeFromQueue(message.itemId);
      
      case 'start-queue':
        return await startQueueProcessing();
      
      case 'stop-queue':
        return await stopQueueProcessing();
      
      case 'stop-now':
        return await stopRecordingNow(message.saveRecording);
      
      case 'update-settings':
        return await updateSettings(message.playButtonSelector, message.maxDurationMinutes);
      
      case 'download-blob':
        return await handleDownloadBlob(message);
      
      case 'recording-complete':
        return await handleRecordingComplete(message);
      
      case 'offscreen-log':
        // Forward offscreen console logs to background console
        const prefix = '[OFFSCREEN]';
        if (message.level === 'error') {
          console.error(prefix, message.message);
        } else if (message.level === 'warn') {
          console.warn(prefix, message.message);
        } else {
          console.log(prefix, message.message);
        }
        return { success: true };
      
      case 'video-ended':
        console.log('Received video-ended notification for item:', message.itemId);
        // Only stop if this is the currently recording item
        if (state.currentRecordingId === message.itemId) {
          console.log('Video ended for current recording, stopping recording...');
          await chrome.runtime.sendMessage({
            type: 'stop-recording',
            saveRecording: true
          });
        }
        return { success: true };
      
      default:
        console.warn('Unknown message type:', message.type);
        return { success: false, error: 'Unknown message type' };
    }
  } catch (error) {
    console.error('Error handling message:', error);
    return { success: false, error: error.message };
  }
}

// Update item status
async function updateItemStatus(itemId, status) {
  const item = state.queue.find(i => i.id === itemId);
  
  if (!item) {
    console.error('Item not found:', itemId);
    return { success: false, error: 'Item not found' };
  }
  
  item.status = status;
  item.updatedAt = Date.now();
  
  await saveState();
  broadcastStateUpdate();
  updateBadge();
  
  return { success: true };
}

// Add item to queue
async function addToQueue(url, tabId = null, title = null, captureNow = false) {
  // Validate URL
  if (!isValidRecordableUrl(url)) {
    return { 
      success: false, 
      error: 'Cannot record this page. Chrome internal pages (chrome://, chrome-extension://, etc.) cannot be captured.' 
    };
  }
  
  const item = {
    id: generateId(),
    tabId: tabId,
    url: url,
    title: title || url,
    status: 'waiting',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  state.queue.push(item);
  await saveState();
  broadcastStateUpdate();
  updateBadge();
  
  // Don't auto-start - let user manually click "Start Queue"
  
  return { success: true, itemId: item.id };
}

// Reorder queue (only affects waiting items)
async function reorderQueue(newOrderIds) {
  const waitingItems = state.queue.filter(item => item.status === 'waiting');
  const otherItems = state.queue.filter(item => item.status !== 'waiting');
  
  // Create new order for waiting items
  const reorderedWaiting = newOrderIds
    .map(id => waitingItems.find(item => item.id === id))
    .filter(item => item !== undefined);
  
  // Rebuild queue: keep non-waiting items in their positions
  const newQueue = [];
  let waitingIndex = 0;
  
  for (const item of state.queue) {
    if (item.status === 'waiting') {
      if (waitingIndex < reorderedWaiting.length) {
        newQueue.push(reorderedWaiting[waitingIndex++]);
      }
    } else {
      newQueue.push(item);
    }
  }
  
  // Add any remaining waiting items
  while (waitingIndex < reorderedWaiting.length) {
    newQueue.push(reorderedWaiting[waitingIndex++]);
  }
  
  state.queue = newQueue;
  await saveState();
  broadcastStateUpdate();
  
  return { success: true };
}

// Remove item from queue
async function removeFromQueue(itemId) {
  const index = state.queue.findIndex(item => item.id === itemId);
  
  if (index === -1) {
    return { success: false, error: 'Item not found' };
  }
  
  const item = state.queue[index];
  
  // Cannot remove item that's currently recording
  if (item.status === 'recording') {
    return { success: false, error: 'Cannot remove item that is currently recording' };
  }
  
  state.queue.splice(index, 1);
  await saveState();
  broadcastStateUpdate();
  updateBadge();
  
  return { success: true };
}

// Update settings
async function updateSettings(playButtonSelector, maxDurationMinutes) {
  state.userSettings = {
    playButtonSelector: playButtonSelector || 'video',
    maxDurationMinutes: maxDurationMinutes || 90
  };
  
  await saveState();
  broadcastStateUpdate();
  
  return { success: true };
}

// Start queue processing
async function startQueueProcessing() {
  state.shouldStopAfterCurrent = false;
  processQueue();
  return { success: true };
}

// Stop queue processing after current item
async function stopQueueProcessing() {
  state.shouldStopAfterCurrent = true;
  broadcastStateUpdate();
  return { success: true };
}

// Stop recording immediately
async function stopRecordingNow(saveRecording) {
  if (!state.currentRecordingId) {
    return { success: false, error: 'No recording in progress' };
  }
  
  const item = state.queue.find(i => i.id === state.currentRecordingId);
  if (!item) {
    return { success: false, error: 'Recording item not found' };
  }
  
  console.log('Stopping recording immediately, save:', saveRecording);
  
  // Tell offscreen to stop recording
  try {
    await chrome.runtime.sendMessage({
      type: 'stop-recording',
      saveRecording: saveRecording
    });
  } catch (error) {
    console.warn('Could not send stop message to offscreen:', error);
  }
  
  // Update item status
  if (saveRecording) {
    item.status = 'done';
    console.log('Recording stopped and will be saved');
  } else {
    item.status = 'error';
    console.log('Recording stopped and will be discarded');
  }
  
  item.updatedAt = Date.now();
  state.currentRecordingId = null;
  state.shouldStopAfterCurrent = true; // Don't continue to next item
  state.isProcessing = false;
  
  await saveState();
  broadcastStateUpdate();
  updateBadge();
  
  return { success: true };
}

// Process queue (main loop)
async function processQueue() {
  if (state.isProcessing) {
    return; // Already processing
  }
  
  if (state.shouldStopAfterCurrent && !state.currentRecordingId) {
    console.log('Queue processing stopped by user');
    return;
  }
  
  const waitingItem = state.queue.find(item => item.status === 'waiting');
  
  if (!waitingItem) {
    console.log('No waiting items in queue');
    state.isProcessing = false;
    return;
  }
  
  state.isProcessing = true;
  
  try {
    await recordItem(waitingItem);
  } catch (error) {
    console.error('Error recording item:', error);
    // Mark as error and continue
    const item = state.queue.find(i => i.id === waitingItem.id);
    if (item) {
      item.status = 'error';
      item.updatedAt = Date.now();
      await saveState();
      broadcastStateUpdate();
      updateBadge();
    }
  }
  
  state.isProcessing = false;
  // Don't clear currentRecordingId here - it will be cleared when recording completes
  // Don't continue to next item yet - wait for recording to complete
  // handleRecordingComplete() will call processQueue() to continue
}

// Record a single item
async function recordItem(item) {
  console.log('Starting recording for item:', item.id);
  
  // Validate URL before attempting to record
  if (!isValidRecordableUrl(item.url)) {
    throw new Error('Cannot record this page. Chrome internal pages cannot be captured.');
  }
  
  console.log('Recording item with URL:', item.url);
  
  // Update item status
  item.status = 'recording';
  item.updatedAt = Date.now();
  state.currentRecordingId = item.id;
  await saveState();
  broadcastStateUpdate();
  updateBadge();
  
  try {
    // Use the original tab where "Add Current Tab" was clicked
    // That tab has the extension invoked, so we can capture it
    let tabId = item.tabId;
    let tab = null;
    
    if (!tabId) {
      throw new Error('No tab associated with this item. Items must be added using "Add Current Tab" and the tab must remain open.');
    }
    
    try {
      tab = await chrome.tabs.get(tabId);
      console.log('Using original tab:', tab.id, 'URL:', tab.url);
      
      // Ensure tab is at the correct URL
      if (tab.url !== item.url) {
        console.log('Tab URL changed. Expected:', item.url, 'Got:', tab.url);
        throw new Error('Tab URL has changed. Please keep tabs open after adding them to the queue.');
      }
      
      // Validate the actual tab URL
      if (!isValidRecordableUrl(tab.url)) {
        throw new Error(`Cannot record this page. Tab is on a restricted URL: ${tab.url}`);
      }
      
      // Focus the tab
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      
    } catch (error) {
      console.log('Original tab error:', error.message);
      throw new Error('Tab was closed or is no longer available. Please keep tabs open after adding them to the queue.');
    }
    
    // Tab is already loaded with video player initialized, just brief delay
    console.log('Brief delay to ensure tab is ready...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Ensure tab is actively focused
    console.log('Focusing window and activating tab...');
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Inject content script dynamically (required for activeTab permission)
    console.log('Injecting content script...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      console.log('Content script injected successfully');
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.warn('Could not inject content script (may already be injected):', error);
    }
    
    // Send direct message to content.js to trigger autoplay
    console.log('Sending trigger-play message to content script...');
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'trigger-play' });
      console.log('Trigger-play message sent to content script');
    } catch (error) {
      console.warn('Could not send message to content script:', error);
    }
    
    // Wait for content.js to attempt autoplay (content script already loaded)
    console.log('Waiting 1 second for video to start playing...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Additionally inject backup auto-play script (in case content.js failed)
    try {
      console.log('Injecting backup auto-play script...');
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: autoPlayVideo,
        args: [state.userSettings.playButtonSelector]
      });
      console.log('Backup auto-play script injected');
    } catch (error) {
      console.warn('Could not inject backup auto-play script:', error);
    }
    
    // Brief wait for video to buffer (already pre-loaded)
    console.log('Waiting 1 second for video buffer...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Ensure offscreen document exists
    await ensureOffscreenDocument();
    
    // Verify tab is still at the correct URL before capturing
    const finalTab = await chrome.tabs.get(tabId);
    console.log('Final tab check before capture - URL:', finalTab.url, 'Expected:', item.url, 'Active:', finalTab.active);
    
    if (finalTab.url !== item.url) {
      throw new Error(`Tab navigated away from expected URL. Current: ${finalTab.url}, Expected: ${item.url}`);
    }
    
    if (!finalTab.active) {
      console.warn('Tab is not active, forcing activation...');
      await chrome.windows.update(finalTab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (!isValidRecordableUrl(finalTab.url)) {
      throw new Error(`Cannot capture this tab. URL is not recordable: ${finalTab.url}`);
    }
    
    // Get fresh media stream ID (old one may have expired)
    // Stream IDs have a short lifetime, so we get it right before recording
    console.log('Capturing fresh stream ID for tab:', tabId);
    let streamId;
    try {
      // Use explicit options to ensure we're targeting the right tab
      streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId
      });
      console.log('Fresh stream ID captured:', streamId);
    } catch (captureError) {
      console.error('Failed to get stream ID:', captureError);
      console.error('Tab details:', finalTab);
      
      // More detailed error message
      if (captureError.message.includes('invoked')) {
        throw new Error(`Cannot capture tab. This may be due to browser security restrictions. Try reloading the extension and starting from the tab you want to record.`);
      }
      
      throw new Error('Cannot capture tab stream. The tab must be active and have proper permissions.');
    }
    
    // Send recording request to offscreen document
    await chrome.runtime.sendMessage({
      type: 'start-recording',
      itemId: item.id,
      tabId: tabId,
      streamId: streamId,
      title: item.title,
      url: item.url,
      maxDurationMs: state.userSettings.maxDurationMinutes * 60 * 1000
    });
    
    // Recording is now in progress
    console.log('Recording started for:', item.title);
    
    // Inject video monitoring script to detect when video ends
    try {
      console.log('Injecting video end monitor...');
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: monitorVideoEnd,
        args: [item.id]
      });
      console.log('Video end monitor injected');
    } catch (error) {
      console.warn('Could not inject video end monitor:', error);
    }
    
  } catch (error) {
    console.error('Error starting recording:', error);
    item.status = 'error';
    item.updatedAt = Date.now();
    state.currentRecordingId = null;
    await saveState();
    broadcastStateUpdate();
    updateBadge();
    throw error;
  }
}

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
  const hasDocument = await chrome.offscreen.hasDocument();
  
  if (!hasDocument) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['USER_MEDIA'],
      justification: 'Recording tab audio and video'
    });
    
    // Wait a moment for document to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Handle download blob message from offscreen
async function handleDownloadBlob(message) {
  const { itemId, blobUrl, filename } = message;
  
  console.log('Received download request - Filename:', filename, 'Item:', itemId);
  
  try {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
    
    // Get save location settings
    const settings = await chrome.storage.local.get([
      'saveLocation',
      'driveFolderId',
      'driveFolderName'
    ]);
    
    const saveLocation = settings.saveLocation || 'local';
    const shouldSaveLocal = saveLocation === 'local' || saveLocation === 'both';
    const shouldSaveDrive = saveLocation === 'drive' || saveLocation === 'both';
    
    // Save locally if needed
    if (shouldSaveLocal) {
      await chrome.downloads.download({
        url: blobUrl,
        filename: `CourseRecordings/${sanitizedFilename}`,
        saveAs: false
      });
      console.log('Local download initiated for:', sanitizedFilename);
    }
    
    // Upload to Drive if needed
    if (shouldSaveDrive) {
      const folderId = settings.driveFolderId || 'root';
      const folderName = settings.driveFolderName || 'My Drive';
      
      // Update status to uploading
      const item = state.queue.find(i => i.id === itemId);
      if (item) {
        item.status = 'uploading';
        await saveState();
        broadcastStateUpdate();
        updateBadge();
      }
      
      console.log(`Uploading to Google Drive folder: ${folderName}...`);
      
      // Fetch the blob from the blob URL
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      
      // Upload to Drive
      const result = await uploadBlobToDrive(blob, sanitizedFilename, folderId);
      
      console.log('Successfully uploaded to Google Drive:', result.name);
      console.log('Drive file link:', result.webViewLink);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving file:', error);
    return { success: false, error: error.message };
  }
}

// Handle recording complete message from offscreen
async function handleRecordingComplete(message) {
  const { itemId, success, error } = message;
  
  const item = state.queue.find(i => i.id === itemId);
  
  if (!item) {
    console.error('Item not found:', itemId);
    return { success: false, error: 'Item not found' };
  }
  
  if (success) {
    item.status = 'done';
  } else {
    item.status = 'error';
    console.error('Recording failed:', error);
  }
  
  item.updatedAt = Date.now();
  state.currentRecordingId = null;
  
  await saveState();
  broadcastStateUpdate();
  updateBadge();
  
  // Continue processing queue if not stopped by user
  if (!state.shouldStopAfterCurrent) {
    setTimeout(() => processQueue(), 1000);
  }
  
  return { success: true };
}
