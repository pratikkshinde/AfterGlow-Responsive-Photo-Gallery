let allPhotos = [];
let currentGalleryIndex = 0;
window.galleryAvatarCache = window.galleryAvatarCache || {};

// Load gallery on page load
document.addEventListener('DOMContentLoaded', () => {
    loadGallery();

    if (typeof window.onRealtimePhotoUpdate === 'function') {
        window.onRealtimePhotoUpdate(() => {
            loadGallery();
        });
    }

    // Touch & Mouse Drag Swipe support for gallery lightbox
    setupGalleryLightboxSwipe();

    // Close when clicking the dark backdrop outside the image stage
    const lb = document.getElementById('lightbox');
    if (lb) {
        lb.addEventListener('click', (e) => {
            if (e.target === lb) {
                closeLightbox();
            }
        });
    }
});

function getLoggedInUser() {
    const token = localStorage.getItem('ag_token');
    if (!token) return null;
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
        return null;
    }
}

function triggerDoubleTapHeart(stage, x, y) {
    if (!stage) return;

    const heart = document.createElement('div');
    heart.className = 'double-tap-heart';
    heart.innerHTML = '<i class="fas fa-heart"></i>';

    if (typeof x === 'number' && typeof y === 'number') {
        heart.style.left = `${x}px`;
        heart.style.top = `${y}px`;
    } else {
        heart.style.left = '50%';
        heart.style.top = '50%';
    }

    const randomRot = (Math.random() * 26 - 13).toFixed(1);
    heart.style.setProperty('--heart-rot', `${randomRot}deg`);

    stage.appendChild(heart);

    setTimeout(() => {
        if (heart && heart.parentNode) {
            heart.remove();
        }
    }, 850);
}

