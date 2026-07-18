import { TmosError } from "../errors/TmosError.js";

function notImplemented(methodName) {
  throw new TmosError({
    code: "PROVIDER_UNAVAILABLE",
    message: `Media provider method '${methodName}' is not implemented`,
    status: 503,
  });
}

export class MediaProvider {
  capabilities() {
    notImplemented("capabilities");
  }

  async createRoom(_payload) {
    notImplemented("createRoom");
  }

  async joinSession(_payload) {
    notImplemented("joinSession");
  }

  async leaveSession(_payload) {
    notImplemented("leaveSession");
  }

  async updateDeviceSelection(_payload) {
    notImplemented("updateDeviceSelection");
  }

  async setPublisherState(_payload) {
    notImplemented("setPublisherState");
  }

  async setSubscriberState(_payload) {
    notImplemented("setSubscriberState");
  }

  async applyProducerControl(_payload) {
    notImplemented("applyProducerControl");
  }
}
