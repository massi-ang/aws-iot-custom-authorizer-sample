# Custom Authorizers

This repo illustrates how to create and configure AWS IoT Core custom authorizers and provides client sample for how to invoke them. We provide the sample code for 2 type of custom authorizers: for WebSocket connections and for MQTT connections. It is of course possible combine the two in a single authorizer, but we keep them separate for readability.

## What are custom authorizers and why do you need them

AWS IoT Core authenticates MQTT/TLS connections using mutual TLS and MQTT/Websocket connections using AWS IAM credentials. AWS IoT Core supports also the HTTP protocol, but in such case there is no bi-directional communication possible. If your application and device can support any of the above, it is highly recommended to use them. When using such authentication methods, the authorization associated to the connection is determined based on the AWS IoT Policies associated to the principal identity of the device: the certificate in case of MQTT/TLS and the Cognito Identity in case of MQTT/Websockets.

For all those cases where the above methods are not suitable, customers can create a custom authorizer implemented via a Lambda function.

## Contents of this demo

In this demo we provide a sample implementation for:

* A custom authorizer for [JWT tokens](#jwt-custom-authorizer-demo)
* A custom authorizer for [MQTT username/password](#mqtt-custom-authorizer-configuration)

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

You can run the provided CDK project to deploy 2 custom authorizer Lambda functions.
You can examine the definition of the resources that are going to be created in the `lib/jwt-iot-custom-authorizer-stack.ts` file. The authorizer logic in the Lambda functions in the `/lambda` folder. There are 2 authorizers, one for Websocket and one for MQTT.

Run the following commands to download all the project dependencies and compile the stack:

```
npm install
npm run build
```

Then deploy it with:

```
cdk deploy
```

You can change the default values for the username, password and token for the MQTT authorizer by invoking the `cdk deploy` with the parameters:

```
cdk deploy --parameters username=admin --parameters password=admin --parameters token=XXX
```

**NOTE**: if this is the first time you use CDK on this AWS account and region the deploy will fail. Read the instructions printed on screen on how to bootstrap the account to be able to use the CDK tool.

The above commands will print out few lines ending with the 2 custom authorizer Lambda function arns, one called `lambdaArn` and the other `lambdaArnMqtt`. Please note these down as they will be needed later.


## WebSocket Custom Authorizer for JSON Web Tokens (JWT)

If signature verification is enabled on the custom authorizer, AWS IoT Core validates that the token that is provided is signed with a an asymmetric key known by the client and AWS IoT Core. This prevents malicious users to trigger your custom authorizer Lambda function as AWS IoT Core will deny access if the token and the token signature do not match.

AWS IoT Core supports signatures generated by the RSA256 algorithm. This is also one of the algorithms that can be used to sign JWT tokens [RFC 7518](https://tools.ietf.org/html/rfc7518#section-3), which means that if you have a signed JWT token, you can use the JWT as token and the JWT signature as the token signature to pass to the authorizer. In this way AWS IoT Core takes care of validating the signature and the Custom Authorizer Lambda function can trust the JWT and does not need to validate it again.

Note that the JWS signature uses a base64url encoding schema (see https://datatracker.ietf.org/doc/html/rfc7515#section-7.1), while AWS IoT Custom authorizer require a base64 encoding. The difference between the two is that `-` and `_` characters are valid in base64url but not in base64 and must be replaced by `+` and `/` respectively. Moreover, padding `=` is not used in base64url. The file `client/javascript/token-gen.js` implements the code to create a signed JWT token and make the signature compliant to AWS IoT Core format.

If you want to use JWT tokens provided by 3rd parties IdP, verify that the signing algorithm used is RSA256. 
You also need to get the public key from the provider that will be used as the public verification key by the custom authorizer. If the provider is OIDC compliant, you can obtain the public key from the jwks endpoint. (For an extensive walk through you can refer to [Navigating RS256 and JWKS](https://auth0.com/blog/navigating-rs256-and-jwks/))

1. `GET /.well-known/openid-configuration` from the provider endpoint (https://openid.net/specs/openid-connect-discovery-1_0-21.html#ProviderConfigurationRequest)
1. Extract the `"jwks_uri"` value from the response
1. `GET <jwks_uri>` to get the JSON Web Key Set (https://auth0.com/docs/security/tokens/json-web-tokens/json-web-key-set-properties)
1. Derive the public key

You can use [jwks-rsa](https://www.npmjs.com/package/jwks-rsa) library to get the public key.

# JWT custom authorizer demo

## Create a custom signing key pair 

For this demo we are going to create our own signing key pair using openssl. The private key of the signing pair is used to generate the token signature, the public key is assigned to the custom authorizer in AWS IoT Core and is used to verify the signature.

```bash
openssl genrsa -out myPrivateKey.pem 2048
openssl rsa -in myPrivateKey.pem -pubout > mykey.pub
```

The file `mykey.pub` will contain the public key in PEM format that you will need to configure for the authorizer in the next step.

##  Create the authorizer for WSS connections and JWT tokens

In this step we are going to configure the custom authorizer in AWS IoT Core. You can find more information about custom authorizers in the [documentation](https://docs.aws.amazon.com/iot/latest/developerguide/custom-authorizer.html).

We first create the authorizer, giving it a name and associating it with the lambda function that performs the authorization. This lambda function has been created when we executed the CDK script (`lambdaArn`). You can examine the code in `lambda/iot-custom-auth/lambda.js`.

```bash
arn=<lambdaArn from CDK output>

resp=$(aws iot create-authorizer \
  --authorizer-name "TokenAuthorizer" \
  --authorizer-function-arn $arn \
  --status ACTIVE \
  --token-key-name token \
  --token-signing-public-keys KEY1="-----BEGIN PUBLIC KEY-----
  ...
  ...
  -----END PUBLIC KEY-----")

auth_arn=$(echo $resp | jq -r .authorizerArn -)
```

**Note:** you can also use the AWS Console to create the Custom Authorizer

We need to give the AWS IoT service the permission to invoke this AWS Lambda function when a new connection request is made.

```bash
aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Id-1234 \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```

By using the `source-arn` condition, we limit which custom authorizer can invoke this specific function.

## Test the authorizer Lambda function

We use the AWS CLI to test if the authorizer is setup correctly. To obtain the token and the corresponding signature we use the `token-gen.js` helper.

```
node client/javascript/helpers/token-gen.js --id <id> --key_path <path to private key>
``` 

This will print out a JSON with a token and a signature. 

```
{
  "token": "eyJhbGciO...Y3NTY3OTg0Nn0",
  "signature": "ab7KFiLjFwuEeZHNYI...1uNX3Smw=="
}
```

Copy the two values and execute the following command:

```bash
aws iot test-invoke-authorizer \
  --authorizer-name TokenAuthorizer \
  --token <token> --token-signature <signature>
```

### How permissions are generated

The JWT token used for this demo has the following format:

```json
{
  "sub": <id>,
  "exp": 1593699087
}
```

This token is base64 encoded and passed sent to the custom authorizer together with the signature. AWS IoT Core validate the signature against the token and then passes the token base64 encoded values to the Custom Authorizer  Lambda function.
The Lambda function checks the `exp` field to see if the token has not expired and uses the `sub` field in the token to scope down the policy for the connection, allowing the client to publish and subscribe to the topic `d/<sub>` and to its own IoT Shadow (`$aws/things/<sub>/shadow/*`).


## Test with custom clients

We provide some sample client implementations in Javascript and Python. You find them in the `/client` folder.

| Language | Client | Runtime | Notes |
|---|---|----|---|
| Javascript | `wss-client-v1.js` | NodeJs | uses the [v1 node sdk](https://github.com/aws/aws-iot-device-sdk-js)|
| Javascript | `mqtt_wss_client.js` | NodeJs |  uses the `mqttjs` library. Requires NodeJs >= 4.4 |
| Javascript | `index.html` | Browser | uses the `mqttjs` library |
| Python | `minimal-wss-client.py` | Python | uses AWS IoT Device client, connects via WebSockets |


All clients connect to AWS IoT Core using the `id` as the MQTT Client Id, they subscribe to the `d/<id>` topic and then start publishing messages to the same `d/<id>` topic.

The test client publishes a message to the topic `d/<sub>` every 5 sec. 

You can also use the [AWS Iot Test console](https://console.aws.amazon.com/iot/home?#/test) to check the messages are being received.

### Running the clients 

The Javascript clients generate the JWT token give the `id` and the signature.
```
node client/javascript/wss-client-v1.js --key_path <key path> --endpoint <endpoint> --id <id> [--verbose] [--authorizer_name] [--key_path]
```

For all other clients you need to first generate the token and the signature values and then pass them as arguments to the client.

```
node client/javascript/helpers/token-gen.js --id <id> --key_path <path to private key>
``` 

For example, to invoke the WebSockets Python client:

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

For the python client and the browser client you need to pass the token and signature values, which can be obtained as follow:

```
node client/javascript/helpers/token-gen.js --id <id> --key_path <path to private key>
``` 

## Testing with [aws-iot-device-sdk-cpp-v2](https://github.com/aws/aws-iot-device-sdk-cpp-v2)

To test the custom authorizer with the CPP device SDK v2 proceed as follow:

* Clone the github repo
* Compile the code following the instructions
* execute the `samples/mqtt/raw-pub-sub` sample with the following args:
```
  --endpoint <iot endpoint> 
  --use_websocket --auth_params token=<token>,x-amz-customauthorizer-name=TokenAuthorizer,x-amz-customauthorizer-signature=<signature> --topic d/<id>
```

You can get the `token` and `signature` values running 
```
node client/javascript/helpers/token-gen.js --id <id> --key_path <path to private key>
``` 
Use the same value for the `id` used to generate the token in the topic value passed to the client.

You can also use the Java SDK as it provides a [raw-pub-sub](https://github.com/aws/aws-iot-device-sdk-java-v2/tree/master/samples/RawPubSub) implementation.

# About the tokens and security

In this demo the client is responsible of signing the token. This is not secure as a malicious actor gaining access to the private key could craft his own privileges or impersonate another device.

The token and its signature should therefore be generated in the backend, and possibly also encrypted. The token and the signature should then be provided to the device via another secure channel, eg via a companion app, a registration step, etc. which are not in the scope of this demo.


# MQTT custom authorizer configuration

In this second demo we are going to setup a new custom authorizer to perform username and password authentication for MQTT/TLS connections.

> **NOTE**: the stack deploys the authorizer with some default values for username, password and token. You can, and should, change them by redeploying the stack with the following command:

```
cdk deploy --parameters username=<value> --parameters password=<value> --parameters token=<value>      
```

## Configure the authorizer

This Lambda function has been created by the CDK stack you have deployed. You can examine the code in `lambda/iot-mqtt-custom-auth/lambda.js`.

```bash
arn=<lambdaArnMqtt arn from CDK>

resp=$(aws iot create-authorizer \
  --authorizer-name "MqttAuthorizer" \
  --authorizer-function-arn $arn \
  --status ACTIVE \
  --signing-disabled)

auth_arn=$(echo $resp | jq -r .authorizerArn -)
```

We need to give the AWS IoT service the permission to invoke this lambda function when a new connection request is made.

```bash
aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Mqtt-auth \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```

## Test the authorizer

We provide a Python client using the Python AWS CRT libraries.

```
pip install -r requirements.txt
python client/python/minimal-mqtt-client.py --username aladdin --password opensesame --topic d/aladdin --endpoint <endpoint> --authorizer-name MqttAuthorizer
```

Where
* **endpoint** is the FQDN of your AWS IoT endpoint (get it via `aws iot describe-endpoint --endpoint-type iot:Data-ATS` on from the console)

The difference from this code and the stock [pub-sub](https://github.com/aws/aws-iot-device-sdk-python-v2/blob/master/samples/pubsub.py) sample is in the initialization of the client, and in particular in the setup of the TLS context. 

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

For better compatibility with legacy clients, you might want to configure the authorizer as the default one for the account using the following command. This removes the need to append the custom authorizer name to the username:

```
aws iot set-default-authorizer --authorizer-name MqttAuthorizer
```

## MQTT authorizer with Bearer token

Instead of using username/password for MQTT authentication, you can also use a bearer token. In this case you will need to specify a token name when creating the authorizer and you can use the signing option to secure your endpoint. We are not going to enable signing in this example. 

Let's create a new authorizer using the same authorizer lambda that already has code to use the token:

```bash
arn=<lambdaArnMqtt arn from CDK>

resp=$(aws iot create-authorizer \
  --authorizer-name "MqttTokenAuthorizer" \
  --authorizer-function-arn $arn \
  --status ACTIVE
  --token-key-name mytoken
  --signing-disabled)

auth_arn=$(echo $resp | jq -r .authorizerArn -)

aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Id-1234 \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```

The difference compared to the username/password authorizer we created previously is that we have added the parameter `--token-key-name` when creating the authorizer.

To test it, execute the client with the following options:

```bash
endpoint=$(aws iot describe-endpoint --type data:iot-ats)
python client/python/minimal-mqtt-client.py --endpoint $endpoint \
  --topic d/aladdin --token allow --token-name mytoken --authorizer-name MqttTokenAuthorizer \
  --username aladdin --password dummy
```

You can also test the MQTT/TLS connection with the `raw-pub-sub` sample client available in the [Java](https://github.com/aws/aws-iot-device-sdk-java-v2) 
and [CPP](https://github.com/aws/aws-iot-device-sdk-cpp-v2) SDKs.

With those samples you need to pass the `token` and the `authorizer name` as part of the username. The password can be any string. The value for the username would then be:

`aladdin?x-amz-customauthorizer-name=MqttTokenAuthorizer&mytoken=allow`

## Enable signing

If you enable signing for the authorizer you need to generate the token signature using the RSA256 algorithm and pass it as part of the username.

For example the full username would be similar to:

`aladdin?x-amz-customauthorizer-name=MqttTokenAuthorizer&token=allow&x-amz-customauthorizer-signature=<signature>`

Where `<signature>` is the computed signature.

## Test using the embedded C SDK

To test the MQTT/TLS custom authorizer with the [embedded C SDK](https://github.com/aws/aws-iot-device-sdk-embedded-C), you can use the `demos/mqtt/mqtt_demo_mutual_auth`.

```
git clone https://github.com/aws/aws-iot-device-sdk-embedded-C
```

Open the `demos/mqtt/mqtt_demo_mutual_auth\demo_config.h` include file and specify values for:
* CLIENT_PRIVATE_KEY_PATH
* CLIENT_USERNAME
* CLIENT_PASSWORD

Open the `demos/mqtt/mqtt_demo_mutual_auth\demo_config.h` and change the value for:
* MQTT_EXAMPLE_TOPIC

to `d/<username>` or whatever you have setup the policy returned by the custom authorizer to return.

Once done, in the terminal you would do:

```
mkdir build
cd build
cmake ..
make mqtt_demo_mutual_auth
bin/mqtt_demo_mutual_auth
```

## Using Custom Domains

When using Custom Domains for the AWS IoT Core endpoint, you need to configure the authorizer on the domain using the following API https://docs.aws.amazon.com/iot/latest/apireference/API_UpdateDomainConfiguration.html


```
aws iot update-domain-configuration --domain-configuration-name <DOMAIN_CONF_NAME> \
     --authorizer-config defaultAuthorizerName=<AUTHORIZER_NAME>
``` 


# Troubleshooting

## Testing without signature verification

In case you encounter issues in connecting the client with AWS IoT Core, you can try configuring the authorizer without token signing.

```bash
resp=$(aws iot create-authorizer \
  --authorizer-name "TokenAuthorizer_NoSign" \
  --authorizer-function-arn $arn \
  --status ACTIVE \
  --token-key-name token \
  --signing-disabled")
auth_arn=$(echo $resp | jq -r .authorizerArn -)
```

And then add the lambda permissions:

```bash
aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Id-12367 \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```
