const Web3 = require('web3');
const {ethers} = require('ethers');
const { ecsign } = require('ethereumjs-util');

const getProvider = providerUrl => new ethers.providers.Web3Provider(new Web3.providers.HttpProvider(providerUrl));

const getCurrentBlockNumber = async provider => provider.getBlockNumber()

const signReport = (reportHash, signingKey) => {
    let { v, r, s } = ecsign(
        Buffer.from(reportHash.slice(2), 'hex'),
        Buffer.from(signingKey.slice(2), 'hex')
    );

    return {v, r, s};
}

module.exports = {
    getProvider,
    getCurrentBlockNumber,
    signReport,
}