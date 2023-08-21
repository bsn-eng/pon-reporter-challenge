const axios = require('axios');
const {paymentToPayoutPool} = require('../executionLayer/payoutPoolPayment')
const constants = require('../../utils/constants')

const getSlotPayment = async (slot, BEACON_URL, payoutPool, w3, blsPubKey, blsKeyToAlternativeFeeRecipient) => {

    let url = BEACON_URL.concat(constants.BEACON_BLOCK_URL, slot)
    let beaconResponse
    try {
        beaconResponse = await axios.get(url)
    } catch (e) {
        console.log(`getSlotPayment: Failed to get beacon block from ${url}`);
        return {
            slot,
            executionBlockNumber: slotEpochBlock,
            payment,
            builder,
            reverted
        }
    }

    let slotEpochBlock = beaconResponse.data.data.message.body.execution_payload.block_number
    let {payment, builder, reverted} = await paymentToPayoutPool(slotEpochBlock, payoutPool, w3, blsPubKey, blsKeyToAlternativeFeeRecipient)
    return {
        slot,
        executionBlockNumber: slotEpochBlock,
        payment,
        builder,
        reverted
    };
};

module.exports = {
    getSlotPayment
};