// server.js (Final On-Demand Caching Version)
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

// --- 2. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('[Main] ✅ Successfully connected to MongoDB Atlas!'))
    .catch(err => console.error('[Main] ❌ Error connecting to MongoDB:', err));

// --- 3. PUBLIC ROUTES ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) { return res.status(400).json({ message: 'Username and password are required.' }); }
    const isValidUser = (username === process.env.ADMIN_USERNAME);
    const isPasswordCorrect = isValidUser && await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!isValidUser || !isPasswordCorrect) { return res.status(401).json({ message: 'Invalid credentials.' }); }
    const token = jwt.sign({ username: process.env.ADMIN_USERNAME }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
});

// --- 4. AUTHENTICATION MIDDLEWARE ---
app.use(authMiddleware);

// --- 5. PROTECTED API ROUTES ---

// This is now our primary endpoint for both live data AND data collection.
app.get('/api/fois/loco/:locoId', async (req, res) => {
    try {
        const { locoId } = req.params;
        const url = `https://fois.indianrail.gov.in/foisweb/GG_AjaxInteraction?Optn=RTIS_CURRENT_LOCO_RPTG&Loco=${locoId}`;
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0...' } });

        const data = response.data;
        if (!data.LocoDtls || data.LocoDtls.length === 0 || !data.LocoDtls[0].PopUpMsg) { return res.status(404).json({ message: 'Loco not found on FOIS server.' }); }
        
        const details = data.LocoDtls[0];
        const popupMsg = details.PopUpMsg;
        const stripHtml = (html) => html ? html.replace(/<[^>]*>/g, '').trim() : '';
        const stationMatch = popupMsg.match(/Station:\s*(.*?)(?=<br|<div|$)/s);
        const eventMatch = popupMsg.match(/Event:\s*(.*?)(?=<br|<div|$)/s);
        const speedMatch = popupMsg.match(/Speed:\s*(.*?)(?=<br|<div|$)/s);
        const timestampMatch = popupMsg.match(/\((\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\)/);

        let timestamp = new Date();
        if (timestampMatch && timestampMatch[1]) {
            const year = new Date().getFullYear();
            const [date, time] = timestampMatch[1].split(' ');
            const [day, month] = date.split('-');
            timestamp = new Date(`${year}-${month}-${day}T${time}`);
        }

        const structuredResponse = {
            loco_no: parseInt(locoId, 10),
            latitude: parseFloat(details.Lttd),
            longitude: parseFloat(details.Lgtd),
            station: stationMatch ? stripHtml(stationMatch[1]) : 'N/A',
            event: eventMatch ? stripHtml(eventMatch[1]) : 'N/A',
            speed: speedMatch ? (parseInt(stripHtml(speedMatch[1]), 10) || 0) : 0,
            timestamp: timestamp, // Use Date object for saving
            train_no: null 
        };

        const dbRecord = await LocoPosition.findOne({ loco_no: parseInt(locoId) }).sort({ timestamp: -1 });
        if (dbRecord && dbRecord.train_no) { structuredResponse.train_no = dbRecord.train_no; }
        
        // --- NEW: Save the fresh data point to our database (on-demand caching) ---
        // We run this in the background and don't wait for it to complete before responding to the user.
        LocoPosition.updateOne(
            { loco_no: structuredResponse.loco_no, timestamp: structuredResponse.timestamp },
            { $set: structuredResponse },
            { upsert: true }
        ).catch(err => console.error('[DB Caching Error]', err.message)); // Log errors but don't crash

        // Convert timestamp to string for the JSON response
        structuredResponse.timestamp = timestamp.toISOString();
        res.json(structuredResponse);

    } catch (error) {
        if (error.response && typeof error.response.data === 'string') { return res.status(404).json({ message: 'Loco not found or invalid response from FOIS.' }); }
        res.status(500).json({ message: 'Server error while fetching data from FOIS.', error: error.message });
    }
});

// Other routes remain the same
app.get('/api/train-profile/:trainNo', async (req, res) => { /* ... */ });
app.get('/api/train-schedules', async (req, res) => { /* ... */ });
app.get('/api/loco/history/:locoId', async (req, res) => { /* ... */ });
app.get('/api/search/train/:trainId', async (req, res) => { /* ... */ });

// --- 6. START THE SERVER ---
// The background worker logic is completely removed.
app.listen(PORT, () => {
    console.log(`[Main] 🚀 API server is running on http://localhost:${PORT}`);
});
