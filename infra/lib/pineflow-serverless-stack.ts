import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class PineflowServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const budgetAlertEmail = new cdk.CfnParameter(this, "BudgetAlertEmail", {
      type: "String",
      description: "Email address that receives Pineflow AWS Budget alerts."
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "pineflow-users",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      standardAttributes: {
        email: { required: true, mutable: true }
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const userPoolClient = userPool.addClient("UserPoolClient", {
      userPoolClientName: "pineflow-web",
      generateSecret: false,
      disableOAuth: true,
      preventUserExistenceErrors: true,
      authFlows: {
        userSrp: true,
        userPassword: true
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(1)
    });

    const table = new dynamodb.Table(this, "Table", {
      tableName: "pineflow",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `pineflow-frontend-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "FrontendSecurityHeadersPolicy",
      {
        responseHeadersPolicyName: "pineflow-frontend-security-headers",
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "img-src 'self' data:",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              `connect-src 'self' https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com https://*.execute-api.${cdk.Stack.of(this).region}.amazonaws.com https://api.open-meteo.com https://api.bigdatacloud.net`
            ].join("; "),
            override: true
          },
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true
          },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
            override: true
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true
          }
        }
      }
    );

    const distribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5)
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5)
        }
      ]
    });

    const apiLogGroup = new logs.LogGroup(this, "ApiFunctionLogGroup", {
      logGroupName: "/aws/lambda/pineflow-api",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const apiFunction = new lambda.Function(this, "ApiFunction", {
      functionName: "pineflow-api",
      code: lambda.Code.fromAsset("lambda/pineflow-api"),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      reservedConcurrentExecutions: 1,
      logGroup: apiLogGroup,
      environment: {
        TABLE_NAME: table.tableName
      }
    });

    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:TransactWriteItems"
        ],
        resources: [table.tableArn]
      })
    );

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "pineflow-api",
      corsPreflight: {
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS
        ],
        allowOrigins: [`https://${distribution.distributionDomainName}`],
        maxAge: cdk.Duration.days(1)
      }
    });

    const defaultStage = httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: 5,
        throttlingRateLimit: 1
      };
    }

    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      "CognitoJwtAuthorizer",
      `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId]
      }
    );

    const integration = new integrations.HttpLambdaIntegration("ApiIntegration", apiFunction);

    for (const route of [
      { path: "/api/health", method: apigwv2.HttpMethod.GET },
      { path: "/api/state", method: apigwv2.HttpMethod.GET },
      { path: "/api/check-in", method: apigwv2.HttpMethod.POST },
      { path: "/api/check-out", method: apigwv2.HttpMethod.POST },
      { path: "/api/records/{recordId}", method: apigwv2.HttpMethod.PATCH },
      { path: "/api/settings", method: apigwv2.HttpMethod.PATCH }
    ]) {
      httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration,
        authorizer: jwtAuthorizer
      });
    }

    new cloudwatch.Alarm(this, "ApiLambdaErrorAlarm", {
      alarmName: "pineflow-api-lambda-errors",
      metric: apiFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    for (const amount of [1, 3, 5]) {
      new budgets.CfnBudget(this, `Budget${amount}Usd`, {
        budget: {
          budgetName: `pineflow-${amount}-usd-monthly`,
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: {
            amount,
            unit: "USD"
          }
        },
        notificationsWithSubscribers: [
          {
            notification: {
              comparisonOperator: "GREATER_THAN",
              notificationType: "ACTUAL",
              threshold: 100,
              thresholdType: "PERCENTAGE"
            },
            subscribers: [
              {
                subscriptionType: "EMAIL",
                address: budgetAlertEmail.valueAsString
              }
            ]
          }
        ]
      });
    }

    new cdk.CfnOutput(this, "ApiEndpoint", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "FrontendBucketName", { value: frontendBucket.bucketName });
    new cdk.CfnOutput(this, "FrontendDistributionDomainName", {
      value: distribution.distributionDomainName
    });
    new cdk.CfnOutput(this, "FrontendDistributionId", {
      value: distribution.distributionId
    });
  }
}
