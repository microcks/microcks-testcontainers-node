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
import { readFile, stat } from "fs/promises";
import { AbstractStartedContainer, GenericContainer, StartedTestContainer, Wait } from "testcontainers";

const HTTP_PORT = 8080;
const GRPC_PORT = 9090;

export class MicrocksContainer extends GenericContainer {
  private mainArtifacts: string[] = [];
  private secondaryArtifacts: string[] = [];

  constructor(image = "quay.io/microcks/microcks-uber:1.8.0") {
    super(image);
  }

  public withMainArtifacts(artifacts: string[]): this {
    this.mainArtifacts = this.mainArtifacts.concat(artifacts);
    return this;
  }

  public withSecondaryArtifacts(artifacts: string[]): this {
    this.secondaryArtifacts = this.secondaryArtifacts.concat(artifacts);
    return this;
  }

  public override async start(): Promise<StartedMicrocksContainer> {
    this.withExposedPorts(...(this.hasExposedPorts ? this.exposedPorts : [HTTP_PORT, GRPC_PORT]))
        .withWaitStrategy(Wait.forLogMessage(/.*Started MicrocksApplication.*/, 1));

    let startedContainer = new StartedMicrocksContainer(await super.start());
    // Import artifacts declared in configuration. 
    for (let i=0; i<this.mainArtifacts.length; i++) {
      await startedContainer.importAsMainArtifact(this.mainArtifacts[i]);
    }
    for (let i=0; i<this.secondaryArtifacts.length; i++) {
      await startedContainer.importAsSecondaryArtifact(this.secondaryArtifacts[i]);
    }

    return startedContainer;
  }
}

export interface TestRequest {
  serviceId: string;
  testEndpoint: string;
  runnerType: string;
  timeout: number;
  secretName?: string;
  filteredOperations?: string[];
  operationsHeaders?: any;
}

export interface SecretRef {
  secretId: string;
  name: string;
}

export interface TestResult {
  id: string;
  version: number;
  testNumber: number;
  testDate: number;
  testedEndpoint: string;
  serviceId: string;
  timeout: number;
  elapsedTime: number;
  success: boolean;
  inProgress: boolean;
  runnerType: TestRunnerType;
  operationHeaders: any;
  testCaseResults: TestCaseResult[];
  secretRef: SecretRef;
}

export interface TestCaseResult {
  success: boolean;
  elapsedTime: number;
  operationName: string;
  testStepResults: TestStepResult[];
}

export interface TestStepResult {
  success: boolean;
  elapsedTime: number;
  requestName: string;
  eventMessageName: string;
  message: string;
}

export enum TestRunnerType {
  HTTP = "HTTP",
  SOAP_HTTP = "SOAP_HTTP",
  SOAP_UI = "SOAP_UI",
  POSTMAN = "POSTMAN",
  OPEN_API_SCHEMA = "OPEN_API_SCHEMA",
  ASYNC_API_SCHEMA = "ASYNC_API_SCHEMA",
  GRPC_PROTOBUF = "GRPC_PROTOBUF",
  GRAPHQL_SCHEMA = "GRAPHQL_SCHEMA"
}

export class StartedMicrocksContainer extends AbstractStartedContainer {
  private readonly httpPort: number;
  private readonly grpcPort: number;

  constructor(
    startedTestContainer: StartedTestContainer
  ) {
    super(startedTestContainer);
    this.httpPort = startedTestContainer.getMappedPort(HTTP_PORT);
    this.grpcPort = startedTestContainer.getMappedPort(GRPC_PORT);
  }

  /**
   * @returns The HttpEndpoint for connection to Microcks container api
   */
  public getHttpEndpoint(): string {
    return `http://${this.getHost()}:${this.httpPort}`;
  }

  /**
   * Get the exposed mock endpoint for a SOAP service.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @returns A usable endpoint to interact with Microcks mocks
   */
  public getSoapMockEndpoint(service: string, version: string): string {
    return `http://${this.getHost()}:${this.httpPort}/soap/${service}/${version}`;
  }

  /**
   * Get the exposed mock endpoint for a REST API.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @returns A usable endpoint to interact with Microcks mocks
   */
  public getRestMockEndpoint(service: string, version: string): string {
    return `http://${this.getHost()}:${this.httpPort}/rest/${service}/${version}`;
  }

