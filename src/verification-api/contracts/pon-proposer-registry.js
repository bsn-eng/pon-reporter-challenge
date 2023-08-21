const {ethers} = require('ethers');
const ProposerRegistryABI = require('../../abis/ProposerRegistryABI.json');

const getProposerRegistry = (provider, address) => {
    return new ethers.Contract(
        address,
        ProposerRegistryABI,
        provider
    )
}

module.exports = {
    getProposerRegistry
}