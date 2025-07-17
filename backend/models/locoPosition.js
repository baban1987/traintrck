const mongoose = require('mongoose');

const locoPositionSchema = new mongoose.Schema({
    loco_no: {
        type: Number,
        required: true,
    },
    train_no: {
        type: Number,
        default: null,
    },
    latitude: {
        type: Number,
        required: true,
    },
    longitude: {
        type: Number,
        required: true,
    },
    speed: Number,
    event: String,
    station: String,
    timestamp: {
        type: Date,
        required: true,
        expires: '6h',
    }
});

// The compound index is still useful to prevent duplicate entries from the data source
locoPositionSchema.index({ loco_no: 1, timestamp: 1 }, { unique: true });

// Mongoose will automatically create the TTL index on the 'timestamp' field upon connection.
const LocoPosition = mongoose.model('LocoPosition', locoPositionSchema);

module.exports = LocoPosition;