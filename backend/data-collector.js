// data-collector.js
const { parentPort } = require('worker_threads');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const LocoPosition = require('./models/locoPosition');

const MONGO_URI = process.env.MONGO_URI;

// --- Helper function for parsing the FOIS API response ---
const parseFoisResponse = (locoId, foisData) => {
    if (!foisData.LocoDtls || foisData.LocoDtls.length === 0 || !foisData.LocoDtls[0].PopUpMsg) {
        return null;
    }
    const details = foisData.LocoDtls[0];
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

    return {
        loco_no: parseInt(locoId, 10),
        latitude: parseFloat(details.Lttd),
        longitude: parseFloat(details.Lgtd),
        station: stationMatch ? stripHtml(stationMatch[1]) : 'N/A',
        event: eventMatch ? stripHtml(eventMatch[1]) : 'N/A',
        speed: speedMatch ? (parseInt(stripHtml(speedMatch[1]), 10) || 0) : 0,
        timestamp: timestamp, // Store as a Date object for TTL index
    };
};

const processInChunks = async (items, chunkSize, delay, processFn) => {
    let results = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        console.log(`[Worker] Processing chunk ${i / chunkSize + 1} of ${Math.ceil(items.length / chunkSize)}...`);
        const chunkPromises = chunk.map(processFn);
        const chunkResults = await Promise.all(chunkPromises);
        results = results.concat(chunkResults);
        // Add a delay to be kind to the external API
        if (i + chunkSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return results;
};


// --- UPDATED Data Collection Logic ---
const collectData = async () => {
    if (mongoose.connection.readyState !== 1) {
        console.log('[Worker] MongoDB not connected, skipping data collection.');
        return;
    }

    console.log('[Worker] 🕒 Starting data collection cycle...');
    try {
        // Step 1: Get active locos directory
        console.log('[Worker] Fetching active loco directory...');
        const directoryResponse = await axios.post('https://www.railjournal.in/RailRadar/', 'action=refresh_data');
        const activeLocos = directoryResponse.data.locoData;

        if (!activeLocos || activeLocos.length === 0) {
            console.log('[Worker] ℹ️ No active locos found in directory. Ending cycle.');
            return;
        }
        console.log(`[Worker] Found ${activeLocos.length} active locos. Fetching live data from FOIS in chunks...`);

        // Step 2: Define the function that processes a single loco
        const fetchLocoData = (loco) =>
            axios.get(`https://fois.indianrail.gov.in/foisweb/GG_AjaxInteraction?Optn=RTIS_CURRENT_LOCO_RPTG&Loco=${loco.loco_no}`)
                .then(response => ({ loco_no: loco.loco_no, data: response.data, status: 'fulfilled' }))
                .catch(error => ({ loco_no: loco.loco_no, status: 'rejected', reason: error.message }));

        // Step 3: Execute all fetches in controlled chunks
        const CHUNK_SIZE = 50; // Process 50 locos at a time
        const DELAY_BETWEEN_CHUNKS = 1500; // Wait 1.5 seconds between chunks
        const results = await processInChunks(activeLocos, CHUNK_SIZE, DELAY_BETWEEN_CHUNKS, fetchLocoData);

        const operations = [];
        let successCount = 0;

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const parsedData = parseFoisResponse(result.loco_no, result.data);
                if (parsedData) {
                    const directoryInfo = activeLocos.find(l => l.loco_no === parsedData.loco_no);
                    if (directoryInfo && directoryInfo.train_no) {
                        parsedData.train_no = directoryInfo.train_no;
                    }
                    operations.push({
                        updateOne: {
                            filter: { loco_no: parsedData.loco_no, timestamp: parsedData.timestamp },
                            update: { $set: parsedData },
                            upsert: true
                        }
                    });
                    successCount++;
                }
            }
        }

        console.log(`[Worker] Successfully fetched data for ${successCount}/${activeLocos.length} locos.`);

        // Step 4: Bulk write to database
        if (operations.length > 0) {
            const dbResult = await LocoPosition.bulkWrite(operations, { ordered: false });
            console.log(`[Worker] ✅ Database updated. Added: ${dbResult.upsertedCount}, Modified: ${dbResult.modifiedCount}`);
        } else {
            console.log('[Worker] ℹ️ No new valid data to write to the database.');
        }

    } catch (error) {
        console.error('[Worker] ❌ A critical error occurred during the data collection cycle:', error.message);
    }
};

const start = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[Worker] ✅ Successfully connected to MongoDB Atlas!');

        // Run once immediately on start
        await collectData();

        // Then run every 1 minute
        setInterval(collectData, 5 * 60 * 1000);
        console.log('[Worker] 🕒 Data collection scheduled to run every 1 minute.');

    } catch (err) {
        console.error('[Worker] ❌ Error connecting to MongoDB:', err);
        if (parentPort) parentPort.postMessage({ error: err.message });
        else process.exit(1);
    }
};

start();
