const { Web3 } = require('web3');
const {ethers} = require('ethers');

const {getEpochProposers} = require("../services/beaconChain/epochProposers");
const {isValidatorSlashedOrEffectiveLow} = require("../services/beaconChain/slashedProposers");
const {getProposers} = require("../services/payoutPool/getValidProposers");
const {ponSlots} = require("../utils/utils");
const {getMissedSlots, getLastExecutionBlockNumBeforeAMissedSlot} = require("../services/beaconChain/missedSlot");
const {getCurrentSlotInfo} = require("../services/beaconChain/slotInfo");
const {getProposerPayloadDelivered} = require("../services/relay/getProposerDelivered");
const {getProposerHeaderRequests} = require("../services/relay/getProposerRequests");
const {getHighestValueHeaderForEachSlot, isUnderpayment} = require("../services/relay/highestBid");
const {getBuilderSubmissionForSlotBasedOnProposerHeaderRequestsAndResponses} = require("../services/relay/processBuilderSubmissions");
const {getSlotPayment} = require("../services/beaconChain/slotPayment");
const {getBuilderBidSubmissions} = require("../services/relay/getBlockSubmissions");
const {getSlotRewards} = require("../services/executionLayer/eip1559Rewards");
const {getBlocksInAnEpoch, getExecutionBlockInAnEpoch} = require("../services/executionLayer/blocksInAnEpoch");
const {epochToSlot, getRpbsPayloadFromBuilderSubmission} = require('../utils/utils');
const {getAlternativeFeeRecipientMultipleBLSKeys} = require('../services/proposerRegistry/index');
const constants = require('../utils/constants');

const EXECUTION_LAYER_PROVIDER = process.env.EXECUTION_LAYER_PROVIDER;
const PAYOUT_POOL_URL = process.env.PAYOUT_POOL_URL;
const BEACON_URL = process.env.BEACON_URL;
const RELAY_URL = process.env.RELAY_URL;
const PAYOUT_POOL_ADDRESS = process.env.PAYOUT_POOL_ADDRESS;
const PROPOSER_REGISTRY = process.env.PROPOSER_REGISTRY;

