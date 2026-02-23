// Offscreen document for handling media recording

// Forward console logs to background for easier debugging
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function forwardLog(level, ...args) {
  // Call original console method
  const originalMethod = level === 'error' ? originalError : (level === 'warn' ? originalWarn : originalLog);
  originalMethod.apply(console, args);
  
  // Forward to background
  try {
    chrome.runtime.sendMessage({
      type: 'offscreen-log',
      level: level,
      message: args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')
    }).catch(() => {}); // Ignore errors if background isn't listening
  } catch (e) {}
}

console.log = (...args) => forwardLog('log', ...args);
console.error = (...args) => forwardLog('error', ...args);
console.warn = (...args) => forwardLog('warn', ...args);

console.log('[OFFSCREEN] Offscreen document loaded');

// Active recording state
let activeRecording = null;
let shouldSaveRecording = true; // Track if we should save the recording

// Silence detection configuration
const SILENCE_CHECK_INTERVAL = 2000; // Check every 2 seconds
const SILENCE_THRESHOLD = 0.02; // Volume threshold (0-1)
const SILENCE_DURATION_THRESHOLD = 10000; // 10 seconds of silence triggers stop

// Listen for recording requests from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start-recording') {
    console.log('[OFFSCREEN] ═══════════════════════════════════════════');
    console.log('[OFFSCREEN] Received start-recording message');
    console.log('[OFFSCREEN] Item ID:', message.itemId);
    console.log('[OFFSCREEN] Title:', message.title);
    console.log('[OFFSCREEN] ═══════════════════════════════════════════');
    startRecording(message).then(sendResponse).catch(error => {
      console.error('[OFFSCREEN] Error starting recording:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'stop-recording') {
    console.log('Received stop-recording message, save:', message.saveRecording);
    shouldSaveRecording = message.saveRecording;
    if (activeRecording && activeRecording.mediaRecorder) {
      activeRecording.mediaRecorder.stop();
    }
    sendResponse({ success: true });
    return true;
  }
});

