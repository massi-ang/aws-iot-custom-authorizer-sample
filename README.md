# Custom Authorizers

This sample code provides two AWS IoT custom authorizers implementations: one that works for WebSocket connections, and one for MQTT connections. It is of course possible combine the two in a single authorizer, but I preferred keeping them separate for readability.

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
## WebSocket Custom Authorizer for JSON Web Tokens (JWT)

The custom authorizer can validate that the token that is provided is signed with a known key. This prevents malicious users to trigger you custom authorizer lambda function as AWS IoT Core will deny access if the token and the token signature do not match.

The custom authorizer uses the RSA256 algorithm for the token signature. This is also one of the algorithms that can be used to sign JWT tokens [RFC 7518](https://tools.ietf.org/html/rfc7518#section-3), which means we can use the JWT signature as signature to pass to the authorizer. In this way, AWS IoT Core takes care of validating the signature allowing the Customer Authorizer to trust the JWT.

If you want to use JWT tokens provided by 3rd parties IdP, first verify that the signing algorithm used is RSA256. 
Then, you need to get the public key from the provider that will be used as the public verification key by the custom authorizer. If the provider is OIDC compliant, you can obtain the public key from the jwks endpoint. (For an extensive walk through you can refer to [Navigating RS256 and JWKS](https://auth0.com/blog/navigating-rs256-and-jwks/))

1. `GET /.well-known/openid-configuration` from the provider endpoint (https://openid.net/specs/openid-connect-discovery-1_0-21.html#ProviderConfigurationRequest)
1. Extract the `"jwks_uri"` value from the response
1. `GET <jwks_uri>` to get the JSON Web Key Set (https://auth0.com/docs/security/tokens/json-web-tokens/json-web-key-set-properties)
1. Derive the public key

You can use [jwks-rsa](https://www.npmjs.com/package/jwks-rsa) library to get the public key.


## Create the signing key pair

To create the key pair follow these steps:

```bash
openssl genrsa -out myPrivateKey.pem 2048
openssl rsa -in myPrivateKey.pem -pubout > mykey.pub
```

The file `mykey.pub` will contain the public key in PEM format that you will need to configure for the authorizer in the next step.

##  Custom authorizer configuration MQTT/WSS

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
  --token-signing-public-keys KEY1="-----BEGIN PUBLIC KEY-----
  ...
  -----END PUBLIC KEY-----")
auth_arn=$(echo $resp | jq -r .authorizerArn -)
```

Note: you can also use the AWS Console to create the Custom Authorizer.

Take note of the arn of the token authorizer. We need it to give the iot service the permission to invoke this lambda function on when a new connection request is made.

```bash
aws lambda add-permission \
  --function-name  $arn \
  --principal iot.amazonaws.com \
  --statement-id Id-1234 \
  --action "lambda:InvokeFunction" \
  --source-arn $auth_arn
```

### Test the authorizer


To test the authorizer you can use one of the provided clients or the `raw-pub-sub` sample clients in some of SDKs. 

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

You can obtain the values by running 

```
node client/javascript/token-gen.js --id <id> --key_path <path to private key>
``` 


The client code creates a JWT token as the following and signs it with RSA256 using the private key:

```json
{
  "sub": <id>,
  "exp": 1593699087
}
```

The `sub` field in the token is used by the authorizer to scope down the policy for the connection, allowing the client to publish and subscribe to the topic `d/<sub>` and to its own IoT Shadow.

The test client publishes a message to the topic `d/<id>` every 5 sec. Use the [iot console](https://console.aws.amazon.com/iot/home?#/test) to check the messages are being received.

**If you get an error**

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

##  MQTT Custom authorizer configuration

In this second example we are going to setup a new custom authorizer to perform username and password authentication for MQTT/TLS connections.

> **NOTE**: the stack deploys the authorizer with some default values for username, password and token. You can customize them by redeploying the stack with the following command:

```
cdk deploy --parameters username=<value> --parameters password=<value> --parameters token=<value>      
```

### CLI

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

For now we are setting up the  MQTT authorizer without specifying a token and with signing disabled. Later we will show how to enable these features.

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

For this test we provide a Python client using the Python AWS Crt libraries.

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





