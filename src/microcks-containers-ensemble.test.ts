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

import { GenericContainer, Network, Wait } from "testcontainers";
import { MicrocksContainersEnsemble } from "./microcks-containers-ensemble";
import { TestRequest, TestRunnerType } from "./microcks-container";
import { WebSocket } from "ws";

describe("MicrocksContainersEnsemble", () => {
  jest.setTimeout(180_000);

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

  // start and mock async {
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


  function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
  }
});