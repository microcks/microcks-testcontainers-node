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
import { MicrocksContainer, Secret, StartedMicrocksContainer } from "./microcks-container";
import { AmazonServiceConnection, KafkaConnection, MicrocksAsyncMinionContainer, StartedMicrocksAsyncMinionContainer } from "./microcks-async-minion-container";

export class MicrocksContainersEnsemble {
  private network: StartedNetwork;
  private microcksContainer: MicrocksContainer;
  private postmanContainer?: GenericContainer;
  private asyncMinionContainer?: MicrocksAsyncMinionContainer;

  constructor(network: StartedNetwork, image = "quay.io/microcks/microcks-uber:1.8.1") {
    this.network = network;

    this.microcksContainer = new MicrocksContainer(image)
      .withNetwork(this.network)
      .withNetworkAliases("microcks")
      .withEnvironment({
        POSTMAN_RUNNER_URL: "http://postman:3000",
        TEST_CALLBACK_URL: "http://microcks:8080",
        ASYNC_MINION_URL: "http://microcks-async-minion:" + MicrocksAsyncMinionContainer.MICROCKS_ASYNC_MINION_HTTP_PORT,
      });
  }

  /**
   * Enable the Postman runtime container with provided container image.
   * @param {String} image The name (with tag/version) of Microcks Postman runtime to use.
   * @returns this
   */
  public withPostman(image = "quay.io/microcks/microcks-postman-runtime:latest"): this {
    this.postmanContainer = new GenericContainer(image)
      .withNetwork(this.network)
      .withNetworkAliases("postman")
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
   * @param connection Connection details to a Kafka broker.
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
   * Provide Secret that should be imported in Microcks after startup.
   * @param {[Secret]} secret The description of a secret to access remote Git repository, test endpoint or broker.
   * @returns this
   */
  public withSecret(secret: Secret): this {
    this.microcksContainer.withSecret(secret);
    return this;
  }

  public async start(): Promise<StartedMicrocksContainersEnsemble> {
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