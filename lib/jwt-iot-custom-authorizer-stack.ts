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



import * as cdk from 'aws-cdk-lib';
import { aws_lambda as lambda,  } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class JwtIotCustomAuthorizerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
