const axios = require('axios');
const constants = require("../../utils/constants");

const getBuilderBidSubmissions = async (RELAY_URL, slotLower, slotUpper) => {
    let data = JSON.stringify({
        "slot_lower": Number(slotLower),
        "slot_upper": Number(slotUpper)
    });

    let url = RELAY_URL.concat(constants.RELAY_SUBMISSIONS_URL)
    // {
    //   slot: [
    //     {
    //       Builder Bid
    //     },
    //     {
    //       Builder Bid
    //     }
    //   ]
    // }
    let submissions
    try {
        submissions = await axios.post(url, data)
    } catch (e) {
        console.log(`getBuilderBidSubmissions: Failed to get builder submissions from ${url}`)
        return []
    }

    let totalSubmissions = submissions.data
    let slotWiseSubmissions = {}
    for (let slot = slotLower; slot <= slotUpper; slot++) {
        slotWiseSubmissions[slot] = []
    }

    for (let slot = 0; slot < totalSubmissions.length; slot++) {
        slotWiseSubmissions[totalSubmissions[slot].Slot].push(totalSubmissions[slot])
    }

    return slotWiseSubmissions
};

module.exports = {
    getBuilderBidSubmissions
};