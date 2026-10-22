// Navigation Drawer Controller
function initNavigationDrawer() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const navBackdrop = document.getElementById('navBackdrop');
    const navDrawerClose = document.getElementById('navDrawerClose');

    if (!navLinks) return;

    function setDrawerState(open) {
        navLinks.classList.toggle('active', open);
        if (navBackdrop) {
            navBackdrop.classList.toggle('active', open);
        }
        document.body.classList.toggle('nav-drawer-open', open);

        if (hamburger) {
            hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
            const icon = hamburger.querySelector('i');
            if (icon) {
                if (open) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        }
    }

    if (hamburger) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = navLinks.classList.contains('active');
            setDrawerState(!isOpen);
        });
    }

    if (navDrawerClose) {
        navDrawerClose.addEventListener('click', (e) => {
            e.stopPropagation();
            setDrawerState(false);
        });
    }

    if (navBackdrop) {
        navBackdrop.addEventListener('click', () => {
            setDrawerState(false);
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
            setDrawerState(false);
        }
    });

    // Close drawer when a navigation link is clicked (mobile)
    navLinks.querySelectorAll('a:not(.search-dropdown a)').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 960) {
                setDrawerState(false);
            }
        });
    });

    // Reset drawer state on desktop resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 960 && navLinks.classList.contains('active')) {
            setDrawerState(false);
        }
    }, { passive: true });
}

initNavigationDrawer();

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

// Global Search & Instant Creator Suggestions on Tap
const CURATED_DEFAULT_CREATORS = [
    { username: 'pratik_s', name: 'Pratik Shinde', full_name: 'Pratik Shinde', bio: 'Founder & Fine Art Visuals', profile_picture_url: 'uploads/profiles/1775980620187.jpeg' },
    { username: 'oliver_lens', name: 'Oliver Scott', full_name: 'Oliver Scott', bio: 'Monochrome & Fine Art', profile_picture_url: 'favicon.svg' },
    { username: 'elena_v', name: 'Elena Vance', full_name: 'Elena Vance', bio: 'Cinematic Portraits', profile_picture_url: 'favicon.svg' },
    { username: 'marcus_k', name: 'Marcus Kane', full_name: 'Marcus Kane', bio: 'Urban Street Stories', profile_picture_url: 'favicon.svg' },
    { username: 'sophia_art', name: 'Sophia Chen', full_name: 'Sophia Chen', bio: 'Atmospheric Landscapes', profile_picture_url: 'favicon.svg' }
];

let cachedSuggestedCreators = null;

async function getSuggestedCreators() {
    if (cachedSuggestedCreators && cachedSuggestedCreators.length >= 5) {
        return cachedSuggestedCreators;
    }

    const seenUsernames = new Set();
    const suggested = [];

    const addCreator = (u) => {
        if (!u) return;
        const rawUsername = u.username || '';
        const clean = rawUsername.replace(/^@/, '').toLowerCase().trim();
        if (!clean || clean === 'unknown' || seenUsernames.has(clean)) return;
        seenUsernames.add(clean);
        suggested.push({
            username: clean,
            name: u.full_name || u.name || clean,
            full_name: u.full_name || u.name || clean,
            bio: u.bio || '',
            profile_picture_url: u.profile_picture_url || ''
        });
    };

    // 1. Fetch from server suggested endpoint
    try {
        const res = await fetch('/api/users/suggested');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                data.forEach(addCreator);
            }
        }
    } catch (e) {}

    // 2. If fewer than 5, try server search endpoint
    if (suggested.length < 5) {
        try {
            const res2 = await fetch('/api/users/search');
            if (res2.ok) {
                const data2 = await res2.json();
                if (Array.isArray(data2)) {
                    data2.forEach(addCreator);
                }
            }
        } catch (e) {}
    }

    // 3. If still fewer than 5, extract unique creators from photo archive
    if (suggested.length < 5) {
        try {
            const pRes = await fetch('/api/photos');
            if (pRes.ok) {
                const photos = await pRes.json();
                if (Array.isArray(photos)) {
                    for (const p of photos) {
                        if (suggested.length >= 5) break;
                        const u = (p.username || '').replace(/^@/, '').toLowerCase().trim();
                        if (u && u !== 'unknown' && !seenUsernames.has(u)) {
                            addCreator({
                                username: u,
                                name: p.username || u,
                                full_name: p.username || u,
                                profile_picture_url: p.userAvatar || ''
                            });
                        }
                    }
                }
            }
        } catch (e) {}
    }

    // 4. Fill any remaining slots up to 5 from curated photography creators
    for (const c of CURATED_DEFAULT_CREATORS) {
        if (suggested.length >= 5) break;
        addCreator(c);
    }

    cachedSuggestedCreators = suggested.slice(0, 5);
    return cachedSuggestedCreators;
}

