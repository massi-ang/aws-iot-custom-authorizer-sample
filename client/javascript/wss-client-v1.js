/* 
 *  This is the default license template.
 *  
 *  File: wss-client-v1.js
 *  Author: angmas
 *  Copyright (c) 2020 angmas
 *  
 *  To edit this license information: Press Ctrl+Shift+P and press 'Create new License Template...'.
 */

const device = require('aws-iot-device-sdk').device
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
    authorizer: { type: 'string', default: 'TokenAuthorizer' }
}).demand(['endpoint', 'id', 'key_path']).help().argv

key = fs.readFileSync(argv.key_path) // PEM private key

console.log(`Connecting to ${argv.endpoint} with id=${argv.id}`)

token = { sub: argv.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 }

jwtToken = jwt.sign(token, key, { algorithm: 'RS256' })

parts = jwtToken.split('.')

t = parts[0] + '.' + parts[1]
s = parts[2].replace(/_/gi, '/').replace(/-/gi, '+') + '==' // Make the signature compliant

// The signature can also be calculated using the crypto library for any arbitraty token and not onlu JWT
//

// k = crypto.createPrivateKey(key)
// sign = crypto.createSign('SHA256')
// sign.write(t)
// sign.end()
// s = sign.sign(k, 'base64')

if (argv.verbose) {
    console.log('-'.repeat(10))
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
    }
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


d.on('disconnect', (err) => {
    console.log('disconnected', err)
    process.exit()
})

d.on('error', (err) => {
    console.log('error', err)
    process.exit()
})