// Start recording
async function startRecording(config) {
  const { itemId, tabId, streamId, title, url, maxDurationMs } = config;
  
  // Reset save flag for new recording
  shouldSaveRecording = true;
  
  try {
    console.log('Starting recording for:', title);
    console.log('Stream ID:', streamId);
    console.log('Tab ID:', tabId);
    
    // Get media stream using the stream ID
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });
    } catch (getUserMediaError) {
      console.error('getUserMedia failed:', getUserMediaError);
      console.error('Error name:', getUserMediaError.name);
      console.error('Error message:', getUserMediaError.message);
      throw new Error(`Error starting tab capture: ${getUserMediaError.message}`);
    }
    
    console.log('Media stream obtained');
    
    // Determine supported MIME type
    const mimeType = getSupportedMimeType();
    console.log('Using MIME type:', mimeType);
    
    // Create MediaRecorder
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: 2500000 // 2.5 Mbps
    });
    
    const chunks = [];
    let silenceStartTime = null;
    let audioContext = null;
    let analyser = null;
    let maxDurationTimeout = null;
    let silenceCheckInterval = null;
    
    // Setup audio analysis for silence detection
    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      
      console.log('Audio analysis setup complete');
    } catch (error) {
      console.warn('Could not setup audio analysis:', error);
    }
    
    // Handle data available
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    
    // Handle recording stop
    mediaRecorder.onstop = async () => {
      console.log('══════════════════════════════════════════════════════');
      console.log('[RECORDING] MediaRecorder.onstop triggered');
      console.log('[RECORDING] Processing recording...');
      console.log('[RECORDING] Item ID:', itemId);
      console.log('[RECORDING] Title:', title);
      console.log('[RECORDING] Chunks collected:', chunks.length);
      console.log('══════════════════════════════════════════════════════');
      
      // Cleanup
      clearTimeout(maxDurationTimeout);
      clearInterval(silenceCheckInterval);
      
      if (audioContext) {
        await audioContext.close();
      }
      
      stream.getTracks().forEach(track => track.stop());
      
      // Create blob from chunks
      if (chunks.length === 0) {
        console.error('No data recorded');
        await notifyRecordingComplete(itemId, false, 'No data recorded');
        activeRecording = null;
        shouldSaveRecording = true; // Reset for next recording
        return;
      }
      
      const blob = new Blob(chunks, { type: mimeType });
      console.log('Blob created, size:', blob.size, 'bytes');
      
      // Check if we should save the recording
      if (!shouldSaveRecording) {
        console.log('Recording discarded by user');
        await notifyRecordingComplete(itemId, false, 'Recording discarded by user');
        activeRecording = null;
        shouldSaveRecording = true; // Reset for next recording
        return;
      }
      
      // Use WebM format directly
      const finalBlob = blob;
      const fileExtension = 'webm';
      
      // Create object URL
      const blobUrl = URL.createObjectURL(finalBlob);
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9-_.]/g, '_').substring(0, 50);
      const filename = `${sanitizedTitle}-${timestamp}.${fileExtension}`;
      
      console.log('[DOWNLOAD] Preparing download...');
      console.log('[DOWNLOAD] Final filename:', filename);
      console.log('[DOWNLOAD] File format:', fileExtension.toUpperCase());
      console.log('[DOWNLOAD] Blob URL created');
      
      // Send download request to background
      try {
        await chrome.runtime.sendMessage({
          type: 'download-blob',
          itemId: itemId,
          blobUrl: blobUrl,
          filename: filename
        });
        
        console.log('[DOWNLOAD] ✓ Download request sent to background');
        
        // Notify completion
        await notifyRecordingComplete(itemId, true);
        
      } catch (error) {
        console.error('[DOWNLOAD] ✗ Error sending download request:', error);
        await notifyRecordingComplete(itemId, false, error.message);
      }
      
      activeRecording = null;
      shouldSaveRecording = true; // Reset for next recording
    };
    
    // Handle errors
    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
      notifyRecordingComplete(itemId, false, event.error.message);
      activeRecording = null;
    };
    
    // Start recording
    mediaRecorder.start(1000); // Capture in 1-second chunks
    console.log('MediaRecorder started');
    
    // Setup max duration timeout
    maxDurationTimeout = setTimeout(() => {
      console.log('Max duration reached, stopping recording');
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, maxDurationMs);
    
    // Setup silence detection
    if (analyser) {
      silenceCheckInterval = setInterval(() => {
        checkSilence(analyser, mediaRecorder);
      }, SILENCE_CHECK_INTERVAL);
    }
    
    // Check silence function
    function checkSilence(analyser, recorder) {
      if (recorder.state !== 'recording') {
        return;
      }
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength / 255; // Normalize to 0-1
      
      // Check if silent
      if (average < SILENCE_THRESHOLD) {
        if (silenceStartTime === null) {
          silenceStartTime = Date.now();
          console.log('Silence detected, monitoring...');
        } else {
          const silenceDuration = Date.now() - silenceStartTime;
          if (silenceDuration >= SILENCE_DURATION_THRESHOLD) {
            console.log('Prolonged silence detected, stopping recording');
            recorder.stop();
          }
        }
      } else {
        if (silenceStartTime !== null) {
          console.log('Audio resumed');
        }
        silenceStartTime = null;
      }
    }
    
    // Store active recording
    activeRecording = {
      itemId,
      mediaRecorder,
      stream,
      audioContext,
      maxDurationTimeout,
      silenceCheckInterval
    };
    
    return { success: true };
    
  } catch (error) {
    console.error('Error in startRecording:', error);
    await notifyRecordingComplete(itemId, false, error.message);
    throw error;
  }
}

// Get supported MIME type
function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  
  return 'video/webm'; // Fallback
}

// Notify background of recording completion
async function notifyRecordingComplete(itemId, success, error = null) {
  try {
    await chrome.runtime.sendMessage({
      type: 'recording-complete',
      itemId: itemId,
      success: success,
      error: error
    });
  } catch (err) {
    console.error('Error notifying recording complete:', err);
  }
}
