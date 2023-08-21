const _ = require('lodash');
const { SLOTS_IN_EPOCH } = require('./constants.js');

const epochToSlot = (epoch, slot) => {
    return ((epoch * SLOTS_IN_EPOCH) + (slot-1));
};

const ponSlots = async (epochProposers, validProposers) => {
    return _.filter(epochProposers, p => {
        return _.includes(validProposers, p.blsPubKey)
    });
};

const getRpbsPayloadFromBuilderSubmission = (builderSubmission) => {
    if (
       !builderSubmission || !builderSubmission.BuilderPubkey || !builderSubmission.BuilderSignature || !builderSubmission.RPBS || !builderSubmission.RpbsPublicKey || !builderSubmission.TransactionByte || !builderSubmission.BidValue
    ) {
        return null
    }

    const {BuilderPubkey, BuilderSignature, RPBS, RpbsPublicKey, TransactionByte, BidValue} = builderSubmission;
    return {
        BuilderPubkey,
        BuilderSignature,
        signature: RPBS,
        RpbsPublicKey,
        TransactionByte,
        Value: BidValue
    }
}

module.exports = {
    epochToSlot,
    ponSlots,
    getRpbsPayloadFromBuilderSubmission
};