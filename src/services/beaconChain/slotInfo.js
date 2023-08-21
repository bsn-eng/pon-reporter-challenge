const axios = require('axios');
const {FINALITY_CHECKPOINTS_URL} = require('../../utils/constants');

const getCurrentSlotInfo = async (BEACON_URL) => {
    let axiosResponse

    try {
        axiosResponse = await axios.get(`${BEACON_URL}${FINALITY_CHECKPOINTS_URL}`)
    } catch (e) {
        throw new Error(`getCurrentSlotInfo: Failed to get finalized epoch at ${BEACON_URL}${FINALITY_CHECKPOINTS_URL}`)
    }

    const apiData = axiosResponse.data
    const {finalized} = apiData.data
    let epoch = parseInt(finalized.epoch)
    return epoch * 32;
}

module.exports = {
    getCurrentSlotInfo
}