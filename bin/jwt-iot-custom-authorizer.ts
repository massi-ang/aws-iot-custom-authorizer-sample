#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { JwtIotCustomAuthorizerStack } from '../lib/jwt-iot-custom-authorizer-stack';

const app = new cdk.App();
new JwtIotCustomAuthorizerStack(app, 'JwtIotCustomAuthorizerStack');