// --- Responsive Image Helper (supports Cloudinary & Unsplash dynamic variants) ---
function buildResponsiveImageMarkup(src, alt = 'Exhibition photograph', className = '', extraAttrs = '') {
    const safeAlt = (alt || 'Exhibition photograph').replace(/"/g, '&quot;');
    let srcset = '';
    const sizes = '(max-width: 480px) 50vw, (max-width: 960px) 50vw, (max-width: 1440px) 33vw, 25vw';

    if (src && src.includes('res.cloudinary.com') && src.includes('/upload/')) {
        const parts = src.split('/upload/');
        const base = parts[0] + '/upload/';
        const rest = parts[1].replace(/^(f_auto,q_auto[^\/]*\/|w_\d+[^\/]*\/)/, '');
        srcset = `${base}f_auto,q_auto,w_400/${rest} 400w, ${base}f_auto,q_auto,w_800/${rest} 800w, ${base}f_auto,q_auto,w_1200/${rest} 1200w, ${base}f_auto,q_auto,w_1600/${rest} 1600w`;
    } else if (src && src.includes('images.unsplash.com')) {
        const cleanBase = src.split('?')[0];
        srcset = `${cleanBase}?auto=format&fit=crop&w=400&q=80 400w, ${cleanBase}?auto=format&fit=crop&w=800&q=80 800w, ${cleanBase}?auto=format&fit=crop&w=1200&q=80 1200w, ${cleanBase}?auto=format&fit=crop&w=1600&q=80 1600w`;
    }

    const loadAttr = 'onload="this.classList.add(\'img-loaded\');"';
    if (srcset) {
        return `<img src="${src}" srcset="${srcset}" sizes="${sizes}" alt="${safeAlt}" class="${className}" loading="lazy" ${loadAttr} ${extraAttrs}>`;
    }
    return `<img src="${src}" alt="${safeAlt}" class="${className}" loading="lazy" ${loadAttr} ${extraAttrs}>`;
}
window.buildResponsiveImageMarkup = buildResponsiveImageMarkup;

function setupGalleryLightboxSwipe() {
    const stage = document.getElementById('lightboxStage');
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImage');
    if (!stage || !lb) return;

    // --- State Variables for Pinch-to-Zoom & Pan ---
    let currentScale = 1;
    let panX = 0;
    let panY = 0;
    let isPinching = false;
    let initialPinchDistance = 0;
    let initialScale = 1;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let lastTapTime = 0;

    function applyZoomTransform() {
        if (!img) return;
        if (currentScale <= 1.01) {
            img.style.transform = 'none';
        } else {
            img.style.transform = `scale(${currentScale}) translate(${panX / currentScale}px, ${panY / currentScale}px)`;
        }
    }

    function resetZoom(animated = true) {
        currentScale = 1;
        panX = 0;
        panY = 0;
        isPinching = false;
        isPanning = false;
        if (img) {
            if (animated) img.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
            else img.style.transition = '';
            img.style.transform = 'none';
            setTimeout(() => { if (img) img.style.transition = ''; }, 300);
        }
    }
    window.resetGalleryLightboxZoom = resetZoom;

    // Desktop double-click to like or reset zoom
    stage.addEventListener('dblclick', (e) => {
        if (e.target.closest('.lightbox-dock-overlay') || e.target.closest('.lightbox-nav-btn') || e.target.closest('.close-lightbox')) return;
        if (currentScale > 1.1) {
            resetZoom(true);
        } else {
            const rect = stage.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            triggerDoubleTapHeart(stage, x, y);
            toggleCurrentGalleryPhotoLike(true);
        }
    });

    // --- Touch Gestures (Pinch-to-zoom, Pan, Swipe-Down-To-Close, Horizontal Nav) ---
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchSwiping = false;

    stage.addEventListener('touchstart', (e) => {
        if (e.target.closest('.lightbox-dock-overlay') || e.target.closest('.lightbox-nav-btn') || e.target.closest('.close-lightbox')) return;

        if (e.touches.length === 2) {
            // Multi-touch pinch start
            isPinching = true;
            isTouchSwiping = false;
            isPanning = false;
            stage.style.transform = '';
            lb.style.backgroundColor = '';
            initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialScale = currentScale;
            if (img) img.style.transition = '';
            return;
        }

        if (e.touches.length === 1) {
            if (currentScale > 1.05) {
                // Zoomed in: pan image
                isPanning = true;
                panStartX = e.touches[0].clientX - panX;
                panStartY = e.touches[0].clientY - panY;
                if (img) img.style.transition = '';
                return;
            }

            // Normal 1x: Track swipe
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isTouchSwiping = true;
            stage.style.transition = '';
        }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
        if (isPinching && e.touches.length === 2) {
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (initialPinchDistance > 0) {
                const factor = currentDistance / initialPinchDistance;
                currentScale = Math.min(4, Math.max(0.85, initialScale * factor));
                applyZoomTransform();
            }
            return;
        }

        if (isPanning && e.touches.length === 1 && currentScale > 1.05) {
            panX = e.touches[0].clientX - panStartX;
            panY = e.touches[0].clientY - panStartY;
            const maxPanX = (stage.clientWidth * (currentScale - 1)) / 1.8;
            const maxPanY = (stage.clientHeight * (currentScale - 1)) / 1.8;
            panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
            panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
            applyZoomTransform();
            return;
        }

        if (!isTouchSwiping || !e.touches || !e.touches[0] || currentScale > 1.05) return;
        const diffX = e.touches[0].clientX - touchStartX;
        const diffY = e.touches[0].clientY - touchStartY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
            // Horizontal nav preview drag
            stage.style.transform = `translateX(${diffX * 0.4}px)`;
        } else if (diffY > 0) {
            // Vertical pull-down to close with spring damping and backdrop fade
            const damping = Math.min(diffY * 0.72, 260);
            const scale = Math.max(0.78, 1 - diffY / 900);
            stage.style.transform = `translateY(${damping}px) scale(${scale})`;
            const bgOpacity = Math.max(0.15, 0.94 - (diffY / 420));
            lb.style.backgroundColor = `rgba(4, 5, 8, ${bgOpacity})`;
        }
    }, { passive: true });

    stage.addEventListener('touchend', (e) => {
        if (isPinching) {
            isPinching = false;
            if (currentScale < 1.05) {
                resetZoom(true);
            }
            return;
        }

        if (isPanning) {
            isPanning = false;
            return;
        }

        if (!isTouchSwiping) return;
        isTouchSwiping = false;

        if (e.changedTouches && e.changedTouches[0]) {
            const touchX = e.changedTouches[0].clientX;
            const touchY = e.changedTouches[0].clientY;
            const diffX = touchX - touchStartX;
            const diffY = touchY - touchStartY;

            // Stationary tap: check for double tap
            if (Math.abs(diffX) < 18 && Math.abs(diffY) < 18) {
                const now = Date.now();
                const tapDiff = now - lastTapTime;
                if (tapDiff < 320 && tapDiff > 40) {
                    if (currentScale > 1.1) {
                        resetZoom(true);
                    } else {
                        const rect = stage.getBoundingClientRect();
                        const x = touchX - rect.left;
                        const y = touchY - rect.top;
                        triggerDoubleTapHeart(stage, x, y);
                        if (typeof window.agHaptic === 'function') window.agHaptic('heart');
                        toggleCurrentGalleryPhotoLike(true);
                    }
                    lastTapTime = 0;
                    return;
                } else {
                    lastTapTime = now;
                }
            } else if (diffY > 70 && diffY > Math.abs(diffX) * 1.15) {
                // Vertical Swipe-to-close triggered!
                if (typeof window.agHaptic === 'function') window.agHaptic('dismiss');
                stage.style.transition = 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.24s ease-out';
                stage.style.transform = 'translateY(110vh) scale(0.6)';
                stage.style.opacity = '0';
                setTimeout(() => {
                    closeLightbox();
                    stage.style.transform = '';
                    stage.style.opacity = '';
                    stage.style.transition = '';
                    lb.style.backgroundColor = '';
                    resetZoom(false);
                }, 240);
                return;
            } else if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
                // Horizontal navigation
                if (typeof window.agHaptic === 'function') window.agHaptic('light');
                if (diffX < 0) navigateGalleryLightbox(1);
                else navigateGalleryLightbox(-1);
            }
        }

        // Reset spring snap back
        stage.style.transition = 'transform 0.25s ease';
        stage.style.transform = '';
        lb.style.backgroundColor = '';
        setTimeout(() => { if (stage) stage.style.transition = ''; }, 260);
    }, { passive: true });

    // --- Mouse Drag Swipe & Pan (Desktop) ---
    let isMouseDown = false;
    let mouseStartX = 0;
    let mouseStartY = 0;
    let hasDragged = false;

    stage.addEventListener('mousedown', (e) => {
        if (e.target.closest('.lightbox-dock-overlay') || e.target.closest('.lightbox-nav-btn') || e.target.closest('.close-lightbox')) return;
        isMouseDown = true;
        hasDragged = false;
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
        stage.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const diffX = e.clientX - mouseStartX;
        const diffY = e.clientY - mouseStartY;

        if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
            hasDragged = true;
            if (currentScale > 1.05) {
                panX += diffX * 0.6;
                panY += diffY * 0.6;
                mouseStartX = e.clientX;
                mouseStartY = e.clientY;
                applyZoomTransform();
            } else if (Math.abs(diffX) > Math.abs(diffY)) {
                stage.style.transform = `translateX(${diffX * 0.45}px)`;
            } else if (diffY > 0) {
                const damping = Math.min(diffY * 0.65, 200);
                stage.style.transform = `translateY(${damping}px) scale(${Math.max(0.85, 1 - diffY / 900)})`;
                lb.style.backgroundColor = `rgba(4, 5, 8, ${Math.max(0.2, 0.94 - (diffY / 400))})`;
            }
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (!isMouseDown) return;
        isMouseDown = false;
        stage.classList.remove('dragging');
        stage.style.transition = 'transform 0.25s ease';
        stage.style.transform = '';
        lb.style.backgroundColor = '';

        if (hasDragged && currentScale <= 1.05) {
            const diffX = e.clientX - mouseStartX;
            const diffY = e.clientY - mouseStartY;
            if (diffY > 80 && diffY > Math.abs(diffX)) {
                closeLightbox();
                resetZoom(false);
            } else if (Math.abs(diffX) > 40) {
                if (diffX < 0) navigateGalleryLightbox(1);
                else navigateGalleryLightbox(-1);
            }
        }
        setTimeout(() => { if (stage) stage.style.transition = ''; }, 260);
    });
}

