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
import { GenericContainer, StartedNetwork, StartedTestContainer, StopOptions, Wait } from "testcontainers";
import { MicrocksContainer, Secret, StartedMicrocksContainer, RemoteArtifact } from "./microcks-container.js";
import { 
  AmazonServiceConnection, GenericConnection, GooglePubSubConnection, KafkaConnection, 
  MicrocksAsyncMinionContainer, StartedMicrocksAsyncMinionContainer 
} from "./microcks-async-minion-container.js";

export class MicrocksContainersEnsemble {
  static readonly MICROCKS_CONTAINER_ALIAS = "microcks";
  static readonly POSTMAN_CONTAINER_ALIAS = "postman";
  static readonly MICROCKS_ASYNC_MINION_CONTAINER_ALIAS = "microcks-async-minion";

  private network: StartedNetwork;
  private microcksContainer: MicrocksContainer;
  private postmanContainer?: GenericContainer;
  private asyncMinionContainer?: MicrocksAsyncMinionContainer;

  private asyncMinionEnvironment: Record<string, string> = {};

  constructor(network: StartedNetwork, image = "quay.io/microcks/microcks-uber:1.13.2") {
    this.network = network;

    this.microcksContainer = new MicrocksContainer(image)
      .withNetwork(this.network)
      .withNetworkAliases(MicrocksContainersEnsemble.MICROCKS_CONTAINER_ALIAS)
      .withEnvironment({
        POSTMAN_RUNNER_URL: "http://" + MicrocksContainersEnsemble.POSTMAN_CONTAINER_ALIAS + ":3000",
        TEST_CALLBACK_URL: "http://" + MicrocksContainersEnsemble.MICROCKS_CONTAINER_ALIAS 
            + ":" + MicrocksContainer.MICROCKS_HTTP_PORT,
        ASYNC_MINION_URL: "http://" + MicrocksContainersEnsemble.MICROCKS_ASYNC_MINION_CONTAINER_ALIAS 
            + ":" + MicrocksAsyncMinionContainer.MICROCKS_ASYNC_MINION_HTTP_PORT,
      });
  }

  /**
   * Enable debug log level on MicrocksContainersEnsemble containers.
   * @returns this
   */
  public withDebugLogLevel(): this {
    this.microcksContainer.withDebugLogLevel();
    this.asyncMinionEnvironment = { 
      'QUARKUS_LOG_CONSOLE_LEVEL': 'DEBUG',  
      'QUARKUS_LOG_CATEGORY__IO_GITHUB_MICROCKS__LEVEL': 'DEBUG'
    };
    return this;
  }

  /**
   * Enable the Postman runtime container with provided container image.
   * @param {String} image The name (with tag/version) of Microcks Postman runtime to use.
   * @returns this
   */
  public withPostman(image = "quay.io/microcks/microcks-postman-runtime:latest"): this {
    this.postmanContainer = new GenericContainer(image)
      .withNetwork(this.network)
      .withNetworkAliases(MicrocksContainersEnsemble.POSTMAN_CONTAINER_ALIAS)
      .withWaitStrategy(Wait.forLogMessage(/.*postman-runtime wrapper listening on port.*/, 1));
    return this;
  }

  /**
   * Enable the Async Feature container with provided container image.
   * @param {String} image The name (with tag/version) of Microcks Async Minion Uber distribution to use.
   * @returns this
   */
  public withAsyncFeature(image?: string): this {
    let asyncMinionImage = (image ? image : this.microcksContainer.getImageName().replace("microcks-uber", "microcks-uber-async-minion"));
    if (asyncMinionImage.endsWith("-native")) {
      asyncMinionImage = asyncMinionImage.substring(0, asyncMinionImage.length - "-native".length);
    }
    this.asyncMinionContainer = new MicrocksAsyncMinionContainer(this.network, asyncMinionImage);
    return this;
  }

  /**
   * Once the Async Feature is enabled, connects to a Kafka broker.
   * @param {KafkaConnection} connection Connection details to a Kafka broker.
   * @returns this
   */
  public withKafkaConnection(connection: KafkaConnection): this {
    if (this.asyncMinionContainer == undefined) {
      throw new Error('Async feature must have been enabled first');
    }
    this.asyncMinionContainer?.withKafkaConnection(connection);
    return this;
  }

  /**
   * Once the Async Feature is enabled, connects to a MQTT broker.
   * @param {GenericConnection} connection Connection details to a MQTT broker.
   * @returns this
   */
  public withMQTTConnection(connection: GenericConnection): this {
    if (this.asyncMinionContainer == undefined) {
      throw new Error('Async feature must have been enabled first');
    }
    this.asyncMinionContainer?.withMQTTConnection(connection);
    return this;
  }

  /**
   * Once the Async Feature is enabled, connects to a AMQP broker.
   * @param {GenericConnection} connection Connection details to a MQTT broker.
   * @returns this
   */
  public withAMQPConnection(connection: GenericConnection): this {
    if (this.asyncMinionContainer == undefined) {
      throw new Error('Async feature must have been enabled first');
    }
    this.asyncMinionContainer?.withAMQPConnection(connection);
    return this;
  }

