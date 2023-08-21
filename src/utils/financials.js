const { BLOCK_MAXIMUM_GAS } = require('./constants.js');

const priorityFeeMedian = async (rewards) => {
    return ((parseInt(rewards[0], 16) + parseInt(rewards[1], 16)) / 2)
}

const calculatePenalty = async (priorityFee, gasUsed) => {

    let totalRewards = 0

    for (let i = 0; i < priorityFee.length; i++) {

        let gas = gasUsed[i] * BLOCK_MAXIMUM_GAS
        let medianRewards = await priorityFeeMedian(priorityFee[i])

        totalRewards += (medianRewards * gas)
      }
    
      return (totalRewards / priorityFee.length)
};

module.exports = {
    calculatePenalty
};