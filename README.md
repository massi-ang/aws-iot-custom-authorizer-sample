# Custom Authorizers

This repo illustrates how to create and configure AWS IoT Core custom authorizers and provides client sample for how to invoke them. We provide the sample code for 2 type of custom authorizers: for WebSocket connections and for MQTT connections. It is of course possible combine the two in a single authorizer, but we kept them  keeping them separate for readability.

## What are custom authorizers and why do you need them

AWS IoT Core authenticates MQTT/TLS connections using mutual TLS and MQTT/Websocket connections using AWS IAM credentials (AWS IoT Core also support HTTP protocol, but in such case there is no bi-directional communication possible). If your application and device can support any of the above, it is highly recommended to use them. When using such authentication methods, the authorization associated to the connection is determined based on the AWS IoT Policies associated to the identity, ie the certificate in case of MQTT/TLS and the cognito identity in case of MQTT/Websockets.

For all those cases where the default methods are not suitable, customers can create Lambda functions custom authorizers.


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

You can run the provided CDK project to deploy the 2 custom authorizer lambda functions.
You can examine the definition of the resources that are going to be created in the `lib/jwt-iot-custom-authorizer-stack.ts` file. The authorizer logic in in teh lambda functions in the lambda folder. There are 2 authorizers, one for websocket connections and one for mqtt.

Run the following commands to download all the project dependencies and compile the stack:

```
npm install
npm run build
```

Then deploy it with:

```
cdk deploy
```

You can change the default values for the username, password and token for the Mqtt authorizer by invoking the `cdk deploy` with the parameters:

```
cdk deploy --parameters username=admin --parameters password=admin --parameters token=XXX
```

**NOTE**: if this is the first time you use CDK on this AWS account and region the deploy will fail. Read the instructions printed on screen on how to bootstrap the account to be able to use the CDK tool.

The above commands will print out few lines ending with the 2 custom authorizer Lambda function arns, one called `lambdaArn` and the other `lambdaArnMqtt`. Please note these down as they will be needed later.


## WebSocket Custom Authorizer for JSON Web Tokens (JWT)

If signature verification is enabled on the custom authorizer, AWS IoT Core validates that the token that is provided is signed with a an asymmetric key known by the client and AWS IoT Core. This prevents malicious users to trigger you custom authorizer Lambda function as AWS IoT Core will deny access if the token and the token signature do not match.

