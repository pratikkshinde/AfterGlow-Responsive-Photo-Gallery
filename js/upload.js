let selectedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    if (uploadArea) {
        // Click to browse
        uploadArea.addEventListener('click', () => {
            if (fileInput.disabled) return;
            fileInput.click();
        });
        
        // Drag and drop
        uploadArea.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (fileInput.disabled) return;
            uploadArea.classList.add('drag-hover');
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (fileInput.disabled) return;
            uploadArea.classList.add('drag-hover');
        });
        
        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (fileInput.disabled) return;
            uploadArea.classList.remove('drag-hover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            if (fileInput.disabled) return;
            uploadArea.classList.remove('drag-hover');
            
            const files = Array.from(e.dataTransfer.files);
            handleFiles(files);
        });
        
        // File input change
        fileInput.addEventListener('change', (e) => {
            if (fileInput.disabled) return;
            const files = Array.from(e.target.files);
            handleFiles(files);
        });
        
        // Browse button
        if (browseBtn) {
            browseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (fileInput.disabled) return;
                fileInput.click();
            });
        }
        
        // Upload button
        if (uploadBtn) {
            uploadBtn.addEventListener('click', uploadPhotos);
        }
        
        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', clearAll);
        }
    }

    checkUploadAuth();
});

function checkUploadAuth() {
    const token = localStorage.getItem('ag_token');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const clearBtn = document.getElementById('clearBtn');

    const isLoggedIn = Boolean(token);

    if (uploadArea) {
        uploadArea.classList.toggle('disabled', !isLoggedIn);
    }
    if (fileInput) fileInput.disabled = !isLoggedIn;
    if (browseBtn) browseBtn.disabled = !isLoggedIn;
    if (uploadBtn) uploadBtn.disabled = !isLoggedIn;
    if (clearBtn) clearBtn.disabled = !isLoggedIn;

    if (!isLoggedIn) {
        showMessage('Login required to upload photos. <a href="auth.html" class="auth-link">Sign in</a>.', 'error', true, false);
    }
}


function handleFiles(files) {
    // Filter images only
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
        showMessage('Please select valid image files (JPG, PNG, WEBP)', 'error');
        return;
    }
    
    // Check file size (max 5MB)
    const validFiles = imageFiles.filter(file => file.size <= 5 * 1024 * 1024);
    
    if (validFiles.length !== imageFiles.length) {
        showMessage('Some files exceed the 5MB limit and were skipped', 'error');
    }
    
    if (validFiles.length === 0) {
        return;
    }
    
    selectedFiles.push(...validFiles);
    updatePreview();
}

function updatePreview() {
    const previewSection = document.getElementById('previewSection');
    const previewGrid = document.getElementById('previewGrid');
    
    if (selectedFiles.length > 0) {
        previewSection.style.display = 'block';
        
        previewGrid.innerHTML = selectedFiles.map((file, index) => `
            <div class="preview-item" data-index="${index}" style="--index: ${index}">
                <img src="${URL.createObjectURL(file)}" alt="Preview">
                <button class="remove-preview" onclick="removePreview(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    } else {
        previewSection.style.display = 'none';
        previewGrid.innerHTML = '';
    }
}

function removePreview(index) {
    selectedFiles.splice(index, 1);
    updatePreview();
    
    if (selectedFiles.length === 0) {
        const fileInput = document.getElementById('fileInput');
        fileInput.value = '';
    }
}

function clearAll() {
    selectedFiles = [];
    updatePreview();
    const fileInput = document.getElementById('fileInput');
    fileInput.value = '';
    showMessage('All files cleared', 'success');
}

async function uploadPhotos() {
    if (selectedFiles.length === 0) {
        showMessage('Please select photos to upload', 'error');
        return;
    }
    
    const token = localStorage.getItem('ag_token');
    if(!token) {
        showMessage('You must be logged in to upload photos.', 'error');
        setTimeout(() => window.location.href = 'auth.html', 2000);
        return;
    }

    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    let successCount = 0;
    let errorCount = 0;
    let lastErrorMessage = '';

    for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('photo', file);
        
        try {
            const response = await fetch('/api/photos', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
                body: formData
            });

            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
                try {
                    const errData = await response.json();
                    lastErrorMessage = errData.error || 'Server rejected file';
                } catch (e) {
                    lastErrorMessage = 'Server returned error ' + response.status;
                }
            }
        } catch (error) {
            console.error('Upload error:', error);
            errorCount++;
            lastErrorMessage = error.message || 'Network error during upload';
        }
    }
    
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload Photos';

    if (successCount > 0) {
        if (typeof window.notifyPhotoAdded === 'function') {
            window.notifyPhotoAdded({ count: successCount });
        }
        showMessage(`Successfully uploaded ${successCount} photo(s)!`, 'success');
        clearAll();
        setTimeout(() => {
            if (confirm('Photos uploaded successfully! Would you like to view them in the gallery?')) {
                window.location.href = 'gallery.html';
            }
        }, 1500);
    } else {
        showMessage(lastErrorMessage || 'Error uploading photos. Please try again.', 'error');
    }
}

function showMessage(message, type, allowHTML = false, autoClear = true) {
    const messageDiv = document.getElementById('uploadMessage');
    if (messageDiv) {
        if (allowHTML) {
            messageDiv.innerHTML = message;
        } else {
            messageDiv.textContent = message;
        }
        messageDiv.className = `upload-message ${type}`;
        
        if (autoClear) {
            setTimeout(() => {
                messageDiv.textContent = '';
                messageDiv.className = 'upload-message';
            }, 5000);
        }
    }
}