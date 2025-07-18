// cron-job.js
// No worker_threads needed
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();
const LocoPosition = require('./models/locoPosition');

const MONGO_URI = process.env.MONGO_URI;

// ... (The parseFoisResponse helper function is unchanged) ...

const runJob = async () => {
    console.log('[Cron] Job started.');
    await mongoose.connect(MONGO_URI);
    console.log('[Cron] ✅ DB Connected.');

    try {
        // This is the collectData logic from the old worker
        console.log('[Cron] Fetching active loco directory...');
        const directoryResponse = await axios.post('https://www.railjournal.in/RailRadar/', 'action=refresh_data');
        // ... (rest of the data collection and parsing logic is the same) ...

        if (operations.length > 0) {
            const dbResult = await LocoPosition.bulkWrite(operations, { ordered: false });
            console.log(`[Cron] ✅ DB updated. Added: ${dbResult.upsertedCount}, Modified: ${dbResult.modifiedCount}`);
        } else {
            console.log('[Cron] ℹ️ No new valid data to write.');
        }
    } catch (error) {
        console.error('[Cron] ❌ A critical error occurred:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('[Cron] 🔌 DB Disconnected. Job finished.');
    }
};

runJob();
