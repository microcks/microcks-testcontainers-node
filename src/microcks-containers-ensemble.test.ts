/*
 * Copyright The Microcks Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as path from "path";
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { jest } from '@jest/globals'
import { CreateQueueCommand, ListQueuesCommand, ReceiveMessageCommand, SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { GenericContainer, Network, Wait } from "testcontainers";
import { LocalstackContainer } from "@testcontainers/localstack";
import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import { MicrocksContainersEnsemble } from "./microcks-containers-ensemble.js";
import { TestRequest, TestResult, TestRunnerType } from "./microcks-container.js";
import { WebSocket } from "ws";
import mqtt from "mqtt"; 
import amqp from "amqplib";

describe("MicrocksContainersEnsemble", () => {
  jest.setTimeout(180_000);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const resourcesDir = path.resolve(__dirname, "..", "test-resources");

  // start and mock {
  it("should start, load artifacts and expose mock", async () => {
    const network = await new Network().start();

    // Start ensemble, load artifacts and start other containers.
    const ensemble = await new MicrocksContainersEnsemble(network)
      .withMainArtifacts([path.resolve(resourcesDir, "apipastries-openapi.yaml")])
      .withSecondaryArtifacts([path.resolve(resourcesDir, "apipastries-postman-collection.json")])
      .start();

    // Get base Url for API Pastries / 0.0.1
    var pastriesUrl = ensemble.getMicrocksContainer().getRestMockEndpoint("API Pastries", "0.0.1");

    // Check that mock from main/primary artifact has been loaded.
    var response = await fetch(pastriesUrl + "/pastries/Millefeuille");
    var responseJson = await response.json();

    expect(response.status).toBe(200);
    expect(responseJson.name).toBe("Millefeuille");

    // Check that mock from secondary artifact has been loaded too.
    response = await fetch(pastriesUrl + "/pastries/Eclair Chocolat");
    responseJson = await response.json();

    expect(response.status).toBe(200);
    expect(responseJson.name).toBe("Eclair Chocolat");

    // Now stop the ensemble and the network.
    await ensemble.stop();
    await network.stop();
  });
  // }

  // start and contract test {
  it("should start, load artifacts and contract test mock", async () => {
    const network = await new Network().start();

    // Start ensemble, load artifacts and start other containers.
    const ensemble = await new MicrocksContainersEnsemble(network)
      .withMainArtifacts([path.resolve(resourcesDir, "apipastries-openapi.yaml")])
      .withSecondaryArtifacts([path.resolve(resourcesDir, "apipastries-postman-collection.json")])
      .withPostman()
      .start();

    const badImpl = await new GenericContainer("quay.io/microcks/contract-testing-demo:02")
      .withNetwork(network)
      .withNetworkAliases("bad-impl")
      .withWaitStrategy(Wait.forLogMessage("Example app listening on port 3002", 1))
      .start();
    const goodImpl = await new GenericContainer("quay.io/microcks/contract-testing-demo:03")
      .withNetwork(network)
      .withNetworkAliases("good-impl")
      .withWaitStrategy(Wait.forLogMessage("Example app listening on port 3003", 1))
      .start();

    var testRequest: TestRequest = {
      serviceId: "API Pastries:0.0.1",
      runnerType: TestRunnerType.POSTMAN,
      testEndpoint: "http://bad-impl:3002",
      timeout: 3000
    }
    var testResult = await ensemble.getMicrocksContainer().testEndpoint(testRequest);

    expect(testResult.success).toBe(false);
    expect(testResult.testedEndpoint).toBe("http://bad-impl:3002");
    expect(testResult.testCaseResults.length).toBe(3);
    // Postman runner stop at first failure so there's just 1 testStepResult per testCaseResult
    expect(testResult.testCaseResults[0].testStepResults.length).toBe(1);
    // Order is not deterministic so it could be a matter of invalid size, invalid name or invalid price.
    expect(testResult.testCaseResults[0].testStepResults[0].message === "Valid size in response pastries"
        || testResult.testCaseResults[0].testStepResults[0].message === "Valid name in response pastry"
        || testResult.testCaseResults[0].testStepResults[0].message === "Valid price in response pastry").toBeTruthy();

    testRequest = {
      serviceId: "API Pastries:0.0.1",
      runnerType: TestRunnerType.POSTMAN,
      testEndpoint: "http://good-impl:3003",
      timeout: 3000
    }
    testResult = await ensemble.getMicrocksContainer().testEndpoint(testRequest);

    expect(testResult.success).toBe(true);
    expect(testResult.testedEndpoint).toBe("http://good-impl:3003");
    expect(testResult.testCaseResults.length).toBe(3);
    expect(testResult.testCaseResults[0].testStepResults[0].message).toBeUndefined();

    // Now stop the ensemble, the containers and the network.
    await ensemble.stop();
    await badImpl.stop();
    await goodImpl.stop();
    await network.stop();
  });
  // }

  // start and mock async WS {
  it("should start, load artifacts and mock async WebSocket", async () => {
    const network = await new Network().start();

    // Start ensemble, load artifacts and start other containers.
    const ensemble = await new MicrocksContainersEnsemble(network, "quay.io/microcks/microcks-uber:nightly")
      .withMainArtifacts([path.resolve(resourcesDir, "pastry-orders-asyncapi.yml")])
      .withAsyncFeature("quay.io/microcks/microcks-uber-async-minion:nightly")
      .start();

    // Initialize messages list and connect to mock endpoint.
    let messages: string[] = [];
    let wsEndpoint = ensemble.getAsyncMinionContainer()?.getWSMockEndpoint("Pastry orders API", "0.1.0", "SUBSCRIBE pastry/orders");
    let expectedMessage = "{\"id\":\"4dab240d-7847-4e25-8ef3-1530687650c8\",\"customerId\":\"fe1088b3-9f30-4dc1-a93d-7b74f0a072b9\",\"status\":\"VALIDATED\",\"productQuantities\":[{\"quantity\":2,\"pastryName\":\"Croissant\"},{\"quantity\":1,\"pastryName\":\"Millefeuille\"}]}";

    const ws = new WebSocket(wsEndpoint as string);    
    ws.on('error', console.error);
    ws.on('message', function message(data) {
      messages.push(data.toString());
    });

    // Wait 7 seconds for messages from Async Minion WebSocket to get at least 2 messages.
    await delay(7000);

    expect(messages.length).toBeGreaterThan(0);
    messages.forEach(message => {
      expect(message).toBe(expectedMessage);
    });

    // Now stop the ensemble, the containers and the network.
    await ensemble.stop();
    await network.stop();
  });
  // }

  // start and contract test async WS {
  it("should start, load artifacts and contract test mock async WebSocket", async () => {
    const network = await new Network().start();

    // Start ensemble, load artifacts and start other containers.
    const ensemble = await new MicrocksContainersEnsemble(network, "quay.io/microcks/microcks-uber:nightly")
      .withMainArtifacts([path.resolve(resourcesDir, "pastry-orders-asyncapi.yml")])
      .withAsyncFeature()
      .start();

    const badImpl = await new GenericContainer("quay.io/microcks/contract-testing-demo-async:01")
      .withNetwork(network)
      .withNetworkAliases("bad-impl")
      .withWaitStrategy(Wait.forLogMessage("Starting WebSocket server on ws://localhost:4001/websocket", 1))
      .start();
    const goodImpl = await new GenericContainer("quay.io/microcks/contract-testing-demo-async:02")
      .withNetwork(network)
      .withNetworkAliases("good-impl")
      .withWaitStrategy(Wait.forLogMessage("Starting WebSocket server on ws://localhost:4002/websocket", 1))
      .start();

    var testRequest: TestRequest = {
      serviceId: "Pastry orders API:0.1.0",
      runnerType: TestRunnerType.ASYNC_API_SCHEMA,
      testEndpoint: "ws://bad-impl:4001/websocket",
      timeout: 5000
    }

    var testResult = await ensemble.getMicrocksContainer().testEndpoint(testRequest);

    expect(testResult.success).toBe(false);
    expect(testResult.testedEndpoint).toBe("ws://bad-impl:4001/websocket");
    expect(testResult.testCaseResults.length).toBeGreaterThan(0);
    expect(testResult.testCaseResults[0].testStepResults[0].message).toContain("object has missing required properties");

    // Retrieve event messages for the failing test case.
    const events = await ensemble.getMicrocksContainer().getEventMessagesForTestCase(testResult, 
      "SUBSCRIBE pastry/orders");

    // We should have at least 1 event.
    expect(events.length).toBeGreaterThan(0);
    events.forEach(message => {
      expect(message.eventMessage).not.toBeNull();
      expect(message.eventMessage.content).not.toBeNull();

      // Check these are the correct content.
      const content = JSON.parse(message.eventMessage.content);
      expect(content['productQuantities'].length).toBe(2);
    });

    testRequest = {
      serviceId: "Pastry orders API:0.1.0",
      runnerType: TestRunnerType.ASYNC_API_SCHEMA,
      testEndpoint: "ws://good-impl:4002/websocket",
      timeout: 5000
    }
    testResult = await ensemble.getMicrocksContainer().testEndpoint(testRequest);

    expect(testResult.success).toBe(true);
    expect(testResult.testedEndpoint).toBe("ws://good-impl:4002/websocket");
    expect(testResult.testCaseResults.length).toBeGreaterThan(0);
    testResult.testCaseResults.forEach(tcr => {
      tcr.testStepResults.forEach(tsr => {
        expect(tsr.message).toBeUndefined();
      })
    });

    // Now stop the ensemble, the containers and the network.
    await ensemble.stop();
    await badImpl.stop();
    await goodImpl.stop();
    await network.stop();
  });
  // }

  // start and mock async MQTT {
  it("should start, load artifacts and mock async MQTT", async () => {
    const network = await new Network().start();

    // Start ensemble, load artifacts and start other containers.
    const artemis = await new GenericContainer("apache/activemq-artemis:2.35.0-alpine")
      .withNetwork(network)
      .withNetworkAliases("artemis")
      .withExposedPorts(1883)
      .withWaitStrategy(Wait.forLogMessage(/.AMQ221007: Server is now active*/, 1))
      .start();

    const ensemble = await new MicrocksContainersEnsemble(network, "quay.io/microcks/microcks-uber:nightly-native")
      .withMainArtifacts([path.resolve(resourcesDir, "pastry-orders-asyncapi.yml")])
      .withAsyncFeature()
      .withMQTTConnection({server: 'artemis:1883', username: 'artemis', password: 'artemis'})
      .start();

    const client = mqtt.connect('mqtt://localhost:' + artemis.getMappedPort(1883), {
      username: 'artemis',
      password: 'artemis'
    });

    // Initialize messages list and connect to mock endpoint.
    let messages: string[] = [];
    let mqttTopic = ensemble.getAsyncMinionContainer()?.getMQTTMockTopic("Pastry orders API", "0.1.0", "SUBSCRIBE pastry/orders");
    let expectedMessage = "{\"id\":\"4dab240d-7847-4e25-8ef3-1530687650c8\",\"customerId\":\"fe1088b3-9f30-4dc1-a93d-7b74f0a072b9\",\"status\":\"VALIDATED\",\"productQuantities\":[{\"quantity\":2,\"pastryName\":\"Croissant\"},{\"quantity\":1,\"pastryName\":\"Millefeuille\"}]}";

    client.on('connect', () => {
      client.subscribe(mqttTopic as string, (err: any) => {
        if (!err && err != null) {
          console.log(err);
        }
      })
    })
    client.on('error', console.error);
    client.on('message', (topic: any, message: Buffer) => {
      messages.push(message.toString());
    })

    // Wait 7 seconds for messages from Async Minion to send at least 2 messages.
    await delay(7000);

    client.end(true);

    expect(messages.length).toBeGreaterThan(0);
    messages.forEach(message => {
      expect(message).toBe(expectedMessage);
    });

    // Now stop the ensemble, the container and the network.
    await ensemble.stop();
    await artemis.stop();
    await network.stop();
  });
  // }

  // start and mock async AMQP {
  it("should start, load artifacts and mock async AMQP", async () => {
    const network = await new Network().start();

    // Start ensemble, load artifacts and start other containers.
    const rabbitmq = await new RabbitMQContainer("rabbitmq:3.9.13-management-alpine")
      .withNetwork(network)
      .withNetworkAliases("rabbitmq")
      .start();

    var { output, exitCode } = await rabbitmq.exec(["rabbitmqctl", "add_user", "test", "test"]);
    var { output, exitCode } = await rabbitmq.exec(["rabbitmqctl", "set_permissions", "-p", "/", "test", ".*", ".*", ".*"]);

    const ensemble = await new MicrocksContainersEnsemble(network, "quay.io/microcks/microcks-uber:nightly-native")
      .withMainArtifacts([path.resolve(resourcesDir, "pastry-orders-asyncapi.yml")])
      .withAsyncFeature()
      .withAMQPConnection({server: 'rabbitmq:5672', username: 'test', password: 'test'})
      .start();

    // Initialize messages list and connect to mock endpoint.
    let messages: string[] = [];
    let amqpDestination = ensemble.getAsyncMinionContainer()?.getAMQPMockDestination("Pastry orders API", "0.1.0", "SUBSCRIBE pastry/orders");
    let expectedMessage = "{\"id\":\"4dab240d-7847-4e25-8ef3-1530687650c8\",\"customerId\":\"fe1088b3-9f30-4dc1-a93d-7b74f0a072b9\",\"status\":\"VALIDATED\",\"productQuantities\":[{\"quantity\":2,\"pastryName\":\"Croissant\"},{\"quantity\":1,\"pastryName\":\"Millefeuille\"}]}";

    const conn = await amqp.connect('amqp://test:test@localhost:' + rabbitmq.getMappedPort(5672));
    const channel = await conn.createChannel();

    await delay(500);
    //await channel.checkExchange(amqpDestination as string);
    await channel.assertQueue('microcks-test', { durable: false });
    await channel.bindQueue('microcks-test', amqpDestination as string, '');
    
    channel.consume('microcks-test', (msg: any) => {
      if (msg !== null) {
        messages.push(msg.content.toString());
      }
    });

    // Wait 7 seconds for messages from Async Minion to send at least 2 messages.
    await delay(7000);

    channel.close();
    conn.close();

    expect(messages.length).toBeGreaterThan(0);
    messages.forEach(message => {
      expect(message).toBe(expectedMessage);
    });

    // Now stop the ensemble, the container and the network.
    await ensemble.stop();
    await rabbitmq.stop();
    await network.stop();
  });
  // }

  // start and mock async SQS {
  it("should start, load artifacts and mock async SQS", async () => {
    const network = await new Network().start();

    // Start ensemble, load artifacts and start other containers.
    const localstack = await new LocalstackContainer("localstack/localstack:4.0.3")
      .withNetwork(network)
      .withNetworkAliases("localstack")
      .withEnvironment({
        SERVICES: 'sqs'
      })
      .start();

    // Create the Queue that has to be used by Microcks.
    const client = new SQSClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      },
      endpoint: {
        url: new URL(localstack.getConnectionUri())
      }
    });

    const createCommand = new CreateQueueCommand({
      QueueName: 'PastryordersAPI-010-pastry-orders'
    })
    await client.send(createCommand);

    const ensemble = await new MicrocksContainersEnsemble(network, "quay.io/microcks/microcks-uber:1.11.0-native")
      .withMainArtifacts([path.resolve(resourcesDir, "pastry-orders-asyncapi.yml")])
      .withAsyncFeature()
      .withAmazonSQSConnection({
        region: 'us-east-1',
        accessKey: 'test',
        secretKey: 'test',
        endpointOverride: 'http://localstack:4566'
      })
      .start();
          
    // Initialize messages list and connect to mock endpoint.
    let messages: string[] = [];
    let sqsEndpoint = ensemble.getAsyncMinionContainer()?.getAmazonSQSMockQueue("Pastry orders API", "0.1.0", "SUBSCRIBE pastry/orders");
    let expectedMessage = "{\"id\":\"4dab240d-7847-4e25-8ef3-1530687650c8\",\"customerId\":\"fe1088b3-9f30-4dc1-a93d-7b74f0a072b9\",\"status\":\"VALIDATED\",\"productQuantities\":[{\"quantity\":2,\"pastryName\":\"Croissant\"},{\"quantity\":1,\"pastryName\":\"Millefeuille\"}]}";

    // Retrieve this queue URL
    const listCommand = new ListQueuesCommand({
      QueueNamePrefix: sqsEndpoint,
      MaxResults: 1
    });
    try {
      const listResponse = await client.send(listCommand);
      const queueUrl = listResponse.QueueUrls ? listResponse.QueueUrls[0] : "null";

      const startTime = Date.now();
      const timeoutTime = startTime + 4000;
      while (Date.now() - startTime < 4000) {
        let receiveCommand = new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: Math.round((timeoutTime - Date.now()) / 1000)
        });

        let receiveResponse = await client.send(receiveCommand);
        receiveResponse.Messages?.forEach(message => {
          messages.push(message.Body as string)
        })
      }
    } finally {
      client.destroy();
    }

    expect(messages.length).toBeGreaterThan(0);
    messages.forEach(message => {
      expect(message).toBe(expectedMessage);
    });

    // Now stop the ensemble, the containers and the network.
    await ensemble.stop();
    await localstack.stop();
    await network.stop();
  });
  // }

  // start and contract test async SQS {
  it("should start, load artifacts and contract test mock async SQS", async () => {
    const network = await new Network().start();

    // Start ensemble, load artifacts and start other containers.
    const localstack = await new LocalstackContainer("localstack/localstack:4.0.3")
      .withNetwork(network)
      .withNetworkAliases("localstack")
      .start();

    // Create the Queue that has to be used by Microcks.
    const client = new SQSClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      },
      endpoint: {
        url: new URL(localstack.getConnectionUri())
      }
    });
    const createCommand = new CreateQueueCommand({
      QueueName: 'pastry-orders'
    })
    await client.send(createCommand);

    // Retrieve this queue URL
    const listCommand = new ListQueuesCommand({
      QueueNamePrefix: 'pastry-orders',
      MaxResults: 1
    });
    let queueUrl;
    try {
      const listResponse = await client.send(listCommand);
      queueUrl = listResponse.QueueUrls ? listResponse.QueueUrls[0] : "null";
    } finally {
      client.destroy();
    }

    const ensemble = await new MicrocksContainersEnsemble(network, "quay.io/microcks/microcks-uber:nightly")
      .withMainArtifacts([path.resolve(resourcesDir, "pastry-orders-asyncapi.yml")])
      .withSecret({
        name: 'localstack secret',
        username: 'test',
        password: 'test'
      })
      .withAsyncFeature()
      .start();

    // Initialize messages, start the test and publish messages.
    const badMessage = "{\"id\":\"abcd\",\"customerId\":\"efgh\",\"productQuantities\":[{\"quantity\":2,\"pastryName\":\"Croissant\"},{\"quantity\":1,\"pastryName\":\"Millefeuille\"}]}";
    const goodMessage = "{\"id\":\"abcd\",\"customerId\":\"efgh\",\"status\":\"CREATED\",\"productQuantities\":[{\"quantity\":2,\"pastryName\":\"Croissant\"},{\"quantity\":1,\"pastryName\":\"Millefeuille\"}]}";

    var testRequest: TestRequest = {
      serviceId: "Pastry orders API:0.1.0",
      runnerType: TestRunnerType.ASYNC_API_SCHEMA,
      testEndpoint: "sqs://us-east-1/pastry-orders?overrideUrl=http://localstack:4566",
      secretName: "localstack secret",
      timeout: 5000
    }

    // First test should fail with validation failure messages.
    let testResultPromise: Promise<TestResult> = ensemble.getMicrocksContainer().testEndpoint(testRequest);

    for (var i=0; i<5; i++) {
      let sendCommand = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: badMessage
      });
      client.send(sendCommand);
      console.log('Sending bad message ' + i + ' on SQS queue');
      await delay(500);
    }

    let testResult = await testResultPromise;

    expect(testResult.success).toBe(false);
    expect(testResult.testedEndpoint).toBe("sqs://us-east-1/pastry-orders?overrideUrl=http://localstack:4566");

    console.log("TestResult: " + JSON.stringify(testResult));

    expect(testResult.testCaseResults.length).toBeGreaterThan(0);
    expect(testResult.testCaseResults[0].testStepResults[0].message).toContain("object has missing required properties");
    testResult.testCaseResults.forEach(tcr => {
      tcr.testStepResults.forEach(tsr => {
        expect(tsr.message).toContain("object has missing required properties");
      })
    });

    // Second test should be OK with no validation failure messages.
    let testResultPromise2: Promise<TestResult> = ensemble.getMicrocksContainer().testEndpoint(testRequest);

    for (var i=0; i<5; i++) {
      let sendCommand = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: goodMessage
      });
      client.send(sendCommand);
      console.log('Sending good message ' + i + ' on SQS queue');
      await delay(5000);
    }

    let testResult2 = await testResultPromise2;

    expect(testResult2.success).toBe(true);
    expect(testResult2.testedEndpoint).toBe("sqs://us-east-1/pastry-orders?overrideUrl=http://localstack:4566");
    expect(testResult2.testCaseResults.length).toBeGreaterThan(0);
    testResult2.testCaseResults.forEach(tcr => {
      tcr.testStepResults.forEach(tsr => {
        expect(tsr.message).toBeUndefined();
      })
    });

    // Now stop the ensemble, the containers and the network.
    await ensemble.stop();
    await localstack.stop();
    await network.stop();
  });
  // }

  function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
  }
});