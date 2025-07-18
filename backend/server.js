// server.js (Vercel Version - NO WORKER)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// No longer need worker_threads or path
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const LocoPosition = require('./models/locoPosition');
const authMiddleware = require('./authMiddleware');

const app = express();
const PORT = process.env.PORT || 3001;

// --- 1. SETUP MIDDLEWARE ---
const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173'];
const corsOptions = { /* ... */ };
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// --- 2. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('[API] ✅ Successfully connected to MongoDB Atlas!'))
    .catch(err => console.error('[API] ❌ Error connecting to MongoDB:', err));

// --- 3. PUBLIC & PROTECTED ROUTES ---
app.post('/api/login', async (req, res) => { /* ... (no changes) ... */ });
app.use(authMiddleware);
app.get('/api/fois/loco/:locoId', async (req, res) => { /* ... (no changes) ... */ });
app.get('/api/train-profile/:trainNo', async (req, res) => { /* ... (no changes) ... */ });
app.get('/api/train-schedules', async (req, res) => { /* ... (no changes) ... */ });
app.get('/api/loco/history/:locoId', async (req, res) => { /* ... (no changes) ... */ });
app.get('/api/search/loco/:locoId', async (req, res) => { /* ... (no changes) ... */ });
app.get('/api/search/train/:trainId', async (req, res) => { /* ... (no changes) ... */ });

// --- 4. START THE SERVER ---
// The worker logic has been removed.
app.listen(PORT, () => {
    console.log(`[API] 🚀 API server is running on http://localhost:${PORT}`);
});

// Vercel needs this export to wrap the Express app
module.exports = app;
