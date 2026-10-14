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
                                <img src="${u.profile_picture_url || 'https://via.placeholder.com/40'}" alt="${u.username}">
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
                    const lightbox = document.getElementById('lightbox');
                    const lightboxImg = document.getElementById('lightbox-img');
                    const lightboxCaption = document.getElementById('lightbox-caption');

                    if (lightbox && lightboxImg) {
                        lightboxImg.src = photo.src;
                        const uploader = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
                        lightboxCaption.innerHTML = `
                            <a href="profile.html?username=${encodeURIComponent(uploader)}" class="lightbox-creator-badge" title="View @${uploader}'s profile">
                                <div class="creator-badge-avatar">
                                    <i class="fas fa-user"></i>
                                </div>
                                <span class="creator-badge-handle">@${uploader}</span>
                                <i class="fas fa-arrow-right creator-badge-arrow"></i>
                            </a>
                        `;
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
    if (lightbox && e.key === 'Escape' && (lightbox.classList.contains('modal-active') || lightbox.style.display === 'block' || lightbox.style.display === 'flex')) {
        closeLightbox();
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

function showRealtimeToast(msg) {
    let toast = document.getElementById('rt-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'rt-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            background: rgba(15, 23, 42, 0.95);
            color: #fff;
            padding: 12px 22px;
            border-radius: 30px;
            border: 1px solid var(--primary-color, #ec4899);
            box-shadow: 0 10px 30px rgba(236, 72, 153, 0.3);
            font-size: 0.9rem;
            font-weight: 500;
            z-index: 9999;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
            backdrop-filter: blur(12px);
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-bolt" style="color: var(--primary-color, #ec4899);"></i> ` + msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
    }, 4000);
}