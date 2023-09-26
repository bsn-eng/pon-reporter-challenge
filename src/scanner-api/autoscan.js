require("dotenv").config();

const Web3 = require("web3");
const axios = require("axios");

const { epochReporter } = require("../core-reporter/reporter");

const { FINALITY_CHECKPOINTS_URL } = require("../utils/constants");
const EXECUTION_LAYER_PROVIDER = process.env.EXECUTION_LAYER_PROVIDER;

const EventSource = require("eventsource");

const BEACON_URL = process.env.BEACON_URL;
const FINALITY_EVENTS = "/eth/v1/events?topics=finalized_checkpoint";
let eventSourceInitDict = { headers: { Accept: "text/event-stream" } };

async function getListOfViolations(finalizedEpoch) {
  const listOfViolations = await epochReporter(
    finalizedEpoch,
    new Web3.providers.HttpProvider(EXECUTION_LAYER_PROVIDER),
  );
  console.log(listOfViolations);
}

async function checkForViolations() {
  console.log("\x1b[33m", "First, check current", "\x1b[0m");
  let axiosResponse;

  try {
    axiosResponse = await axios.get(`${BEACON_URL}${FINALITY_CHECKPOINTS_URL}`);
  } catch (e) {
    throw new Error(
      `getCurrentSlotInfo: Failed to get finalized epoch at ${BEACON_URL}${FINALITY_CHECKPOINTS_URL}`,
    );
  }

  const apiData = axiosResponse.data;
  const { finalized } = apiData.data;
  let epoch = parseInt(finalized.epoch);

  const currentFinalizedEpoch = Number(epoch) - 2;
  await getListOfViolations(currentFinalizedEpoch);
}

async function main() {
  await checkForViolations();

  const url = `${BEACON_URL}${FINALITY_EVENTS}`;

  console.log(
    "\x1b[33m",
    "Listening for finalized epoch events (7 minutes):",
    "\x1b[0m",
  );
  let es = new EventSource(url, eventSourceInitDict);

  es.addEventListener("finalized_checkpoint", async function(e) {
    const dataParsed = JSON.parse(e.data);
    const currentEpoch = Number(dataParsed.epoch);
    const finalizedEpoch = currentEpoch - 3;

    await getListOfViolations(finalizedEpoch);

    console.log("\x1b[33m", "The next epoch is in 7 minutes:", "\x1b[0m");
  });
}

main();
