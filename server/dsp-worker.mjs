// Runs the sound cleanup (server/dsp.mjs) off the server's thread: workerData {samples, rate, strength}.
import {parentPort, workerData} from 'node:worker_threads';
import {denoise} from './dsp.mjs';

const y = denoise(workerData.samples, workerData.rate, workerData.strength);
parentPort.postMessage(y, [y.buffer]);
