require('dotenv').config();
const Web3 = require('web3');
const express = require('express');
const app = express();

const PORT = 1212;
const EXECUTION_LAYER_PROVIDER = process.env.EXECUTION_LAYER_PROVIDER;

const {epochReporter} = require('../core-reporter/reporter');

/// @dev Service provider infrastructure should have some way of knowing who's supposed to be running software
app.get('/scan', async (req, res) => {
    const query = req.query;
    if (!query) {
        res.status(500);
        res.json({
            error: 'No query supplied'
        });
        return;
    }

    if (!query.epoch || isNaN(query.epoch)) {
        res.status(500);
        res.json({
            error: 'No epoch supplied'
        });
        return;
    }

    const listOfViolations = await epochReporter(query.epoch, new Web3.providers.HttpProvider(EXECUTION_LAYER_PROVIDER));

    res.status(200);
    res.json({
        epoch: query.epoch,
        listOfViolations
    });
})

app.listen(PORT, '127.0.0.1', (error) => {
        if (!error) {
            console.log("Server is Successfully Running, and App is listening on port " + PORT);
        } else
            console.log("Error occurred, server can't start", error);
    }
);