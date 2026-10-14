// Navigation functionality
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        const icon = hamburger.querySelector('i');
        if (navLinks.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });
}

// Navbar scroll glass blur effect
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        if (window.scrollY > 25) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }
}, { passive: true });

// Handle global Auth Nav State
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('ag_token');
    const profileLinks = document.querySelectorAll('a[href="profile.html"], a[href="auth.html"]');

    profileLinks.forEach(link => {
        if (!token) {
            link.href = 'auth.html';
            link.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        } else {
            link.href = 'profile.html';
            link.innerHTML = '<i class="fas fa-user-circle"></i> Profile';
        }
    });

    if (document.querySelector('.stats')) {
        updateStats();
        scrollStatsCounter();
    }
    if (document.querySelector('.hero')) {
        updateHeroImages();
    }

    if (document.getElementById('archCarousel')) {
        initArchCarousel();
    }

    initGlobalSearch();
    setupRealtimeSSE();

    // Register Home Page real-time update listeners
    window.onRealtimePhotoUpdate(() => {
        if (document.querySelector('.hero')) {
            updateHeroImages();
        }
        if (document.getElementById('archCarousel')) {
            initArchCarousel();
        }
    });
});

// Global Search
function initGlobalSearch() {
    const searchInputs = document.querySelectorAll('.global-search');

    searchInputs.forEach(input => {
        let debounceTimer;
        const dropdown = input.nextElementSibling;

        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();

            if (query.length < 1) {
                dropdown.style.display = 'none';
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/users/search?q=${query}`);
                    if (!res.ok) throw new Error('Search failed');

                    const users = await res.json();
                    if (users.length > 0) {
                        dropdown.innerHTML = users.map(u => `
                            <a href="profile.html?username=${u.username}">
                                <img src="${u.profile_picture_url || 'favicon.svg'}" onerror="this.src='favicon.svg'" alt="${u.username}">
                                @${u.username}
                            </a>
                        `).join('');
                        dropdown.style.display = 'flex';
                    } else {
                        dropdown.innerHTML = '<div style="padding:10px 15px; color:rgba(255,255,255,0.5); font-size:0.9rem;">No users found.</div>';
                        dropdown.style.display = 'flex';
                    }
                } catch (err) {
                    console.error('User search error:', err);
                }
            }, 300); // 300ms debounce
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    });
}

// Smooth count-up animation helper
function animateCount(elem, from, to, duration, decimals, prefix = '', suffix = '') {
    const startTime = performance.now();
    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out expo
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const value = from + (to - from) * eased;
        elem.textContent = prefix + (decimals ? value.toFixed(decimals) : Math.round(value)) + suffix;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// Update stats on home page fetching from backend
async function updateStats() {
    try {
        const res = await fetch('/api/photos');
        if (res.ok) {
            const data = await res.json();
            const photoCountElem = document.getElementById('photoCount');
            if (photoCountElem) {
                animateCount(photoCountElem, 0, data.length, 1500, 0);
            }
        }
    } catch (err) {
        console.error("Failed to update stats", err);
    }
}

// Animate stats counters when scrolled into view
function scrollStatsCounter() {
    const statsSection = document.querySelector('.stats');
    if (!statsSection) return;

    let animated = false;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !animated) {
                animated = true;
                const photoSupport = document.getElementById('photoSupportCount');
                const responsive = document.getElementById('responsiveCount');
                const loadTime = document.getElementById('galleryLoadCount');
                if (photoSupport) animateCount(photoSupport, 0, 500, 1800, 0, '', '+');
                if (responsive) animateCount(responsive, 0, 100, 1500, 0, '', '%');
                if (loadTime) animateCount(loadTime, 3, 1, 1200, 0, '<', 's');
                observer.disconnect();
            }
        });
    }, { threshold: 0.4 });
    observer.observe(statsSection);
}

// Replace ALL four hero images with the most recent uploaded photos
async function updateHeroImages() {
    try {
        const res = await fetch('/api/photos');
        if (!res.ok) throw new Error('Failed to fetch hero photos');

        const photos = await res.json();
        if (!Array.isArray(photos) || photos.length === 0) return;

        const heroImageIds = ['heroImage1', 'heroImage2', 'heroImage3', 'heroImage4'];
        heroImageIds.forEach((id, index) => {
            const img = document.getElementById(id);
            const photo = photos[index];
            if (img && photo) {
                img.src = photo.src;
                img.alt = photo.title ? `${photo.title} uploaded recently` : `Recently uploaded photo ${index + 1}`;
                img.onerror = null; // remove old onerror fallback
            }
        });
    } catch (err) {
        console.error('Could not load hero photos', err);
    }
}

// Arch Carousel Initialization and Rotation Logic
let archOffsetDegree = 0;
let currentHomeArchPhotos = [];
let currentHomeArchIndex = 0;

function updateHomeLightboxDisplay() {
    if (!currentHomeArchPhotos || currentHomeArchPhotos.length === 0) return;
    const photo = currentHomeArchPhotos[currentHomeArchIndex];
    if (!photo) return;

    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const stage = document.getElementById('homeLightboxStage');

    if (lightboxImg) {
        lightboxImg.src = photo.src;
        lightboxImg.alt = photo.title || 'Exhibition photograph';

        const applyAspect = () => {
            if (stage && lightboxImg.naturalWidth && lightboxImg.naturalHeight) {
                stage.style.aspectRatio = `${lightboxImg.naturalWidth} / ${lightboxImg.naturalHeight}`;
            }
        };
        lightboxImg.onload = applyAspect;
        if (lightboxImg.complete) {
            applyAspect();
        }
    }

    if (lightboxCaption) {
        const uploader = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
        const avatarUrl = photo.userAvatar || '';
        const avatarMarkup = avatarUrl
            ? `<img src="${avatarUrl}" alt="${uploader}" class="creator-avatar-img">`
            : `<i class="fas fa-user"></i>`;

        lightboxCaption.innerHTML = `
            <a href="profile.html?username=${encodeURIComponent(uploader)}" class="lightbox-creator-badge" title="View @${uploader}'s profile">
                <div class="creator-badge-avatar">
                    ${avatarMarkup}
                </div>
                <span class="creator-badge-handle">@${uploader}</span>
            </a>
        `;
    }

    const prevBtn = document.getElementById('homeLightboxPrev');
    const nextBtn = document.getElementById('homeLightboxNext');
    const hasMultiple = currentHomeArchPhotos.length > 1;
    if (prevBtn) prevBtn.style.display = hasMultiple ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = hasMultiple ? 'flex' : 'none';
}

window.navigateHomeLightbox = function(direction) {
    if (!currentHomeArchPhotos || currentHomeArchPhotos.length <= 1) return;
    currentHomeArchIndex = (currentHomeArchIndex + direction + currentHomeArchPhotos.length) % currentHomeArchPhotos.length;
    updateHomeLightboxDisplay();
};

window.shareCurrentHomePhoto = function() {
    const photo = currentHomeArchPhotos[currentHomeArchIndex];
    const src = photo ? photo.src : (document.getElementById('lightbox-img')?.src || window.location.href);
    const title = (photo && photo.title) ? photo.title : 'AfterGlow Photograph';
    const uploader = (photo && photo.username) ? photo.username : 'photographer';
    if (typeof window.sharePhoto === 'function') {
        window.sharePhoto(src, title, uploader);
    } else {
        window.copyPhotoLink(src);
    }
};

window.downloadCurrentHomePhoto = function() {
    const photo = currentHomeArchPhotos[currentHomeArchIndex];
    const src = photo ? photo.src : (document.getElementById('lightbox-img')?.src || '');
    const rawTitle = (photo && photo.title) ? photo.title : 'AfterGlow-Photograph';
    const safeFilename = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_') + '.jpg';
    window.downloadPhotoFile(src, safeFilename);
};

async function initArchCarousel() {
    const archContainer = document.getElementById('archCarousel');
    const wrapper = document.querySelector('.arch-carousel-wrapper');
    if (!archContainer || !wrapper) return;

    try {
        const res = await fetch('/api/photos');
        if (!res.ok) throw new Error('Failed to fetch arch photos');
        const photos = await res.json();

        if (!Array.isArray(photos) || photos.length === 0) return;

        // Take up to 11 chronological photos for a wide smooth arc
        const archPhotos = photos.slice(0, 11);
        currentHomeArchPhotos = archPhotos;
        archContainer.innerHTML = '';

        const spacing = 15;
        const startAngle = -Math.floor(archPhotos.length / 2) * spacing;
        const maxOffset = Math.abs(startAngle);

        let archNodes = [];

        archPhotos.forEach((photo, index) => {
            const angle = startAngle + (index * spacing);
            const div = document.createElement('div');
            div.className = 'arch-item';
            div.dataset.angle = angle;
            div.style.transform = `rotate(${angle}deg)`;

            const img = document.createElement('img');
            img.src = photo.src;
            img.alt = photo.title || `Gallery Upload ${index}`;
            img.draggable = false;
            img.onerror = () => { img.src = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=300&auto=format&fit=crop'; };

            div.appendChild(img);
            archContainer.appendChild(div);
            archNodes.push(div);

            // Lightbox / Click rotation interaction
            div.addEventListener('click', () => {
                if (wrapper.dataset.isDragging === 'true') return;

                const absoluteAngle = Math.round(parseFloat(div.dataset.angle) + archOffsetDegree);

                if (Math.abs(absoluteAngle) < 3) {
                    // Center image -> Open Lightbox
                    currentHomeArchIndex = index;
                    updateHomeLightboxDisplay();
                    const lightbox = document.getElementById('lightbox');
                    if (lightbox) {
                        lightbox.classList.add('modal-active');
                    }
                } else {
                    // Rotate clicked item to center
                    rotateCarouselTo(archOffsetDegree - absoluteAngle);
                }
            });
        });

        // Fast GPU state update
        const updateActiveItem = () => {
            archNodes.forEach((node) => {
                const baseAngle = parseFloat(node.dataset.angle);
                const absoluteAngle = Math.round(baseAngle + archOffsetDegree);
                const isCenter = Math.abs(absoluteAngle) < 3;

                node.style.zIndex = isCenter ? 10 : 1;
                node.style.opacity = isCenter ? '1' : (Math.abs(absoluteAngle) > 45 ? '0.2' : '0.6');
                node.classList.toggle('active', isCenter);
            });
        };

        const rotateCarouselTo = (targetDegree) => {
            archOffsetDegree = Math.max(-maxOffset, Math.min(maxOffset, targetDegree));
            archContainer.style.transform = `rotate(${archOffsetDegree}deg)`;
            updateActiveItem();
        };

        // Initialize carousel positioning
        rotateCarouselTo(0);

        // Control Buttons
        const prevBtn = document.getElementById('archPrev');
        const nextBtn = document.getElementById('archNext');

        if (prevBtn) {
            prevBtn.onclick = () => rotateCarouselTo(archOffsetDegree + spacing);
        }
        if (nextBtn) {
            nextBtn.onclick = () => rotateCarouselTo(archOffsetDegree - spacing);
        }

        // --- CURSOR & TOUCH DRAG ROTATION ---
        let startX = 0;
        let startDegree = 0;
        let isPointerDown = false;
        let hasMoved = false;

        const onPointerDown = (e) => {
            if (e.target.closest('.arch-btn')) return;
            isPointerDown = true;
            hasMoved = false;
            wrapper.dataset.isDragging = 'false';
            startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            startDegree = archOffsetDegree;
            archContainer.classList.add('dragging');
            wrapper.classList.add('grabbing');
        };

        const onPointerMove = (e) => {
            if (!isPointerDown) return;
            const currentX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            const deltaX = currentX - startX;

            if (Math.abs(deltaX) > 5) {
                hasMoved = true;
                wrapper.dataset.isDragging = 'true';
            }

            // Convert horizontal cursor drag delta into rotation angle
            const degreeDelta = deltaX * 0.15;
            rotateCarouselTo(startDegree + degreeDelta);
        };

        const onPointerUp = () => {
            if (!isPointerDown) return;
            isPointerDown = false;
            archContainer.classList.remove('dragging');
            wrapper.classList.remove('grabbing');

            if (hasMoved) {
                // Snap cleanly to nearest item angle step
                const snappedDegree = Math.round(archOffsetDegree / spacing) * spacing;
                rotateCarouselTo(snappedDegree);
                setTimeout(() => { wrapper.dataset.isDragging = 'false'; }, 50);
            }
        };

        wrapper.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        wrapper.addEventListener('touchstart', onPointerDown, { passive: true });
        window.addEventListener('touchmove', onPointerMove, { passive: true });
        window.addEventListener('touchend', onPointerUp);

    } catch (err) {
        console.error("Arch Carousel Error", err);
    }
}


// Global Lightbox close handlers (used by gallery.js)
function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.remove('modal-active');
    }
}

document.addEventListener('click', function (e) {
    const lightbox = document.getElementById('lightbox');
    if (lightbox && e.target === lightbox) {
        closeLightbox();
    }
});

document.addEventListener('keydown', function (e) {
    const lightbox = document.getElementById('lightbox');
    const isLbActive = lightbox && (lightbox.classList.contains('modal-active') || lightbox.style.display === 'block' || lightbox.style.display === 'flex');
    if (lightbox && e.key === 'Escape' && isLbActive) {
        closeLightbox();
    } else if (isLbActive && typeof window.navigateHomeLightbox === 'function' && document.getElementById('archCarousel')) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            window.navigateHomeLightbox(-1);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            window.navigateHomeLightbox(1);
        }
    }
});

// Touch & Mouse Drag Swipe support for home lightbox
document.addEventListener('DOMContentLoaded', function () {
    const stage = document.getElementById('homeLightboxStage');
    if (stage && document.getElementById('archCarousel')) {
        let touchStartX = 0;
        let touchStartY = 0;
        let isTouchSwiping = false;

        stage.addEventListener('touchstart', (e) => {
            if (e.target.closest('.lightbox-dock-overlay') || e.target.closest('.lightbox-nav-btn') || e.target.closest('.close-lightbox')) return;
            if (e.touches && e.touches[0]) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isTouchSwiping = true;
            }
        }, { passive: true });

        stage.addEventListener('touchmove', (e) => {
            if (!isTouchSwiping || !e.touches || !e.touches[0]) return;
            const diffX = e.touches[0].clientX - touchStartX;
            const diffY = e.touches[0].clientY - touchStartY;
            if (Math.abs(diffX) > Math.abs(diffY)) {
                stage.style.transform = `translateX(${diffX * 0.4}px)`;
            }
        }, { passive: true });

        stage.addEventListener('touchend', (e) => {
            if (!isTouchSwiping) return;
            isTouchSwiping = false;
            stage.style.transition = 'transform 0.25s ease';
            stage.style.transform = '';
            if (e.changedTouches && e.changedTouches[0]) {
                const diffX = e.changedTouches[0].clientX - touchStartX;
                const diffY = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX < 0 && window.navigateHomeLightbox) window.navigateHomeLightbox(1);
                    else if (diffX > 0 && window.navigateHomeLightbox) window.navigateHomeLightbox(-1);
                }
            }
            setTimeout(() => { if (stage) stage.style.transition = ''; }, 260);
        }, { passive: true });

        // Desktop Mouse Drag Swipe
        let isMouseDown = false;
        let mouseStartX = 0;
        let hasDragged = false;

        stage.addEventListener('mousedown', (e) => {
            if (e.target.closest('.lightbox-dock-overlay') || e.target.closest('.lightbox-nav-btn') || e.target.closest('.close-lightbox')) return;
            isMouseDown = true;
            hasDragged = false;
            mouseStartX = e.clientX;
            stage.classList.add('dragging');
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMouseDown) return;
            const diffX = e.clientX - mouseStartX;
            if (Math.abs(diffX) > 5) {
                hasDragged = true;
                stage.style.transform = `translateX(${diffX * 0.45}px)`;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (!isMouseDown) return;
            isMouseDown = false;
            stage.classList.remove('dragging');
            stage.style.transition = 'transform 0.25s ease';
            stage.style.transform = '';
            if (hasDragged) {
                const diffX = e.clientX - mouseStartX;
                if (Math.abs(diffX) > 40) {
                    if (diffX < 0 && window.navigateHomeLightbox) window.navigateHomeLightbox(1);
                    else if (diffX > 0 && window.navigateHomeLightbox) window.navigateHomeLightbox(-1);
                }
            }
            setTimeout(() => { if (stage) stage.style.transition = ''; }, 260);
        });
    }
});

// --- REAL-TIME PHOTO UPDATE SYSTEM ---
window.photoUpdateCallbacks = window.photoUpdateCallbacks || [];
let realtimeChannel = null;

if (typeof BroadcastChannel !== 'undefined') {
    try {
        realtimeChannel = new BroadcastChannel('ag_photos_realtime');
        realtimeChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'photo_update') {
                triggerPhotoUpdates(event.data.payload);
            }
        };
    } catch (e) {
        console.warn('BroadcastChannel not supported', e);
    }
}

// Storage listener for fallback multi-tab sync
window.addEventListener('storage', (e) => {
    if (e.key === 'ag_photo_update_event' && e.newValue) {
        try {
            const data = JSON.parse(e.newValue);
            triggerPhotoUpdates(data);
        } catch (err) {}
    }
});

function triggerPhotoUpdates(payload = {}) {
    window.photoUpdateCallbacks.forEach(cb => {
        try { cb(payload); } catch (err) { console.error(err); }
    });
}

window.onRealtimePhotoUpdate = function(callback) {
    if (typeof callback === 'function') {
        window.photoUpdateCallbacks.push(callback);
    }
};

window.notifyPhotoAdded = function(payload = {}) {
    const eventData = { type: 'photo_update', action: 'added', timestamp: Date.now(), ...payload };
    if (realtimeChannel) {
        try { realtimeChannel.postMessage({ type: 'photo_update', payload: eventData }); } catch (e) {}
    }
    try {
        localStorage.setItem('ag_photo_update_event', JSON.stringify(eventData));
    } catch (e) {}
    triggerPhotoUpdates(eventData);
};

function setupRealtimeSSE() {
    if (typeof EventSource === 'undefined') return;

    try {
        const evtSource = new EventSource('/api/events');
        
        evtSource.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'photo_added' || data.type === 'photo_deleted') {
                    triggerPhotoUpdates(data);
                    showRealtimeToast(data.type === 'photo_added' ? '✨ New photo added to gallery!' : '🗑️ Photo updated in gallery');
                }
            } catch (err) {}
        };
    } catch (err) {
        console.warn('SSE connection failed', err);
    }
}

// Universal High-End Toast Notification System
window.showToast = function (message, type = 'info', duration = 3500) {
    let container = document.getElementById('ag-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'ag-toast-container';
        container.className = 'ag-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `ag-toast toast-${type}`;

    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    else if (type === 'error') iconClass = 'fa-circle-xmark';
    else if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <span class="ag-toast-icon"><i class="fas ${iconClass}"></i></span>
        <span class="ag-toast-text">${message}</span>
        <button class="ag-toast-close" aria-label="Close notification">&times;</button>
    `;

    container.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-show');
    });

    const removeToast = () => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 320);
    };

    const closeBtn = toast.querySelector('.ag-toast-close');
    if (closeBtn) closeBtn.addEventListener('click', removeToast);

    if (duration > 0) {
        setTimeout(removeToast, duration);
    }
};