The token signature is generated by using the RSA256 algorithm. This is also one of the algorithms that can be used to sign JWT tokens [RFC 7518](https://tools.ietf.org/html/rfc7518#section-3), which means we can use the JWT as token and the JWT signature as the token signature to pass to the authorizer. In this way AWS IoT Core takes care of validating the signature and the Custom Authorizer Lambda function can trust the JWT.

If you want to use JWT tokens provided by 3rd parties IdP, first verify that the signing algorithm used is RSA256. 
You also need to get the public key from the provider that will be used as the public verification key by the custom authorizer. If the provider is OIDC compliant, you can obtain the public key from the jwks endpoint. (For an extensive walk through you can refer to [Navigating RS256 and JWKS](https://auth0.com/blog/navigating-rs256-and-jwks/))

1. `GET /.well-known/openid-configuration` from the provider endpoint (https://openid.net/specs/openid-connect-discovery-1_0-21.html#ProviderConfigurationRequest)
1. Extract the `"jwks_uri"` value from the response
1. `GET <jwks_uri>` to get the JSON Web Key Set (https://auth0.com/docs/security/tokens/json-web-tokens/json-web-key-set-properties)
1. Derive the public key

You can use [jwks-rsa](https://www.npmjs.com/package/jwks-rsa) library to get the public key.


## Create a custom signing key pair 

For this demo we are going to create our own signing key pair using openssl.

```bash
openssl genrsa -out myPrivateKey.pem 2048
openssl rsa -in myPrivateKey.pem -pubout > mykey.pub
```

The file `mykey.pub` will contain the public key in PEM format that you will need to configure for the authorizer in the next step.

##  Custom authorizer configuration for WSS connections

In this step we are going to configure the custom authorizer in AWS IoT Core. You can find more information about custom authorizers in the [documentation](https://docs.aws.amazon.com/iot/latest/developerguide/custom-authorizer.html).

We first create the authorizer, giving it a name and associating it with the lambda function that performs the authorization. This lambda function has been created in the previous step. You can examine the code in `lambda/iot-custom-auth/lambda.js`.

```bash
arn=<lambdaArn from CDK>

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

Note: you can also use the AWS Console to create the Custom Authorizer, which makes it simpler when it comes to adding the public key in the correct format.

Take note of the arn of the token authorizer. We need it to give the AWS IoT service the permission to invoke this AWS Lambda function when a new connection request is made.

```bash
aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Id-1234 \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```

By using the `source-arn` condition, we limit which custom authorizer can invoke this specific function.

### Test the authorizer

To test the authorizer you can use one of the provided clients or the `raw-pub-sub` sample clients you can find some of SDKs (see below), but we are also providing some sample clients with a minimal implementation.

For javascript we provide 3 clients in  the `client/javascript` folder. 

- `wss-client-v1.js` uses the [v1 node sdk](https://github.com/aws/aws-iot-device-sdk-js) and run in NodeJs
- `mqtt_wss_client.js` uses the `mqttjs` library directly and run in NodeJs >= 4.4
- `index.html`uses the `mqttjs` library and runs in a browser.


For python the client is in `client/python/minimal-wss-client.py`.

You can run all the clients without arguments to get the help.

Example:

```
node client/javascript/wss-client-v1.js --key_path <key path> --endpoint <endpoint> --id <id> [--verbose] [--authorizer_name] [--key_path]
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

For the python client and the browser client you need to pass the token and signature values, which can be obtained as follow:

```
node client/javascript/token-gen.js --id <id> --key_path <path to private key>
``` 

### How permissions are generated

The JWT token used for this demo has the following format:

```json
{
  "sub": <id>,
  "exp": 1593699087
}
```

The lambda function authorizer receives a validated token. It then checks the exp field to see if the token has not expired.
The lambda function authorizer uses the `sub` field in the token to scope down the policy for the connection  allowing the client to publish and subscribe to the topic `d/<sub>` and to its own IoT Shadow (`$aws/things/<sub>/shadow/*`).

The test client publishes a message to the topic `d/<sub>` every 5 sec. 

You can use the [AWS Iot Test console](https://console.aws.amazon.com/iot/home?#/test) to check the messages are being received.

**Troubleshooting**

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

You can get the `token` and `signature` values running 
```
node client/javascript/token-gen.js --id <id> --key_path <path to private key>
``` 
Use the same value for the `id` used to generate the token in the topic value passed to the client.

You can also use the Java SDK as it provides a [raw-pub-sub](https://github.com/aws/aws-iot-device-sdk-java-v2/tree/master/samples/RawPubSub) implementation.

## About the tokens and security

In this example the client is responsible of signing the token which is obviously not secure, as the client could craft his own privileges or impersonate another device.

The token and its signature should therefore be generated in the backend, and possibly also encrypted. 

Rotations of the token can be implemented via the MQTT protocol, and the only issue to solve would be how to obtain the initial token to the device. This could be done via an external API, a companion app, a registration step, etc. and is out of the scope of this demo.

### Testing without signature verification

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

# MQTT Custom authorizer configuration

In this second example we are going to setup a new custom authorizer to perform username and password authentication for MQTT/TLS connections.

> **NOTE**: the stack deploys the authorizer with some default values for username, password and token. You can, and should, change them by redeploying the stack with the following command:

```
cdk deploy --parameters username=<value> --parameters password=<value> --parameters token=<value>      
```

## Configure the authorizer

We first create the authorizer, giving it a name and associating it with the lambda function that performs the authorization. This lambda function has been created by the CDK stack you have deployed. You can examine the code in `lambda/iot-mqtt-custom-auth/lambda.js`.

```bash
arn=<lambdaArnMqtt arn from CDK>

resp=$(aws iot create-authorizer \
  --authorizer-name "MqttAuthorizer" \
  --authorizer-function-arn $arn \
  --status ACTIVE \
  --signing-disabled)

auth_arn=$(echo $resp | jq -r .authorizerArn -)
```

Take note of the arn of the token authorizer, we need it to give the AWS IoT service the permission to invoke this lambda function when a new connection request is made.

```bash
aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Mqtt-auth \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```

### Test the authorizer

For this test we provide a Python client using the Python AWS CRT libraries.

```
pip install -r requirements.txt
python client/python/minimal-mqtt-client.py --username aladdin --password opensesame --topic d/aladdin --endpoint <endpoint>
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

You need to provide an authorizer name that will be appended to the `username` unless you have configured the authorizer as the default one for the account using the following command:

```
aws iot set-default-authorizer --authorizer-name MqttAuthorizer
```


### Use a token instead of username/password

Instead of using username/password for MQTT authentication, you can also use a bearer token. In this case you will need to specify a token name when creating the authorizer and you can use the signing option to better secure your endpoint. We are not going to enable signing in this example. 

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
  --topic d/aladdin --token allow --authorizer-name MqttTokenAuthorizer \
  --username aladdin --password dummy
```

You can also test the MQTT/TLS connection with the `raw-pub-sub` sample client available in the [Java](https://github.com/aws/aws-iot-device-sdk-java-v2) 
and [CPP](https://github.com/aws/aws-iot-device-sdk-cpp-v2) SDKs.

With those samples you need to pass the `token` and the `authorizer name` as username. The password can be any string. The value for the username would then be:

`aladdin?x-amz-customauthorizer-name=MqttTokenAuthorizer&token=allow`

## Enable signing

If you enable signing for the authorizer you need to generate the token signature using the RSA256 algorithm and pass it as part of the username.

For example the full username would be similar to:

`aladdin?x-amz-customauthorizer-name=MqttTokenAuthorizer&token=allow&x-amz-customauthorizer-signature=signature`

Where `signature` is the computed signature.

## Using the embedded C SDK

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

When using Custom Domains you need to configure the authorizer on the domain using the following API https://docs.aws.amazon.com/iot/latest/apireference/API_UpdateDomainConfiguration.html


```
aws iot update-domain-configuration --domain-configuration-name <DOMAIN_CONF_NAME> \
     --authorizer-config defaultAuthorizerName=<AUTHORIZER_NAME>
``` 





