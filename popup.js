// Global state
let currentState = {
  queue: [],
  currentRecordingId: null,
  userSettings: {
    playButtonSelector: 'video',
    maxDurationMinutes: 90
  }
};

// DOM elements
const playButtonSelectorInput = document.getElementById('playButtonSelector');
const maxDurationInput = document.getElementById('maxDuration');
const saveSettingsBtn = document.getElementById('saveSettings');
const urlInput = document.getElementById('urlInput');
const addUrlBtn = document.getElementById('addUrl');
const addCurrentTabBtn = document.getElementById('addCurrentTab');
const startQueueBtn = document.getElementById('startQueue');
const stopQueueBtn = document.getElementById('stopQueue');
const stopNowBtn = document.getElementById('stopNow');
const statusBar = document.getElementById('statusBar');
const queueList = document.getElementById('queueList');

// Drive elements
const saveLocalRadio = document.getElementById('saveLocal');
const saveDriveRadio = document.getElementById('saveDrive');
const saveBothRadio = document.getElementById('saveBoth');
const driveStatus = document.getElementById('driveStatus');
const folderDisplay = document.getElementById('folderDisplay');
const connectDriveBtn = document.getElementById('connectDrive');
const selectFolderBtn = document.getElementById('selectFolder');
const disconnectDriveBtn = document.getElementById('disconnectDrive');

// Drag and drop state
let draggedElement = null;
let draggedItemId = null;

// Initialize popup
async function init() {
  await requestState();
  await loadDriveSettings();
  setupEventListeners();
  
  // Listen for state updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'state-update') {
      currentState = message;
      updateUI();
    }
  });
  
  // Listen for folder selection
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.driveFolderId || changes.driveFolderName)) {
      loadDriveSettings();
    }
  });
}

// Request current state from background
async function requestState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-state' });
    if (response) {
      currentState = response;
      updateUI();
    }
  } catch (error) {
    console.error('Error requesting state:', error);
  }
}

// Setup all event listeners
function setupEventListeners() {
  saveSettingsBtn.addEventListener('click', saveSettings);
  addUrlBtn.addEventListener('click', addUrl);
  addCurrentTabBtn.addEventListener('click', addCurrentTab);
  startQueueBtn.addEventListener('click', startQueue);
  stopQueueBtn.addEventListener('click', stopQueue);
  stopNowBtn.addEventListener('click', stopNow);
  
  // Drive event listeners
  saveLocalRadio.addEventListener('change', saveDriveSettings);
  saveDriveRadio.addEventListener('change', saveDriveSettings);
  saveBothRadio.addEventListener('change', saveDriveSettings);
  connectDriveBtn.addEventListener('click', connectToDrive);
  selectFolderBtn.addEventListener('click', openFolderPicker);
  disconnectDriveBtn.addEventListener('click', disconnectFromDrive);
  
  // Enter key in URL input
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addUrl();
    }
  });
}

// Save settings
async function saveSettings() {
  const playButtonSelector = playButtonSelectorInput.value.trim();
  const maxDurationMinutes = parseInt(maxDurationInput.value, 10);
  
  if (!playButtonSelector) {
    alert('Please enter a play button selector');
    return;
  }
  
  if (isNaN(maxDurationMinutes) || maxDurationMinutes < 1) {
    alert('Please enter a valid max duration');
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({
      type: 'update-settings',
      playButtonSelector,
      maxDurationMinutes
    });
    
    showFeedback(saveSettingsBtn, 'Saved!');
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Error saving settings: ' + error.message);
  }
}

// Add URL to queue
async function addUrl() {
  const url = urlInput.value.trim();
  
  if (!url) {
    alert('Please enter a URL');
    return;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('Please enter a valid URL starting with http:// or https://');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'add-url',
      url
    });
    
    if (response && !response.success) {
      alert(response.error || 'Failed to add URL');
      return;
    }
    
    urlInput.value = '';
    showFeedback(addUrlBtn, 'Added!');
  } catch (error) {
    console.error('Error adding URL:', error);
    alert('Error adding URL: ' + error.message);
  }
}

// Add current tab to queue
async function addCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      alert('No active tab found');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'add-current-tab',
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    });
    
    if (response && !response.success) {
      alert(response.error || 'Failed to add tab');
      return;
    }
    
    showFeedback(addCurrentTabBtn, 'Added! Keep this tab open.');
  } catch (error) {
    console.error('Error adding current tab:', error);
    alert('Error adding current tab: ' + error.message);
  }
}

// Start queue processing
async function startQueue() {
  try {
    await chrome.runtime.sendMessage({ 
      type: 'start-queue'
    });
  } catch (error) {
    console.error('Error starting queue:', error);
    alert('Error starting queue: ' + error.message);
  }
}

// Stop queue after current recording
async function stopQueue() {
  try {
    await chrome.runtime.sendMessage({ type: 'stop-queue' });
  } catch (error) {
    console.error('Error stopping queue:', error);
    alert('Error stopping queue: ' + error.message);
  }
}