function renderSearchDropdown(dropdown, users, isSuggested = false, query = '') {
    if (!dropdown) return;

    if (!users || users.length === 0) {
        if (isSuggested) {
            dropdown.style.display = 'none';
        } else {
            dropdown.innerHTML = `<div class="search-no-results">No creators found for "${query}"</div>`;
            dropdown.style.display = 'flex';
        }
        return;
    }

    const header = isSuggested
        ? `<div class="search-dropdown-header"><i class="fas fa-fire"></i> Suggested Creators</div>`
        : `<div class="search-dropdown-header"><i class="fas fa-search"></i> Creators</div>`;

    const displayList = users.slice(0, 5);

    dropdown.innerHTML = header + displayList.map(u => {
        const cleanUser = (u.username || 'creator').replace(/^@/, '').toLowerCase();
        const displayName = u.full_name || u.name || cleanUser;
        const avatar = u.profile_picture_url || 'favicon.svg';

        return `
            <a href="profile.html?username=${encodeURIComponent(cleanUser)}" class="search-dropdown-item">
                <img src="${avatar}" onerror="this.src='favicon.svg'" alt="${cleanUser}">
                <div class="search-user-info">
                    <span class="search-user-name">${displayName}</span>
                    <span class="search-user-handle">@${cleanUser}</span>
                </div>
            </a>
        `;
    }).join('');

    dropdown.style.display = 'flex';
}

function initGlobalSearch() {
    const searchInputs = document.querySelectorAll('.global-search');

    searchInputs.forEach(input => {
        let debounceTimer;
        const dropdown = input.nextElementSibling;
        if (!dropdown) return;

        // Display 5 suggested users as soon as user taps or focuses on the search bar
        const triggerSuggestions = async () => {
            if (!input.value.trim()) {
                const suggested = await getSuggestedCreators();
                if (!input.value.trim()) {
                    renderSearchDropdown(dropdown, suggested, true);
                }
            }
        };

        // User tap / click / focus triggers instant dropdown of 5 suggested creators
        input.addEventListener('focus', triggerSuggestions);
        input.addEventListener('click', triggerSuggestions);
        input.addEventListener('mousedown', triggerSuggestions);
        input.addEventListener('touchstart', triggerSuggestions, { passive: true });

        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();

            if (query.length < 1) {
                // If cleared or empty, show suggested creators immediately
                triggerSuggestions();
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
                    if (!res.ok) throw new Error('Search failed');

                    const users = await res.json();
                    renderSearchDropdown(dropdown, users, false, query);
                } catch (err) {
                    console.error('User search error:', err);
                }
            }, 250);
        });

        // Hide dropdown when clicking/tapping outside
        const handleOutside = (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        };
        document.addEventListener('click', handleOutside);
        document.addEventListener('touchstart', handleOutside, { passive: true });
    });

    // Prefetch suggested creators in the background for zero-latency tap response
    getSuggestedCreators().catch(() => {});
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

    if (typeof window.resetHomeLightboxZoom === 'function') {
        window.resetHomeLightboxZoom(false);
    }

    if (lightboxImg) {
        lightboxImg.src = photo.src;
        lightboxImg.alt = photo.title || 'Exhibition photograph';
        lightboxImg.onerror = () => {
            if (stage) stage.style.aspectRatio = '4 / 3';
        };

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

    // Update Like Button & Privacy-Protected Count
    const me = (function() {
        const token = localStorage.getItem('ag_token');
        if (!token) return null;
        try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; }
    })();

    const cleanUser = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
    const myUsername = me && me.username ? me.username.toLowerCase() : '';
    const myId = me && (me.id || me._id);
    const isUploader = !!(photo.isUploader || (myId && photo.uploaderId && String(myId) === String(photo.uploaderId)) || (myUsername && myUsername === cleanUser));

    const isLiked = !!(photo.isLiked || localStorage.getItem('ag_photo_liked_' + photo.id) === 'true');

    const likeBtn = document.getElementById('homeLightboxLikeBtn');
    const heartIcon = document.getElementById('homeLightboxHeartIcon');
    const countEl = document.getElementById('homeLightboxLikeCount');

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

    const prevBtn = document.getElementById('homeLightboxPrev');
    const nextBtn = document.getElementById('homeLightboxNext');
    const hasMultiple = currentHomeArchPhotos.length > 1;
    if (prevBtn) prevBtn.style.display = hasMultiple ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = hasMultiple ? 'flex' : 'none';
}

