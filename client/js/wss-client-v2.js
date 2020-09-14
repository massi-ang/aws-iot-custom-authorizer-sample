const crt = require('aws-crt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const yargs = require('yargs');

(async () => {
    const argv = yargs.options({
        endpoint: { type: 'string' },
        id: { type: 'string' },
        verbose: { type: 'boolean', default: false },
        key_path: { type: 'string' },
        authorizer: { type: 'string', default: 'TokenAuthorizer' }
    }).demand(['endpoint', 'id', 'key_path']).help().argv

    const key = fs.readFileSync(argv.key_path) // PEM private key

    console.log(`Connecting to ${argv.endpoint} with id=${argv.id}`)

    const token = {
        sub: argv.id,
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

    if (argv.verbose) {
        console.log('-'.repeat(10))
        console.debug(`Token: ${t}`)
        console.debug(`Signature: ${s}`)
        console.log('-'.repeat(10))
    }
    try {
        crt.io.enable_logging(crt.io.LogLevel.INFO)

        
        const client_bootstrap = new crt.io.ClientBootstrap();
        const tls_ctx_options = new crt.io.TlsContextOptions();
        tls_ctx_options.verify_peer = true;
        const socket_options = new crt.io.SocketOptions();
        const tls_ctx = new crt.io.TlsContext(tls_ctx_options);

        function addCustomAuthHeaders (request, done) {
            console.debug(request);
        
            request.headers.add('x-amz-customauthorizer-name', argv.authorizer);
            request.headers.add('x-amz-customauthorizer-signature', s);
            request.headers.add('token', t);
            for (const h of request.headers) {
                console.log(h)
            }
            done();
        }

        const client = new crt.mqtt.MqttClient(client_bootstrap);

        const connection = new crt.mqtt.MqttClientConnection(client, {
            client_id: argv.id,
            host_name: argv.endpoint,
            port: 443,
            clean_session: true,
            tls_ctx: tls_ctx,
            timeout: 3000,
            use_websocket: true,
            socket_options: socket_options,
            websocket_handshake_transform: addCustomAuthHeaders
        });
        setTimeout(() => { console.log('Times up. Exiting')}, 600 * 1000);

        console.log('Connecting')
        const resuming = await connection.connect()

        console.log(`Resuming session: ${resuming}`)
        console.log('Connected')
        let topic = `d/${token.sub}`

        setInterval(async () => {           
            console.log(`Publishing message at time ${Date.now()} to topic ${topic}`)

            await connection.publish(topic,
                JSON.stringify({ 'msg': 'Hello via SDK v2 using websocket and custom auth ', 'ts': Date.now() }), 0);
            console.log(`Published`)
        }, 1000)
    } catch (err) {
        console.error(err);
        process.exit(1);
    }

})()