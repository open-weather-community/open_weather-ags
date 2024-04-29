const rtljs = require("rtljs");

console.log(rtljs.getDeviceCount()); // 1
console.log(rtljs.getDeviceName(0)); // Generic RTL R820T2

let device = rtljs.open(0);
device.setCenterFreq(1090 * rtljs.mhz); // 1090000000

// raw IQ data
device.resetBuffer(); // reset buffer to prevent communication data from appearing as radio data
let data = device.readSync(512); // read 512b
console.log(JSON.stringify(data)); // [128, 127, 128... etc

rtljs.close(device);