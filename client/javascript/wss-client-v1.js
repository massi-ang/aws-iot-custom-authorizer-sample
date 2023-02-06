// Copyright 2022 Massimiliano Angelino
// SPDX-License-Identifier: MIT-0

const device = require('aws-iot-device-sdk').device
const crypto = require('crypto')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const yargs = require('yargs')
const { exit } = require('process')

const argv = yargs(process.argv).options({
    endpoint: { type: 'string' },
    id: { type: 'string' },
    verbose: { type: 'boolean', default: false },
    key_path: { type: 'string' },
    authorizer: { type: 'string', default: 'TokenAuthorizer' }
}).demandOption(['endpoint', 'id', 'key_path']).help().argv

const key = fs.readFileSync(argv.key_path) // PEM private key

console.log(`Connecting to ${argv.endpoint} with id=${argv.id}`)

const token = { sub: argv.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 }

const jwtToken = jwt.sign(token, key, { algorithm: 'RS256' })

const parts = jwtToken.split('.')

const t = parts[0] + '.' + parts[1]
// Make the signature compliant
// JSW are encoded using Base64URL schema which replaces / for _ and + with - in order to avoid % encoding those values
// The signature passed to the custom authorizers uses a pure Base64 encoding, hence the following is necessary
const s = parts[2].replace(/_/gi, '/').replace(/-/gi, '+') + '==' 

if (argv.verbose) {
    console.log('-'.repeat(10))
    console.debug(`Token: ${JSON.stringify(token)}`)
    console.debug(`Token: ${t}`)
    console.debug(`Signature: ${s}`)
    console.log('-'.repeat(10))
}

const d = device({
    host: argv.endpoint,
    protocol: 'wss-custom-auth',
    clientId: argv.id,
    customAuthHeaders: {
        'X-Amz-CustomAuthorizer-Name': argv.authorizer,
        'X-Amz-CustomAuthorizer-Signature': s,
        'token': t
    }, 
})


d.on('connect', () => {
    console.log('Connected')
    setInterval(() => {
        let topic = `d/${token.sub}`
        console.log(`Publishing message at time ${Date.now()} to topic ${topic}`)
        d.publish(topic,
            JSON.stringify({ 'msg': 'Hello via websocket and custom auth ', 'ts': Date.now() }))
    }, 5000)
})

d.on('close', (err) => {
    console.log('closed', err)
    process.exit()
})

d.on('disconnect', (err) => {
    console.log('disconnected', err)
    process.exit()
})

d.on('error', (err) => {
    console.log('error', err)
    process.exit()
})