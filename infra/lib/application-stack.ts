import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  HttpApi,
  CorsHttpMethod,
  HttpMethod
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType
} from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table
} from "aws-cdk-lib/aws-dynamodb";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  KeyGroup,
  PriceClass,
  PublicKey,
  ViewerProtocolPolicy
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket, BlockPublicAccess, HttpMethods } from "aws-cdk-lib/aws-s3";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Queue } from "aws-cdk-lib/aws-sqs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const firebaseProjectId = this.node.tryGetContext("firebaseProjectId");
    const firebaseServiceAccountSecretName = this.node.tryGetContext(
      "firebaseServiceAccountSecretName"
    );
    const mediaSigningKeySecretName = this.node.tryGetContext(
      "mediaSigningKeySecretName"
    );

    if (
      !firebaseProjectId ||
      !firebaseServiceAccountSecretName ||
      !mediaSigningKeySecretName
    ) {
      throw new Error(
        "Set firebaseProjectId, firebaseServiceAccountSecretName, and mediaSigningKeySecretName in CDK context."
      );
    }

    const firebaseServiceAccountSecret = Secret.fromSecretNameV2(
      this,
      "FirebaseServiceAccountSecret",
      firebaseServiceAccountSecretName
    );
    const mediaSigningKeySecret = Secret.fromSecretNameV2(
      this,
      "MediaSigningKeySecret",
      mediaSigningKeySecretName
    );

    const createHandler = (id: string, entry: string) =>
      new NodejsFunction(this, id, {
        runtime: Runtime.NODEJS_22_X,
        entry: path.join(__dirname, "../../packages/backend/src", entry),
        handler: "handler",
        bundling: {
          minify: true,
          sourceMap: true
        }
      });

    const postsTable = new Table(this, "PostsTable", {
      partitionKey: {
        name: "PK",
        type: AttributeType.STRING
      },
      sortKey: {
        name: "SK",
        type: AttributeType.STRING
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    postsTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: {
        name: "GSI1PK",
        type: AttributeType.STRING
      },
      sortKey: {
        name: "GSI1SK",
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    });

    const usersTable = new Table(this, "UsersTable", {
      partitionKey: {
        name: "PK",
        type: AttributeType.STRING
      },
      sortKey: {
        name: "SK",
        type: AttributeType.STRING
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const profilesTable = new Table(this, "ProfilesTable", {
      partitionKey: {
        name: "PK",
        type: AttributeType.STRING
      },
      sortKey: {
        name: "SK",
        type: AttributeType.STRING
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const mediaBucket = new Bucket(this, "MediaBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"]
        }
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const mediaPublicKey = new PublicKey(this, "MediaPublicKey", {
      encodedKey: mediaSigningKeySecret
        .secretValueFromJson("publicKey")
        .unsafeUnwrap()
    });
    const mediaKeyGroup = new KeyGroup(this, "MediaKeyGroup", {
      items: [mediaPublicKey]
    });
    const mediaCachePolicy = new CachePolicy(this, "MediaCachePolicy", {
      defaultTtl: cdk.Duration.minutes(1),
      maxTtl: cdk.Duration.minutes(1),
      minTtl: cdk.Duration.seconds(0)
    });

    const mediaDistribution = new Distribution(this, "MediaDistribution", {
      defaultBehavior: {
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: mediaCachePolicy,
        origin: S3BucketOrigin.withOriginAccessControl(mediaBucket, {
          originPath: "/posts/processed"
        }),
        trustedKeyGroups: [mediaKeyGroup],
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      priceClass: PriceClass.PRICE_CLASS_100
    });
    const mediaBaseUrl = `https://${mediaDistribution.distributionDomainName}`;

    const postProcessingQueue = new Queue(this, "PostProcessingQueue", {
      visibilityTimeout: cdk.Duration.minutes(5)
    });

    const healthHandler = createHandler("HealthHandler", "handlers/health.ts");
    const firebaseAuthorizerHandler = createHandler(
      "FirebaseAuthorizerHandler",
      "handlers/firebase-authorizer.ts"
    );
    const completeOnboardingHandler = createHandler(
      "CompleteOnboardingHandler",
      "handlers/complete-onboarding.ts"
    );
    const getCurrentUserHandler = createHandler(
      "GetCurrentUserHandler",
      "handlers/get-current-user.ts"
    );
    const createPostUploadUrlsHandler = createHandler(
      "CreatePostUploadUrlsHandler",
      "handlers/create-post-upload-urls.ts"
    );
    const finalizePostHandler = createHandler(
      "FinalizePostHandler",
      "handlers/finalize-post.ts"
    );
    const getPostStatusHandler = createHandler(
      "GetPostStatusHandler",
      "handlers/get-post-status.ts"
    );
    const getProfileHandler = createHandler(
      "GetProfileHandler",
      "handlers/get-profile.ts"
    );
    const getProfilePostsHandler = createHandler(
      "GetProfilePostsHandler",
      "handlers/get-profile-posts.ts"
    );
    const getPostDetailHandler = createHandler(
      "GetPostDetailHandler",
      "handlers/get-post-detail.ts"
    );
    const deletePostHandler = createHandler(
      "DeletePostHandler",
      "handlers/delete-post.ts"
    );
    const likePostHandler = createHandler(
      "LikePostHandler",
      "handlers/like-post.ts"
    );
    const processPostMediaHandler = new NodejsFunction(
      this,
      "ProcessPostMediaHandler",
      {
        runtime: Runtime.NODEJS_22_X,
        entry: path.join(
          __dirname,
          "../../packages/backend/src/handlers/process-post-media.ts"
        ),
        handler: "handler",
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        bundling: {
          forceDockerBundling: true,
          minify: true,
          sourceMap: true,
          nodeModules: ["sharp"],
          environment: {
            // CDK's pnpm Docker bundling otherwise puts nondeterministic store
            // metadata in the Lambda asset.
            NPM_CONFIG_STORE_DIR: "/tmp/pnpm-cache"
          }
        }
      }
    );

    createPostUploadUrlsHandler.addEnvironment(
      "MEDIA_BUCKET_NAME",
      mediaBucket.bucketName
    );
    firebaseAuthorizerHandler.addEnvironment(
      "FIREBASE_PROJECT_ID",
      firebaseProjectId
    );
    firebaseAuthorizerHandler.addEnvironment(
      "USERS_TABLE_NAME",
      usersTable.tableName
    );
    firebaseAuthorizerHandler.addEnvironment(
      "FIREBASE_SERVICE_ACCOUNT_SECRET_NAME",
      firebaseServiceAccountSecretName
    );
    finalizePostHandler.addEnvironment(
      "POSTS_TABLE_NAME",
      postsTable.tableName
    );
    finalizePostHandler.addEnvironment(
      "POST_PROCESSING_QUEUE_URL",
      postProcessingQueue.queueUrl
    );
    finalizePostHandler.addEnvironment("MEDIA_BASE_URL", mediaBaseUrl);
    finalizePostHandler.addEnvironment(
      "MEDIA_SIGNING_KEY_PAIR_ID",
      mediaPublicKey.publicKeyId
    );
    finalizePostHandler.addEnvironment(
      "MEDIA_SIGNING_KEY_SECRET_NAME",
      mediaSigningKeySecretName
    );
    getPostStatusHandler.addEnvironment(
      "POSTS_TABLE_NAME",
      postsTable.tableName
    );
    getProfilePostsHandler.addEnvironment(
      "POSTS_TABLE_NAME",
      postsTable.tableName
    );
    getProfilePostsHandler.addEnvironment(
      "PROFILES_TABLE_NAME",
      profilesTable.tableName
    );
    getProfilePostsHandler.addEnvironment("MEDIA_BASE_URL", mediaBaseUrl);
    getProfilePostsHandler.addEnvironment(
      "MEDIA_SIGNING_KEY_PAIR_ID",
      mediaPublicKey.publicKeyId
    );
    getProfilePostsHandler.addEnvironment(
      "MEDIA_SIGNING_KEY_SECRET_NAME",
      mediaSigningKeySecretName
    );
    getPostDetailHandler.addEnvironment(
      "POSTS_TABLE_NAME",
      postsTable.tableName
    );
    getPostDetailHandler.addEnvironment(
      "PROFILES_TABLE_NAME",
      profilesTable.tableName
    );
    getPostDetailHandler.addEnvironment("MEDIA_BASE_URL", mediaBaseUrl);
    getPostDetailHandler.addEnvironment(
      "MEDIA_SIGNING_KEY_PAIR_ID",
      mediaPublicKey.publicKeyId
    );
    getPostDetailHandler.addEnvironment(
      "MEDIA_SIGNING_KEY_SECRET_NAME",
      mediaSigningKeySecretName
    );
    deletePostHandler.addEnvironment("POSTS_TABLE_NAME", postsTable.tableName);
    deletePostHandler.addEnvironment(
      "PROFILES_TABLE_NAME",
      profilesTable.tableName
    );
    deletePostHandler.addEnvironment(
      "MEDIA_BUCKET_NAME",
      mediaBucket.bucketName
    );
    likePostHandler.addEnvironment("POSTS_TABLE_NAME", postsTable.tableName);
    likePostHandler.addEnvironment(
      "PROFILES_TABLE_NAME",
      profilesTable.tableName
    );
    processPostMediaHandler.addEnvironment(
      "POSTS_TABLE_NAME",
      postsTable.tableName
    );
    processPostMediaHandler.addEnvironment(
      "MEDIA_BUCKET_NAME",
      mediaBucket.bucketName
    );
    completeOnboardingHandler.addEnvironment(
      "USERS_TABLE_NAME",
      usersTable.tableName
    );
    completeOnboardingHandler.addEnvironment(
      "PROFILES_TABLE_NAME",
      profilesTable.tableName
    );
    getCurrentUserHandler.addEnvironment(
      "PROFILES_TABLE_NAME",
      profilesTable.tableName
    );
    getProfileHandler.addEnvironment(
      "PROFILES_TABLE_NAME",
      profilesTable.tableName
    );
    mediaBucket.grantPut(createPostUploadUrlsHandler);
    mediaBucket.grantDelete(deletePostHandler);
    usersTable.grantReadData(firebaseAuthorizerHandler);
    firebaseServiceAccountSecret.grantRead(firebaseAuthorizerHandler);
    mediaSigningKeySecret.grantRead(finalizePostHandler);
    mediaSigningKeySecret.grantRead(getProfilePostsHandler);
    mediaSigningKeySecret.grantRead(getPostDetailHandler);
    mediaBucket.grantReadWrite(processPostMediaHandler);
    postProcessingQueue.grantSendMessages(finalizePostHandler);
    postProcessingQueue.grantConsumeMessages(processPostMediaHandler);
    processPostMediaHandler.addEventSource(
      new SqsEventSource(postProcessingQueue, {
        batchSize: 5
      })
    );
    postsTable.grantWriteData(finalizePostHandler);
    postsTable.grantReadData(getPostStatusHandler);
    postsTable.grantReadWriteData(processPostMediaHandler);
    postsTable.grantReadData(getProfilePostsHandler);
    postsTable.grantReadData(getPostDetailHandler);
    postsTable.grantReadWriteData(deletePostHandler);
    postsTable.grantWriteData(likePostHandler);
    usersTable.grantWriteData(completeOnboardingHandler);
    profilesTable.grantWriteData(completeOnboardingHandler);
    usersTable.grant(
      completeOnboardingHandler,
      "dynamodb:TransactWriteItems"
    );
    profilesTable.grant(
      completeOnboardingHandler,
      "dynamodb:TransactWriteItems"
    );
    profilesTable.grantReadData(getCurrentUserHandler);
    profilesTable.grantReadData(getProfileHandler);
    profilesTable.grantReadData(getProfilePostsHandler);
    profilesTable.grantReadData(getPostDetailHandler);
    profilesTable.grantReadData(deletePostHandler);
    profilesTable.grantReadData(likePostHandler);

    const api = new HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowHeaders: [
          "content-type",
          "authorization"
        ],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS
        ],
        allowOrigins: ["*"]
      }
    });

    const firebaseAuthorizer = new HttpLambdaAuthorizer(
      "FirebaseAuthorizer",
      firebaseAuthorizerHandler,
      {
        responseTypes: [HttpLambdaResponseType.SIMPLE],
        identitySource: ["$request.header.Authorization"],
        resultsCacheTtl: cdk.Duration.minutes(5)
      }
    );

    api.addRoutes({
      path: "/health",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("HealthIntegration", healthHandler)
    });

    api.addRoutes({
      path: "/me/onboarding",
      methods: [HttpMethod.POST],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "CompleteOnboardingIntegration",
        completeOnboardingHandler
      )
    });

    api.addRoutes({
      path: "/me",
      methods: [HttpMethod.GET],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "GetCurrentUserIntegration",
        getCurrentUserHandler
      )
    });

    api.addRoutes({
      path: "/posts/upload-urls",
      methods: [HttpMethod.POST],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "CreatePostUploadUrlsIntegration",
        createPostUploadUrlsHandler
      )
    });

    api.addRoutes({
      path: "/posts",
      methods: [HttpMethod.POST],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "FinalizePostIntegration",
        finalizePostHandler
      )
    });

    api.addRoutes({
      path: "/posts/{postId}",
      methods: [HttpMethod.GET],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "GetPostStatusIntegration",
        getPostStatusHandler
      )
    });

    api.addRoutes({
      path: "/profiles/{username}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "GetProfileIntegration",
        getProfileHandler
      )
    });

    api.addRoutes({
      path: "/profiles/{username}/posts",
      methods: [HttpMethod.GET],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "GetProfilePostsIntegration",
        getProfilePostsHandler
      )
    });

    api.addRoutes({
      path: "/profiles/{username}/posts/{postId}",
      methods: [HttpMethod.GET],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "GetPostDetailIntegration",
        getPostDetailHandler
      )
    });

    api.addRoutes({
      path: "/profiles/{username}/posts/{postId}",
      methods: [HttpMethod.DELETE],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "DeletePostIntegration",
        deletePostHandler
      )
    });

    api.addRoutes({
      path: "/profiles/{username}/posts/{postId}/like",
      methods: [HttpMethod.POST],
      authorizer: firebaseAuthorizer,
      integration: new HttpLambdaIntegration(
        "LikePostIntegration",
        likePostHandler
      )
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.apiEndpoint
    });

    new cdk.CfnOutput(this, "MediaUrl", {
      value: mediaBaseUrl
    });
  }
}
