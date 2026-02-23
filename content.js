// Content script for auto-playing videos
console.log('Course Video Queue Recorder: Content script loaded');

// Fallback selectors if user selector doesn't work
const FALLBACK_SELECTORS = [
  'video',
  'button[aria-label*="play" i]',
  'button[aria-label*="Play" i]',
  '.play-button',
  '.vjs-big-play-button',
  '[data-testid*="play" i]',
  '.ytp-large-play-button', // YouTube
  '.plyr__control--overlaid', // Plyr player
];

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'trigger-play') {
    console.log('Trigger play message received');
    triggerPlay();
    sendResponse({ success: true });
  }
  return true;
});

// Main function to trigger video play
async function triggerPlay() {
  console.log('Attempting to trigger play...');
  
  try {
    // Get user-configured selector from storage
    const result = await chrome.storage.local.get('queueRecorderState');
    let playButtonSelector = 'video';
    
    if (result.queueRecorderState?.userSettings?.playButtonSelector) {
      playButtonSelector = result.queueRecorderState.userSettings.playButtonSelector;
    }
    
    console.log('Using play button selector:', playButtonSelector);
    
    // Try user selector first
    let success = await trySelector(playButtonSelector);
    
    if (success) {
      console.log('Successfully triggered play with user selector');
      return true;
    }
    
    // Try fallback selectors
    console.log('User selector failed, trying fallback selectors...');
    for (const selector of FALLBACK_SELECTORS) {
      if (selector === playButtonSelector) continue; // Skip if already tried
      
      success = await trySelector(selector);
      if (success) {
        console.log('Successfully triggered play with fallback selector:', selector);
        return true;
      }
    }
    
    console.warn('Could not find any play button or video element');
    return false;
    
  } catch (error) {
    console.error('Error triggering play:', error);
    return false;
  }
}

// Try a specific selector
async function trySelector(selector) {
  try {
    // Try to find element(s) with the selector
    const elements = document.querySelectorAll(selector);
    
    if (elements.length === 0) {
      return false;
    }
    
    console.log(`Found ${elements.length} element(s) with selector: ${selector}`);
    
    // Try each matching element
    for (const element of elements) {
      // Check if element is visible
      if (!isElementVisible(element)) {
        continue;
      }
      
      // If it's a video element, call play()
      if (element.tagName === 'VIDEO') {
        console.log('Found video element, calling play()');
        try {
          // Mute first to bypass autoplay policy
          element.muted = true;
          const playPromise = element.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
          
          // Unmute after video starts playing
          setTimeout(() => {
            element.muted = false;
            console.log('Video unmuted after autoplay');
          }, 500);
          
          return true;
        } catch (playError) {
          console.warn('Video play() failed:', playError);
          // Continue to try other elements or methods
        }
      }
      
      // If it's a button or other clickable element, click it
      if (element.tagName === 'BUTTON' || element.onclick || element.click) {
        console.log('Found clickable element, clicking...');
        try {
          element.click();
          
          // Wait a moment and check if a video started playing
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Try to find and play video elements that might have appeared
          const videos = document.querySelectorAll('video');
          for (const video of videos) {
            if (!video.paused) {
              console.log('Video is now playing after click');
              return true;
            }
            
            // Try to play the video (muted first)
            try {
              video.muted = true;
              await video.play();
              // Unmute after it starts
              setTimeout(() => {
                video.muted = false;
                console.log('Video unmuted after click');
              }, 500);
              return true;
            } catch (err) {
              // Continue
            }
          }
          
          return true; // Click was successful even if we can't verify video playback
        } catch (clickError) {
          console.warn('Click failed:', clickError);
        }
      }
    }
    
    return false;
    
  } catch (error) {
    console.error('Error trying selector:', selector, error);
    return false;
  }
}

// Check if element is visible
function isElementVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  
  if (style.display === 'none' || 
      style.visibility === 'hidden' || 
      style.opacity === '0') {
    return false;
  }
  
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  
  return true;
}

// Note: Auto-play on page load removed - we now use manual trigger messages from background script
// This prevents premature attempts before video player is ready

// Try to auto-play when tab becomes visible (e.g., when user switches back)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('Tab became visible, attempting play');
    setTimeout(() => triggerPlay(), 1000);
  }
});
