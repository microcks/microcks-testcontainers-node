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
import { GenericContainer, Network, Wait } from "testcontainers";
import { MicrocksContainer, TestRequest, TestRunnerType, OAuth2GrantType, StartedMicrocksContainer } from "./microcks-container";

import KeycloakContainer from 'keycloak-testcontainer';

describe("MicrocksContainer", () => {
  jest.setTimeout(180_000);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const resourcesDir = path.resolve(__dirname, "..", "test-resources");

  // start and mock {
  it("should start, load artifacts and expose mock", async () => {
    // Start container and load artifacts.
    const container = await new MicrocksContainer()
      .withSnapshots([path.resolve(resourcesDir, "microcks-repository.json")])
      .withMainArtifacts([path.resolve(resourcesDir, "apipastries-openapi.yaml")])
      .withMainRemoteArtifacts(["https://raw.githubusercontent.com/microcks/microcks/master/samples/APIPastry-openapi.yaml"])
      .withSecondaryArtifacts([path.resolve(resourcesDir, "apipastries-postman-collection.json")])
      .start();
    
    // Test mock endpoints relative methods.
    let baseWsUrl = container.getSoapMockEndpoint("Pastries Service", "1.0");
    expect(container.getHttpEndpoint() + "/soap/Pastries Service/1.0").toBe(baseWsUrl);

    let baseApiUrl = container.getRestMockEndpoint("API Pastries", "0.0.1");
    expect(container.getHttpEndpoint() + "/rest/API Pastries/0.0.1").toBe(baseApiUrl);

    let baseGraphUrl = container.getGraphQLMockEndpoint("Pastries Graph", "1");
    expect(container.getHttpEndpoint() + "/graphql/Pastries Graph/1").toBe(baseGraphUrl);

    let baseGrpcUrl = container.getGrpcMockEndpoint();
    expect("grpc://" + container.getHost() + ":" + container.getMappedPort(9090)).toBe(baseGrpcUrl);

    let baseWsPath = container.getSoapMockEndpointPath("Pastries Service", "1.0");
    expect("/soap/Pastries Service/1.0").toBe(baseWsPath);

    let baseApiPath = container.getRestMockEndpointPath("API Pastries", "0.0.1");
    expect("/rest/API Pastries/0.0.1").toBe(baseApiPath);

    let baseGraphPath = container.getGraphQLMockEndpointPath("Pastries Graph", "1");
    expect("/graphql/Pastries Graph/1").toBe(baseGraphPath);

    let validWsUrl = container.getValidatingSoapMockEndpoint("Pastries Service", "1.0");
    expect(container.getHttpEndpoint() + "/soap/Pastries Service/1.0?validate=true").toBe(validWsUrl);

    let validApiUrl = container.getValidatingRestMockEndpoint("API Pastries", "0.0.1");
    expect(container.getHttpEndpoint() + "/rest-valid/API Pastries/0.0.1").toBe(validApiUrl);

    let validWsPath = container.getValidatingSoapMockEndpointPath("Pastries Service", "1.0");
    expect("/soap/Pastries Service/1.0?validate=true").toBe(validWsPath);

    let validApiPath = container.getValidatingRestMockEndpointPath("API Pastries", "0.0.1");
    expect("/rest-valid/API Pastries/0.0.1").toBe(validApiPath);

    // Check available services loaded including snapshot.
    var services = await fetch(container.getHttpEndpoint() + "/api/services");
    expect(services.status).toBe(200);

    var servicesJson = await services.json();
    expect(servicesJson.length).toBe(6);
    var names = servicesJson.map((service: { name: any; }) => service.name);
    expect(names).toContain("API Pastries");
    expect(names).toContain("API Pastry - 2.0");
    expect(names).toContain("HelloService Mock");
    expect(names).toContain("Movie Graph API");
    expect(names).toContain("Petstore API");
    expect(names).toContain("io.github.microcks.grpc.hello.v1.HelloService");

    // Get base Url for API Pastries / 0.0.1
    var pastriesUrl = container.getRestMockEndpoint("API Pastries", "0.0.1");

    // Check that mock from main/primary artifact has been loaded.
    var response = await fetch(pastriesUrl + "/pastries/Millefeuille");
    var responseJson = await response.json();

    expect(response.status).toBe(200);
    expect(responseJson.name).toBe("Millefeuille");

    // Check it has been called once.
    await testInvocationsCheckingFunctionality(container, "API Pastries", "0.0.1", 1);

    // Check that mock from secondary artifact has been loaded too.
    response = await fetch(pastriesUrl + "/pastries/Eclair Chocolat");
    responseJson = await response.json();

    expect(response.status).toBe(200);
    expect(responseJson.name).toBe("Eclair Chocolat");

    // Check it has been called twice.
    await testInvocationsCheckingFunctionality(container, "API Pastries", "0.0.1", 2);

    // Check that mock from from main/primary remote artifact has been loaded.
    pastriesUrl = container.getRestMockEndpoint("API Pastry - 2.0", "2.0.0");

    response = await fetch(pastriesUrl + "/pastry/Millefeuille");
    responseJson = await response.json();

    expect(response.status).toBe(200);
    expect(responseJson.name).toBe("Millefeuille");

    // Check it has been called once.
    await testInvocationsCheckingFunctionality(container, "API Pastry - 2.0", "2.0.0", 1);

    // Now stop the container.
    await container.stop();
  });
  // }

  async function testInvocationsCheckingFunctionality(container: StartedMicrocksContainer, 
      serviceName: string, serviceVersion: string, expectedCount: number) {
    expect(await container.verify(serviceName, serviceVersion)).toBe(true);
    expect(await container.getServiceInvocationsCount(serviceName, serviceVersion)).toBe(expectedCount)
  }

  // start and contract test {
  it("should start, load artifacts and contract test mock", async () => {
    const network = await new Network().start();

    // Start microcks container and other containers.
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

    // Retrieve messages for the failing test case.
    const messages = await container.getMessagesForTestCase(testResult, "GET /pastries");
    expect(messages.length).toBe(3);
    messages.forEach(message => {
      expect(message.request).not.toBeNull();
      expect(message.response).not.toBeNull();
      expect(message.request.content).not.toBeNull();
      // Check these are the correct requests.
      expect(message.request.queryParameters).not.toBeNull();
      expect(message.request.queryParameters.length).toBe(1);
      expect(message.request.queryParameters[0].name).toBe('size');
    });

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

  // start and contract test with OAuth2 context{
  it("should start, load artifacts and contract test mock with OAuth2 context", async () => {
    const network = await new Network().start();

    // Start microcks container and other containers.
    const container = await new MicrocksContainer().withNetwork(network).start();
    const keycloak = await new KeycloakContainer({ tag: '26.0' })
        .withNetwork(network)
        .withNetworkAliases("keycloak")
        .withRealmImport(path.resolve(resourcesDir, "realm"))
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
      testEndpoint: "http://good-impl:3002",
      timeout: 3000,
      oAuth2Context: {
        clientId: "myrealm-serviceaccount",
        clientSecret: "ab54d329-e435-41ae-a900-ec6b3fe15c54",
        tokenUri: "http://keycloak:8080/realms/myrealm/protocol/openid-connect/token",
        grantType: OAuth2GrantType.CLIENT_CREDENTIALS
      }
    }
    var testResult = await container.testEndpoint(testRequest);

    expect(testResult.success).toBe(true);
    expect(testResult.testedEndpoint).toBe("http://good-impl:3002");
    expect(testResult.testCaseResults.length).toBe(3);
    expect(testResult.testCaseResults[0].testStepResults[0].message).toBe("");

    // Ensure test has used a valid OAuth2 client.
    expect(testResult.authorizedClient).toBeDefined();
    expect(testResult.authorizedClient?.principalName).toBe("myrealm-serviceaccount");
    expect(testResult.authorizedClient?.tokenUri).toBe("http://keycloak:8080/realms/myrealm/protocol/openid-connect/token");
    expect(testResult.authorizedClient?.scopes).toBe("openid profile email");

    // Now stop the containers and the network.
    await container.stop();
    await keycloak.stop();
    await goodImpl.stop();
    await network.stop();
  });
  // }
});  