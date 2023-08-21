const getBuilderSubmissionForSlotBasedOnProposerHeaderRequestsAndResponses = (
    slot,
    blocksInEpoch,
    builderSubmissionsForSlot,
    proposerPayloadRequests,
    proposerPayloadDeliveries
) => {
    let blockForSlot = blocksInEpoch.filter(b => b.slot.toString() === slot.toString());

    if (blockForSlot.length) {
        blockForSlot = blockForSlot[0];
    } else {
        throw new Error(`Reporting slot does not match one on the chain`)
    }

    let foundHeaderRequest;
    let foundPayloadDeliveredFromProposer;
    let foundSubmission
    let lastFoundBuilderSubmission
    for (let i = 0; i < builderSubmissionsForSlot.length; ++i) {
        const submission = builderSubmissionsForSlot[i];
        const {BuilderBidHash: blockHash} = submission;

        if (blockForSlot.blockHash && blockHash.toLowerCase() !== blockForSlot.blockHash.toLowerCase()) {
            continue;
        }

        // find the header request for the given block hash
        for (let j = 0; j < proposerPayloadRequests.length; ++j) {
            let req = proposerPayloadRequests[j];
            if (req.BlockHash.toLowerCase() === blockHash.toLowerCase()) {
                lastFoundBuilderSubmission = submission;
                foundHeaderRequest = req;
                break;
            }
        }

        for (let k = 0; k < proposerPayloadDeliveries.length; ++k) {
            let res = proposerPayloadDeliveries[k];
            if (res.BlockHash.toLowerCase() === blockHash.toLowerCase()) {
                foundPayloadDeliveredFromProposer = res;
                break;
            }
        }

        if (foundHeaderRequest && foundPayloadDeliveredFromProposer) {
            foundSubmission = submission;
        } else if (foundHeaderRequest && !foundPayloadDeliveredFromProposer) {
            foundSubmission = lastFoundBuilderSubmission;
        }
    }

    let ProposerPubkey = null
    if (foundPayloadDeliveredFromProposer) {
        ProposerPubkey = foundPayloadDeliveredFromProposer.ProposerPubkey
    } else if (foundHeaderRequest) {
        ProposerPubkey = foundHeaderRequest.ProposerPubkey
    }

    return {
        foundHeaderRequest,
        foundPayloadDeliveredFromProposer,
        builderBid: foundSubmission,
        ProposerPubkey,
        blockForSlot
    }
}

module.exports = {
    getBuilderSubmissionForSlotBasedOnProposerHeaderRequestsAndResponses
}