// Stop recording now with save/delete option
async function stopNow() {
  const saveRecording = confirm(
    'Stop recording now?\n\n' +
    'Click OK to SAVE the recording so far.\n' +
    'Click Cancel to DELETE it and discard the recording.'
  );
  
  try {
    await chrome.runtime.sendMessage({ 
      type: 'stop-now',
      saveRecording: saveRecording
    });
  } catch (error) {
    console.error('Error stopping recording:', error);
    alert('Error stopping recording: ' + error.message);
  }
}

// Remove item from queue
async function removeItem(itemId) {
  try {
    await chrome.runtime.sendMessage({
      type: 'remove-from-queue',
      itemId
    });
  } catch (error) {
    console.error('Error removing item:', error);
    alert('Error removing item: ' + error.message);
  }
}

// Reorder queue
async function reorderQueue(newOrderIds) {
  try {
    await chrome.runtime.sendMessage({
      type: 'reorder-queue',
      ids: newOrderIds
    });
  } catch (error) {
    console.error('Error reordering queue:', error);
    alert('Error reordering queue: ' + error.message);
  }
}

// Update entire UI
function updateUI() {
  // Update settings inputs
  playButtonSelectorInput.value = currentState.userSettings.playButtonSelector;
  maxDurationInput.value = currentState.userSettings.maxDurationMinutes;
  
  // Update status bar
  updateStatusBar();
  
  // Update queue list
  updateQueueList();
}

// Update status bar
function updateStatusBar() {
  const { queue, currentRecordingId } = currentState;
  const waitingItems = queue.filter(item => item.status === 'waiting');
  
  if (currentRecordingId) {
    const currentItem = queue.find(item => item.id === currentRecordingId);
    if (currentItem) {
      statusBar.textContent = `🔴 Recording: ${currentItem.title}`;
      statusBar.style.background = '#fce8e6';
      statusBar.style.color = '#c5221f';
      // Show stop now button when recording
      stopNowBtn.style.display = 'inline-block';
      startQueueBtn.style.display = 'none';
    }
  } else if (waitingItems.length > 0) {
    statusBar.textContent = `⏱ Waiting (${waitingItems.length} item${waitingItems.length !== 1 ? 's' : ''})`;
    statusBar.style.background = '#e8f0fe';
    statusBar.style.color = '#1967d2';
    // Hide stop now button when not recording
    stopNowBtn.style.display = 'none';
    startQueueBtn.style.display = 'inline-block';
  } else {
    statusBar.textContent = 'Idle';
    statusBar.style.background = '#e8f0fe';
    statusBar.style.color = '#1967d2';
    // Hide stop now button when idle
    stopNowBtn.style.display = 'none';
    startQueueBtn.style.display = 'inline-block';
  }
}

// Update queue list
function updateQueueList() {
  const { queue } = currentState;
  
  if (queue.length === 0) {
    queueList.innerHTML = '<div class="empty-queue">No items in queue</div>';
    return;
  }
  
  queueList.innerHTML = '';
  
  queue.forEach(item => {
    const itemElement = createQueueItemElement(item);
    queueList.appendChild(itemElement);
  });
}

// Create queue item element
function createQueueItemElement(item) {
  const div = document.createElement('div');
  div.className = 'queue-item';
  div.dataset.itemId = item.id;
  
  // Make waiting items draggable
  if (item.status === 'waiting') {
    div.className += ' draggable';
    div.draggable = true;
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragleave', handleDragLeave);
  }
  
  // Status icon and label
  const statusIcon = document.createElement('div');
  statusIcon.className = `status-icon ${item.status}`;
  
  const statusLabel = document.createElement('span');
  statusLabel.className = `status-label ${item.status}`;
  statusLabel.textContent = getStatusText(item.status);
  
  // Title
  const title = document.createElement('div');
  title.className = 'queue-item-title';
  title.textContent = item.title;
  title.title = item.title; // Tooltip for full title
  
  // Header
  const header = document.createElement('div');
  header.className = 'queue-item-header';
  header.appendChild(statusIcon);
  header.appendChild(title);
  header.appendChild(statusLabel);
  
  // URL
  const url = document.createElement('div');
  url.className = 'queue-item-url';
  url.textContent = item.url;
  url.title = item.url; // Tooltip for full URL
  
  // Actions (Remove button)
  const actions = document.createElement('div');
  actions.className = 'queue-item-actions';
  
  if (item.status === 'waiting' || item.status === 'error' || item.status === 'done') {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-danger btn-small';
    removeBtn.textContent = '✕ Remove';
    removeBtn.addEventListener('click', () => removeItem(item.id));
    actions.appendChild(removeBtn);
  }
  
  // Assemble
  div.appendChild(header);
  div.appendChild(url);
  if (actions.childElementCount > 0) {
    div.appendChild(actions);
  }
  
  return div;
}

// Get status text
function getStatusText(status) {
  const statusMap = {
    'waiting': '⏱ Waiting',
    'recording': '🔴 Recording',
    'uploading': '☁️ Uploading',
    'done': '✅ Done',
    'error': '⚠️ Error'
  };
  return statusMap[status] || status;
}

