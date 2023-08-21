const axios = require('axios');
const constants = require("../../utils/constants")


const getProposerPayloadDelivered = async (RELAY_URL, slotLower, slotUpper) => {
    let data = JSON.stringify({
        "slot_lower": Number(slotLower),
        "slot_upper": Number(slotUpper)
    });

    let url = RELAY_URL.concat(constants.RELAY_DELIVERED_URL)

    let proposerDeliveredSlot
    try {
        proposerDeliveredSlot = await axios.post(url, data)
    } catch (e) {
        console.log(`getProposerPayloadDelivered: Failed to get proposer payload delivered from ${url}`)
        return null
    }

    return proposerDeliveredSlot.data
};

module.exports = {
    getProposerPayloadDelivered
};