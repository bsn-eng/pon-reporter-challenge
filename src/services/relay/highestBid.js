const {getBuilderSubmissionForSlotBasedOnProposerHeaderRequestsAndResponses} = require("./processBuilderSubmissions");
const getHighestValueHeaderForEachSlot = (proposerDeliveredHeaders) => {
    let highestValueHeaderForEachSlot = {}
    for (let i = 0; i < proposerDeliveredHeaders.length; ++i) {
        let deliveredHeader = proposerDeliveredHeaders[i]
        if (!highestValueHeaderForEachSlot[deliveredHeader.Slot]) {
            highestValueHeaderForEachSlot[deliveredHeader.Slot] = deliveredHeader.BidValue
        } else {
            if (highestValueHeaderForEachSlot[deliveredHeader.Slot] < deliveredHeader.BidValue) {
                highestValueHeaderForEachSlot[deliveredHeader.Slot] = deliveredHeader.BidValue;
            }
        }
    }
    return highestValueHeaderForEachSlot;
}

const isUnderpayment = (
    builderSubmissions,
    slot,
    blocksInEpoch,
    proposerDeliveredHeaders,
    proposerDeliveredSlots,
    executionBlockNumber,
    highestValueHeaderForEachSlot,
    reverted,
    payment
) => {
    let builderBidSubmissionsForSlot = builderSubmissions[slot.toString()];
    let { builderBid, blockForSlot } = getBuilderSubmissionForSlotBasedOnProposerHeaderRequestsAndResponses(
        slot.toString(),
        blocksInEpoch,
        builderBidSubmissionsForSlot,
        proposerDeliveredHeaders,
        proposerDeliveredSlots
    );

    if (executionBlockNumber.toString() !== blockForSlot.blockNumber) {
        throw new Error('Unexpected state');
    }

    let highestValueHeader = highestValueHeaderForEachSlot[slot.toString()];
    return {
        result: highestValueHeader && builderBid && (reverted || payment < BigInt(highestValueHeader)),
        builderBid,
        blockForSlot,
        payment,
        expectedPayment: highestValueHeader
    };
}

module.exports = {
    getHighestValueHeaderForEachSlot,
    isUnderpayment
}