window.triggerHomeDoubleTapHeart = function(stage, x, y) {
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
};

window.toggleCurrentHomePhotoLike = async function(forceLike = false) {
    if (!currentHomeArchPhotos || currentHomeArchPhotos.length === 0) return;
    const photo = currentHomeArchPhotos[currentHomeArchIndex];
    if (!photo || !photo.id) return;

    const token = localStorage.getItem('ag_token');
    if (!token) {
        if (window.confirm('Please sign in or create an account to like photographs. Go to login?')) {
            window.location.href = 'auth.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        }
        return;
    }

    const me = (function() {
        try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; }
    })();

    const cleanUser = (photo.username || 'creator').replace(/^@/, '').toLowerCase();
    const myUsername = me && me.username ? me.username.toLowerCase() : '';
    const myId = me && (me.id || me._id);
    const isUploader = !!(photo.isUploader || (myId && photo.uploaderId && String(myId) === String(photo.uploaderId)) || (myUsername && myUsername === cleanUser));

    const currentlyLiked = !!(photo.isLiked || localStorage.getItem('ag_photo_liked_' + photo.id) === 'true');

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

    if (isUploader && typeof photo.likesCount === 'number') {
        photo.likesCount = Math.max(0, photo.likesCount + (newLikedState ? 1 : -1));
    }

    const likeBtn = document.getElementById('homeLightboxLikeBtn');
    const heartIcon = document.getElementById('homeLightboxHeartIcon');
    const countEl = document.getElementById('homeLightboxLikeCount');

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
        console.error('Home photo like error:', err);
    }
};

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
    const cleanTitle = (typeof window.formatPhotoDisplayTitle === 'function')
        ? window.formatPhotoDisplayTitle(photo?.title, photo?.username)
        : ((photo && photo.title) ? photo.title : 'AfterGlow-Photograph');
    const safeFilename = cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') + '.jpg';
    window.downloadPhotoFile(src, safeFilename || 'AfterGlow-Photograph.jpg');
};