  /**
   * Get the exposed mock endpoint for a GraphQL API.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @returns A usable endpoint to interact with Microcks mocks
   */
  public getGraphQLMockEndpoint(service: string, version: string): string {
    return `http://${this.getHost()}:${this.httpPort}/graphql/${service}/${version}`;
  }

  /**
   * Get the exposed mock endpoint for a gRPC API.
   * @returns A usable endpoint to interact with Microcks mocks
   */
  public getGrpcMockEndpoint(): string {
    return `grpc://${this.getHost()}:${this.grpcPort}`;
  }


  /**
   * Import an artifact as a primary or main one within the Microcks container.
   * @param {String} artifactPath The file path to artifact (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns Success or error via Promise
   */
  public async importAsMainArtifact(artifactPath: string): Promise<void> {
    return this.importArtifact(artifactPath, true);
  }

  /**
   * Import an artifact as a secondary one within the Microcks container. 
   * @param {String} artifactPath The file path to artifact (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns Success or error via Promise
   */
  public async importAsSecondaryArtifact(artifactPath: string): Promise<void> {
    return this.importArtifact(artifactPath, false);
  }

  /**
   * Launch a conformance test on an endpoint.
   * @param {TestRequest} testRequest The test specifications (API under test, endpoint, runner, ...)
   * @returns The final TestResult containing information on success/failure as well as details on test cases.
   */
  public async testEndpoint(testRequest: TestRequest): Promise<TestResult> {
    // Launch a test with request elements.
    const response = await fetch(this.getHttpEndpoint() + "/api/tests", {
      method: 'POST',
      body: JSON.stringify(testRequest),
      headers: {
        'Content-Type': 'application/json'
      },
    });

    if (response.status == 201) {
      const responseJson = await response.json()
      const testResultId: string = responseJson.id;

      const endDate: number = Date.now() + testRequest.timeout;
      var testResult: TestResult = await this.refreshTestResult(testResultId);
      while (testResult.inProgress && Date.now() < endDate) {
        await this.wait(250);
        testResult = await this.refreshTestResult(testResultId);
      }
      return testResult;
    }
    throw new Error("Couldn't launch on new test on Microcks. Please check Microcks container logs.");
  }

  
  private async importArtifact(artifactPath: string, mainArtifact: boolean): Promise<void> {
    const isFile = await this.isFile(artifactPath);
    if (!isFile) {
      throw new Error(`Artifact ${artifactPath}  does not exist or can't be read`);
    }

    // Initialize delimiters items and multiparBody.
    var crlf = "\r\n",
        boundaryKey = Math.random().toString(16),
        boundary = `--${boundaryKey}`,
        delimeter = `${crlf}--${boundary}`,
        closeDelimeter = `${delimeter}--`,
        multipartBody;

    const filename = path.basename(artifactPath);
    const disposition = `Content-Disposition: form-data; name="file"; filename="${filename}"` + crlf;

    const artifactContent = await readFile(artifactPath);
    multipartBody = Buffer.concat([
        Buffer.from(delimeter + crlf + disposition + crlf),
        artifactContent,
        Buffer.from(closeDelimeter)]
    );
  
    // Prepare headers with content type and length.
    const headers: Record<string, string> = {
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Content-Length': multipartBody.length.toString(),
    }
    const uploadURI = this.getHttpEndpoint() + "/api/artifact/upload" + (mainArtifact ? "" : "?mainArtifact=false");

    // Actually upload the file to upload endpoint.
    const response = await fetch(uploadURI, {
      method: 'POST',
      body: multipartBody,
      headers: headers,
    });

    if (response.status != 201) {
      throw new Error("Artifact has not been correctly been imported: " + await response.json());
   }
  }

  private refreshTestResult(testResultId: string): Promise<TestResult> {
    return fetch(this.getHttpEndpoint() + "/api/tests/" + testResultId)
      .then(response => {
        if (!response.ok) {
          throw new Error('Error while fetching TestResult on Microcks, code: ' + response.status);
        }
        return response.json() as Promise<TestResult>;
      })
  }

  private async isFile(path: string): Promise<boolean> {  
    const stats = await stat(path);
    return stats.isFile()
  }

  private wait(ms: number): Promise<any> {
    return new Promise(resolve => {
      //console.log(`Waiting for ${ms} ms`);
      setTimeout(resolve, ms);
    });
  }
}