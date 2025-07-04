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

import { AbstractStartedContainer, GenericContainer, StartedNetwork, StartedTestContainer, Wait } from "testcontainers";
import { MicrocksContainer } from "./microcks-container";

export class MicrocksAsyncMinionContainer extends GenericContainer {
  static readonly MICROCKS_ASYNC_MINION_HTTP_PORT = 8081;
  
  private network: StartedNetwork;
  private extraProtocols: string = "";
  
  constructor(network: StartedNetwork, image = "quay.io/microcks/microcks-uber-async-minion:1.12.0") {
    super(image);
    this.network = network;
    this.withNetwork(this.network)
        .withNetworkAliases("microcks-async-minion")
        .withEnvironment({
          MICROCKS_HOST_PORT: "microcks:" + MicrocksContainer.MICROCKS_HTTP_PORT
        })
        .withExposedPorts(MicrocksAsyncMinionContainer.MICROCKS_ASYNC_MINION_HTTP_PORT)
        .withWaitStrategy(Wait.forLogMessage(/.*Profile prod activated\..*/, 1));
  }

  /**
   * Connect the MicrocksAsyncMinionContainer to a Kafka server to allow Kafka messages mocking.
   * @param {KafkaConnection} connection Connection details to a Kafka broker.
   * @returns this
   */
  public withKafkaConnection(connection: KafkaConnection): this {
    this.addProtocolIfNeeded('KAFKA');
    this.withEnvironment({
      ASYNC_PROTOCOLS: this.extraProtocols,
      KAFKA_BOOTSTRAP_SERVER: connection.bootstrapServers
    });
    return this;
  }

  /**
   * Connect the MicrocksAsyncMinionContainer to a MQTT server to allow MQTT messages mocking.
   * @param {GenericConnection} connection Connection details to a MQTT broker.
   * @returns  this
   */
  public withMQTTConnection(connection: GenericConnection): this {
    this.addProtocolIfNeeded('MQTT');
    this.withEnvironment({
      ASYNC_PROTOCOLS: this.extraProtocols,
      MQTT_SERVER: connection.server,
      MQTT_USERNAME: connection.username,
      MQTT_PASSWORD: connection.password
    });
    return this;
  }

  /**
   * Connect the MicrocksAsyncMinionContainer to a AMQP server to allow AMQP messages mocking.
   * @param {GenericConnection} connection Connection details to a AMQP broker.
   * @returns  this
   */
  public withAMQPConnection(connection: GenericConnection): this {
    this.addProtocolIfNeeded('AMQP');
    this.withEnvironment({
      ASYNC_PROTOCOLS: this.extraProtocols,
      AMQP_SERVER: connection.server,
      AMQP_USERNAME: connection.username,
      AMQP_PASSWORD: connection.password
    });
    return this;
  }

  /**
   * Connect the MicrocksAsyncMinionContainer to an Amazon SQS service to allow SQS messages mocking.
   * @param {AmazonServiceConnection} connection Connection details to an Amazon SQS service.
   * @returns this
   */
  public withAmazonSQSConnection(connection: AmazonServiceConnection): this {
    this.addProtocolIfNeeded('SQS');
    this.withEnvironment({
      ASYNC_PROTOCOLS: this.extraProtocols,
      AWS_SQS_REGION: connection.region,
      AWS_ACCESS_KEY_ID: connection.accessKey,
      AWS_SECRET_ACCESS_KEY: connection.secretKey
    });
    if (connection.endpointOverride != undefined) {
      this.withEnvironment({
        AWS_SQS_ENDPOINT: connection.endpointOverride
      });
    }
    return this;
  }

  /**
   * Connect the MicrocksAsyncMinionContainer to an Amazon SNS service to allow SQS messages mocking.
   * @param {AmazonServiceConnection} connection Connection details to an Amazon SQS service.
   * @returns this
   */
  public withAmazonSNSConnection(connection: AmazonServiceConnection): this {
    this.addProtocolIfNeeded('SNS');
    this.withEnvironment({
      ASYNC_PROTOCOLS: this.extraProtocols,
      AWS_SNS_REGION: connection.region,
      AWS_ACCESS_KEY_ID: connection.accessKey,
      AWS_SECRET_ACCESS_KEY: connection.secretKey
    });
    if (connection.endpointOverride != undefined) {
      this.withEnvironment({
        AWS_SNS_ENDPOINT: connection.endpointOverride
      });
    }
    return this;
  }

  public override async start(): Promise<StartedMicrocksAsyncMinionContainer> {
    return new StartedMicrocksAsyncMinionContainer(await super.start());
  }

