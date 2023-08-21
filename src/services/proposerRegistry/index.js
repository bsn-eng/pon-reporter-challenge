const ABI = require('../../abis/ProposerRegistryABI.json');
const {ethers} = require('ethers');

const getRegistry = (provider, address) => {
    return new ethers.Contract(
        address,
        ABI,
        provider
    );
}

const getAlternativeFeeRecipient = async (provider, proposerRegistryAddress, blsPublicKey) => {
    const registry = getRegistry(provider, proposerRegistryAddress)
    return registry.alternativeFeeRecipient(blsPublicKey)
}

const getAlternativeFeeRecipientMultipleBLSKeys = async (provider, proposerRegistryAddress, blsPublicKeys) => {
    let promises = []
    for (let i = 0; i < blsPublicKeys.length; ++i) {
        promises.push(getAlternativeFeeRecipient(provider, proposerRegistryAddress, blsPublicKeys[i]))
    }

    let blsKeyToAlternativeFeeRecipient = {}
    const results = await Promise.all(promises);
    for (let i = 0; i < blsPublicKeys.length; ++i) {
        blsKeyToAlternativeFeeRecipient[blsPublicKeys[i].toLowerCase()] = results[i]
    }

    return blsKeyToAlternativeFeeRecipient;
}

module.exports = {
    getRegistry,
    getAlternativeFeeRecipient,
    getAlternativeFeeRecipientMultipleBLSKeys
}