// Folder Picker UI Logic

let currentFolderId = 'root';
let currentFolderName = 'My Drive';
let selectedFolderId = null;
let selectedFolderName = null;
let breadcrumbPath = [{ id: 'root', name: 'My Drive' }];

// DOM elements
const folderList = document.getElementById('folderList');
const breadcrumb = document.getElementById('breadcrumb');
const selectBtn = document.getElementById('selectBtn');
const cancelBtn = document.getElementById('cancelBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const createFolderSection = document.getElementById('createFolderSection');
const newFolderName = document.getElementById('newFolderName');
const createFolderBtn = document.getElementById('createFolderBtn');
const cancelCreateBtn = document.getElementById('cancelCreateBtn');

// Initialize
loadFolders(currentFolderId);

// Event listeners
selectBtn.addEventListener('click', () => {
  if (selectedFolderId) {
    // Return selected folder to parent window
    chrome.storage.local.set({
      driveFolderId: selectedFolderId,
      driveFolderName: selectedFolderName
    }, () => {
      window.close();
    });
  } else {
    // Select current folder
    chrome.storage.local.set({
      driveFolderId: currentFolderId,
      driveFolderName: currentFolderName
    }, () => {
      window.close();
    });
  }
});

cancelBtn.addEventListener('click', () => {
  window.close();
});

newFolderBtn.addEventListener('click', () => {
  createFolderSection.classList.add('visible');
  newFolderName.focus();
});

cancelCreateBtn.addEventListener('click', () => {
  createFolderSection.classList.remove('visible');
  newFolderName.value = '';
});

createFolderBtn.addEventListener('click', async () => {
  const folderName = newFolderName.value.trim();
  if (!folderName) return;
  
  try {
    createFolderBtn.disabled = true;
    createFolderBtn.textContent = 'Creating...';
    
    const folder = await createDriveFolder(folderName, currentFolderId);
    
    // Reload folder list
    await loadFolders(currentFolderId);
    
    // Reset UI
    createFolderSection.classList.remove('visible');
    newFolderName.value = '';
    createFolderBtn.disabled = false;
    createFolderBtn.textContent = 'Create';
  } catch (error) {
    alert('Failed to create folder: ' + error.message);
    createFolderBtn.disabled = false;
    createFolderBtn.textContent = 'Create';
  }
});

newFolderName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    createFolderBtn.click();
  }
});

// Load folders from Drive
async function loadFolders(folderId) {
  folderList.innerHTML = '<div class="loading">Loading folders...</div>';
  
  try {
    const folders = await listDriveFolders(folderId);
    
    if (folders.length === 0) {
      folderList.innerHTML = '<div class="empty">No folders in this location.<br>Click "+ New Folder" to create one.</div>';
    } else {
      folderList.innerHTML = '';
      folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.dataset.id = folder.id;
        item.dataset.name = folder.name;
        
        item.innerHTML = `
          <span class="folder-icon">📁</span>
          <span class="folder-name">${folder.name}</span>
        `;
        
        // Double-click to navigate into folder
        item.addEventListener('dblclick', () => {
          navigateToFolder(folder.id, folder.name);
        });
        
        // Single click to select
        item.addEventListener('click', () => {
          // Remove previous selection
          document.querySelectorAll('.folder-item').forEach(el => {
            el.classList.remove('selected');
          });
          
          // Select this item
          item.classList.add('selected');
          selectedFolderId = folder.id;
          selectedFolderName = folder.name;
          selectBtn.disabled = false;
          selectBtn.textContent = `Select "${folder.name}"`;
        });
        
        folderList.appendChild(item);
      });
    }
  } catch (error) {
    folderList.innerHTML = `<div class="empty" style="color: #d93025;">Error loading folders:<br>${error.message}</div>`;
  }
}

// Navigate to a folder
function navigateToFolder(folderId, folderName) {
  currentFolderId = folderId;
  currentFolderName = folderName;
  selectedFolderId = null;
  selectedFolderName = null;
  
  // Update breadcrumb
  const existingIndex = breadcrumbPath.findIndex(item => item.id === folderId);
  if (existingIndex >= 0) {
    // Going back to a previous folder
    breadcrumbPath = breadcrumbPath.slice(0, existingIndex + 1);
  } else {
    // Going forward to a new folder
    breadcrumbPath.push({ id: folderId, name: folderName });
  }
  
  updateBreadcrumb();
  selectBtn.disabled = false;
  selectBtn.textContent = `Select "${folderName}"`;
  loadFolders(folderId);
}

// Update breadcrumb display
function updateBreadcrumb() {
  breadcrumb.innerHTML = '';
  
  breadcrumbPath.forEach((item, index) => {
    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    span.dataset.id = item.id;
    span.textContent = item.name;
    
    span.addEventListener('click', () => {
      if (item.id !== currentFolderId) {
        navigateToFolder(item.id, item.name);
      }
    });
    
    breadcrumb.appendChild(span);
    
    if (index < breadcrumbPath.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'breadcrumb-separator';
      separator.textContent = '›';
      breadcrumb.appendChild(separator);
    }
  });
}