const epochReporter = async (epoch, alternativeWeb3Provider) => {
    console.log('Epoch reporter triggered for epoch:', epoch)

    const provider = new Web3.providers.HttpProvider(EXECUTION_LAYER_PROVIDER);
    const ethersProvider = new ethers.providers.Web3Provider(alternativeWeb3Provider ? alternativeWeb3Provider : provider);
    const web3 = new Web3(provider);

    /////////////////////////////////////////////////////////
    /// @dev All slots For Which Penalty Needs To Be Imposed
    /////////////////////////////////////////////////////////

    /// @dev Penalty For Payment By Builder Less Than Bid For
    let penaltiesForInvalidBuilderPayment = []

    /// @dev Penalty Proposer Offline, Not Asking For Header
    let penaltiesForProposersOffline = []

    /// @dev Penalty Proposer Not Sending Blinded Block
    let penaltiesForProposerNoSignedHeaderReturned = []

    /// @dev Penalty For Builder Not Proposing For Slot
    let penaltiesForBuildersNotPublishing = []

    // @dev Penalty associated with proposers that have been slashed or have their effective balances fall below 32
    let penaltiesForProposersSlashed = []

    let currentSlot = (await getCurrentSlotInfo(BEACON_URL)).toString();
    let currentEpoch = (Number(currentSlot) / 32).toString();
    let previousFinalisedEpoch = currentEpoch === '0' ? 0 : Number(currentEpoch - 2);
    console.log('Current Finalized Slot', currentSlot);
    console.log('Current Finalized Epoch', currentEpoch);
    if (Number(epoch) > previousFinalisedEpoch) {
        return {
            error: `Only past epochs that have reached finality i.e. [${previousFinalisedEpoch}] and before. Epoch ${epoch} is either in the future or still in progress`,
            currentEpoch
        };
    }

    /// @dev Slots Won By PON Validators
    let proposersEpoch = await getEpochProposers(epoch, BEACON_URL);
    if (!proposersEpoch || !proposersEpoch.length) {
        return {
            error: 'Failed to get the list of proposers selected by the RANDAO'
        }
    }

    let ponProposers = await getProposers(PAYOUT_POOL_URL);
    let alternativeFeeRecipientPromise = getAlternativeFeeRecipientMultipleBLSKeys(ethersProvider, PROPOSER_REGISTRY, ponProposers)
    if (!ponProposers || !ponProposers.length) {
        return {
            error: 'Failed to get the list of registered PoN proposers'
        }
    }

    let slotsToProcess = await ponSlots(proposersEpoch, ponProposers);

    // Check if any proposers have been slashed on the consensus layer
    let blsKeyToAlternativeFeeRecipient = await alternativeFeeRecipientPromise
    const isSlashedPromises = [];
    for (let i = 0; i < ponProposers.length; ++i) {
        isSlashedPromises.push(isValidatorSlashedOrEffectiveLow(BEACON_URL, ponProposers[i], blsKeyToAlternativeFeeRecipient));
    }

    const slotFromEpoch = parseInt(Number(epoch) * 32).toString();
    const executionBlock = await getExecutionBlockInAnEpoch(BEACON_URL, slotFromEpoch)
    for (let i = 0; i < ponProposers.length; ++i) {
        if (await isSlashedPromises[i]) {
            penaltiesForProposersSlashed.push({
                blsKey: ponProposers[i],
                builder: ethers.constants.AddressZero,
                slot: slotFromEpoch,
                block: executionBlock.block_number,
                penaltyType: constants.INTERNAL_PENALTY_TYPE_TO_CONTRACT_TYPE.PROPOSER_SLASHED_OR_LOW_EFFECTIVE, // Proposer Penalty - Disqualification
                amount: '0', // This is zero as enforced by the contract
                internalPenaltyType: constants.INTERNAL_PENALTY_TYPES.PROPOSER_SLASHED_OR_LOW_EFFECTIVE,
                relayUrl: RELAY_URL,
                rpbs: null,
                additionalData: {}
            });
        }
    }

    /// @dev No Slot Won By PoN Proposers
    if (slotsToProcess.length === 0) {
        return {
            penaltiesForInvalidBuilderPayment,
            penaltiesForProposersOffline,
            penaltiesForProposerNoSignedHeaderReturned,
            penaltiesForBuildersNotPublishing,
            penaltiesForProposersSlashed,
            currentEpoch
        };
    }

    /// @dev Missed Slots And Proposed Slots Of The Epoch
    let missedSlot = await getMissedSlots(slotsToProcess, BEACON_URL);
    let proposedSlot = slotsToProcess.filter(x => !missedSlot.includes(x));

    /// @dev Relay Working For The Epoch
    let proposerDeliveredHeaders = await getProposerHeaderRequests(RELAY_URL, epochToSlot(epoch, 1), epochToSlot(epoch, constants.SLOTS_IN_EPOCH))
    let highestValueHeaderForEachSlot = getHighestValueHeaderForEachSlot(proposerDeliveredHeaders);

    let slotPaymentPromises = []
    for (let i = 0; i < proposedSlot.length; ++i) {
        const {slot, blsPubKey} = proposedSlot[i];
        slotPaymentPromises.push(getSlotPayment(slot, BEACON_URL, PAYOUT_POOL_ADDRESS, web3, blsPubKey, blsKeyToAlternativeFeeRecipient))
    }

    let blocksInEpoch = getBlocksInAnEpoch(BEACON_URL, proposedSlot, missedSlot)
    let proposerDeliveredSlots = getProposerPayloadDelivered(RELAY_URL, epochToSlot(epoch, 1), epochToSlot(epoch, constants.SLOTS_IN_EPOCH))
    let builderSubmissions = getBuilderBidSubmissions(RELAY_URL, epochToSlot(epoch, 1), epochToSlot(epoch, constants.SLOTS_IN_EPOCH))
    proposerDeliveredSlots = await proposerDeliveredSlots
    builderSubmissions = await builderSubmissions
    blocksInEpoch = await blocksInEpoch

    /// @dev Penalty For Less Payment Then What Builder Had Bid
    for (let i = 0; i < proposedSlot.length; ++i) {
        const {blsPubKey, slot} = proposedSlot[i];
        let {payment, executionBlockNumber, builder, reverted} = await slotPaymentPromises[i];
        let {
            result,
            blockForSlot,
            builderBid,
            expectedPayment
        } = isUnderpayment(
            builderSubmissions,
            slot,
            blocksInEpoch,
            proposerDeliveredHeaders,
            proposerDeliveredSlots,
            executionBlockNumber,
            highestValueHeaderForEachSlot,
            reverted,
            payment
        );

        if ((!builderBid || !builderBid.BuilderPubkey) && builder === ethers.constants.AddressZero) {
            console.warn(`No builder bid matching execution layer block hash found in proposed slot ${slot} whilst checking for underpayment`);
            continue;
        }

        // If we have an underpayment true result, we will track it
        if (result) {
            penaltiesForInvalidBuilderPayment.push({
                blsKey: blsPubKey,
                builder: builder === ethers.constants.AddressZero ? builderBid.BuilderPubkey : builder, // builder will be zero when block has no transactions so we get it from bid to relayer
                slot,
                block: blockForSlot.blockNumber,
                penaltyType: constants.INTERNAL_PENALTY_TYPE_TO_CONTRACT_TYPE.BUILDER_UNDERPAYMENT, // Builder Penalty
                amount: (BigInt(2) * BigInt(highestValueHeaderForEachSlot[slot.toString()])).toString(), // Penalty is twice what builder had bid
                internalPenaltyType: constants.INTERNAL_PENALTY_TYPES.BUILDER_UNDERPAYMENT,
                relayUrl: RELAY_URL,
                rpbs: getRpbsPayloadFromBuilderSubmission(builderBid),
                additionalData: {
                    payment: payment.toString(),
                    expectedPayment: expectedPayment.toString()
                }
            });
        }
    }

    /// @dev Penalty For Missed Slots
    for (let i = 0; i < missedSlot.length; ++i) {
        const {slot, blsPubKey} = missedSlot[i];

        /// @dev No Bandwidth Request from any builder to the specified relayer and therefore no Penalty
        if (builderSubmissions[slot] && builderSubmissions[slot].length === 0) {
            // No point continuing for this slot
            continue;
        }

        const builderBidSubmissionsForSlot = builderSubmissions[slot];
        let {
            builderBid,
            ProposerPubkey
        } = getBuilderSubmissionForSlotBasedOnProposerHeaderRequestsAndResponses(
            slot,
            blocksInEpoch,
            builderBidSubmissionsForSlot,
            proposerDeliveredHeaders,
            proposerDeliveredSlots
        );

        const rpbs = getRpbsPayloadFromBuilderSubmission(builderBid);

        /// @dev Proposer Offline. Didn't request a header from the relayer from a winning builder bid
        if (!highestValueHeaderForEachSlot[slot] && blsKeyToAlternativeFeeRecipient[blsPubKey.toLowerCase()] === ethers.constants.AddressZero) {
            let amountGwei = parseInt((2 * Number(await getSlotRewards(slot, web3))).toString()).toString();
            let amount = ethers.utils.parseUnits(amountGwei, 'gwei').toString();

            penaltiesForProposersOffline.push({
                blsKey: ProposerPubkey,
                builder: rpbs.BuilderPubkey,
                slot,
                block: await getLastExecutionBlockNumBeforeAMissedSlot(BEACON_URL, slot),
                penaltyType: constants.INTERNAL_PENALTY_TYPE_TO_CONTRACT_TYPE.PROPOSER_OFFLINE, // Proposer Penalty
                amount, // Penalty Is Twice EIP1559 Rewards
                internalPenaltyType: constants.INTERNAL_PENALTY_TYPES.PROPOSER_OFFLINE,
                relayUrl: RELAY_URL,
                rpbs,
                additionalData: {}
            });

            // No point continuing for this slot
            continue;
        }

        /// @dev Proposer requested a header for signing from the relayer but did not return a signed header payload so that builder can publish a block
        if (!proposerDeliveredSlots[slot] && blsKeyToAlternativeFeeRecipient[blsPubKey.toLowerCase()] === ethers.constants.AddressZero) {
            let amountGwei = parseInt((2 * Number(await getSlotRewards(slot, web3))).toString()).toString();
            let amount = ethers.utils.parseUnits(amountGwei, 'gwei').toString();

            penaltiesForProposerNoSignedHeaderReturned.push({
                blsKey: ProposerPubkey,
                builder: rpbs && rpbs.BuilderPubkey ? rpbs.BuilderPubkey : ethers.constants.AddressZero,
                slot,
                block: await getLastExecutionBlockNumBeforeAMissedSlot(BEACON_URL, slot),
                penaltyType: constants.INTERNAL_PENALTY_TYPE_TO_CONTRACT_TYPE.PROPOSER_DID_NOT_SIGN, // Proposer Penalty
                amount, // Penalty Is Twice EIP1559 Rewards
                internalPenaltyType: constants.INTERNAL_PENALTY_TYPES.PROPOSER_DID_NOT_SIGN,
                relayUrl: RELAY_URL,
                rpbs,
                additionalData: {}
            });

            // No point continuing for this slot
            continue;
        }

        /// @dev Builder Didn't Submit For Slot To Beacon Chain
        penaltiesForBuildersNotPublishing.push({
            blsKey: ProposerPubkey,
            builder: rpbs.BuilderPubkey,
            slot,
            block: await getLastExecutionBlockNumBeforeAMissedSlot(BEACON_URL, slot),
            penaltyType: constants.INTERNAL_PENALTY_TYPE_TO_CONTRACT_TYPE.BUILDER_DIDNT_PUBLISH, // Builder Penalty
            amount: (BigInt(2) * BigInt(highestValueHeaderForEachSlot[slot.toString()])).toString(), // Penalty is twice what builder had bid
            internalPenaltyType: constants.INTERNAL_PENALTY_TYPES.BUILDER_DIDNT_PUBLISH,
            relayUrl: RELAY_URL,
            rpbs,
            additionalData: {}
        });
    }

    return {
        penaltiesForInvalidBuilderPayment,
        penaltiesForProposersOffline,
        penaltiesForProposerNoSignedHeaderReturned,
        penaltiesForBuildersNotPublishing,
        penaltiesForProposersSlashed,
        currentEpoch
    };
};

module.exports = {
    epochReporter
};