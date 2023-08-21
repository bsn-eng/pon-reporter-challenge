const axios = require('axios');

const getProposers = async (payoutPoolURL) => {
    let data = JSON.stringify({
      query: `{
                proposers(first:1000, where:{
                    status: "1"
                }){
                    id
                }
            }`,
      variables: {}
    });
    
    let proposers
    try {
        proposers = await axios.post(payoutPoolURL, data)
    } catch (e) {
        console.log(`getProposers: Failed to get list of proposers from ${payoutPoolURL}`);
        return []
    }
    
    let validProposers = proposers.data.data.proposers
    let allProposers = []
    for (let proposer = 0; proposer < validProposers.length; proposer++) {
        allProposers.push(validProposers[proposer].id)
    }

    return allProposers
};

module.exports = {
    getProposers
};