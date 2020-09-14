// Copyright 2020 angmas
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const fs = require('fs');
const jwt = require('jsonwebtoken');
const yargs = require('yargs');


const argv = yargs.options({
    id: { type: 'string' },
    key_path: { type: 'string' },
}).demand(['id', 'key_path']).help().argv

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

    // The signature can also be calculated using the crypto library for any arbitrary token and not only JWT
    //

    // k = crypto.createPrivateKey(key)
    // sign = crypto.createSign('SHA256')
    // sign.write(t)
    // sign.end()
    // s = sign.sign(k, 'base64')
    return {
        token: t,
        signature: s
    }

}
module.exports = { get_token: get_token }