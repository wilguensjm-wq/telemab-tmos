import { reporterControlService } from "./reporterControlService";

export const producerControlService = {
  async listRequests() {
    return reporterControlService.listReporters();
  },

  async approveRequest(reporterId) {
    return reporterControlService.updateReporterStatus(reporterId, "live");
  },

  async rejectRequest(reporterId) {
    return reporterControlService.updateReporterStatus(reporterId, "offline");
  },
};