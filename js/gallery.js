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

function setupGalleryLightboxSwipe() {
    const stage = document.getElementById('lightboxStage');
    const lb = document.getElementById('lightbox');
    if (!stage || !lb) return;

    // --- Touch Swipe (Mobile & Tablet) ---
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
                if (diffX < 0) navigateGalleryLightbox(1);
                else navigateGalleryLightbox(-1);
            }
        }
        setTimeout(() => { if (stage) stage.style.transition = ''; }, 260);
    }, { passive: true });

    // --- Mouse Drag Swipe (Desktop) ---
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
                if (diffX < 0) navigateGalleryLightbox(1);
                else navigateGalleryLightbox(-1);
            }
        }
        setTimeout(() => { if (stage) stage.style.transition = ''; }, 260);
    });
}

async function loadGallery() {
    try {
        const res = await fetch('/api/photos');
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
        return `
            <div class="gallery-item" data-id="${photo.id}" data-username="${cleanUser}" style="--index: ${index}">
                <img src="${photo.src}" alt="${photo.title || 'Exhibition photograph'}" loading="lazy">
                <div class="gallery-item-info">
                    <p>
                        <a href="profile.html?username=${encodeURIComponent(cleanUser)}">
                            <i class="fas fa-user-circle"></i> @${cleanUser}
                        </a>
                    </p>
                </div>
            </div>
        `;
    }).join('');

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
    }
}

function updateGalleryLightbox() {
    if (!allPhotos || allPhotos.length === 0) return;
    const photo = allPhotos[currentGalleryIndex];
    if (!photo) return;

    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCaption = document.getElementById('lightboxCaption');
    const stage = document.getElementById('lightboxStage');

    if (lightboxImage) {
        lightboxImage.src = photo.src;
        lightboxImage.alt = photo.title || 'Exhibition photograph';

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

    const prevBtn = document.getElementById('galleryLightboxPrev');
    const nextBtn = document.getElementById('galleryLightboxNext');
    const hasMultiple = allPhotos.length > 1;
    if (prevBtn) prevBtn.style.display = hasMultiple ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = hasMultiple ? 'flex' : 'none';
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
    const rawTitle = (photo && photo.title) ? photo.title : 'AfterGlow-Photograph';
    const safeFilename = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_') + '.jpg';
    if (typeof window.downloadPhotoFile === 'function') {
        window.downloadPhotoFile(src, safeFilename);
    }
}

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