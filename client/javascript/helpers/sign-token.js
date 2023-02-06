// Copyright 2022 Massimiliano Angelino
// SPDX-License-Identifier: MIT-0

const fs = require('fs');
const yargs = require('yargs/yargs');
const crypto = require('crypto')


const argv = yargs(process.argv).options({
    key_path: { type: 'string' },
    token: { type: 'string' }
}).demandOption(['token', 'key_path']).help().argv

const key = fs.readFileSync(argv.key_path) // PEM private key

console.log(JSON.stringify(sign(argv.token, key), undefined, 2));
    
function sign(token, key) {
    let k = crypto.createPrivateKey(key)
    sign = crypto.createSign('SHA256')
    sign.write(token)
    sign.end()
    let s = sign.sign(k, 'base64')

    return {
        token: token,
        signature: s
    }
}

module.exports = { sign: sign }