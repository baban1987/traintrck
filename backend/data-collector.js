// data-collector.js (Final Version for Render Web Service)
const { parentPort } = require('worker_threads');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const LocoPosition = require('./models/locoPosition');
const MONGO_URI = process.env.MONGO_URI;

const parseFoisResponse = (locoId, foisData) => { /* ... (logic is correct) ... */ };

const collectData = async () => {
    if (mongoose.connection.readyState !== 1) { console.log('[Worker] MongoDB not connected, skipping.'); return; }
    console.log('[Worker] 🕒 Starting data collection cycle...');
    try {
        const directoryResponse = await axios.post('https://www.railjournal.in/RailRadar/', 'action=refresh_data');
        const activeLocos = directoryResponse.data.locoData;
        if (!activeLocos || activeLocos.length === 0) { console.log('[Worker] ℹ️ No active locos found.'); return; }
        console.log(`[Worker] Found ${activeLocos.length} active locos. Fetching live data from FOIS...`);
        const foisPromises = activeLocos.map(loco => {
            const url = `https://fois.indianrail.gov.in/foisweb/GG_AjaxInteraction?Optn=RTIS_CURRENT_LOCO_RPTG&Loco=${loco.loco_no}`;
            return axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0...' } })
                .then(response => ({ loco_no: loco.loco_no, data: response.data, status: 'fulfilled' }))
                .catch(error => ({ loco_no: loco.loco_no, status: 'rejected', reason: error.message }));
        });
        const results = await Promise.all(foisPromises);
        const operations = [];
        let successCount = 0;
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const parsedData = parseFoisResponse(result.loco_no, result.data);
                if (parsedData) {
                    const directoryInfo = activeLocos.find(l => l.loco_no === parsedData.loco_no);
                    if (directoryInfo && directoryInfo.train_no) { parsedData.train_no = directoryInfo.train_no; }
                    operations.push({ updateOne: { filter: { loco_no: parsedData.loco_no, timestamp: parsedData.timestamp }, update: { $set: parsedData }, upsert: true } });
                    successCount++;
                }
            }
        }
        console.log(`[Worker] Successfully fetched data for ${successCount}/${activeLocos.length} locos.`);
        if (operations.length > 0) {
            const dbResult = await LocoPosition.bulkWrite(operations, { ordered: false });
            console.log(`[Worker] ✅ Database updated. Added: ${dbResult.upsertedCount}, Modified: ${dbResult.modifiedCount}`);
        } else {
            console.log('[Worker] ℹ️ No new valid data to write.');
        }
    } catch (error) {
        console.error('[Worker] ❌ A critical error occurred:', error.message);
    }
};

const start = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[Worker] ✅ Successfully connected to MongoDB Atlas!');
    await collectData(); // Run once on start
    setInterval(collectData, 1 * 60 * 1000); 
    console.log('[Worker] 🕒 Data collection scheduled to run every 1 minute.');
  } catch (err) {
    console.error('[Worker] ❌ Error connecting to MongoDB:', err);
    if (parentPort) parentPort.postMessage({ error: err.message });
    else process.exit(1);
  }
};

start();