  /**
   * Once the Async Feature is enabled, connects to an Amazon SQS service.
   * @param {AmazonServiceConnection} connection Connection details to an Amazon SQS service.
   * @returns this
   */
  public withAmazonSQSConnection(connection: AmazonServiceConnection): this {
    if (this.asyncMinionContainer == undefined) {
      throw new Error('Async feature must have been enabled first');
    }
    this.asyncMinionContainer?.withAmazonSQSConnection(connection);
    return this;
  }

  /**
   * Once the Async Feature is enabled, connects to an Amazon SNS service.
   * @param {AmazonServiceConnection} connection Connection details to an Amazon SQS service.
   * @returns this
   */
  public withAmazonSNSConnection(connection: AmazonServiceConnection): this {
    if (this.asyncMinionContainer == undefined) {
      throw new Error('Async feature must have been enabled first');
    }
    this.asyncMinionContainer?.withAmazonSNSConnection(connection);
    return this;
  }

  /**
   * Once the Async Feature is enabled, connects to a Google Pub/Sub service.
   * @param {GooglePubSubConnection} connection Connection details to a Google Pub/Sub service.
   * @returns this
   */
  public withGooglePubSubConnection(connection: GooglePubSubConnection): this {
    if (this.asyncMinionContainer == undefined) {
      throw new Error('Async feature must have been enabled first');
    }
    this.asyncMinionContainer?.withGooglePubSubConnection(connection);
    return this;
  }

  /**
   * Provide paths to artifacts that will be imported as primary or main ones within the Microcks container
   * once it will be started and healthy.
   * @param {[String]} artifacts The file paths to artifacts (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns this
   */
  public withMainArtifacts(artifacts: string[]): this {
    this.microcksContainer.withMainArtifacts(artifacts);
    return this;
  }

  /**
   * Provide paths to artifacts that will be imported as secondary ones within the Microcks container
   * once it will be started and healthy.
   * @param {[String]} artifacts The file paths to artifacts (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns this
   */
  public withSecondaryArtifacts(artifacts: string[]): this {
    this.microcksContainer.withSecondaryArtifacts(artifacts);
    return this;
  }

  /**
   * Provide urls of remote artifacts that will be imported as primary or main ones within the Microcks container
   * once it will be started and healthy.
   * @param {[RemoteArtifact]} remoteArtifactUrls The urls or remote artifacts (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns this
   */
  public withMainRemoteArtifacts(remoteArtifactUrls: RemoteArtifact[]): this {
    this.microcksContainer.withMainRemoteArtifacts(remoteArtifactUrls);
    return this;
  }

  /**
   * Provide urls of remote artifacts that will be imported as secondary ones within the Microcks container
   * once it will be started and healthy.
   * @param {[RemoteArtifact]} remoteArtifactUrls The furls or remote (OpenAPI, Postman collection, Protobuf, GraphQL schema, ...)
   * @returns this
   */
  public withSecondaryRemoteArtifacts(remoteArtifactUrls: RemoteArtifact[]): this {
    this.microcksContainer.withSecondaryRemoteArtifacts(remoteArtifactUrls);
    return this;
  }

  /**
   * Provide Secret that should be imported in Microcks after startup.
   * @param {[Secret]} secret The description of a secret to access remote Git repository, test endpoint or broker.
   * @returns this
   */
  public withSecret(secret: Secret): this {
    this.microcksContainer.withSecret(secret);
    return this;
  }

  public async start(): Promise<StartedMicrocksContainersEnsemble> {
    if (this.asyncMinionContainer) {
      this.asyncMinionContainer.withEnvironment(this.asyncMinionEnvironment);
    }
    return new StartedMicrocksContainersEnsemble(
      await this.microcksContainer.start(),
      await this.postmanContainer?.start(), 
      await this.asyncMinionContainer?.start()
    );
  }
}

export class StartedMicrocksContainersEnsemble {
  private readonly startedMicrocksContainer: StartedMicrocksContainer;
  private readonly startedPostmanContainer?: StartedTestContainer;
  private readonly startedAsyncMinionContainer?: StartedMicrocksAsyncMinionContainer;

  constructor(
    startedMicrocksContainer: StartedMicrocksContainer,
    startedPostmanContainer: StartedTestContainer | undefined,
    startedAsyncMinionContainer: StartedMicrocksAsyncMinionContainer | undefined
  ) {
    this.startedMicrocksContainer = startedMicrocksContainer;
    this.startedPostmanContainer = startedPostmanContainer;
    this.startedAsyncMinionContainer = startedAsyncMinionContainer;
  }

  public getMicrocksContainer(): StartedMicrocksContainer {
    return this.startedMicrocksContainer;
  }

  public getPostmanContainer(): StartedTestContainer | undefined {
    return this.startedPostmanContainer;
  }

  public getAsyncMinionContainer(): StartedMicrocksAsyncMinionContainer | undefined {
    return this.startedAsyncMinionContainer;
  }

  public async stop(options?: Partial<StopOptions>): Promise<StoppedMicrocksContainersEnsemble> {
    await this.startedMicrocksContainer.stop(options);
    if (this.startedPostmanContainer) {
      await this.startedPostmanContainer.stop(options);
    }
    if (this.startedAsyncMinionContainer) {
      await this.startedAsyncMinionContainer.stop(options);
    }
    return new StoppedMicrocksContainersEnsemble();
  }
}

export class StoppedMicrocksContainersEnsemble {

  constructor() {

  }
}