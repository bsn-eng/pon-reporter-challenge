const _ = require('lodash');
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

const PORT = 9565;
const PROVIDER_URL = process.env.EXECUTION_LAYER_PROVIDER;
const CONSENSUS_LAYER_URL = process.env.CONSENSUS_LAYER_PROVIDER;
const REPORTER_REGISTRY = process.env.REPORTER_REGISTRY;
const PROPOSER_REGISTRY = process.env.PROPOSER_REGISTRY;
const BUILDER_REGISTRY = process.env.BUILDER_REGISTRY;
const DESIGNATED_VERIFIER_PRIVATE_KEY = process.env.DESIGNATED_VERIFIER_PRIVATE_KEY;
const PAYOUT_POOL_ADDRESS = process.env.PAYOUT_POOL_ADDRESS;

const axios = require("axios");
const {ethers} = require('ethers');
const Web3 = require('web3');
const {getProvider, signReport} = require('./contracts/signer');
const {getReporterRegistry, getUnsignedReportHash} = require('./contracts/pon-reporter-registry');
const {getProposerRegistry} = require('./contracts/pon-proposer-registry');
const {getBuilderRegistry} = require('./contracts/pon-builder-registry');
const {INTERNAL_PENALTY_TYPES, INTERNAL_PENALTY_TYPE_TO_CONTRACT_TYPE} = require('../utils/constants');
const {getProposerHeaderRequests} = require("../services/relay/getProposerRequests");
const {getProposerPayloadDelivered} = require("../services/relay/getProposerDelivered");
const {getProposerForSlot} = require('../services/beaconChain/validatorForSlot');
const {getSlotRewards} = require("../services/executionLayer/eip1559Rewards");
const {getHighestValueHeaderForEachSlot, isUnderpayment} = require("../services/relay/highestBid");
const {getExecutionBlockNumberFromSlot, getExecutionBlockInAnEpoch} = require("../services/executionLayer/blocksInAnEpoch");
const {unmarshallRPBSSignature, isSignatureValid, marshalRPBSSignatureToHex} = require('./rpbs-utils');
const {getCurrentSlotInfo} = require("../services/beaconChain/slotInfo");
const {isValidatorSlashedOrEffectiveLow} = require("../services/beaconChain/slashedProposers");
const {getBuilderBidSubmissions} = require("../services/relay/getBlockSubmissions");
const {getSlotPayment} = require("../services/beaconChain/slotPayment");
const {getAlternativeFeeRecipient} = require("../services/proposerRegistry");

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

