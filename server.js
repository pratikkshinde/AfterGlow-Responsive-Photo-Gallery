require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const admin = require('firebase-admin');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { User, Photo, dbConnect } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'afterglow_super_secret_key_2026';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DB Connection Middleware for API routes
app.use('/api', async (req, res, next) => {
    try {
        await dbConnect();
        next();
    } catch (err) {
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Firebase Admin if credentials are available
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const firebaseServiceAccount = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
            : process.env.FIREBASE_SERVICE_ACCOUNT;

        // Ensure newline formatting is preserved for private key on Vercel/Linux
        if (firebaseServiceAccount && firebaseServiceAccount.private_key) {
            firebaseServiceAccount.private_key = firebaseServiceAccount.private_key.replace(/\\n/g, '\n');
        }

        if (!admin.apps.length) {
            admin.initializeApp({ credential: admin.credential.cert(firebaseServiceAccount) });
            console.log('Firebase Admin initialized');
        }
    } catch (err) {
        console.warn('Failed to initialize Firebase Admin:', err.message);
    }
} else {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set; Firebase authentication endpoint disabled.');
}

// Multer Storage Configuration (In-Memory Buffer for direct Cloudinary upload)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Direct Cloudinary upload function (No local disk saving)
function uploadToCloudinary(file, folder = 'photo-gallery/uploads') {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return Promise.reject(new Error('Cloudinary credentials are not configured in .env'));
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'auto'
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary API upload error:', error.message || error);
                    return reject(new Error(error.message || 'Cloudinary upload failed'));
                }
                console.log('Successfully uploaded to Cloudinary:', result.secure_url);
                resolve(result.secure_url);
            }
        );
        stream.end(file.buffer);
    });
}

// JWT Middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: 'No token provided' });

    const parts = authHeader.split(' ');
    const token = parts.length === 2 ? parts[1] : parts[0];

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized or session expired' });
        req.userId = decoded.id;
        next();
    });
};

// --- AUTHENTICATION ROUTES (100% Firebase Authentication) ---

// Lookup email by username for login (allows logging in with username or email via Firebase)
app.get('/api/auth/lookup-email', async (req, res) => {
    try {
        const username = req.query.username;
        if (!username) return res.status(400).json({ error: 'Username required' });
        const user = await User.findOne({ username: new RegExp('^' + username.trim() + '$', 'i') }).select('email');
        if (!user) return res.status(404).json({ error: 'No account found with this username' });
        res.json({ email: user.email });
    } catch (err) {
        res.status(500).json({ error: 'Failed to look up username' });
    }
});

// Unified Firebase Auth Endpoint (for Google Sign-In, Email/Password Login & Register)
app.post('/api/auth/firebase', async (req, res) => {
    const { idToken, username: reqUsername } = req.body;
    if (!idToken) return res.status(400).json({ error: 'No Firebase ID token provided' });
    if (!admin.apps.length) return res.status(500).json({ error: 'Firebase Admin is not configured on server' });

    let decodedToken;
    try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authErr) {
        console.error('Firebase token verification error:', authErr);
        return res.status(401).json({ error: `Firebase auth failed: ${authErr.message}` });
    }

    if (!decodedToken.email) return res.status(400).json({ error: 'Firebase user email is required' });

    try {
        const userEmail = decodedToken.email.toLowerCase();
        let user = await User.findOne({
            $or: [
                { firebase_uid: decodedToken.uid },
                { email: userEmail }
            ]
        });

        if (!user) {
            // Clean requested username or derive from email/displayName
            let baseUsername = (reqUsername || decodedToken.displayName || userEmail.split('@')[0])
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '');

            if (!baseUsername || baseUsername.length < 3) {
                baseUsername = 'user_' + Math.random().toString(36).slice(-5);
            }

            let username = baseUsername;
            let count = 1;
            while (await User.findOne({ username })) {
                username = `${baseUsername}${count++}`;
            }

            user = await User.create({
                username,
                email: userEmail,
                firebase_uid: decodedToken.uid,
                profile_picture_url: decodedToken.picture || ''
            });
        } else {
            // Sync firebase_uid or profile picture if not already set
            let updated = false;
            if (!user.firebase_uid) {
                user.firebase_uid = decodedToken.uid;
                updated = true;
            }
            if (!user.profile_picture_url && decodedToken.picture) {
                user.profile_picture_url = decodedToken.picture;
                updated = true;
            }
            if (updated) await user.save();
        }

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: 86400 });
        res.json({
            message: 'Authentication successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profile_picture_url: user.profile_picture_url
            }
        });
    } catch (dbErr) {
        console.error('Database error during Firebase auth sync:', dbErr);
        res.status(500).json({ error: `Database error: ${dbErr.message}` });
    }
});

// --- USER ROUTES ---

