const {ZERO_ADDRESS} = require('../../utils/constants');
const paymentToPayoutPool = async (slotEpochBlock, payoutPool, w3, blsPubKey, blsKeyToAlternativeFeeRecipient) => {
    let block = await w3.eth.getBlock(slotEpochBlock);

    let payment = BigInt(0)
    if (!block.transactions) {
        return {
            payment,
            builder: ZERO_ADDRESS
        }
    }

    let transactionHash = block.transactions[block.transactions.length - 1];
    let transactionDetails = w3.eth.getTransaction(transactionHash);
    let transactionReceipt = w3.eth.getTransactionReceipt(transactionHash);

    transactionDetails = await transactionDetails
    transactionReceipt = await transactionReceipt

    if (transactionReceipt.to.toLowerCase() === payoutPool.toLowerCase()) {
        payment = BigInt(transactionDetails.value)
    } else if (
        blsKeyToAlternativeFeeRecipient[blsPubKey.toLowerCase()] !== ZERO_ADDRESS &&
        transactionReceipt.to.toLowerCase() === blsKeyToAlternativeFeeRecipient[blsPubKey.toLowerCase()].toLowerCase()
    ) {
        payment = BigInt(transactionDetails.value)
    }

    return {
        payment,
        builder: transactionReceipt.from,
        reverted: transactionReceipt.status.toString() === '0'
    };
};

module.exports = {
    paymentToPayoutPool
};