function showRealtimeToast(msg) {
    window.showToast(msg, 'info', 4000);
}

// Universal High-Resolution Photo Downloader
window.downloadPhotoFile = async function (url, filename = 'AfterGlow-Photograph.jpg') {
    if (!url) return;
    window.showToast('📥 Downloading photograph...', 'info', 2200);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename || 'AfterGlow-Photograph.jpg';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        a.remove();
        window.showToast('✓ Photograph downloaded successfully!', 'success');
    } catch (e) {
        // Fallback for cross-origin or constrained environments
        const a = document.createElement('a');
        a.target = '_blank';
        a.href = url;
        a.download = filename || 'AfterGlow-Photograph.jpg';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.showToast('✓ Photograph opened for download!', 'success');
    }
};

// Universal Clipboard Copy Helper with Toast Notification
window.copyToClipboard = async function (text, message = '✨ Photo link copied to clipboard!') {
    let copied = false;
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            copied = true;
        }
    } catch (err) {
        // Fallback to execCommand if writeText fails
    }

    if (!copied) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            copied = document.execCommand('copy');
            ta.remove();
        } catch (e) {
            copied = false;
        }
    }

    if (typeof window.showToast === 'function') {
        window.showToast(message, 'success');
    }
    return copied;
};

// Universal Share / Copy Link Helper
window.copyPhotoLink = function (url) {
    const targetUrl = url || window.location.href;
    window.copyToClipboard(targetUrl, '✨ Photo link copied to clipboard!');
};

