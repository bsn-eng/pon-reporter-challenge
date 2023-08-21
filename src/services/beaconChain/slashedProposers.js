const axios = require('axios');
const constants = require('../../utils/constants');
const {ethers} = require("ethers");

const isValidatorSlashedOrEffectiveLow = async (BEACON_URL, blsPubKey, blsKeyToAlternativeFeeRecipient) => {

    let url = BEACON_URL.concat(constants.VALIDATOR_STATE_URL(blsPubKey))
    let resp
    try {
        resp = await axios.get(url);
    } catch (e) {
        console.log(`isValidatorSlashedOrEffectiveLow: Unable to get validator state from ${url}`)
        return false;
    }
    let apiData = resp.data

    const { validator } = apiData.data
    const { slashed, effective_balance } = validator

    // Effective balance tracked in gwei
    // Only check this condition if the proposer is registered to the payout pool
    return (slashed || (Number(effective_balance) < 32 * 10 ** 9)) && blsKeyToAlternativeFeeRecipient[blsPubKey.toLowerCase()] === ethers.constants.AddressZero;
};

module.exports = {
    isValidatorSlashedOrEffectiveLow
};