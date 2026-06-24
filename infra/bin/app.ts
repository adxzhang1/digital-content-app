#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ApplicationStack } from "../lib/application-stack.js";

const app = new cdk.App();

new ApplicationStack(app, "DigitalContentApp-dev", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
