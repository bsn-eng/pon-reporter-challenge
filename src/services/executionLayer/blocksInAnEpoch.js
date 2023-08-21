const _ = require('lodash');
const constants = require("../../utils/constants");
const axios = require("axios");

const getSlot = (BEACON_URL, slot) => {
    return axios.get(constants.BEACON_SLOT_URL(BEACON_URL, slot));
}

const getExecutionBlockInAnEpoch = async (BEACON_URL, slot) => {
    let beaconResponse;

    try {
        beaconResponse = await getSlot(BEACON_URL, slot)
    } catch (e) {
        console.log(`getExecutionBlockInAnEpoch: Failed to get execution block num from ${constants.BEACON_SLOT_URL(BEACON_URL, slot)}`);
        return null
    }

    return beaconResponse.data.data.message.body.execution_payload;
}

const getExecutionBlockNumberFromSlot = async (BEACON_URL, slot) => {
    let execution_payload = await getExecutionBlockInAnEpoch(BEACON_URL, slot)
    return execution_payload.block_number;
}

const getBlocksInAnEpoch = async (BEACON_URL, proposedSlots, missedSlots) => {

    let promises = []
    for (let i = 0; i < proposedSlots.length; ++i) {
        let {slot} = proposedSlots[i]
        promises.push(getSlot(BEACON_URL, slot));
    }

    const executionLayerBlockInfo = []
    for (let i = 0; i < proposedSlots.length; ++i) {
        let {slot} = proposedSlots[i]
        try {
            const beaconResponse = await promises[i];
            const execution_payload = beaconResponse.data.data.message.body.execution_payload;
            executionLayerBlockInfo.push({
                slot,
                blockNumber: execution_payload.block_number,
                blockHash: execution_payload.block_hash,
                executionLayerBlockHash: execution_payload.block_hash,
                proposerIndex: beaconResponse.data.data.message.proposer_index
            });
        } catch (e) {
            console.log(`getBlocksInAnEpoch: Failed to get execution block num from ${constants.BEACON_SLOT_URL(BEACON_URL, slot)}`);
            executionLayerBlockInfo.push({
                slot,
                blockNumber: null,
                blockHash: null,
                executionLayerBlockHash: null,
                proposerIndex: null,
            });
        }
    }

    for (let i = 0; i < missedSlots.length; ++i) {
        let {slot} = missedSlots[i];
        executionLayerBlockInfo.push({
            slot,
            blockNumber: null,
            blockHash: null
        });
    }

    return executionLayerBlockInfo;
}

module.exports = {
    getBlocksInAnEpoch,
    getSlot,
    getExecutionBlockNumberFromSlot,
    getExecutionBlockInAnEpoch
}