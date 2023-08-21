const axios = require('axios');
const constants = require('../../utils/constants');

const getSlot = (BEACON_URL, slot) => {
    return axios.get(constants.BEACON_SLOT_URL(BEACON_URL, slot));
}

const getFinalisedSlotInfo = (BEACON_URL) => {
    return axios.get(BEACON_URL.concat(constants.FINALIZED_BLOCK_URL))
}

const getResponse = async (url) => {
  let responseBeacon = 200
  await axios.get(url)
  .catch(async function (error) {
    if (error.response) {
      responseBeacon = await error.response.status
    }
  });
  return responseBeacon
}

const getMissedSlots = async (slots, BEACON_URL) => {

    let missedSlotsEpochPromises = []
    let missedSlotsEpoch = []

    for (let slot = 0; slot < slots.length; slot++) {
        let epochSlot = slots[slot]
        let promise = getResponse(BEACON_URL.concat(constants.SLOT_URL, epochSlot.slot))
        missedSlotsEpochPromises.push(promise)
    }

    for (let slot = 0; slot < slots.length; slot++) {
        let beaconResponse = Number(await missedSlotsEpochPromises[slot])
        if (beaconResponse === 404) {
            missedSlotsEpoch.push(slots[slot]);
        }
    }
    
    return missedSlotsEpoch
};

const getLastExecutionBlockNumBeforeAMissedSlot = async (BEACON_URL, missedSlotNum) => {
    let found = false;
    let lastSlotNum = Number(missedSlotNum);
    let slotBefore = lastSlotNum - 1;
    let executionLayerBlockNumFound = null

    let promises = []
    for (let i = 0; i < 3; i++) {
        let promise = getResponse(BEACON_URL.concat(constants.SLOT_URL, slotBefore));
        promises.push(promise);

        slotBefore -= 1;
    }

    slotBefore = lastSlotNum - 1;
    for (let i = 0; i < 3; i++) {
        let beaconResponse = await promises[slotBefore];
        if (beaconResponse !== 404) {
            try {
                // We found a non-missed slot so we can get its execution payload block num
                const beaconResponse = await getSlot(BEACON_URL, slotBefore);
                executionLayerBlockNumFound = (Number(beaconResponse.data.data.message.body.execution_payload.block_number) + 1).toString();
                found = true;
                break;
            } catch (e) {
                console.log(`getLastExecutionBlockNumBeforeAMissedSlot: Unable to get beacon slot from ${constants.BEACON_SLOT_URL(BEACON_URL, slotBefore)}`)
            }
        }
        slotBefore -= 1;
    }

    // When we didn't find a block in the last 3 slots before the missed one, fall back where we used current finalised slot to work out diff
    if (!found) {
        try {
            const finalisedInfo = await getFinalisedSlotInfo(BEACON_URL);
            const apiData = finalisedInfo.data;
            const { message } = apiData.data;
            const { body, slot } = message;
            const executionBlockNum = body.execution_payload.block_num;
            const diffFromSlotToExecutionBlockNum = Number(slot) - Number(executionBlockNum);
            executionLayerBlockNumFound = (Number(missedSlotNum) - diffFromSlotToExecutionBlockNum).toString();
        } catch (e) {
            console.log(`getLastExecutionBlockNumBeforeAMissedSlot: Unable to get finalised slot from ${BEACON_URL.concat(constants.FINALIZED_BLOCK_URL)}`)
        }
    }

    return executionLayerBlockNumFound;
}

module.exports = {
    getMissedSlots,
    getLastExecutionBlockNumBeforeAMissedSlot
};