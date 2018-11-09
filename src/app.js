/**
 * Copyright 2018 isobar. All Rights Reserved.
 *
 **/

'use strict';

const dgram = require('dgram')
const udpTX = dgram.createSocket('udp4');

const WebSocket = require('ws');

const WEBSOCKET_URI = "wss://emotivcortex.com:54321";
// const WEBSOCKET_ISOBAR_URI = "wss://dbc46093.ngrok.io/";
// const WEBSOCKET_ISOBAR_URI = "ws://10.65.16.232:8000/";
const WEBSOCKET_ISOBAR_URI = "";

const ws = new WebSocket(WEBSOCKET_URI, {rejectUnauthorized:false});

// emotiv insight
const windowSize = 10;
let bands = {
  theta: [],
  alpha: [],
  betaL: [],
  betaH: [],
  gamma: []
};
let bandNames;
let bandName;
let averageBands;
let raw_eeg = {};
let max_eeg = {
  theta: 1000,
  alpha: 500,
  betaL: 300,
  betaH: 400,
  gamma: 100
};
let auth_token = "";
let method = "";

ws.on('open', function open() {
  writeToScreen('CONNECTED');
  login();
});

ws.on('close', function close(evt) {
  writeToScreen('CLOSE:' + evt);

});

ws.on('error', function open(evt) {
  writeToScreen('ERROR:' + evt);

});

ws.on('message', function onMessage(evt) {
  writeToScreen('RESULT:' + evt);
  writeToScreen('METHOD:' + method);
  let data = JSON.parse(evt)
  if (data.warning) {
    method="";
    udpSend("ERR");
    ws.close();
  }
  if (method=="getUserLogin") {
    getAuth();
    return;
  }
  if (method=="authorize") {
    if (data.result._auth) {
      auth_token = data.result._auth;
    }
    checkHeadset();
    return;
  }
  if (method=="queryHeadsets") {
    if (data.result.length > 0) {
      console.log("success");
      udpSend("SUCCESS");
      createSession();
    }
    else {
      console.log("device not found");
      method="";
      udpSend("ERR");
      ws.close();
      // udpTX.close();
    }
    return;
  }
  if (method=="createSession") {
    subscribe();
    return;
  }

  if (method=="subscribe") {
    if (data.pow) {
      Object.assign(raw_eeg, averageBands(averageSensors(data.pow)));
      maxAverage(raw_eeg);
      writeToScreen(raw_eeg);
      writeToScreen(max_eeg);
      udpSend(JSON.stringify([raw_eeg,max_eeg]));
    }
  }
});

// websocket send
function doSend(obj) {
  method = obj.method;
  const message = JSON.stringify(obj);
  writeToScreen("SENT:" + message);
  ws.send(message);
}

// udp send
function udpSend(str) {
  udpTX.send(Buffer.from(str), 12345, (err) => {
    if (err) {
      console.log("UDP_ERR:",err);
    }
  })
}

function writeToScreen(message) {
  console.log(message);
}

// get band power
function initBandPower() {
  let obj = JSON.parse('{"id":1,"jsonrpc":"2.0","result":[{"pow":{"cols":["AF3/theta","AF3/alpha","AF3/betaL","AF3/betaH","AF3/gamma","T7/theta","T7/alpha","T7/betaL","T7/betaH","T7/gamma","Pz/theta","Pz/alpha","Pz/betaL","Pz/betaH","Pz/gamma","T8/theta","T8/alpha","T8/betaL","T8/betaH","T8/gamma","AF4/theta","AF4/alpha","AF4/betaL","AF4/betaH","AF4/gamma"]},"sid":"1b21bf0a-a069-422f-a9c5-792ce68569bb"}]}');
  let subs = obj.result[0];
  for (let i = 0; i < subs.pow.cols.length; i++) {
    // pow columns look like: IED_AF3/alpha
    bandName = subs.pow.cols[i].split("/")[1];
    bands[bandName].push(i);
  }
  bandNames = Object.keys(bands);
  raw_eeg = {};
  for (const col of [...bandNames]) {
    raw_eeg[col]=0;
  }
  averageBands = rollingAverage(bandNames, windowSize);
}

// the averages overall sensors
function averageSensors(pow) {
  return bandNames.map(n => {
    let sum = bands[n].map(i => pow[i]).reduce((total, row) => total + row, 0);
    return (sum/bands[n].length);
  });

}

// rolling average with a window size
function rollingAverage(columns, windowSize) {
  let avgCount = 0;
  const averages = {};
  return row => {
    avgCount = Math.min(windowSize, avgCount + 1);
    columns.forEach((col, i) => {
      const oldAvg = averages[col] || 0;
      averages[col] = oldAvg + (row[i] - oldAvg) / avgCount;
    });
    return averages;
  };
}

function maxAverage(obj) {
  bandNames.map(n => {
    if (obj[n]>max_eeg[n]) {
      max_eeg[n] = obj[n];
    }
  });
}

// commands
function login() {
  let obj = {
    "jsonrpc": "2.0",
    "method": "getUserLogin",
    "id": 1
  }
  doSend(obj);
}

function getAuth() {
  initBandPower();
  let obj = {
    "jsonrpc": "2.0",
    "method": "authorize",
    "params": {},
    "id": 1
  }
  doSend(obj);
}

function checkHeadset() {
  let obj =   {
    "jsonrpc": "2.0",
    "method": "queryHeadsets",
    "params": {},
    "id": 1
  }
  doSend(obj);
}

function createSession() {
  let obj = {
    "jsonrpc": "2.0",
    "method": "createSession",
    "params": {
      "_auth": auth_token,
      "status": "open"
    },
    "id": 1
  };
  doSend(obj);
}

function subscribe() {
  let obj = {
    "jsonrpc": "2.0",
    "method": "subscribe",
    "params": {
      "_auth": auth_token,
      "streams": [
        "pow"
      ]
    },
    "id": 1
  }
  doSend(obj);
}

function unsubscribe() {
  let obj = {
    "jsonrpc": "2.0",
    "method": "unsubscribe",
    "params": {
      "_auth": auth_token,
      "streams": [
        "pow"
      ]
    },
    "id": 1
  }
  doSend(obj);
}

if (WEBSOCKET_ISOBAR_URI!="") {
  const iws = new WebSocket(WEBSOCKET_ISOBAR_URI, {rejectUnauthorized:false});
  iws.on('open', function open() {
    writeToScreen('iCONNECTED');
    iws.send("i'm isobar");
  });

  iws.on('close', function close(evt) {
    writeToScreen('iCLOSE:' + evt);
  });

  iws.on('error', function open(evt) {
    writeToScreen('iERROR:' + evt);
  });

  iws.on('message', function onMessage(evt) {
    writeToScreen('iMESSAGE:' + evt);
  });
}