import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda'


export class JwtIotCustomAuthorizerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    let username = new cdk.CfnParameter(this, 'username', {
      default: 'aladdin',
      description: 'The username to authenticate the MQTT client'
    })

    let password = new cdk.CfnParameter(this, 'password', {
      default: 'opensesame',
      description: 'The password to authenticate the MQTT client'
    })

    let token = new cdk.CfnParameter(this, 'token', {
      default: 'allow',
      description: 'The password to authenticate the MQTT client'
    })

    let customAuthorizerLambda = new lambda.Function(this, 'iot-custom-auth', {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'lambda.handler',
      code: new lambda.AssetCode('./lambda/iot-custom-auth'),
      environment: {
        "AWS_ACCOUNT": this.account,
      }
    })

    let customAuthorizerLambdaMQTT = new lambda.Function(this, 'iot-custom-auth-mqtt', {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'lambda.handler',
      code: new lambda.AssetCode('./lambda/iot-mqtt-custom-auth'),
      environment: {
        "AWS_ACCOUNT": this.account,
        "USERNAME": username.valueAsString,
        "PASSWORD": password.valueAsString,
        "TOKEN": token.valueAsString
      }
    })

    new cdk.CfnOutput(this, "lambdaArn", {
      description: "CustomAuth Arn",
      value: customAuthorizerLambda.functionArn
    })

    new cdk.CfnOutput(this, "lambdaArnMqtt", {
      description: "CustomAuthMQTT Arn",
      value: customAuthorizerLambdaMQTT.functionArn
    })

  }
}
