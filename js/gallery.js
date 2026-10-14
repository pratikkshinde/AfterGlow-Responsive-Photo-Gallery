let allPhotos = [];

// Load gallery on page load
document.addEventListener('DOMContentLoaded', () => {
    loadGallery();

    if (typeof window.onRealtimePhotoUpdate === 'function') {
        window.onRealtimePhotoUpdate(() => {
            loadGallery();
        });
    }
});

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

    galleryGrid.innerHTML = photos.map((photo, index) => `
        <div class="gallery-item" data-id="${photo.id}" data-username="${photo.username}" style="--index: ${index}">
            <img src="${photo.src}" alt="${photo.title || 'Exhibition photograph'}" loading="lazy">
            <div class="gallery-item-info">
                <p>
                    <a href="profile.html?username=${photo.username}">
                        <i class="fas fa-user-circle"></i> @${photo.username}
                    </a>
                </p>
            </div>
        </div>
    `).join('');

    const galleryItems = document.querySelectorAll('.gallery-item');

    galleryItems.forEach(item => {
        const img = item.querySelector('img');
        item.addEventListener('click', () => {
            const username = item.dataset.username || 'Community Creator';
            openLightbox(img.src, username);
        });
    });

    const closeBtn = document.querySelector('.close-lightbox');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeLightbox);
    }
}

function openLightbox(imageSrc, username) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCaption = document.getElementById('lightboxCaption');

    if (!lightbox || !lightboxImage) return;

    lightboxImage.src = imageSrc;
    if (lightboxCaption) {
        const cleanUser = (username || 'creator').replace(/^@/, '').toLowerCase();
        lightboxCaption.innerHTML = `
            <a href="profile.html?username=${encodeURIComponent(cleanUser)}" class="lightbox-creator-badge" title="View @${cleanUser}'s profile">
                <div class="creator-badge-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <span class="creator-badge-handle">@${cleanUser}</span>
                <i class="fas fa-arrow-right creator-badge-arrow"></i>
            </a>
        `;
    }
    lightbox.classList.add('modal-active');
}