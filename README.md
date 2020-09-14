# Custom Authorizers

This sample code provides two AWS IoT custom authorizers implementations: one that works for WebSocket connections, and one for MQTT connections. It is of course possible to use a single

## Prerequisites

* An AWS Account

On the developer machine:
* [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html)
* [ASW CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)

For the client:
* Node.js 10 or later
* jq (`sudo apt-get install jq`)

> **DISCLAIMER**: This solution is intended for demo purposes only and should not be used as is in a production environment without further works on the code quality and security.


## Deploy the backend via CDK

The custom authorizer logic is deployed via the CDK.
You can examine the definition of the resources that are going to be created in the `lib/jwt-iot-custom-authorizer-stack.ts` file.

Run the following commands to download all the project dependencies and compile the stack:

```
npm install
npm run build
```

Finally, you can deploy it with:

```
cdk deploy
```

**NOTE**: if this is the first time you use CDK on this AWS account and region the deploy will fail. Read the instructions printed on screen on how to bootstrap the account to be able to use the CDK tool.

The above commands will print out few output lines, with the 2 custom authorizer lambda arn. one called `lambdaArn` and the other `lambdaArnMqtt`. Please note these down as they will be needed later.

You can change the default values for the username, password and token for the Mqtt authorizer by invoking the `cdk deploy` with the parameters:

```
cdk deploy --parameters username=admin --parameters password=admin --parameters token=XXX
```

### Create the signing key pair

The custom authorizer validated that the token that is provided is signed with a known key. This prevents malicious users to trigger you custom authorizer lambda function as AWS IoT Core will deny access if the token and the token signature do not match.