async function initArchCarousel() {
    const archContainer = document.getElementById('archCarousel');
    const wrapper = document.querySelector('.arch-carousel-wrapper');
    if (!archContainer || !wrapper) return;

    try {
        const token = localStorage.getItem('ag_token');
        const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
        const res = await fetch('/api/photos', { headers });
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
                        document.body.classList.add('lightbox-open');
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
    document.body.classList.remove('lightbox-open');
    if (typeof window.resetGalleryLightboxZoom === 'function') {
        window.resetGalleryLightboxZoom(false);
    }
    if (typeof window.resetHomeLightboxZoom === 'function') {
        window.resetHomeLightboxZoom(false);
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

// Touch & Mouse Drag Swipe + Pinch-to-Zoom support for home lightbox
document.addEventListener('DOMContentLoaded', function () {
    const stage = document.getElementById('homeLightboxStage');
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    if (stage && document.getElementById('archCarousel')) {
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
        window.resetHomeLightboxZoom = resetZoom;

        // Desktop double click to like at click coordinates or reset zoom
        stage.addEventListener('dblclick', (e) => {
            if (e.target.closest('.lightbox-dock-overlay') || e.target.closest('.lightbox-nav-btn') || e.target.closest('.close-lightbox')) return;
            if (currentScale > 1.1) {
                resetZoom(true);
            } else {
                const rect = stage.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                if (window.triggerHomeDoubleTapHeart) window.triggerHomeDoubleTapHeart(stage, x, y);
                if (window.toggleCurrentHomePhotoLike) window.toggleCurrentHomePhotoLike(true);
            }
        });

        let touchStartX = 0;
        let touchStartY = 0;
        let isTouchSwiping = false;

        stage.addEventListener('touchstart', (e) => {
            if (e.target.closest('.lightbox-dock-overlay') || e.target.closest('.lightbox-nav-btn') || e.target.closest('.close-lightbox')) return;

            if (e.touches.length === 2) {
                isPinching = true;
                isTouchSwiping = false;
                isPanning = false;
                stage.style.transform = '';
                if (lb) lb.style.backgroundColor = '';
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
                    isPanning = true;
                    panStartX = e.touches[0].clientX - panX;
                    panStartY = e.touches[0].clientY - panY;
                    if (img) img.style.transition = '';
                    return;
                }

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
                stage.style.transform = `translateX(${diffX * 0.4}px)`;
            } else if (diffY > 0) {
                const damping = Math.min(diffY * 0.72, 260);
                const scale = Math.max(0.78, 1 - diffY / 900);
                stage.style.transform = `translateY(${damping}px) scale(${scale})`;
                if (lb) {
                    const bgOpacity = Math.max(0.15, 0.94 - (diffY / 420));
                    lb.style.backgroundColor = `rgba(4, 5, 8, ${bgOpacity})`;
                }
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
                            if (window.triggerHomeDoubleTapHeart) window.triggerHomeDoubleTapHeart(stage, x, y);
                            if (window.toggleCurrentHomePhotoLike) window.toggleCurrentHomePhotoLike(true);
                        }
                        lastTapTime = 0;
                        return;
                    } else {
                        lastTapTime = now;
                    }
                } else if (diffY > 70 && diffY > Math.abs(diffX) * 1.15) {
                    // Vertical Swipe-to-close triggered!
                    stage.style.transition = 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.24s ease-out';
                    stage.style.transform = 'translateY(110vh) scale(0.6)';
                    stage.style.opacity = '0';
                    setTimeout(() => {
                        closeLightbox();
                        stage.style.transform = '';
                        stage.style.opacity = '';
                        stage.style.transition = '';
                        if (lb) lb.style.backgroundColor = '';
                        resetZoom(false);
                    }, 240);
                    return;
                } else if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX < 0 && window.navigateHomeLightbox) window.navigateHomeLightbox(1);
                    else if (diffX > 0 && window.navigateHomeLightbox) window.navigateHomeLightbox(-1);
                }
            }

            stage.style.transition = 'transform 0.25s ease';
            stage.style.transform = '';
            if (lb) lb.style.backgroundColor = '';
            setTimeout(() => { if (stage) stage.style.transition = ''; }, 260);
        }, { passive: true });

        // Desktop Mouse Drag Swipe & Pan
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
                    if (lb) lb.style.backgroundColor = `rgba(4, 5, 8, ${Math.max(0.2, 0.94 - (diffY / 400))})`;
                }
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (!isMouseDown) return;
            isMouseDown = false;
            stage.classList.remove('dragging');
            stage.style.transition = 'transform 0.25s ease';
            stage.style.transform = '';
            if (lb) lb.style.backgroundColor = '';

            if (hasDragged && currentScale <= 1.05) {
                const diffX = e.clientX - mouseStartX;
                const diffY = e.clientY - mouseStartY;
                if (diffY > 80 && diffY > Math.abs(diffX)) {
                    closeLightbox();
                    resetZoom(false);
                } else if (Math.abs(diffX) > 40) {
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

// Universal Mobile Haptic Vibration Feedback Helper
window.agHaptic = function (type = 'light') {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            switch (type) {
                case 'light':
                    navigator.vibrate(12);
                    break;
                case 'medium':
                    navigator.vibrate(25);
                    break;
                case 'heart':
                    navigator.vibrate([15, 45, 20]);
                    break;
                case 'success':
                    navigator.vibrate([12, 30, 24]);
                    break;
                case 'dismiss':
                    navigator.vibrate(18);
                    break;
            }
        } catch (e) {
            // Gracefully ignore if device disables vibration
        }
    }
};

// Universal Clipboard Copy Helper with Toast Notification & Haptic Feedback
window.copyToClipboard = async function (text, message = '✨ Link copied to clipboard!') {
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

    if (copied && typeof window.agHaptic === 'function') {
        window.agHaptic('success');
    }

    if (typeof window.showToast === 'function') {
        window.showToast(message, 'success');
    }
    return copied;
};

// Universal Share / Copy Link Helper
window.copyPhotoLink = function (url) {
    const targetUrl = url || window.location.href;
    window.copyToClipboard(targetUrl, '✨ Link copied to clipboard!');
};

// Universal Interactive Glassmorphic Share Modal
window.closeShareModal = function () {
    const overlay = document.getElementById('ag-share-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        if (typeof window.agHaptic === 'function') window.agHaptic('light');
    }
};

