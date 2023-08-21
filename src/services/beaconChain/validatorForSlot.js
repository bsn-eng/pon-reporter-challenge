const constants = require("../../utils/constants");
const axios = require("axios");
const getProposerForSlot = async (BEACON_URL, slot) => {
    let urlForBeaconSlot = BEACON_URL.concat(`${constants.BEACON_BLOCK_URL}${slot}`);

    let proposer_index
    try {
        const response = await axios.get(urlForBeaconSlot);
        proposer_index = response.data.data.message.proposer_index;
    } catch (e) {
        console.error(`getProposerForSlot: Unable to get slot at URL ${urlForBeaconSlot}`)
        return null
    }


    let validatorStateResponse
    try {
        let validatorStateUrl = BEACON_URL.concat(constants.VALIDATOR_STATE_URL(proposer_index));
        validatorStateResponse = await axios.get(validatorStateUrl);
    } catch (e) {
        console.error(`getProposerForSlot: Unable to get validator state at URL ${BEACON_URL.concat(constants.VALIDATOR_STATE_URL(proposer_index))}`)
        return null
    }

    let apiData = validatorStateResponse.data;
    const { validator } = apiData.data;
    const { pubkey } = validator;
    return pubkey;
}

module.exports = {
    getProposerForSlot
}