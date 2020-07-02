import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as JwtIotCustomAuthorizer from '../lib/jwt-iot-custom-authorizer-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new JwtIotCustomAuthorizer.JwtIotCustomAuthorizerStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
