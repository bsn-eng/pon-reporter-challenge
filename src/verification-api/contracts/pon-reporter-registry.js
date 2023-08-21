const {ethers} = require('ethers');
const ReporterRegistryABI = require('../../abis/ReporterRegistryABI.json');

const getReporterRegistry = (provider, address) => {
    return new ethers.Contract(
        address,
        ReporterRegistryABI,
        provider
    )
}

const getUnsignedReportHash = async (reporterRegistry, report) => {
    return reporterRegistry.computeTypedHash(report);
}

module.exports = {
    getReporterRegistry,
    getUnsignedReportHash,
}