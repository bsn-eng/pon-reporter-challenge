const {ethers} = require('ethers');
const BuilderRegistryABI = require('../../abis/BuilderRegistryABI.json');

const getBuilderRegistry = (provider, address) => {
    return new ethers.Contract(
        address,
        BuilderRegistryABI,
        provider
    )
}

module.exports = {
    getBuilderRegistry
}