// Drag and drop handlers
function handleDragStart(e) {
  draggedElement = e.currentTarget;
  draggedItemId = e.currentTarget.dataset.itemId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  
  // Remove drag-over class from all items
  document.querySelectorAll('.queue-item').forEach(item => {
    item.classList.remove('drag-over');
  });
  
  draggedElement = null;
  draggedItemId = null;
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  e.dataTransfer.dropEffect = 'move';
  
  const target = e.currentTarget;
  
  // Only allow drop on waiting items
  if (target.classList.contains('draggable') && target !== draggedElement) {
    target.classList.add('drag-over');
  }
  
  return false;
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  e.preventDefault();
  
  const target = e.currentTarget;
  target.classList.remove('drag-over');
  
  if (draggedElement !== target && target.classList.contains('draggable')) {
    // Get current order of waiting items
    const waitingItems = currentState.queue.filter(item => item.status === 'waiting');
    const draggedItem = waitingItems.find(item => item.id === draggedItemId);
    const targetItemId = target.dataset.itemId;
    const targetItem = waitingItems.find(item => item.id === targetItemId);
    
    if (!draggedItem || !targetItem) return;
    
    // Create new order
    const newOrder = waitingItems.filter(item => item.id !== draggedItemId);
    const targetIndex = newOrder.findIndex(item => item.id === targetItemId);
    newOrder.splice(targetIndex, 0, draggedItem);
    
    // Send reorder request
    const newOrderIds = newOrder.map(item => item.id);
    reorderQueue(newOrderIds);
  }
  
  return false;
}

// Show temporary feedback on button
function showFeedback(button, text) {
  const originalText = button.textContent;
  button.textContent = text;
  button.disabled = true;
  
  setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 1500);
}

// ============================================
// Google Drive Functions
// ============================================

// Load Drive settings from storage
async function loadDriveSettings() {
  const data = await chrome.storage.local.get([
    'saveLocation',
    'driveAuthenticated',
    'driveFolderId',
    'driveFolderName'
  ]);
  
  // Set save location radio
  const saveLocation = data.saveLocation || 'local';
  if (saveLocation === 'local') saveLocalRadio.checked = true;
  else if (saveLocation === 'drive') saveDriveRadio.checked = true;
  else if (saveLocation === 'both') saveBothRadio.checked = true;
  
  // Update Drive connection status
  const isAuthenticated = await isDriveAuthenticated();
  updateDriveUI(isAuthenticated, data.driveFolderId, data.driveFolderName);
}

// Save Drive settings
async function saveDriveSettings() {
  let saveLocation = 'local';
  if (saveLocalRadio.checked) saveLocation = 'local';
  else if (saveDriveRadio.checked) saveLocation = 'drive';
  else if (saveBothRadio.checked) saveLocation = 'both';
  
  await chrome.storage.local.set({ saveLocation });
}

// Connect to Google Drive
async function connectToDrive() {
  try {
    connectDriveBtn.disabled = true;
    connectDriveBtn.textContent = 'Connecting...';
    
    const token = await getDriveToken(true);
    
    if (token) {
      await chrome.storage.local.set({ driveAuthenticated: true });
      updateDriveUI(true, null, null);
      
      // Prompt to select folder
      setTimeout(() => {
        if (confirm('Connected! Would you like to select a folder for your recordings?')) {
          openFolderPicker();
        }
      }, 500);
    }
  } catch (error) {
    alert('Failed to connect to Google Drive: ' + error.message);
    updateDriveUI(false, null, null);
  } finally {
    connectDriveBtn.disabled = false;
    connectDriveBtn.textContent = 'Connect to Drive';
  }
}

// Disconnect from Google Drive
async function disconnectFromDrive() {
  if (!confirm('Disconnect from Google Drive? You can reconnect anytime.')) {
    return;
  }
  
  try {
    await revokeDriveToken();
    await chrome.storage.local.set({
      driveAuthenticated: false,
      driveFolderId: null,
      driveFolderName: null
    });
    updateDriveUI(false, null, null);
  } catch (error) {
    alert('Error disconnecting: ' + error.message);
  }
}

// Open folder picker window
function openFolderPicker() {
  chrome.windows.create({
    url: 'folder-picker.html',
    type: 'popup',
    width: 520,
    height: 640
  });
}

// Update Drive UI based on connection status
function updateDriveUI(isConnected, folderId, folderName) {
  if (isConnected) {
    driveStatus.textContent = '✓ Connected to Google Drive';
    driveStatus.className = 'drive-status connected';
    connectDriveBtn.style.display = 'none';
    selectFolderBtn.style.display = 'inline-block';
    disconnectDriveBtn.style.display = 'inline-block';
    
    if (folderId && folderName) {
      folderDisplay.textContent = folderName;
      folderDisplay.style.display = 'flex';
    } else {
      folderDisplay.style.display = 'none';
    }
  } else {
    driveStatus.textContent = 'Not connected';
    driveStatus.className = 'drive-status';
    connectDriveBtn.style.display = 'inline-block';
    selectFolderBtn.style.display = 'none';
    disconnectDriveBtn.style.display = 'none';
    folderDisplay.style.display = 'none';
  }
}

// ============================================
// End Google Drive Functions
// ============================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
