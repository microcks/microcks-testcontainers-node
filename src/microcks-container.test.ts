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
import { MicrocksContainer, TestRequest, TestRunnerType } from "./microcks-container";

describe("MicrocksContainer", () => {
  jest.setTimeout(180_000);

  const resourcesDir = path.resolve(__dirname, "..", "test-resources");

  // start and mock {
  it("should start, load artifacts and expose mock", async () => {
    // Start container and load artifacts.
    const container = await new MicrocksContainer()
      .withMainArtifacts([path.resolve(resourcesDir, "apipastries-openapi.yaml")])
      .withSecondaryArtifacts([path.resolve(resourcesDir, "apipastries-postman-collection.json")])
      .start();
    
    // Get base Url for API Pastries / 0.0.1
    var pastriesUrl = container.getRestMockEndpoint("API Pastries", "0.0.1");

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

    // Now stop the container.
    await container.stop();
  });
  // }


  // start and contract test {
  it("should start, load artifacts and contract test mock", async () => {
    const network = await new Network().start();

    // Start mcirocks container and other containers.
    const container = await new MicrocksContainer().withNetwork(network).start();
    const badImpl = await new GenericContainer("quay.io/microcks/contract-testing-demo:01")
        .withNetwork(network)
        .withNetworkAliases("bad-impl")
        .withWaitStrategy(Wait.forLogMessage("Example app listening on port 3001", 1))
        .start();
    const goodImpl = await new GenericContainer("quay.io/microcks/contract-testing-demo:02")
        .withNetwork(network)
        .withNetworkAliases("good-impl")
        .withWaitStrategy(Wait.forLogMessage("Example app listening on port 3002", 1))
        .start();

    await container.importAsMainArtifact(path.resolve(resourcesDir, "apipastries-openapi.yaml"));
    
    var testRequest: TestRequest = {
      serviceId: "API Pastries:0.0.1",
      runnerType: TestRunnerType.OPEN_API_SCHEMA,
      testEndpoint: "http://bad-impl:3001",
      timeout: 2000
    }
    var testResult = await container.testEndpoint(testRequest);

    expect(testResult.success).toBe(false);
    expect(testResult.testedEndpoint).toBe("http://bad-impl:3001");
    expect(testResult.testCaseResults.length).toBe(3);
    expect(testResult.testCaseResults[0].testStepResults[0].message).toContain("object has missing required properties");

    testRequest = {
      serviceId: "API Pastries:0.0.1",
      runnerType: TestRunnerType.OPEN_API_SCHEMA,
      testEndpoint: "http://good-impl:3002",
      timeout: 3000
    }
    testResult = await container.testEndpoint(testRequest);

    expect(testResult.success).toBe(true);
    expect(testResult.testedEndpoint).toBe("http://good-impl:3002");
    expect(testResult.testCaseResults.length).toBe(3);
    expect(testResult.testCaseResults[0].testStepResults[0].message).toBe("");

    // Now stop the containers and the network.
    await container.stop();
    await badImpl.stop();
    await goodImpl.stop();
    await network.stop();
  });
  // }
});  