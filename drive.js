// Google Drive API Integration
// Handles authentication, folder selection, and file uploads

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Get OAuth token for Google Drive access
 * @param {boolean} interactive - Whether to show login prompt
 * @returns {Promise<string>} Access token
 */
async function getDriveToken(interactive = true) {
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
 * Revoke OAuth token (sign out)
 */
async function revokeDriveToken() {
  const token = await getDriveToken(false);
  if (token) {
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
    return new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        resolve();
      });
    });
  }
}

/**
 * Check if user is authenticated
 */
async function isDriveAuthenticated() {
  try {
    const token = await getDriveToken(false);
    return !!token;
  } catch {
    return false;
  }
}

/**
 * List folders in user's Google Drive
 * @param {string} parentId - Parent folder ID (optional, defaults to root)
 * @returns {Promise<Array>} List of folders
 */
async function listDriveFolders(parentId = 'root') {
  const token = await getDriveToken();
  
  const query = parentId === 'root' 
    ? "mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false"
    : `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  
  const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=name`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to list folders: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.files || [];
}

/**
 * Create a new folder in Google Drive
 * @param {string} name - Folder name
 * @param {string} parentId - Parent folder ID (optional)
 * @returns {Promise<Object>} Created folder metadata
 */
async function createDriveFolder(name, parentId = 'root') {
  const token = await getDriveToken();
  
  const metadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };
  
  const response = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create folder: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Upload a file to Google Drive
 * @param {Blob} blob - File blob to upload
 * @param {string} fileName - Name for the file
 * @param {string} folderId - Folder ID to upload to
 * @param {Function} progressCallback - Progress callback (optional)
 * @returns {Promise<Object>} Uploaded file metadata
 */
async function uploadToDrive(blob, fileName, folderId, progressCallback = null) {
  const token = await getDriveToken();
  
  // Create metadata
  const metadata = {
    name: fileName,
    parents: [folderId]
  };
  
  // Create multipart body
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";
  
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const multipartRequestBody = new Blob([
    delimiter,
    'Content-Type: application/json\r\n\r\n',
    metadataBlob,
    delimiter,
    'Content-Type: video/webm\r\n\r\n',
    blob,
    close_delim
  ]);
  
  // Upload with progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressCallback) {
        const percentComplete = (e.loaded / e.total) * 100;
        progressCallback(percentComplete);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'));
    });
    
    xhr.open('POST', `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,webViewLink`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);
    
    xhr.send(multipartRequestBody);
  });
}

/**
 * Get folder details by ID
 * @param {string} folderId - Folder ID
 * @returns {Promise<Object>} Folder metadata
 */
async function getDriveFolder(folderId) {
  const token = await getDriveToken();
  
  const response = await fetch(`${DRIVE_API_BASE}/files/${folderId}?fields=id,name`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get folder: ${response.statusText}`);
  }
  
  return await response.json();
}