async function loadGallery() {
    try {
        const token = localStorage.getItem('ag_token');
        const headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const res = await fetch('/api/photos', { headers });
        if (res.ok) {
            allPhotos = await res.json();
            displayGallery(allPhotos);
        } else {
            console.error('Failed to fetch photos');
        }
    } catch (err) {
        console.error('Error fetching photos:', err);
    }
}

function displayGallery(photos) {
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) return;

    // Update live count badge if present
    const countBadge = document.getElementById('galleryLiveCount');
    if (countBadge) {
        countBadge.textContent = `${photos.length} Works Archived`;
    }

    if (photos.length === 0) {
        galleryGrid.innerHTML = `
            <div class="loading">
                <i class="fas fa-camera-retro" style="font-size: 2.2rem; color: var(--primary-light); margin-bottom: 1rem; display: block;"></i>
                No photographs discovered yet. Be the first to upload to the collection!
            </div>
        `;
        return;
    }

    galleryGrid.innerHTML = photos.map((photo, index) => {
        const cleanUser = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
        
        let avatarUrl = photo.userAvatar || window.galleryAvatarCache[cleanUser] || '';
        if (photo.userAvatar) {
            window.galleryAvatarCache[cleanUser] = photo.userAvatar;
        }

        const avatarMarkup = avatarUrl
            ? `<img src="${avatarUrl}" alt="${cleanUser}" class="gallery-avatar-img" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">`
            : `<i class="fas fa-user"></i>`;

        return `
            <div class="gallery-item" data-id="${photo.id}" data-username="${cleanUser}" style="--index: ${index}">
                ${buildResponsiveImageMarkup(photo.src, photo.title || 'Exhibition photograph', 'gallery-photo-img', 'onerror="this.onerror=null; this.src=\'https://images.unsplash.com/photo-1506744012022-df38ba83437e?q=80&w=800&auto=format&fit=crop\';"')}
                <div class="gallery-item-info">
                    <a href="profile.html?username=${encodeURIComponent(cleanUser)}" 
                       class="gallery-creator-badge" 
                       onclick="event.stopPropagation();" 
                       title="View @${cleanUser}'s profile">
                        <div class="gallery-avatar-wrap" data-avatar-user="${cleanUser}">
                            ${avatarMarkup}
                        </div>
                        <span class="gallery-creator-handle">@${cleanUser}</span>
                    </a>
                </div>
            </div>
        `;
    }).join('');

    // Asynchronously fetch missing avatars for creators not yet cached
    const pendingUsers = new Set();
    photos.forEach(photo => {
        const cleanUser = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
        if (!photo.userAvatar && !window.galleryAvatarCache[cleanUser] && cleanUser !== 'unknown' && cleanUser !== 'creator') {
            pendingUsers.add(cleanUser);
        }
    });

    pendingUsers.forEach(username => {
        fetch(`/api/user/public/${encodeURIComponent(username)}`)
            .then(r => r.ok ? r.json() : null)
            .then(userData => {
                if (userData && userData.profile_picture_url) {
                    window.galleryAvatarCache[username] = userData.profile_picture_url;
                    document.querySelectorAll(`.gallery-avatar-wrap[data-avatar-user="${username}"]`).forEach(wrap => {
                        wrap.innerHTML = `<img src="${userData.profile_picture_url}" alt="${username}" class="gallery-avatar-img" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">`;
                    });
                }
            })
            .catch(() => {});
    });

    const galleryItems = document.querySelectorAll('.gallery-item');

    galleryItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            openGalleryLightboxByIndex(index);
        });
    });

    const closeBtn = document.querySelector('.close-lightbox');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeLightbox);
    }
}

