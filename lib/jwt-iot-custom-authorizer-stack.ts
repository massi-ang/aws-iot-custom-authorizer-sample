import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda'


export class JwtIotCustomAuthorizerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    let customAuthorizerLambda = new lambda.Function(this, 'iot-custom-auth', {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'lambda.handler',
      code: new lambda.AssetCode('./lambda/iot-custom-auth'),
      environment: {
        "AWS_ACCOUNT": this.account,
      }
    })

    new cdk.CfnOutput(this, "lambdaArn", {
      description: "CustomAuth Arn",
      value: customAuthorizerLambda.functionArn
    })

  }
}
