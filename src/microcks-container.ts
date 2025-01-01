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

export class MicrocksContainer extends GenericContainer {
  static readonly MICROCKS_HTTP_PORT = 8080;
  static readonly MICROCKS_GRPC_PORT = 9090;
  
  private snapshots: string[] = [];
  private mainArtifacts: string[] = [];
  private secondaryArtifacts: string[] = [];
  private mainRemoteArtifacts: string[] = [];
  private secondaryRemoteArtifacts: string[] = [];
  private secrets: Secret[] = [];

  constructor(image = "quay.io/microcks/microcks-uber:1.10.0") {
    super(image);
    this.withExposedPorts(MicrocksContainer.MICROCKS_HTTP_PORT, MicrocksContainer.MICROCKS_GRPC_PORT)
        .withWaitStrategy(Wait.forLogMessage(/.*Started MicrocksApplication.*/, 1));
  }

  /**
   * Provide paths to artifacts that will be imported as primary or main ones within the Microcks container
   * once it will be started and healthy.
   * @param {[String]} artifacts The file paths to artifacts (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns this
   */
  public withMainArtifacts(artifacts: string[]): this {
    this.mainArtifacts = this.mainArtifacts.concat(artifacts);
    return this;
  }

  /**
   * Provide paths to artifacts that will be imported as secondary ones within the Microcks container
   * once it will be started and healthy.
   * @param {[String]} artifacts The file paths to artifacts (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns this
   */
  public withSecondaryArtifacts(artifacts: string[]): this {
    this.secondaryArtifacts = this.secondaryArtifacts.concat(artifacts);
    return this;
  }

  /**
   * Provide urls of remote artifacts that will be imported as primary or main ones within the Microcks container
   * once it will be started and healthy.
   * @param {[String]} remoteArtifactUrls The urls or remote artifacts (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns this
   */
  public withMainRemoteArtifacts(remoteArtifactUrls: string[]): this {
    this.mainRemoteArtifacts = this.mainRemoteArtifacts.concat(remoteArtifactUrls);
    return this;
  }

  /**
   * Provide urls of remote artifacts that will be imported as secondary ones within the Microcks container
   * once it will be started and healthy.
   * @param {[String]} remoteArtifactUrls The furls or remote (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns this
   */
  public withSecondaryRemoteArtifacts(remoteArtifactUrls: string[]): this {
    this.secondaryRemoteArtifacts = this.secondaryRemoteArtifacts.concat(remoteArtifactUrls);
    return this;
  }

  /**
   * Provide paths to local repository snapshots that will be imported within the Microcks container
   * once it will be started and healthy.
   * @param {[String]} snapshots A set of repository snapshots that will be loaded as classpath resources
   * @return this
   */
  public withSnapshots(snapshots: string[]): this {
    this.snapshots = this.snapshots.concat(snapshots);
    return this;
  }

  /**
   * Provide Secret that should be imported in Microcks after startup.
   * @param {[Secret]} secret The description of a secret to access remote Git repository, test endpoint or broker.
   * @returns this
   */
  public withSecret(secret: Secret): this {
    this.secrets.push(secret);
    return this;
  }

  /**
   * Get the image name used for instantiating this container.
   * @returns The Docker image name
   */
  public getImageName(): string {
    return this.imageName.string;
  }

  public override async start(): Promise<StartedMicrocksContainer> {
    let startedContainer = new StartedMicrocksContainer(await super.start());
    // Load snapshots before anything else.
    for (let i=0; i<this.snapshots.length; i++) {
      await startedContainer.importSnapshot(this.snapshots[i]);
    }
    // Load remote artifacts before local ones.
    for (let i=0; i<this.mainRemoteArtifacts.length; i++) {
      await startedContainer.downloadAsMainArtifact(this.mainRemoteArtifacts[i]);
    }
    for (let i=0; i<this.secondaryRemoteArtifacts.length; i++) {
      await startedContainer.downloadAsSecondaryArtifact(this.secondaryRemoteArtifacts[i]);
    }
    // Import artifacts declared in configuration. 
    for (let i=0; i<this.mainArtifacts.length; i++) {
      await startedContainer.importAsMainArtifact(this.mainArtifacts[i]);
    }
    for (let i=0; i<this.secondaryArtifacts.length; i++) {
      await startedContainer.importAsSecondaryArtifact(this.secondaryArtifacts[i]);
    }
    for (let i=0; i<this.secrets.length; i++) {
      await startedContainer.createSecret(this.secrets[i]);
    }

    return startedContainer;
  }
}

export enum OAuth2GrantType {
  PASSWORD = "PASSWORD",
  CLIENT_CREDENTIALS = "CLIENT_CREDENTIALS",
  REFRESH_TOKEN = "REFRESH_TOKEN"
}

