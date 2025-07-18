// server.js (Final Version for Render Web Service)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Worker } = require('worker_threads');
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const LocoPosition = require('./models/locoPosition');
const authMiddleware = require('./authMiddleware');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Setup Top-Level Middleware
const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173'];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) { callback(null, true); } 
        else { callback(new Error('Not allowed by CORS')); }
    },
    credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// 2. Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('[Main] ✅ Successfully connected to MongoDB Atlas!'))
    .catch(err => console.error('[Main] ❌ Error connecting to MongoDB:', err));

// 3. Public Routes
app.post('/api/login', async (req, res) => { /* ... (logic is correct) ... */ });

// 4. Authentication Middleware
app.use(authMiddleware);

// 5. Protected API Routes
app.get('/api/fois/loco/:locoId', async (req, res) => { /* ... (logic is correct) ... */ });
app.get('/api/train-profile/:trainNo', async (req, res) => { /* ... (logic is correct) ... */ });
app.get('/api/train-schedules', async (req, res) => { /* ... (logic is correct) ... */ });
app.get('/api/loco/history/:locoId', async (req, res) => { /* ... (logic is correct) ... */ });
app.get('/api/search/loco/:locoId', async (req, res) => { /* ... (logic is correct) ... */ });
app.get('/api/search/train/:trainId', async (req, res) => { /* ... (logic is correct) ... */ });

// 6. Background Worker Logic
function startDataCollectorWorker() {
    console.log('[Main] Starting data collector worker...');
    const worker = new Worker(path.resolve(__dirname, 'data-collector.js'));
    worker.on('message', (msg) => { console.log('[Main] Message from worker:', msg); });
    worker.on('error', (err) => {
        console.error('[Main] Worker error:', err);
        console.log('[Main] Restarting worker in 10 seconds...');
        setTimeout(startDataCollectorWorker, 10000);
    });
    worker.on('exit', (code) => {
        if (code !== 0) {
            console.error(`[Main] Worker stopped with exit code ${code}`);
            console.log('[Main] Restarting worker in 10 seconds...');
            setTimeout(startDataCollectorWorker, 10000);
        } else {
            console.log('[Main] Worker exited cleanly.');
        }
    });
}

// 7. Start the Server and the Worker
app.listen(PORT, () => {
    console.log(`[Main] 🚀 API server is running on http://localhost:${PORT}`);
    startDataCollectorWorker();
});
