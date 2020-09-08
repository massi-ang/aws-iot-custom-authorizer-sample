const device = require('aws-iot-device-sdk-v2');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const yargs = require('yargs');
const { exit } = require('process');

    (async () => {
        const argv = yargs.options({
            endopoint: { type: 'string' },
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
        device.io.enable_logging(device.io.LogLevel.TRACE)

        const client_bootstrap = new device.io.ClientBootstrap();
        const tls_ctx_options = new device.io.TlsContextOptions();
        const socket_options = new device.io.SocketOptions();
        const tls_ctx = new device.io.TlsContext(tls_ctx_options);

        function addCustomAuthHeaders (request, done) {
            console.debug(request);
            request.headers['X-Amz-CustomAuthorizer-Name'] = argv.authorizer;
            request.headers['X-Amz-CustomAuthorizer-Signature'] = s;
            request.headers['token'] = t;
            done();
        }

        try {
            
            const client = new device.mqtt.MqttClient(client_bootstrap);

            const c = device.iot.AwsIotMqttConnectionConfigBuilder.new_websocket_builder()
            c.with_clean_session(true)
            c.with_client_id(argv.id)
            c.with_endpoint(argv.endpoint)
            c.with_port(4413)
            //device.iot.AwsIotMqttConnectionConfigBuilder.configure_websocket_handshake(c, addCustomAuthHeaders)

            const connection = client.new_connection(c.build())
            // const connection = client.new_connection({
            //     client_id: argv.id,
            //     host_name: argv.endpoint,
            //     port: 443,
            //     clean_session: true,
            //     tls_ctx: tls_ctx,
            //     use_websocket: true,
            //     socket_options: socket_options,
            //     websocket_handshake_transform: addCustomAuthHeaders
            // });
            console.log('Connecting')
            const res = await connection.connect();

            console.log('Connected')



            setInterval(async () => {
                let topic = `d/${token.sub}`
                console.log(`Publishing message at time ${Date.now()} to topic ${topic}`)
                await connection.publish(topic,
                    JSON.stringify({ 'msg': 'Hello via websocket and custom auth ', 'ts': Date.now() }), 0);
            }, 5000)
        } catch (err) {
            console.error(err);
            process.exit(1);
        }


    })()