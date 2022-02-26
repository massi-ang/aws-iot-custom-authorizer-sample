// Copyright 2022 Amazon.com.
// SPDX-License-Identifier: MIT

const mqtt = require("mqtt")
const qs = require("querystring")
const crypto = require('crypto')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const yargs = require('yargs')
const { exit } = require('process')

const argv = yargs.options({
    endpoint: { type: 'string' },
    id: { type: 'string' },
    verbose: { type: 'boolean', default: false },
    key_path: { type: 'string' },
    authorizer: { type: 'string', default: 'TokenAuthorizer' },
    ca_path: { type: 'string', default: 'AmazonRootCA1.pem' },
}).demand(['endpoint', 'id', 'key_path']).help().argv

options={
    ca: fs.readFileSync(argv.ca_path),
    clientId: argv.id,
}

token = argv.token

console.log(`Connecting to ${argv.endpoint} with client id ${id} using ${argv.authorizer} authorizer`)
query = qs.stringify({"x-amz-customauthorizer-name":argv.authorizer, "token":token})
var client = mqtt.connect(`wss://${argv.endpoint}:443/mqtt?`+query, options);

client.on('connect', function () {
    console.log('Connected')
    client.subscribe('presence');
});

client.on('error', function (err) {
    console.log(err);
});

client.on('close', function (err) {
    console.log('close',err);
    process.exit(1);
});

client.on('message', function (topic, message) {
    // message is Buffer
    console.log(message.toString());
    client.publish('presence', JSON.stringify({'m':'Hello from mqtt.js client'}));
    client.end();
});