The token signature is generated using an RSA key. The private key is used by the client to sign the authorization token while the the public key will be associated with the custom authorizer.
This signature algorithm is equivalent to the RSA256 algorithm adopted by the JWT token [RFC 7518](https://tools.ietf.org/html/rfc7518#section-3). We are going to use this property to simplify the signing process.

To create the key pair follow these steps:

```bash
openssl genrsa -out myPrivateKey.pem 2048
openssl rsa -in myPrivateKey.pem -pubout > mykey.pub
```

The file `mykey.pub` will contain the public key in PEM format that you will need to configure for the authorizer in the next step.

##  Custom authorizer configuration (non MQTT)

In this step we are going to configure the custom authorizer in AWS IoT Core. You can find more information about custom authorizers in the [documentation](https://docs.aws.amazon.com/iot/latest/developerguide/custom-authorizer.html).

### CLI

We first create the authorizer, giving it a name and associating it with the lambda function that performs the authorization. This lambda function has been created in the previous step. You can examine the code in `lambda/iot-custom-auth/lambda.js`.

```bash
arn=<lambdaArn from CDK>

resp=$(aws iot create-authorizer \
  --authorizer-name "TokenAuthorizer" \
  --authorizer-function-arn $arn \
  --status ACTIVE \
  --token-key-name token \
  --token-signing-public-keys KEY1="$key")
auth_arn=$(echo $resp | jq -r .authorizerArn -)
```

Take note of the arn of the token authorizer, we need it to add give the iot service the permission to invoke this lambda function on your behalf when a new connection request is made.

```bash
aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Id-1234 \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```



### Test the authorizer


To test the authorizer you can use of the provided clients. 

For javascript the client is in  `client/javascript` folder and works only for WebSocket. This client uses the [v1 node sdk](https://github.com/aws/aws-iot-device-sdk-js). 
For python the client is in `client/python/minimal-wss-client.py`.


```
node client/javascript/wss-client-v1.js --key_path <key path> --endpoint <endpoint> --id <id> [--verbose] [--authorizer_name] [--token_name]
```

```
python client/python/minimal-wss-client.py --key_path <key path> --endpoint <endpoint> --id <id> [--verbose] [--authorizer_name] [--token_name] [--token] [--signature]
```

where:
* **key_path** is the path to the private key PEM encoded file.
* **endpoint** is the FQDN of your AWS IoT endpoint (get it via `aws iot describe-endpoint --endpoint-type iot:Data-ATS` on from the console).
* **id** is the client id, thingName.
* **verbose** prints out the encoded JWT token and signature.
* **authorizer_name** in case you need to specify another authorizer than TokenAuthorizer.
* **token_name** in case you need to specify another token key name than token.

For the python client you need also to pass also the token and signature values as the client does not generate them.

You can obtain the values by running `node client/javascript/token-gen.js --id <id> --key_path <path to private key>`. 


The client code creates a JWT token as the following and signs it with RSA256 using the private key:

```json
{
  "sub": <id>,
  "exp": 1593699087
}
```

The `sub` in the token is used by the authorizer to define the policy applicable to the connection, and will allow publishing only on a topic `d/<sub>`

The test app will publish message to a topic `d/<id>` every 5 sec. Use the [iot console](https://console.aws.amazon.com/iot/home?#/test) to check the messages are being received.

#### If you get an error

To test if the authorizer is setup correctly you can also use the aws cli.

```bash
aws iot test-invoke-authorizer \
  --authorizer-name TokenAuthorizer \
  --token <token> --token-signature <signature>
```

Use the `--verbose` mode in the authTest.js call to get the token and signature and pass those to the above command.

## Testing with [aws-iot-device-sdk-cpp-v2](https://github.com/aws/aws-iot-device-sdk-cpp-v2)

To test the custom authorizer with the CPP device SDK v2 proceed as follow:

* Clone the github repo
* Compile the code following the instructions
* execute the `samples/mqtt/raw-pub-sub` sample with the following args:
```
  --endpoint <iot endpoint> 
  --use_websocket --auth_params token=<token>,x-amz-customauthorizer-name=TokenAuthorizer,x-amz-customauthorizer-signature=<signature> --topic d/<id>
```

You can get the `token` and `signature` values running `node client/javascript/token-gen.js --id <id> --key_path <path to private key>`. 
Use the same value for the `id` used to generate the token in the topic value passed to the client.

You can also use the java SDK as it provides a [raw-pub-sub](https://github.com/aws/aws-iot-device-sdk-java-v2/tree/master/samples/RawPubSub) implementation.

## About the tokens and security

In this example the client is responsible of signing the token which is obviously not secure, as the client could craft his own privileges or impersonate another device.

The token and its signature should therefore be generated in the backend, and possibly also encrypted. 

Rotations of the token can be implemented via the MQTT protocol, and the only issue to solve would be how to obtain the initial token to the device. This could be done via an external API, a companion app, a registration step, etc. and is out of the scope of this demo.


##  MQTT Custom authorizer configuration

**NOTE**: The sample authorizer uses an hard

### CLI

We first create the authorizer, giving it a name and associating it with the lambda function that performs the authorization. This lambda function has been created in the previous step. You can examine the code in `lambda/iot-mqtt-custom-auth/lambda.js`.

```bash
arn=<lambdaArnMqtt arn from CDK>

resp=$(aws iot create-authorizer \
  --authorizer-name "MqttAuthorizer" \
  --authorizer-function-arn $arn \
  --status ACTIVE \
  --signing-disabled)

auth_arn=$(echo $resp | jq -r .authorizerArn -)
```

Take note of the arn of the token authorizer, we need it to add give the iot service the permission to invoke this lambda function on your behalf when a new connection request is made.

```bash
aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Id-1234 \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```

### Test the authorizer

For this test we provide a Python client using the Python Aws Crt libraries.

```
pip install -r requirements.txt
python --endpoint <endpoint> --topic test/mqtt
```

Where
* **endpoint** is the FQDN of your AWS IoT endpoint (get it via `aws iot describe-endpoint --endpoint-type iot:Data-ATS` on from the console)

The only particularity of this code is about the initialization of the client, and in particular the TLS context. The default static methods will enable mutual authentication, which is not something we want in this case. 

The relevant lines are the following:

```python
tls_options = io.TlsContextOptions()
tls_options.alpn_list = ['mqtt']

if args.root_ca:
    tls_options.override_default_trust_store_from_path(ca_dirpath=None,
        ca_filepath=args.root_ca)
tls_ctx = io.ClientTlsContext(options=tls_options)
client = mqtt.Client(client_bootstrap, tls_ctx)

username = args.username
if args.authorizer_name:
    username += f'?x-amz-customauthorizer-name={args.authorizer_name}'
if args.token:
    username += f'&token={args.token}'
mqtt_connection = mqtt.Connection(client=client,
    host_name=args.endpoint,
    port=443,
    on_connection_interrupted=on_connection_interrupted,
    on_connection_resumed=on_connection_resumed,
    client_id=args.client_id,
    clean_session=True,
    keep_alive_secs=6,
    username=username,
    password=args.password)

```

You can avoid specifying the authorizer name as part of the `username` by setting the custom authorizer as the default authorizer for the endpoint using the following command:

```
aws iot set-default-authorizer --authorizer-name MqttAuthorizer
```


### Use a token instead of username/password

Instead of using username/password for MQTT authentication, you can also use a bearer token. In this case you will need to specify a token name when creating the authorizer and use the signing option to better secure your endpoint.

Let's create a new authorizer using the same authorizer lambda that already has code to use the token:

```bash
arn=<lambdaArnMqtt arn from CDK>

resp=$(aws iot create-authorizer \
  --authorizer-name "MqttTokenAuthorizer" \
  --authorizer-function-arn $arn \
  --status ACTIVE
  --token-key-name token
  --signing-disabled)

auth_arn=$(echo $resp | jq -r .authorizerArn -)

aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Id-1234 \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```

To test it, execute the client with the following options:

```bash
endpoint=$(aws iot describe-endpoint --type data:iot-ats)
python client/python/minimal-mqtt-client.py --endpoint $endpoint \
  --topic test/mqt --token allow --authorizer-name MqttTokenAuthorizer --username admin --password dummy
```

You can also test the MQTT/TLS connection with the `raw-pub-sub` sample client available in the [Java](https://github.com/aws/aws-iot-device-sdk-java-v2) 
and [CPP](https://github.com/aws/aws-iot-device-sdk-cpp-v2) SDKs.