// Universal Photo Display Title Sanitizer: cleans raw filenames, extensions & corrupted characters
window.formatPhotoDisplayTitle = function (rawTitle, uploader) {
    const user = (uploader || '').replace(/^@/, '').trim();
    if (!rawTitle || typeof rawTitle !== 'string') {
        return user ? `Photograph by @${user}` : 'Curated Photograph';
    }

    let title = rawTitle.trim();

    // Preserve dedicated profile or portfolio titles
    if (title.toLowerCase().includes('portfolio')) {
        return title;
    }

    // 1. Strip file extension (.jpg, .jpeg, .png, .webp, .gif, .avif, .heic, etc.)
    title = title.replace(/\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff?|heic|heif|raw|cr2|nef|dng)$/i, '');

    // 2. Remove URL query params / hash fragments if present
    title = title.split('?')[0].split('#')[0];

    // 3. Strip corrupted / mojibake / unprintable / glitch characters
    // Matches corrupted bytes like 'õõ¦Bõõ´', unprintable control codes, replacement characters
    title = title.replace(/[\uFFFD\u0000-\u001F\u007F-\u009Fõ¦´§±\u0080-\u009F]+/g, ' ');

    // 4. Detect camera or auto-generated names (e.g. IMG_..., DSC_..., PXL_..., timestamps)
    const isCameraOrGeneric = /^(IMG|DSC|PXL|PHOTO|PIC|IMAGE|SCREENSHOT|WP|SAM|DCIM)[-_]?\d+/i.test(title)
        || /^\d{10,14}$/.test(title)
        || /^[a-f0-9]{8,}(-[a-f0-9]{4,})*$/i.test(title);

    // Remove long numeric sequences (10+ digits like epoch stamps) or hex hashes
    title = title.replace(/[-_]\d{10,14}\b/g, '');
    title = title.replace(/\b\d{10,14}\b/g, '');
    title = title.replace(/[-_][a-f0-9]{8,}\b/gi, '');

    // 5. Replace separators (underscores, pluses) with spaces
    title = title.replace(/[_\+]+/g, ' ');

    // 6. Clean up hyphens and collapse multiple spaces
    title = title.replace(/\s*-\s*/g, ' - ');
    title = title.replace(/\s+/g, ' ').trim();

    // 7. Check if meaningful or generic
    const genericWords = /^(image|photo|picture|pic|upload|untitled|camera|capture|snapshot|photograph|afterglow photograph)$/i;

    if (!title || isCameraOrGeneric || genericWords.test(title) || /^[\d\s\-_.]+$/.test(title) || title.length < 2) {
        return user ? `Photograph by @${user}` : 'Curated Photograph';
    }

    // Capitalize words if all lowercase or all uppercase
    if (title === title.toLowerCase() || (title === title.toUpperCase() && title.length > 4)) {
        title = title.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    return title;
};