app.get('/api/user/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('username email name full_name bio about specialty profile_picture_url');
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/user/public/:username', async (req, res) => {
    try {
        const clean = (req.params.username || '').trim();
        const user = await User.findOne({ 
            username: { $regex: new RegExp('^' + clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } 
        }).select('username name full_name bio about specialty profile_picture_url');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/users/search', async (req, res) => {
    try {
        const q = req.query.q;
        if (!q) return res.json([]);
        const users = await User.find({ username: { $regex: q, $options: 'i' } })
            .select('username profile_picture_url')
            .limit(10);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/user/profile', verifyToken, upload.single('profilePic'), async (req, res) => {
    const { username, name, full_name, bio, about, specialty } = req.body;

    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (username && username.trim()) {
            const cleanUsername = username.trim().toLowerCase();
            if (cleanUsername !== (user.username || '').toLowerCase()) {
                // Check if username already exists for any other user (case-insensitive)
                const escaped = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const existingUser = await User.findOne({
                    username: { $regex: new RegExp(`^${escaped}$`, 'i') },
                    _id: { $ne: user._id }
                });
                if (existingUser) {
                    return res.status(400).json({ error: `Username "@${cleanUsername}" already exists. Please choose a different username.` });
                }
                user.username = cleanUsername;
            } else {
                user.username = cleanUsername;
            }
        }

        let newPicUrl = user.profile_picture_url;
        if (req.file) {
            newPicUrl = await uploadToCloudinary(req.file, 'photo-gallery/profiles');
        }

        const displayName = name !== undefined ? name : full_name;
        if (displayName !== undefined) {
            user.name = displayName;
            user.full_name = displayName;
        }
        if (bio !== undefined) user.bio = bio;
        if (about !== undefined) user.about = about;
        if (specialty !== undefined) user.specialty = specialty;
        user.profile_picture_url = newPicUrl;

        await user.save();
        res.json({ message: 'Profile updated', profile_picture_url: newPicUrl });
    } catch (err) {
        console.error('Profile update error:', err);
        if (err.code === 11000 || (err.message && (err.message.includes('E11000') || err.message.includes('duplicate key')))) {
            const dupUsername = username ? `@${username.trim()}` : 'This username';
            return res.status(400).json({ error: `Username "${dupUsername}" already exists. Please choose a different username.` });
        }
        res.status(500).json({ error: err.message || 'Failed to update user' });
    }
});

// --- REAL-TIME SSE ENDPOINT ---
let sseClients = [];

app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (res.flushHeaders) res.flushHeaders();

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    sseClients.push(res);

    req.on('close', () => {
        sseClients = sseClients.filter(c => c !== res);
    });
});

// Periodically send ping to prevent connection timeout
const pingInterval = setInterval(() => {
    sseClients.forEach(client => {
        try { client.write(': ping\n\n'); } catch (e) { }
    });
}, 25000);
if (pingInterval.unref) pingInterval.unref();

function broadcastEvent(type, payload = {}) {
    const data = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
    sseClients.forEach(client => {
        try { client.write(data); } catch (e) { }
    });
}

// --- PHOTO ROUTES ---

// Upload photo
app.post('/api/photos', verifyToken, upload.single('photo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    try {
        const fileUrl = await uploadToCloudinary(req.file, 'photo-gallery/uploads');

        const newPhoto = await Photo.create({
            user_id: req.userId,
            filename: fileUrl,
            original_name: req.file.originalname
        });

        // Broadcast real-time photo addition to all connected SSE clients
        const populated = await newPhoto.populate('user_id', 'username');
        broadcastEvent('photo_added', {
            photo_id: newPhoto._id,
            src: fileUrl,
            title: req.file.originalname,
            username: populated.user_id ? populated.user_id.username : 'Unknown'
        });

        res.json({ message: 'Photo uploaded successfully', photo_id: newPhoto._id, src: fileUrl });
    } catch (err) {
        console.error('Photo save error:', err);
        res.status(500).json({ error: err.message || 'Database error during upload' });
    }
});

// Get all photos
app.get('/api/photos', async (req, res) => {
    try {
        const photos = await Photo.find({ deleted_by_user: false })
            .populate('user_id', 'username profile_picture_url')
            .sort({ created_at: -1 })
            .lean();

        // Map to expected format
        const formattedPhotos = photos.map(p => ({
            id: p._id,
            src: p.filename,
            title: p.original_name,
            date: p.created_at,
            username: p.user_id ? p.user_id.username : "Unknown",
            userAvatar: p.user_id ? p.user_id.profile_picture_url : null
        }));

        res.json(formattedPhotos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get logged in user's photos
app.get('/api/photos/me', verifyToken, async (req, res) => {
    try {
        const photos = await Photo.find({ user_id: req.userId, deleted_by_user: false })
            .sort({ created_at: -1 })
            .lean();

        const formattedPhotos = photos.map(p => ({
            id: p._id,
            src: p.filename,
            title: p.original_name,
            date: p.created_at
        }));

        res.json(formattedPhotos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/photos/public/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const photos = await Photo.find({ user_id: user._id, deleted_by_user: false })
            .sort({ created_at: -1 })
            .lean();

        const formattedPhotos = photos.map(p => ({
            id: p._id,
            src: p.filename,
            title: p.original_name,
            date: p.created_at
        }));

        res.json(formattedPhotos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// "Delete" photo (Soft delete)
app.delete('/api/photos/:id', verifyToken, async (req, res) => {
    try {
        const photo = await Photo.findOneAndUpdate(
            { _id: req.params.id, user_id: req.userId },
            { deleted_by_user: true }
        );

        if (!photo) return res.status(404).json({ error: 'Photo not found or unauthorized' });
        broadcastEvent('photo_deleted', { photo_id: req.params.id });
        res.json({ message: 'Photo removed from your profile (still archived in DB)' });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});



// API 404 handler
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
});

// Serve static HTML/CSS/JS from root
app.use(express.static(__dirname));

// Serve brand favicon
app.get('/favicon.ico', (req, res) => res.type('image/svg+xml').sendFile(path.join(__dirname, 'favicon.svg')));

// Serve frontend fallback for SPA
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

if (require.main === module && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
