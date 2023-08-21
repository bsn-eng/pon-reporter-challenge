const axios = require('axios');
const constants = require('../../utils/constants')

const getEpochProposers = async (epoch, BEACON_URL) => {

    let url = BEACON_URL.concat(constants.PROPOSER_DUTY_URL, epoch)
    let resp
    try {
        resp = await axios.get(url);
    } catch (e) {
        console.log(`getEpochProposers: Failed to get proposer duties from ${url}`);
        return []
    }

    let slots = resp.data.data

    let slotWiseProposers = [];
    for (let i = 0; i < slots.length; i++) {
        slotWiseProposers.push({
            blsPubKey: slots[i].pubkey,
            slot: slots[i].slot
        });
    }

    return slotWiseProposers
};

module.exports = {
    getEpochProposers
};