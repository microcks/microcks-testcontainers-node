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
import { MicrocksContainer, StartedMicrocksContainer } from "./microcks-container";

export class MicrocksContainersEnsemble {
  private network: StartedNetwork;
  private microcksContainer: MicrocksContainer;
  private postmanContainer: GenericContainer;

  constructor(network: StartedNetwork, image = "quay.io/microcks/microcks-uber:1.8.0") {
    this.network = network;

    this.microcksContainer = new MicrocksContainer(image)
      .withNetwork(this.network)
      .withNetworkAliases("microcks")
      .withEnvironment({
        POSTMAN_RUNNER_URL: "http://postman:3000",
        TEST_CALLBACK_URL: "http://microcks:8080",
      });

    this.postmanContainer = new GenericContainer("quay.io/microcks/microcks-postman-runtime:latest")
      .withNetwork(this.network)
      .withNetworkAliases("postman")
      .withWaitStrategy(Wait.forLogMessage(/.*postman-runtime wrapper listening on port.*/, 1));
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

  public async start(): Promise<StartedMicrocksContainersEnsemble> {
    return new StartedMicrocksContainersEnsemble(
      await this.microcksContainer.start(),
      await this.postmanContainer.start()
    );
  }
}

export class StartedMicrocksContainersEnsemble {
  private readonly startedMicrocksContainer: StartedMicrocksContainer;
  private readonly startedPostmanContainer: StartedTestContainer;

  constructor(
    startedMicrocksContainer: StartedMicrocksContainer,
    startedPostmanContainer: StartedTestContainer
  ) {
    this.startedMicrocksContainer = startedMicrocksContainer;
    this.startedPostmanContainer = startedPostmanContainer;
  }

  public getMicrocksContainer(): StartedMicrocksContainer {
    return this.startedMicrocksContainer;
  }

  public getPostmanContainer(): StartedTestContainer {
    return this.startedPostmanContainer;
  }

  public async stop(options?: Partial<StopOptions>): Promise<StoppedMicrocksContainersEnsemble> {
    await this.startedMicrocksContainer.stop(options);
    await this.startedPostmanContainer.stop(options);
    return new StoppedMicrocksContainersEnsemble();
  }
}

export class StoppedMicrocksContainersEnsemble {

  constructor() {

  }
}