  private addProtocolIfNeeded(protocol: string): void {
    if (this.extraProtocols.indexOf(',' + protocol) == -1) {
      this.extraProtocols += ',' + protocol;
    }
  }
}

export class StartedMicrocksAsyncMinionContainer extends AbstractStartedContainer {

  constructor(
    startedTestContainer: StartedTestContainer
  ) {
    super(startedTestContainer);
  }

  /**
   * Get the exposed mock endpoints for a WebSocket Service.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @param {String} operationName The name of operation to get the endpoint for
   * @returns  A usable endpoint to interact with Microcks mocks.
   */
  public getWSMockEndpoint(service: string, version: string, operationName: string): string {
    // operationName may start with SUBSCRIBE or PUBLISH.
    if (operationName.indexOf(' ') != -1) {
      operationName = operationName.split(' ')[1];
    }
    let endpoint = `ws://${this.getHost()}:${this.getMappedPort(MicrocksAsyncMinionContainer.MICROCKS_ASYNC_MINION_HTTP_PORT)}/api`;
    endpoint += `/ws/${service.replace(/\s/g, '+')}/${version.replace(/\s/g, '+')}/${operationName}`;
    return endpoint;
  }

  /**
   * Get the exposed mock endpoints for a Kafka Service.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @param {String} operationName The name of operation to get the endpoint for
   * @returns  A usable endpoint to interact with Microcks mocks.
   */
  public getKafkaMockTopic(service: string, version: string, operationName: string): string {
    // operationName may start with SUBSCRIBE or PUBLISH.
    if (operationName.indexOf(' ') != -1) {
      operationName = operationName.split(' ')[1];
    }
    return `${service.replace(/\s/g, '').replace(/-/g, '')}-${version}-${operationName.replace(/\//g, '-')}`;
  }

  /**
   * Get the exposed mock endpoints for a MQTT Service.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @param {String} operationName The name of operation to get the endpoint for
   * @returns  A usable endpoint to interact with Microcks mocks.
   */
  public getMQTTMockTopic(service: string, version: string, operationName: string): string {
    // operationName may start with SUBSCRIBE or PUBLISH.
    if (operationName.indexOf(' ') != -1) {
      operationName = operationName.split(' ')[1];
    }
    return `${service.replace(/\s/g, '').replace(/-/g, '')}-${version.replace(/\s/g, '')}-${operationName}`;
  }

  /**
   * Get the exposed mock endpoints for a AMQP Service.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @param {String} operationName The name of operation to get the endpoint for
   * @returns  A usable endpoint to interact with Microcks mocks.
   */
  public getAMQPMockDestination(service: string, version: string, operationName: string): string {
    // operationName may start with SUBSCRIBE or PUBLISH.
    if (operationName.indexOf(' ') != -1) {
      operationName = operationName.split(' ')[1];
    }
    return `${service.replace(/\s/g, '').replace(/-/g, '')}-${version.replace(/\s/g, '')}-${operationName}`;
  }

  /**
   * Get the exposed mock endpoints for an Amazon SQS Service.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @param {String} operationName The name of operation to get the endpoint for
   * @returns  A usable endpoint to interact with Microcks mocks.
   */
  public getAmazonSQSMockQueue(service: string, version: string, operationName: string): string {
    return this.getAmazonServiceMockDestination(service, version, operationName);
  }

  /**
   * Get the exposed mock endpoints for an Amazon SNS Service.
   * @param {String} service The name of Service/API
   * @param {String} version The version of Service/API
   * @param {String} operationName The name of operation to get the endpoint for
   * @returns  A usable endpoint to interact with Microcks mocks.
   */
  public getAmazonSNSMockTopic(service: string, version: string, operationName: string): string {
    return this.getAmazonServiceMockDestination(service, version, operationName);
  }

  private getAmazonServiceMockDestination(service: string, version: string, operationName: string): string {
    // operationName may start with SUBSCRIBE or PUBLISH.
    if (operationName.indexOf(' ') != -1) {
      operationName = operationName.split(' ')[1];
    }
    return `${service.replace(/\s/g, '').replace(/-/g, '')}-${version.replace(/\s/g, '').replace(/\./g, '')}-${operationName.replace(/\//g, '-')}`;
  }
}


export interface GenericConnection {
  server: string;
  username: string;
  password: string;
}

export interface KafkaConnection {
  bootstrapServers: string;
}

export interface AmazonServiceConnection {
  region: string;
  endpointOverride?: string;
  accessKey: string;
  secretKey: string;
}
