// Copyright 2022 Amazon.com.
// SPDX-License-Identifier: MIT

const mqtt = require("mqtt")
const qs = require("querystring")
const crypto = require('crypto')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const yargs = require('yargs')
const { exit } = require('process')
const { string } = require("yargs")

const argv = yargs.options({
    endpoint: { type: 'string' },
    id: { type: 'string' },
    verbose: { type: 'boolean', default: false },
    token: {type: 'string'},
    token_signature: {type: 'string'},
    authorizer: { type: 'string', default: 'TokenAuthorizer' },
    ca_path: { type: 'string', default: 'AmazonRootCA1.pem' },
}).demand(['endpoint', 'id', 'token']).help().argv

options={
    ca: fs.readFileSync(argv.ca_path),
    clientId: argv.id,
}

token = argv.token

query_obj = {
    "token": token
}

if (argv.token_signature !== null) {
    query_obj["x-amz-customauthorizer-signature"] = argv.token_signature
}

if (argv.authorizer !== null) {
    query_obj["x-amz-customauthorizer-name"] = argv.authorizer
}
id = argv.id
console.log(`Connecting to ${argv.endpoint} with client id ${id} using ${argv.authorizer} authorizer`)
query = qs.stringify(query_obj)
var client = mqtt.connect(`wss://${argv.endpoint}:443/mqtt?`+query, options);

client.on('connect', function () {
    console.log('Connected')
    client.subscribe(`d/${id}`);
    setInterval( ()=> {
        client.publish(`d/${id}`, JSON.stringify({'m':'Hello from mqtt.js client'}));
    }, 5000)
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
    console.log(`topic: ${topic}, message: ${message.toString()}`);
    
});