/// @dev Validate whether a list of PoN penalties have actually taken place
app.post('/validate', async (req, res) => {
    const body = req.body;
    if (!body || !body.reports || !body.reports.length) {
        res.status(500);
        res.json({
            error: 'Missing body or data'
        });
        return;
    }

    const web3 = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL));

    const reports = []
    const designatedVerifierSignatures = []
    for (let i = 0; i < body.reports.length; i++) {
        let reportWithMetadata = body.reports[i];
        if (!reportWithMetadata.blsKey ||
            !reportWithMetadata.builder ||
            !reportWithMetadata.amount ||
            !reportWithMetadata.slot ||
            !reportWithMetadata.block ||
            reportWithMetadata.penaltyType === undefined ||
            reportWithMetadata.rpbs === undefined ||
            !reportWithMetadata.internalPenaltyType ||
            !reportWithMetadata.relayUrl
        ) {
            res.status(500);
            res.json({
                error: `Invalid report (${i+1})`
            });
            return;
        }

        let {internalPenaltyType, relayUrl, rpbs, additionalData, ...report} = reportWithMetadata;
        if (internalPenaltyType !== INTERNAL_PENALTY_TYPES.PROPOSER_SLASHED_OR_LOW_EFFECTIVE) {
            if (!rpbs || !rpbs.BuilderPubkey || !rpbs.BuilderSignature || !rpbs.signature || !rpbs.RpbsPublicKey || !rpbs.TransactionByte || !rpbs.Value) {
                res.status(500);
                res.json({
                    error: `Invalid RPBS payload (${i+1})`
                });
                return;
            }

            // Perform RPBS verification
            // Common info construction: "BuilderWalletAddress:%s,Slot:%d,Amount:%d,Transaction:%s"
            const commonInfo = `BuilderWalletAddress:${rpbs.BuilderPubkey},Slot:${report.slot},Amount:${rpbs.Value},Transaction:${rpbs.TransactionByte}`
            const isRPBSValid = isSignatureValid(
                unmarshallRPBSSignature(JSON.parse(rpbs.signature)),
                commonInfo.toLowerCase(),
                rpbs.RpbsPublicKey
            );

            if (!isRPBSValid) {
                res.status(500);
                res.json({ error: `Invalid RPBS signature for slot (${report.slot}) (${i+1})`});
                return;
            }
        }

        const currentSlotNumber = Number(await getCurrentSlotInfo(CONSENSUS_LAYER_URL));
        console.log('Current Slot Number (Finality)', currentSlotNumber)
        if (Number(report.slot) + 64 > currentSlotNumber) {
            res.status(500);
            res.json({ error: `Finality not yet reached for slot (${report.slot}) (${i+1})`});
            return;
        }

        if (!_.includes(INTERNAL_PENALTY_TYPES, internalPenaltyType)) {
            res.status(500);
            res.json({
                error: `Invalid internal penalty type for report (${i+1})`
            });
            return;
        }

        if (INTERNAL_PENALTY_TYPE_TO_CONTRACT_TYPE[internalPenaltyType] !== report.penaltyType) {
            res.status(500);
            res.json({
                error: `Invalid penalty type for report (${i+1})`
            });
            return;
        }

        if (internalPenaltyType === INTERNAL_PENALTY_TYPES.BUILDER_UNDERPAYMENT) {
            const assignedProposerForSlot = await getProposerForSlot(CONSENSUS_LAYER_URL, report.slot);
            if (assignedProposerForSlot.toLowerCase() !== report.blsKey.toLowerCase()) {
                console.log('assignedProposerForSlot', assignedProposerForSlot);
                res.status(500);
                res.json({
                    error: `Invalid bls key (${report.blsKey}) for report (${i+1}).`
                });
                return;
            }
        }

        const provider = getProvider(PROVIDER_URL);
        const proposerRegistry = getProposerRegistry(provider, PROPOSER_REGISTRY);
        if (!(await proposerRegistry.isProposerReportable(report.blsKey))) {
            res.status(500);
            res.json({
                error: `${report.blsKey} validator is not reportable`
            });
            return;
        }

        const builderRegistry = getBuilderRegistry(provider, BUILDER_REGISTRY)
        if (report.builder !== ethers.constants.AddressZero) {
            if (!(await builderRegistry.isBuilderOperational(report.builder))) {
                res.status(500);
                res.json({
                    error: `${report.builder} builder is not operational`
                });
                return;
            }

            if (!(await builderRegistry.isBuilderReportable(report.builder))) {
                res.status(500);
                res.json({
                    error: `${report.builder} builder is not reportable`
                });
                return;
            }
        }

        let proposerDeliveredHeaders
        if (internalPenaltyType !== INTERNAL_PENALTY_TYPES.PROPOSER_SLASHED_OR_LOW_EFFECTIVE) {
            proposerDeliveredHeaders = await getProposerHeaderRequests(relayUrl, report.slot, report.slot);
            if (!proposerDeliveredHeaders || !proposerDeliveredHeaders.length) {
                res.status(500);
                res.json({ error: `${report.blsKey} - Unable to get delivered headers`});
                return;
            }
        }

        if (internalPenaltyType === INTERNAL_PENALTY_TYPES.BUILDER_UNDERPAYMENT) {
            let executionLayerBlockForSlot = await getExecutionBlockNumberFromSlot(CONSENSUS_LAYER_URL, report.slot);
            if (executionLayerBlockForSlot.toString() !== reportWithMetadata.block) {
                res.status(500);
                res.json({ error: `Invalid execution block specified`});
                return;
            }

            const block = await web3.eth.getBlock(reportWithMetadata.block);
            const numOfTransactions = block.transactions.length;
            const lastTransactionHash = block.transactions[numOfTransactions - 1];
            const lastTransaction = await web3.eth.getTransaction(lastTransactionHash);

            if (lastTransaction.to.toLowerCase() !== PAYOUT_POOL_ADDRESS.toLowerCase()) {
                res.status(500);
                res.json({ error: `Payout pool transaction not found in last transaction in the block`});
                return;
            }

            const parsedTransactionFromRPBSSelfAttestation = ethers.utils.parseTransaction(rpbs.TransactionByte);
            if (lastTransactionHash.toLowerCase() !== parsedTransactionFromRPBSSelfAttestation.hash.toLowerCase()) {
                res.status(500);
                res.json({ error: `Payout pool transaction not matching RPBS payload`});
                return;
            }
        }

        let highestValueHeaderForEachSlot
        if (internalPenaltyType !== INTERNAL_PENALTY_TYPES.PROPOSER_SLASHED_OR_LOW_EFFECTIVE) {
            highestValueHeaderForEachSlot = getHighestValueHeaderForEachSlot(proposerDeliveredHeaders);
            if (internalPenaltyType !== INTERNAL_PENALTY_TYPES.PROPOSER_OFFLINE && (!highestValueHeaderForEachSlot || !highestValueHeaderForEachSlot[report.slot.toString()])) {
                res.status(500);
                res.json({ error: `${report.blsKey} - No Highest header`});
                return;
            }
        }

        let builderSubmissions
        let blocksInEpoch = []
        let proposerDeliveredSlots
        let slotPayment
        let alternativeFeeRecipientPromise = getAlternativeFeeRecipient(provider, PROPOSER_REGISTRY, report.blsKey)
        let blsKeyToAlternativeFeeRecipient = {}
        blsKeyToAlternativeFeeRecipient[report.blsKey.toLowerCase()] = await alternativeFeeRecipientPromise
        if (internalPenaltyType !== INTERNAL_PENALTY_TYPES.PROPOSER_SLASHED_OR_LOW_EFFECTIVE) {
            builderSubmissions = await getBuilderBidSubmissions(relayUrl, report.slot, report.slot)
            let executionBockInAnEpoch = await getExecutionBlockInAnEpoch(CONSENSUS_LAYER_URL, report.slot)
            if (executionBockInAnEpoch) {
                blocksInEpoch.push({
                    slot: report.slot,
                    blockNumber: executionBockInAnEpoch.block_number,
                    blockHash: executionBockInAnEpoch.block_hash
                });
            } else {
                blocksInEpoch.push({
                    slot: report.slot,
                    blockNumber: null,
                    blockHash: null,
                });
            }

            proposerDeliveredSlots = await getProposerPayloadDelivered(relayUrl, report.slot, report.slot);
            if (internalPenaltyType === INTERNAL_PENALTY_TYPES.BUILDER_UNDERPAYMENT) {
                slotPayment = await getSlotPayment(report.slot, CONSENSUS_LAYER_URL, PAYOUT_POOL_ADDRESS, web3, report.blsKey, blsKeyToAlternativeFeeRecipient);
            }
        }

        switch (internalPenaltyType) {
            case INTERNAL_PENALTY_TYPES.PROPOSER_SLASHED_OR_LOW_EFFECTIVE:
                if (report.amount !== '0') {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - amount should be zero`});
                    return;
                }

                const isValidatorBeingKicked = await isValidatorSlashedOrEffectiveLow(CONSENSUS_LAYER_URL, report.blsKey, blsKeyToAlternativeFeeRecipient)
                if (!isValidatorBeingKicked) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - false report that the validator is being kicked`});
                    return;
                }

                break;
            case INTERNAL_PENALTY_TYPES.BUILDER_UNDERPAYMENT:
                let {payment, executionBlockNumber, builder, reverted} = slotPayment;
                let {
                    result,
                    builderBid,
                    expectedPayment
                } = isUnderpayment(
                    builderSubmissions,
                    report.slot,
                    blocksInEpoch,
                    proposerDeliveredHeaders,
                    proposerDeliveredSlots,
                    executionBlockNumber,
                    highestValueHeaderForEachSlot,
                    reverted,
                    payment
                );

                if (!result) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - No underpayment detected for slot ${report.slot}`});
                    return;
                }

                if (!builderBid || !builderBid.BuilderPubkey) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - No builder bid detected for slot ${report.slot}`});
                    return;
                }

                if (expectedPayment.toString() !== additionalData.expectedPayment) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Expected payment mismatch for slot ${report.slot}`});
                    return;
                }

                if (payment.toString() !== additionalData.payment) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Actual payment mismatch for slot ${report.slot}`});
                    return;
                }

                if ((BigInt(2) * BigInt(highestValueHeaderForEachSlot[report.slot.toString()])).toString() !== report.amount) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Invalid amount`});
                    return;
                }
                break;
            case INTERNAL_PENALTY_TYPES.PROPOSER_OFFLINE:
                if (blsKeyToAlternativeFeeRecipient[report.blsKey.toLowerCase()] !== ethers.constants.AddressZero) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - PROPOSER_OFFLINE - Alternative fee recipient set ${blsKeyToAlternativeFeeRecipient[report.blsKey.toLowerCase()]}.`});
                    return;
                }

                if (highestValueHeaderForEachSlot[report.slot.toString()]) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Header request found for slot ${report.slot}`});
                    return;
                }

                let amountGwei1 = parseInt((2 * Number(await getSlotRewards(report.slot, web3))).toString()).toString();
                let expectedAmount1 = ethers.utils.parseUnits(amountGwei1, 'gwei').toString();
                if (report.amount !== expectedAmount1) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Invalid amount vs expected ${expectedAmount}`});
                    return;
                }
                break;
            case INTERNAL_PENALTY_TYPES.PROPOSER_DID_NOT_SIGN:
                if (blsKeyToAlternativeFeeRecipient[report.blsKey.toLowerCase()] !== ethers.constants.AddressZero) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - PROPOSER_DID_NOT_SIGN - Alternative fee recipient set ${blsKeyToAlternativeFeeRecipient[report.blsKey.toLowerCase()]}.`});
                    return;
                }

                if (proposerDeliveredSlots[report.slot.toString()]) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Payload request found for slot ${report.slot}`});
                    return;
                }

                let amountGwei2 = parseInt((2 * Number(await getSlotRewards(report.slot, web3))).toString()).toString();
                let expectedAmount2 = ethers.utils.parseUnits(amountGwei2, 'gwei').toString();
                if (report.amount !== expectedAmount2) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Invalid amount vs expected ${expectedAmount2}`});
                    return;
                }
                break;
            case INTERNAL_PENALTY_TYPES.BUILDER_DIDNT_PUBLISH:
                let httpResponseCode = await getResponse(
                    CONSENSUS_LAYER_URL.concat(`/eth/v1/beacon/headers/${report.slot}`)
                )

                if (httpResponseCode !== 404) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Block was published`});
                    return;
                }

                if ((BigInt(2) * BigInt(highestValueHeaderForEachSlot[report.slot.toString()])).toString() !== report.amount) {
                    res.status(500);
                    res.json({ error: `${report.blsKey} - Invalid amount`});
                    return;
                }
        }

        // All checks have passed, sign the report and return
        const reportStruct = {
            ...report,
            signature: rpbs && rpbs.signature ? marshalRPBSSignatureToHex(JSON.parse(rpbs.signature)) : `0x${Buffer.from("").toString('hex')}`
        }
        reports.push(reportStruct);

        const reporterRegistry = getReporterRegistry(provider, REPORTER_REGISTRY);
        const unsignedReportHash = await getUnsignedReportHash(
            reporterRegistry,
            reportStruct
        );

        const signature = signReport(unsignedReportHash, DESIGNATED_VERIFIER_PRIVATE_KEY);
        const designatedVerifierSignature = {
            v: signature.v,
            r: `0x${signature.r.toString('hex')}`,
            s: `0x${signature.s.toString('hex')}`
        };

        designatedVerifierSignatures.push(designatedVerifierSignature);
    }

    res.status(200);
    res.json({
        reports,
        reportsWithMetadata: body.reports,
        designatedVerifierSignatures
    });
});

app.listen(PORT, '127.0.0.1', (error) => {
        if (!error) {
            console.log("Server is Successfully Running, and App is listening on port " + PORT);
        } else
            console.log("Error occurred, server can't start", error);
    }
);