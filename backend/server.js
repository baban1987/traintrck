// server.js
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

const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173'];
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
};

app.use(cors(corsOptions));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('[Main] ✅ Successfully connected to MongoDB Atlas!'))
    .catch(err => console.error('[Main] ❌ Error connecting to MongoDB:', err));

// --- Public Login Route ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) { return res.status(400).json({ message: 'Username and password are required.' }); }
    const isValidUser = (username === process.env.ADMIN_USERNAME);
    const isPasswordCorrect = isValidUser && await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!isValidUser || !isPasswordCorrect) { return res.status(401).json({ message: 'Invalid credentials.' }); }
    const token = jwt.sign({ username: process.env.ADMIN_USERNAME }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
});

// --- Apply Authentication Middleware ---
app.use(authMiddleware);

// --- UPDATED: FOIS Proxy with final, robust parsing for all fields ---
app.get('/api/fois/loco/:locoId', async (req, res) => {
    try {
        const { locoId } = req.params;
        const url = `https://fois.indianrail.gov.in/foisweb/GG_AjaxInteraction?Optn=RTIS_CURRENT_LOCO_RPTG&Loco=${locoId}`;
        const response = await axios.get(url);

        const data = response.data;
        if (!data.LocoDtls || data.LocoDtls.length === 0 || !data.LocoDtls[0].PopUpMsg) {
            return res.status(404).json({ message: 'Loco not found or has no position data on the FOIS/RTIS server.' });
        }

        const details = data.LocoDtls[0];
        const popupMsg = details.PopUpMsg;
        
        const stripHtml = (html) => html ? html.replace(/<[^>]*>/g, '').trim() : '';

        const stationMatch = popupMsg.match(/Station:\s*(.*?)(?=<br|<div|$)/s);
        const eventMatch = popupMsg.match(/Event:\s*(.*?)(?=<br|<div|$)/s);
        // --- FIX: Use the same robust line-capturing logic for speed ---
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
            // --- FIX: Clean the speed string and then parse the integer ---
            speed: speedMatch ? (parseInt(stripHtml(speedMatch[1]), 10) || 0) : 0,
            timestamp: timestamp.toISOString(),
            train_no: null 
        };

        const dbRecord = await LocoPosition.findOne({ loco_no: parseInt(locoId) }).sort({ timestamp: -1 });
        if (dbRecord && dbRecord.train_no) {
            structuredResponse.train_no = dbRecord.train_no;
        }
        
        res.json(structuredResponse);

    } catch (error) {
        if (error.response && typeof error.response.data === 'string') {
            return res.status(404).json({ message: 'Loco not found or invalid response from FOIS.' });
        }
        res.status(500).json({ message: 'Server error while fetching data from FOIS.', error: error.message });
    }
});



// --- Existing Protected API Routes ---

app.get('/api/train-profile/:trainNo', async (req, res) => {
    try {
        const { trainNo } = req.params;
        const { date } = req.query;
        if (!date || typeof date !== 'string') { return res.status(400).json({ message: 'A start date query parameter is required.' }); }
        const d = new Date(date);
        const formattedDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
        const url = `https://www.railjournal.in/RailRadar/train-profile.php?trainNo=${trainNo}&start_date=${formattedDate}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch train profile data', error: error.message });
    }
});

app.get('/api/train-schedules', async (req, res) => {
    try {
        const response = await axios.post('https://www.railjournal.in/RailRadar/', 'action=refresh_data');
        if (response.data && response.data.trainPositionData) {
            res.json(response.data.trainPositionData);
        } else {
            res.status(404).json({ message: "Train schedule data not found in API response." });
        }
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch train schedule data', error: error.message });
    }
});

app.get('/api/loco/history/:locoId', async (req, res) => {
    try {
        const { locoId } = req.params;
        const history = await LocoPosition.find({ loco_no: parseInt(locoId) }).sort({ timestamp: -1 }).limit(200);
        res.json(history);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching historical data', error: error.message });
    }
});

app.get('/api/search/loco/:locoId', async (req, res) => {
    try {
        const { locoId } = req.params;
        const latestPosition = await LocoPosition.findOne({ loco_no: parseInt(locoId) }).sort({ timestamp: -1 });
        if (latestPosition) {
            res.json(latestPosition);
        } else {
            res.status(404).json({ message: 'Loco not found in database' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/api/search/train/:trainId', async (req, res) => {
    try {
        const { trainId } = req.params;
        const latestPosition = await LocoPosition.findOne({ train_no: parseInt(trainId) }).sort({ timestamp: -1 });
        if (latestPosition) {
            res.json(latestPosition);
        } else {
            res.status(404).json({ message: 'Train not found in database' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// --- Background Worker Logic ---
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

// --- Start the server and the worker ---
app.listen(PORT, () => {
    console.log(`[Main] 🚀 API server is running on http://localhost:${PORT}`);
    startDataCollectorWorker();
});
