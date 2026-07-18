export class ProviderStateService {
  constructor({ providerStateRepository }) {
    this.providerStateRepository = providerStateRepository;
  }

  async upsert(providerKey, status, payload = {}, correlationId = null) {
    await this.providerStateRepository.upsert({ providerKey, status, payload, correlationId });
  }

  async list() {
    return this.providerStateRepository.list();
  }
}