// Universal Interactive Glassmorphic Share Modal
window.closeShareModal = function () {
    const overlay = document.getElementById('ag-share-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
};

window.openShareModal = function ({ url, title, uploader } = {}) {
    const shareUrl = url || window.location.href;
    const cleanUser = (uploader || 'photographer').replace(/^@/, '');
    const cleanTitle = title || 'Captivating Photograph';
    const shareText = `Check out "${cleanTitle}" by @${cleanUser} on AfterGlow!`;

    let overlay = document.getElementById('ag-share-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ag-share-overlay';
        overlay.className = 'ag-share-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Share photograph');

        overlay.innerHTML = `
            <div class="ag-share-card">
                <div class="ag-share-header">
                    <div class="ag-share-title-wrap">
                        <div class="ag-share-title-icon"><i class="fas fa-share-nodes"></i></div>
                        <div class="ag-share-titles">
                            <h3>Share Photograph</h3>
                            <p>Share this visual story across other apps</p>
                        </div>
                    </div>
                    <button type="button" class="ag-share-close-btn" id="ag-share-close-btn" aria-label="Close dialog">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="ag-share-preview">
                    <img class="ag-share-thumb" id="ag-share-thumb" src="" alt="Thumbnail preview">
                    <div class="ag-share-meta">
                        <div class="ag-share-item-title" id="ag-share-item-title"></div>
                        <div class="ag-share-item-author" id="ag-share-item-author"></div>
                    </div>
                </div>

                <div class="ag-share-section-label">Share to other apps</div>
                <div class="ag-share-grid">
                    <button type="button" class="ag-share-app-btn share-whatsapp" data-app="whatsapp" title="Share via WhatsApp">
                        <div class="ag-share-app-icon"><i class="fab fa-whatsapp"></i></div>
                        <span>WhatsApp</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-x" data-app="x" title="Share on X">
                        <div class="ag-share-app-icon">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </div>
                        <span>X / Twitter</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-telegram" data-app="telegram" title="Share on Telegram">
                        <div class="ag-share-app-icon"><i class="fab fa-telegram-plane"></i></div>
                        <span>Telegram</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-facebook" data-app="facebook" title="Share on Facebook">
                        <div class="ag-share-app-icon"><i class="fab fa-facebook-f"></i></div>
                        <span>Facebook</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-reddit" data-app="reddit" title="Share on Reddit">
                        <div class="ag-share-app-icon"><i class="fab fa-reddit-alien"></i></div>
                        <span>Reddit</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-native" data-app="native" title="More options on your device">
                        <div class="ag-share-app-icon"><i class="fas fa-ellipsis"></i></div>
                        <span>More Apps</span>
                    </button>
                </div>

                <div class="ag-share-section-label">Or copy direct link</div>
                <div class="ag-share-link-box">
                    <input type="text" class="ag-share-input" id="ag-share-input" readonly value="">
                    <button type="button" class="ag-share-copy-btn" id="ag-share-copy-btn" title="Copy photo link">
                        <i class="far fa-copy"></i>
                        <span>Copy</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) window.closeShareModal();
        });

        const closeBtn = overlay.querySelector('#ag-share-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', window.closeShareModal);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                window.closeShareModal();
            }
        });
    }

    // Populate data
    const thumbEl = overlay.querySelector('#ag-share-thumb');
    if (thumbEl) {
        thumbEl.src = shareUrl;
        thumbEl.onerror = () => { thumbEl.src = 'favicon.svg'; };
    }
    const titleEl = overlay.querySelector('#ag-share-item-title');
    if (titleEl) titleEl.innerText = cleanTitle;

    const authorEl = overlay.querySelector('#ag-share-item-author');
    if (authorEl) authorEl.innerText = `@${cleanUser}`;

    const inputEl = overlay.querySelector('#ag-share-input');
    if (inputEl) inputEl.value = shareUrl;

    const copyBtn = overlay.querySelector('#ag-share-copy-btn');
    if (copyBtn) {
        copyBtn.onclick = async () => {
            await window.copyToClipboard(shareUrl, '✨ Photo link copied to clipboard!');
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<i class="fas fa-check"></i> <span>Copied!</span>';
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = '<i class="far fa-copy"></i> <span>Copy</span>';
            }, 2000);
        };
    }

    // Configure App buttons
    const waBtn = overlay.querySelector('.ag-share-app-btn.share-whatsapp');
    if (waBtn) {
        waBtn.onclick = () => {
            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
            window.open(waUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const xBtn = overlay.querySelector('.ag-share-app-btn.share-x');
    if (xBtn) {
        xBtn.onclick = () => {
            const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
            window.open(xUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const tgBtn = overlay.querySelector('.ag-share-app-btn.share-telegram');
    if (tgBtn) {
        tgBtn.onclick = () => {
            const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
            window.open(tgUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const fbBtn = overlay.querySelector('.ag-share-app-btn.share-facebook');
    if (fbBtn) {
        fbBtn.onclick = () => {
            const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
            window.open(fbUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const rdBtn = overlay.querySelector('.ag-share-app-btn.share-reddit');
    if (rdBtn) {
        rdBtn.onclick = () => {
            const rdUrl = `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`;
            window.open(rdUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const nativeBtn = overlay.querySelector('.ag-share-app-btn.share-native');
    if (nativeBtn) {
        nativeBtn.onclick = () => {
            if (navigator.share) {
                navigator.share({
                    title: cleanTitle,
                    text: shareText,
                    url: shareUrl
                }).catch(() => {});
            } else {
                window.copyToClipboard(shareUrl, '✨ Photo link copied to clipboard!');
            }
        };
    }

    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });
};

// Universal Share Photo Entrypoint
window.sharePhoto = function (url, title, uploader) {
    window.openShareModal({ url, title, uploader });
};