function openGalleryLightboxByIndex(index) {
    if (!allPhotos || allPhotos.length === 0) return;
    currentGalleryIndex = Math.max(0, Math.min(index, allPhotos.length - 1));
    updateGalleryLightbox();

    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.add('modal-active');
        document.body.classList.add('lightbox-open');
    }
}

function updateGalleryLightbox() {
    if (!allPhotos || allPhotos.length === 0) return;
    const photo = allPhotos[currentGalleryIndex];
    if (!photo) return;

    if (typeof window.resetGalleryLightboxZoom === 'function') {
        window.resetGalleryLightboxZoom(false);
    }

    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCaption = document.getElementById('lightboxCaption');
    const stage = document.getElementById('lightboxStage');

    if (lightboxImage) {
        lightboxImage.src = photo.src;
        lightboxImage.alt = photo.title || 'Exhibition photograph';
        lightboxImage.onerror = () => {
            if (stage) stage.style.aspectRatio = '4 / 3';
        };

        const applyAspect = () => {
            if (stage && lightboxImage.naturalWidth && lightboxImage.naturalHeight) {
                stage.style.aspectRatio = `${lightboxImage.naturalWidth} / ${lightboxImage.naturalHeight}`;
            }
        };

        lightboxImage.onload = applyAspect;
        if (lightboxImage.complete) {
            applyAspect();
        }
    }

    if (lightboxCaption) {
        const cleanUser = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
        const avatarCache = window.galleryAvatarCache;

        let avatarContent = `<i class="fas fa-user"></i>`;
        if (photo.userAvatar) {
            avatarContent = `<img src="${photo.userAvatar}" alt="${cleanUser}" class="creator-avatar-img">`;
            avatarCache[cleanUser] = photo.userAvatar;
        } else if (avatarCache[cleanUser]) {
            avatarContent = `<img src="${avatarCache[cleanUser]}" alt="${cleanUser}" class="creator-avatar-img">`;
        } else {
            // Asynchronously fetch avatar if available
            fetch(`/api/user/public/${encodeURIComponent(cleanUser)}`)
                .then(r => r.ok ? r.json() : null)
                .then(userData => {
                    if (userData && userData.profile_picture_url) {
                        avatarCache[cleanUser] = userData.profile_picture_url;
                        const curPhoto = allPhotos[currentGalleryIndex];
                        if (curPhoto && (curPhoto.username || '').toLowerCase() === cleanUser) {
                            const avEl = document.querySelector('#lightboxCaption .creator-badge-avatar');
                            if (avEl) {
                                avEl.innerHTML = `<img src="${userData.profile_picture_url}" alt="${cleanUser}" class="creator-avatar-img">`;
                            }
                        }
                    }
                })
                .catch(() => {});
        }

        lightboxCaption.innerHTML = `
            <a href="profile.html?username=${encodeURIComponent(cleanUser)}" class="lightbox-creator-badge" title="View @${cleanUser}'s profile">
                <div class="creator-badge-avatar">
                    ${avatarContent}
                </div>
                <span class="creator-badge-handle">@${cleanUser}</span>
            </a>
        `;
    }

    // Update Like Button & Privacy-Protected Count
    const me = getLoggedInUser();
    const cleanUser = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
    const myUsername = me && me.username ? me.username.toLowerCase() : '';
    const myId = me && (me.id || me._id);
    const isUploader = !!(photo.isUploader || (myId && photo.uploaderId && String(myId) === String(photo.uploaderId)) || (myUsername && myUsername === cleanUser));

    const isLiked = !!(photo.isLiked || localStorage.getItem('ag_photo_liked_' + photo.id) === 'true');

    const likeBtn = document.getElementById('galleryLightboxLikeBtn');
    const heartIcon = document.getElementById('galleryLightboxHeartIcon');
    const countEl = document.getElementById('galleryLightboxLikeCount');

    if (likeBtn && heartIcon) {
        if (isLiked) {
            likeBtn.classList.add('liked');
            heartIcon.className = 'fas fa-heart liked';
        } else {
            likeBtn.classList.remove('liked');
            heartIcon.className = 'far fa-heart';
        }

        if (countEl) {
            const countVal = (typeof photo.likesCount === 'number') ? photo.likesCount : (Array.isArray(photo.likes) ? photo.likes.length : 0);
            if (isUploader && countVal > 0) {
                countEl.textContent = countVal;
                countEl.style.display = 'inline-block';
                likeBtn.classList.add('has-count');
                likeBtn.setAttribute('title', `${countVal} like${countVal === 1 ? '' : 's'}`);
            } else {
                countEl.textContent = '';
                countEl.style.display = 'none';
                likeBtn.classList.remove('has-count');
                likeBtn.setAttribute('title', isUploader ? (countVal > 0 ? `${countVal} likes` : 'No likes yet') : (isLiked ? 'Unlike photograph' : 'Like photograph'));
            }
        }
    }

    const prevBtn = document.getElementById('galleryLightboxPrev');
    const nextBtn = document.getElementById('galleryLightboxNext');
    const hasMultiple = allPhotos.length > 1;
    if (prevBtn) prevBtn.style.display = hasMultiple ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = hasMultiple ? 'flex' : 'none';
}