window.openShareModal = function ({ url, title, uploader, thumbUrl, customShareText } = {}) {
    if (typeof window.agHaptic === 'function') window.agHaptic('light');
    const shareUrl = url || window.location.href;
    const cleanUser = (uploader || 'photographer').replace(/^@/, '');
    const cleanTitle = window.formatPhotoDisplayTitle(title, cleanUser);
    const isProfile = cleanTitle.toLowerCase().includes('portfolio') || shareUrl.includes('profile.html');

    let defaultShareText;
    if (isProfile) {
        defaultShareText = `Explore @${cleanUser}'s curated photography portfolio on AfterGlow!`;
    } else if (cleanTitle.toLowerCase().startsWith('photograph by')) {
        defaultShareText = `Check out this photograph by @${cleanUser} on AfterGlow!`;
    } else {
        defaultShareText = `Check out "${cleanTitle}" by @${cleanUser} on AfterGlow!`;
    }
    const shareText = customShareText || defaultShareText;
    const previewThumb = thumbUrl || shareUrl;

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
                            <h3 id="ag-share-dialog-title">Share Photograph</h3>
                            <p id="ag-share-dialog-desc">Share this visual story across other apps</p>
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
                    <button type="button" class="ag-share-app-btn share-instagram" data-app="instagram" title="Share on Instagram">
                        <div class="ag-share-app-icon"><i class="fab fa-instagram"></i></div>
                        <span>Instagram</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-snapchat" data-app="snapchat" title="Share on Snapchat">
                        <div class="ag-share-app-icon"><i class="fab fa-snapchat"></i></div>
                        <span>Snapchat</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-facebook" data-app="facebook" title="Share on Facebook">
                        <div class="ag-share-app-icon"><i class="fab fa-facebook-f"></i></div>
                        <span>Facebook</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-telegram" data-app="telegram" title="Share on Telegram">
                        <div class="ag-share-app-icon"><i class="fab fa-telegram-plane"></i></div>
                        <span>Telegram</span>
                    </button>
                    <button type="button" class="ag-share-app-btn share-native" data-app="native" title="More options on your device">
                        <div class="ag-share-app-icon"><i class="fas fa-ellipsis"></i></div>
                        <span>More Apps</span>
                    </button>
                </div>

                <div class="ag-share-section-label">Or copy direct link</div>
                <div class="ag-share-link-box">
                    <input type="text" class="ag-share-input" id="ag-share-input" readonly value="">
                    <button type="button" class="ag-share-copy-btn" id="ag-share-copy-btn" title="Copy link">
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

    // Dynamic titles based on whether it is a photo or a creator profile
    const dialogTitle = overlay.querySelector('#ag-share-dialog-title');
    if (dialogTitle) dialogTitle.innerText = isProfile ? 'Share Creator Profile' : 'Share Photograph';

    const dialogDesc = overlay.querySelector('#ag-share-dialog-desc');
    if (dialogDesc) dialogDesc.innerText = isProfile ? 'Share this photography portfolio across other apps' : 'Share this visual story across other apps';

    // Populate data
    const thumbEl = overlay.querySelector('#ag-share-thumb');
    if (thumbEl) {
        thumbEl.src = previewThumb;
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
            await window.copyToClipboard(shareUrl, isProfile ? '✨ Profile link copied to clipboard!' : '✨ Photo link copied to clipboard!');
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<i class="fas fa-check"></i> <span>Copied!</span>';
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = '<i class="far fa-copy"></i> <span>Copy</span>';
            }, 2000);
        };
    }

    // Configure 6 App buttons: WhatsApp, Instagram, Snapchat, Facebook, Telegram, More Apps
    const waBtn = overlay.querySelector('.ag-share-app-btn.share-whatsapp');
    if (waBtn) {
        waBtn.onclick = () => {
            if (typeof window.agHaptic === 'function') window.agHaptic('light');
            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
            window.open(waUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const igBtn = overlay.querySelector('.ag-share-app-btn.share-instagram');
    if (igBtn) {
        igBtn.onclick = async () => {
            if (typeof window.agHaptic === 'function') window.agHaptic('light');
            await window.copyToClipboard(shareUrl, '📸 Link copied! Opening Instagram to share...');
            setTimeout(() => {
                window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
            }, 350);
        };
    }

    const snapBtn = overlay.querySelector('.ag-share-app-btn.share-snapchat');
    if (snapBtn) {
        snapBtn.onclick = () => {
            if (typeof window.agHaptic === 'function') window.agHaptic('light');
            const snapUrl = `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(shareUrl)}`;
            window.open(snapUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const fbBtn = overlay.querySelector('.ag-share-app-btn.share-facebook');
    if (fbBtn) {
        fbBtn.onclick = () => {
            if (typeof window.agHaptic === 'function') window.agHaptic('light');
            const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
            window.open(fbUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const tgBtn = overlay.querySelector('.ag-share-app-btn.share-telegram');
    if (tgBtn) {
        tgBtn.onclick = () => {
            if (typeof window.agHaptic === 'function') window.agHaptic('light');
            const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
            window.open(tgUrl, '_blank', 'noopener,noreferrer');
        };
    }

    const nativeBtn = overlay.querySelector('.ag-share-app-btn.share-native');
    if (nativeBtn) {
        nativeBtn.onclick = () => {
            if (typeof window.agHaptic === 'function') window.agHaptic('light');
            if (navigator.share) {
                navigator.share({
                    title: cleanTitle,
                    text: shareText,
                    url: shareUrl
                }).catch(() => {});
            } else {
                window.copyToClipboard(shareUrl, '✨ Link copied to clipboard!');
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

// Fullscreen Stage Toggle Helper
window.toggleStageFullscreen = function (stageEl) {
    if (!stageEl) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (stageEl.requestFullscreen) {
            stageEl.requestFullscreen().catch(() => {});
        } else if (stageEl.webkitRequestFullscreen) {
            stageEl.webkitRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
};

// --- Desktop Keyboard Shortcuts & Fullscreen Navigation ---
document.addEventListener('keydown', (e) => {
    // Ignore if typing inside form inputs or editable elements
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) {
        return;
    }

    // Check which lightbox is open
    const homeLb = document.getElementById('lightbox');
    const isHomeLbOpen = homeLb && (homeLb.classList.contains('active') || homeLb.classList.contains('modal-active') || getComputedStyle(homeLb).display !== 'none');

    const profLb = document.getElementById('profileLightbox');
    const isProfLbOpen = profLb && (profLb.classList.contains('modal-active') || getComputedStyle(profLb).display !== 'none');

    const shareOverlay = document.getElementById('ag-share-overlay');
    const isShareOpen = shareOverlay && shareOverlay.classList.contains('active');

    // Esc closes Share modal first if active
    if (e.key === 'Escape') {
        if (isShareOpen) {
            window.closeShareModal();
            e.preventDefault();
            return;
        }
        if (document.fullscreenElement) {
            return;
        }
        if (isHomeLbOpen) {
            if (typeof window.closeLightbox === 'function') window.closeLightbox();
        } else if (isProfLbOpen) {
            if (typeof window.closeProfileLightbox === 'function') window.closeProfileLightbox();
        }
        return;
    }

    // Only process shortcuts if a lightbox is actively showing and share dialog is not open
    if ((!isHomeLbOpen && !isProfLbOpen) || isShareOpen) {
        return;
    }

    const key = e.key.toLowerCase();

    // 1. Navigation: ArrowLeft / ArrowRight
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isHomeLbOpen) {
            if (typeof window.navigateGalleryLightbox === 'function') window.navigateGalleryLightbox(-1);
            else if (typeof window.navigateHomeLightbox === 'function') window.navigateHomeLightbox(-1);
        } else if (isProfLbOpen) {
            if (typeof window.navigateProfileLightbox === 'function') window.navigateProfileLightbox(-1);
        }
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (isHomeLbOpen) {
            if (typeof window.navigateGalleryLightbox === 'function') window.navigateGalleryLightbox(1);
            else if (typeof window.navigateHomeLightbox === 'function') window.navigateHomeLightbox(1);
        } else if (isProfLbOpen) {
            if (typeof window.navigateProfileLightbox === 'function') window.navigateProfileLightbox(1);
        }
    }
    // 2. Fullscreen Toggle: F
    else if (key === 'f') {
        e.preventDefault();
        const stage = isHomeLbOpen 
            ? (document.getElementById('lightboxStage') || document.getElementById('homeLightboxStage')) 
            : document.getElementById('profileLightboxStage');
        if (stage && typeof window.toggleStageFullscreen === 'function') {
            window.toggleStageFullscreen(stage);
        }
    }
    // 3. Like Toggle: L
    else if (key === 'l') {
        e.preventDefault();
        if (isHomeLbOpen) {
            if (typeof window.toggleCurrentGalleryPhotoLike === 'function') window.toggleCurrentGalleryPhotoLike();
            else if (typeof window.toggleCurrentHomePhotoLike === 'function') window.toggleCurrentHomePhotoLike();
        } else if (isProfLbOpen) {
            if (typeof window.toggleCurrentProfilePhotoLike === 'function') window.toggleCurrentProfilePhotoLike();
        }
    }
    // 4. Share Modal: S
    else if (key === 's') {
        e.preventDefault();
        if (isHomeLbOpen) {
            if (typeof window.shareCurrentGalleryPhoto === 'function') window.shareCurrentGalleryPhoto();
            else if (typeof window.shareCurrentHomePhoto === 'function') window.shareCurrentHomePhoto();
        } else if (isProfLbOpen) {
            if (typeof window.shareCurrentProfilePhoto === 'function') window.shareCurrentProfilePhoto();
        }
    }
    // 5. Download: D
    else if (key === 'd') {
        e.preventDefault();
        if (isHomeLbOpen) {
            if (typeof window.downloadCurrentGalleryPhoto === 'function') window.downloadCurrentGalleryPhoto();
            else if (typeof window.downloadCurrentHomePhoto === 'function') window.downloadCurrentHomePhoto();
        } else if (isProfLbOpen) {
            if (typeof window.downloadCurrentProfilePhoto === 'function') window.downloadCurrentProfilePhoto();
        }
    }
});