export interface OAuth2ClientContext {
  clientId: string;
  clientSecret?: string;
  tokenUri: string;
  scopes?: string;
  username?: string;
  password?: string;
  refreshToken?: string;
  grantType: OAuth2GrantType;
}

export interface OAuth2AuthorizedClient {
  grantType: OAuth2GrantType;
  principalName: string;
  tokenUri: string;
  scopes?: string;
}

export interface TestRequest {
  serviceId: string;
  testEndpoint: string;
  runnerType: string;
  timeout: number;
  secretName?: string;
  filteredOperations?: string[];
  operationsHeaders?: any;
  oAuth2Context?: OAuth2ClientContext;
}

export interface Secret {
  name: string;
  description?: string;
  username?: string;
  password?: string;
  token?: string;
  tokenHeader?: string;
  caCertPem?: string;
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
  authorizedClient?: OAuth2AuthorizedClient;
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

export interface MicrocksHeader {
  name: string;
  values: string[];
}
export interface MicrocksParameter {
  name: string;
  value: string;
}

export interface Message {
  name: string;
  content: string;
  operationId: string;
  testCaseId: string;
  sourceArtifact: string;
  headers: MicrocksHeader[];
}

export interface MicrocksRequest extends Message {
  id: string;
  responseId: string;
  queryParameters: MicrocksParameter[];
}

export interface MicrocksResponse extends Message {
  id: string;
  status: string;
  mediaType: string;
  dispatchCriteria: string;
  isFault: boolean;
}

export interface EventMessage extends Message {
  id: string;
  mediaType: string;
  dispatchCriteria: string;
}

export interface RequestResponsePair {
  request: MicrocksRequest;
  response: MicrocksResponse;
}

export interface UnidirectionalEvent {
  eventMessage: EventMessage;
}


export class StartedMicrocksContainer extends AbstractStartedContainer {
  private readonly httpPort: number;
  private readonly grpcPort: number;

  constructor(
    startedTestContainer: StartedTestContainer
  ) {
    super(startedTestContainer);
    this.httpPort = startedTestContainer.getMappedPort(MicrocksContainer.MICROCKS_HTTP_PORT);
    this.grpcPort = startedTestContainer.getMappedPort(MicrocksContainer.MICROCKS_GRPC_PORT);
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
   * Download a remote artifact as a primary or main one within the Microcks container.
   * @param {String} remoteArtifactUrl The URL to remote artifact (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns Success or error via Promise
   */
  public async downloadAsMainArtifact(remoteArtifactUrl: string): Promise<void> {
    return this.downloadArtifact(remoteArtifactUrl, true);
  }

  /**
   * Download a remote artifact as a secondary one within the Microcks container.
   * @param {String} remoteArtifactUrl The URL to remote artifact (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns Success or error via Promise
   */
  public async downloadAsSecondaryArtifact(remoteArtifactUrl: string): Promise<void> {
    return this.downloadArtifact(remoteArtifactUrl, false);
  }

  /**
   * Import a repository snapshot within the Microcks container.
   * @param {String} snapshotPath The file path to a snapshot
   * @returns Success or error via Promise
   */
  public async importSnapshot(snapshotPath: string): Promise<void> {
    return this.importSnapshotInternal(snapshotPath);
  }

  /**
   * Create a secret to access remote Git repository, test endpoint or broker.
   * @param {Secret} secret The description of a secret to access remote Git repository, test endpoint or broker.
   * @returns Success or error via Promise
   */
  public async createSecret(secret: Secret): Promise<void> {
    const createURI = this.getHttpEndpoint() + "/api/secrets";

    // Prepare headers with content type and length.
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }

    const response = await fetch(createURI, {
      method: 'POST',
      body: JSON.stringify(secret),
      headers: headers
    });

    if (response.status != 201) {
      throw new Error("Secret has not been correctly created: " + await response.json());
    }
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

      const endDate: number = Date.now() + testRequest.timeout + 1000;
      var testResult: TestResult = await this.refreshTestResult(testResultId);
      while (testResult.inProgress && Date.now() < endDate) {
        await this.wait(250);
        testResult = await this.refreshTestResult(testResultId);
      }
      return testResult;
    }
    throw new Error("Couldn't launch on new test on Microcks. Please check Microcks container logs.");
  }