async function toggleCurrentGalleryPhotoLike(forceLike = false) {
    if (!allPhotos || allPhotos.length === 0) return;
    const photo = allPhotos[currentGalleryIndex];
    if (!photo || !photo.id) return;

    const token = localStorage.getItem('ag_token');
    if (!token) {
        if (window.confirm('Please sign in or create an account to like photographs. Go to login?')) {
            window.location.href = 'auth.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        }
        return;
    }

    const me = getLoggedInUser();
    const cleanUser = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
    const myUsername = me && me.username ? me.username.toLowerCase() : '';
    const myId = me && (me.id || me._id);
    const isUploader = !!(photo.isUploader || (myId && photo.uploaderId && String(myId) === String(photo.uploaderId)) || (myUsername && myUsername === cleanUser));

    const currentlyLiked = !!(photo.isLiked || localStorage.getItem('ag_photo_liked_' + photo.id) === 'true');

    // Instagram behavior: double-tap always sets like (does not unlike if already liked)
    if (forceLike && currentlyLiked) {
        return;
    }

    const newLikedState = forceLike ? true : !currentlyLiked;
    photo.isLiked = newLikedState;

    if (typeof window.agHaptic === 'function') {
        window.agHaptic(newLikedState ? 'heart' : 'light');
    }

    if (newLikedState) {
        localStorage.setItem('ag_photo_liked_' + photo.id, 'true');
    } else {
        localStorage.removeItem('ag_photo_liked_' + photo.id);
    }

    // If uploader, update count optimistically
    if (isUploader && typeof photo.likesCount === 'number') {
        photo.likesCount = Math.max(0, photo.likesCount + (newLikedState ? 1 : -1));
    }

    // Immediately update UI
    const likeBtn = document.getElementById('galleryLightboxLikeBtn');
    const heartIcon = document.getElementById('galleryLightboxHeartIcon');
    const countEl = document.getElementById('galleryLightboxLikeCount');

    if (likeBtn && heartIcon) {
        if (newLikedState) {
            likeBtn.classList.add('liked');
            heartIcon.className = 'fas fa-heart liked';
        } else {
            likeBtn.classList.remove('liked');
            heartIcon.className = 'far fa-heart';
        }

        if (countEl) {
            const curCount = (typeof photo.likesCount === 'number') ? photo.likesCount : 0;
            if (isUploader && curCount > 0) {
                countEl.textContent = curCount;
                countEl.style.display = 'inline-block';
                likeBtn.classList.add('has-count');
                likeBtn.setAttribute('title', `${curCount} like${curCount === 1 ? '' : 's'}`);
            } else {
                countEl.textContent = '';
                countEl.style.display = 'none';
                likeBtn.classList.remove('has-count');
                likeBtn.setAttribute('title', isUploader ? 'No likes yet' : (newLikedState ? 'Unlike photograph' : 'Like photograph'));
            }
        }
    }

    // Send API request
    try {
        const res = await fetch(`/api/photos/${photo.id}/like`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        if (res.ok) {
            const data = await res.json();
            photo.isLiked = data.liked;
            if (data.liked) {
                localStorage.setItem('ag_photo_liked_' + photo.id, 'true');
            } else {
                localStorage.removeItem('ag_photo_liked_' + photo.id);
            }
            if (isUploader && typeof data.likesCount === 'number') {
                photo.likesCount = data.likesCount;
                if (countEl) {
                    if (data.likesCount > 0) {
                        countEl.textContent = data.likesCount;
                        countEl.style.display = 'inline-block';
                        likeBtn.classList.add('has-count');
                    } else {
                        countEl.textContent = '';
                        countEl.style.display = 'none';
                        likeBtn.classList.remove('has-count');
                    }
                }
            }
        }
    } catch (err) {
        console.error('Like toggle error:', err);
    }
}

function navigateGalleryLightbox(direction) {
    if (!allPhotos || allPhotos.length <= 1) return;
    currentGalleryIndex = (currentGalleryIndex + direction + allPhotos.length) % allPhotos.length;
    updateGalleryLightbox();
}

function shareCurrentGalleryPhoto() {
    const photo = allPhotos[currentGalleryIndex];
    const src = photo ? photo.src : (document.getElementById('lightboxImage')?.src || window.location.href);
    const title = photo?.title || 'AfterGlow Photograph';
    const uploader = (photo?.username || '').replace(/^@/, '');
    if (typeof window.sharePhoto === 'function') {
        window.sharePhoto(src, title, uploader);
    } else if (typeof window.copyPhotoLink === 'function') {
        window.copyPhotoLink(src);
    }
}

function downloadCurrentGalleryPhoto() {
    const photo = allPhotos[currentGalleryIndex];
    const src = photo ? photo.src : (document.getElementById('lightboxImage')?.src || '');
    const cleanTitle = (typeof window.formatPhotoDisplayTitle === 'function')
        ? window.formatPhotoDisplayTitle(photo?.title, photo?.username)
        : ((photo && photo.title) ? photo.title : 'AfterGlow-Photograph');
    const safeFilename = cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') + '.jpg';
    if (typeof window.downloadPhotoFile === 'function') {
        window.downloadPhotoFile(src, safeFilename || 'AfterGlow-Photograph.jpg');
    }
}

// Global exports for keyboard shortcuts & UI buttons
window.toggleCurrentGalleryPhotoLike = toggleCurrentGalleryPhotoLike;
window.shareCurrentGalleryPhoto = shareCurrentGalleryPhoto;
window.downloadCurrentGalleryPhoto = downloadCurrentGalleryPhoto;
window.navigateGalleryLightbox = navigateGalleryLightbox;

// Arrow Key Navigation
document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lightbox');
    if (lb && (lb.classList.contains('modal-active') || lb.style.display === 'flex' || lb.style.display === 'block')) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            navigateGalleryLightbox(-1);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            navigateGalleryLightbox(1);
        }
    }
});