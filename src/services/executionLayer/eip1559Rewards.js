const { calculatePenalty } = require('../../utils/financials');

const getSlotRewards = async (slot, w3) => {
    const slotRewards = await w3.eth.getFeeHistory(slot, 'latest', [10, 90])

    const priorityFees = slotRewards.reward
    const gasUsed =  slotRewards.gasUsedRatio
    
    return calculatePenalty(priorityFees, gasUsed);
};

module.exports = {
    getSlotRewards
};