  /**
   * Retrieve messages exchanged during a test on an endpoint.
   * @param {TestResult} testResult The TestResult containing information on success/failure as well as details on test cases.
   * @param {string} operationName The name of the operation to get messages corresponding to test case
   * @returns A list of RequestResponsePairs containing the request/response of test
   */
  public async getMessagesForTestCase(testResult: TestResult, operationName: string): Promise<RequestResponsePair[]> {
    // Build the test case identfier.
    const operation = this.encode(operationName)
    const testCaseId = `${testResult.id}-${testResult.testNumber}-${operation}`;
    // Request the test case messages.
    const response = await fetch(this.getHttpEndpoint() + "/api/tests/" + testResult.id + "/messages/" + testCaseId, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
    });

    if (response.status == 200) {
      const responseJson = await response.json();
      return responseJson as RequestResponsePair[];
    }
    throw new Error("Couldn't retrieve messages on test on Microcks. Please check Microcks container logs");
  }

  /**
   * Retrieve event messages received during a test on an endpoint.
   * @param {TestResult} testResult The TestResult containing information on success/failure as well as details on test cases.
   * @param {string} operationName The name of the operation to get messages corresponding to test case
   * @returns A list of RequestResponsePairs containing the request/response of test
   */
  public async getEventMessagesForTestCase(testResult: TestResult, operationName: string): Promise<UnidirectionalEvent[]> {
    // Build the test case identfier.
    const operation = this.encode(operationName)
    const testCaseId = `${testResult.id}-${testResult.testNumber}-${operation}`;
    // Request the test case event messages.
    const response = await fetch(this.getHttpEndpoint() + "/api/tests/" + testResult.id + "/events/" + testCaseId, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
    });

    if (response.status == 200) {
      const responseJson = await response.json();
      return responseJson as UnidirectionalEvent[];
    }
    throw new Error("Couldn't retrieve event messages on test on Microcks. Please check Microcks container logs");
  }

  
  private async importArtifact(artifactPath: string, mainArtifact: boolean): Promise<void> {
    const isFile = await this.isFile(artifactPath);
    if (!isFile) {
      throw new Error(`Artifact ${artifactPath}  does not exist or can't be read`);
    }

    // Actually upload the file to upload endpoint.
    const uploadURI = this.getHttpEndpoint() + "/api/artifact/upload" + (mainArtifact ? "" : "?mainArtifact=false");
    const response = await this.uploadFileToMicrocks(uploadURI, artifactPath, "application/octet-stream");

    if (response.status != 201) {
      throw new Error("Artifact has not been correctly been imported: " + await response.json());
    }
  }

  private async downloadArtifact(remoteArtifactUrl: string, mainArtifact: boolean): Promise<void> {
    let formBody = new URLSearchParams({
      "mainArtifact": String(mainArtifact),
      "url": remoteArtifactUrl
    });

    // Prepare headers with content type and length.
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
    const downloadURI = this.getHttpEndpoint() + "/api/artifact/download";

    const response = await fetch(downloadURI, {
      method: 'POST',
      body: formBody,
      headers: headers,
    })

    if (response.status != 201) {
      throw new Error("Artifact has not been correctly downloaded: " + await response.json());
    }
  }

  private async importSnapshotInternal(snapshotPath: string): Promise<void> {
    const isFile = await this.isFile(snapshotPath);
    if (!isFile) {
      throw new Error(`Snapshot ${snapshotPath}  does not exist or can't be read`);
    }

    // Actually upload the file to upload endpoint.
    const response = await this.uploadFileToMicrocks(this.getHttpEndpoint() + "/api/import", snapshotPath, "application/json");

    if (response.status != 201) {
      throw new Error("Snapshot has not been correctly been imported: " + await response.json());
    }
  }

  private async uploadFileToMicrocks(microcksApiURL: string, filePath: string, contentType: string): Promise<Response> {
    // Initialize delimiters items and multiparBody.
    var crlf = "\r\n",
        boundaryKey = Math.random().toString(16),
        boundary = `--${boundaryKey}`,
        delimeter = `${crlf}--${boundary}`,
        closeDelimeter = `${delimeter}--`,
        multipartBody;

    const filename = path.basename(filePath);
    const disposition = `Content-Disposition: form-data; name="file"; filename="${filename}"` + crlf;

    const content = await readFile(filePath);
    multipartBody = Buffer.concat([
        Buffer.from(delimeter + crlf + disposition),
        Buffer.from(`Content-Type: ${contentType}` + crlf),
        Buffer.from("Content-Transfer-Encoding: binary" + crlf + crlf),
        content,
        Buffer.from(closeDelimeter)]
    );

    // Prepare headers with content type and length.
    const headers: Record<string, string> = {
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Content-Length': multipartBody.length.toString(),
    }

    // Actually upload the file to upload endpoint.
    return fetch(microcksApiURL, {
      method: 'POST',
      body: multipartBody,
      headers: headers,
    });
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

  private encode(operation: string): string {
    operation = operation.replace(/\//g, '!');
    return encodeURIComponent(operation);
  }
}