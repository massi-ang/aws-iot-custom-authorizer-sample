// Copyright 2022 Massimiliano Angelino
// SPDX-License-Identifier: MIT-0

const fs = require('fs');
const jwt = require('jsonwebtoken');
const yargs = require('yargs');


const argv = yargs(process.argv).options({
    id: { type: 'string' },
    key_path: { type: 'string' },
}).demandOption(['id', 'key_path']).help().argv

const key = fs.readFileSync(argv.key_path) // PEM private key
console.log(JSON.stringify(get_token(key, argv.id), undefined, 2))

function get_token (key, id) {

    const token = {
        sub: id,
        exp: Math.floor(Date.now() / 1000) + 60 * 60
    }

    const jwtToken = jwt.sign(token, key, { algorithm: 'RS256' })

    const parts = jwtToken.split('.')

    const t = parts[0] + '.' + parts[1]
    const s = parts[2].replace(/_/gi, '/').replace(/-/gi, '+') + '==' // Make the signature compliant

    return {
        token: t,
        signature: s
    }

}
module.exports = { get_token: get_token }