# Privacy Policy for Course Video Queue Recorder

**Last Updated: February 23, 2026**

## Introduction

This Privacy Policy describes how Course Video Queue Recorder ("the Extension", "we", "us", or "our") collects, uses, and protects your information when you use our Chrome browser extension.

## Our Commitment to Privacy

We are committed to protecting your privacy. This extension is designed with privacy in mind:
- **No data is sent to our servers** - We do not operate any servers or databases
- **No tracking or analytics** - We do not track your behavior or collect usage statistics
- **No advertising** - We do not display ads or share data with advertisers
- **Your data stays with you** - All data remains on your device or in your own Google Drive

## Information We Access

### 1. Tab Information
**What:** Current tab URL and title when you add a video to the queue  
**Why:** To identify and display which videos are in your recording queue  
**Storage:** Stored locally in your browser only  
**Sharing:** Never shared with anyone

### 2. Video Content
**What:** Video and audio streams from browser tabs  
**Why:** To record the videos you explicitly add to your queue  
**Storage:** Temporarily in browser memory during recording, then saved to your local device or Google Drive  
**Sharing:** Never shared with anyone except your own Google Drive (if you choose)

### 3. User Settings
**What:** Your preferences (silence detection settings, playback button selectors, max duration)  
**Why:** To customize the recording behavior to your needs  
**Storage:** Stored locally in your browser using Chrome's storage API  
**Sharing:** Never shared with anyone

### 4. Google Drive Access (Optional)
**What:** OAuth2 access token to your Google Drive account  
**Why:** To upload your recorded videos to your own Google Drive (only if you enable this feature)  
**Storage:** Token stored locally in your browser, managed by Chrome's identity API  
**Sharing:** Only used to communicate directly with Google Drive API - no third parties involved

## What We Do NOT Collect

We do NOT collect, store, or have access to:
- ❌ Personal identification information (name, email, address, phone)
- ❌ Payment or financial information
- ❌ Passwords or authentication credentials (except Google OAuth tokens managed by Chrome)
- ❌ Your browsing history beyond the current tab URL when adding to queue
- ❌ Your location
- ❌ Your contacts or messages
- ❌ Health information
- ❌ Analytics or usage statistics

## How Your Data is Used

All data accessed by this extension is used exclusively for the following purposes:

1. **Recording Videos:** To capture and save videos from tabs you explicitly add to the recording queue
2. **Queue Management:** To maintain and display your list of videos to be recorded
3. **Google Drive Upload:** To upload recorded videos to your own Google Drive account (if enabled)
4. **Settings:** To remember your preferences for how recordings should be handled

## Data Storage and Security

### Local Storage
- Queue data and settings are stored locally in your browser using Chrome's `chrome.storage.local` API
- This data never leaves your device
- You can clear this data at any time by removing the extension

### Google Drive Storage
- If you enable Google Drive uploads, recorded videos are sent directly from your browser to your own Google Drive account
- We do not have access to your Google Drive
- We do not store copies of your videos
- Authentication is handled securely by Google's OAuth2 system

### Recording Data
- Video/audio recordings are temporarily held in browser memory during the recording process
- After recording completes, the video is either downloaded to your local device or uploaded to your Google Drive
- We do not store or transmit recordings to any other location

## Third-Party Services

### Google Drive API
This extension uses Google Drive API to optionally upload your recordings. When you choose to connect Google Drive:

- You authenticate directly with Google (we never see your credentials)
- Google provides an access token that Chrome stores securely
- The extension uses this token to upload files directly to YOUR Google Drive
- Google's Privacy Policy applies to how Google handles this data: https://policies.google.com/privacy

### No Other Third Parties
We do not integrate with, share data with, or transmit data to any other third-party services, analytics platforms, or advertising networks.

## Your Rights and Control

You have complete control over your data:

### Access and Deletion
- All extension data is stored locally in your browser
- To view stored data: Open Chrome DevTools → Application → Storage
- To delete all data: Remove the extension from Chrome

### Google Drive Access
- You can revoke Google Drive access at any time through the extension's popup
- You can also revoke access at: https://myaccount.google.com/permissions
- Revoking access does not delete videos already uploaded to your Drive

### Permissions Control
- You can review the extension's permissions in chrome://extensions
- All permissions are necessary for core functionality (see Permission Justifications below)

## Permission Justifications

This extension requires the following Chrome permissions:

- **tabs:** To identify which tab contains the video you want to record
- **scripting:** To inject controls into web pages for automatic video playback
- **downloads:** To save recorded videos to your local device
- **offscreen:** To use MediaRecorder API for video capture (required in Manifest V3)
- **tabCapture:** To capture video/audio streams from browser tabs (core functionality)
- **storage:** To save your queue and settings locally
- **identity:** To authenticate with Google Drive using OAuth2
- **Host permissions (`<all_urls>`):** To allow recording videos from any website you visit

## Children's Privacy

This extension is not directed at children under 13. We do not knowingly collect any information from children. If you are a parent or guardian and believe your child has used this extension, please contact us.

## Changes to Privacy Policy

We may update this Privacy Policy from time to time. Changes will be reflected by updating the "Last Updated" date at the top of this policy. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Data Retention

- **Queue and Settings:** Retained locally until you clear them or uninstall the extension
- **Recordings:** Not retained by the extension - they are immediately saved to your device or Google Drive
- **OAuth Tokens:** Retained until you disconnect Google Drive or uninstall the extension

## International Users

This extension operates entirely in your local browser. No data is transmitted internationally except:
- Direct communication between your browser and Google Drive (if you enable it)
- This communication is encrypted and handled by Google

## Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

## Your Consent

By installing and using Course Video Queue Recorder, you consent to this Privacy Policy.

## Contact Information

If you have questions, concerns, or requests regarding this Privacy Policy or your data, please contact us:

- **GitHub Issues:** https://github.com/vincentbui21/course-video-recorder/issues
- **Email:** vincentbui2108@gmail.com

## Open Source

This extension is open source. You can review the complete source code to verify our privacy practices:
- **Repository:** https://github.com/vincentbui21/course-video-recorder

---

**Summary:** We don't collect, store, or share your personal data. Everything stays on your device or in your own Google Drive. We have no servers and no tracking. Your privacy is our priority.
