const axios = require('axios');
const constants = require("../../utils/constants");

const getProposerHeaderRequests = async (RELAY_URL, slotLower, slotUpper) => {
    let data = JSON.stringify({
        "slot_lower": Number(slotLower),
        "slot_upper": Number(slotUpper)
    });

    let url = RELAY_URL.concat(constants.RELAY_HEADER_REQUEST_URL)

    let proposerRequests
    try {
       proposerRequests = await axios.post(url, data)
    } catch (e) {
        console.log(`getProposerHeaderRequests: Unable to get proposer header requests from ${url}`)
        return null
    }
    return proposerRequests.data
};

module.exports = {
    getProposerHeaderRequests
};