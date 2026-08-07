import { reporterControlService } from "./reporterControlService";
import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";
import { formatApiError } from "../utils/errorHandling";

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesReporterHints(participant, reporter = {}) {
  const metadata = participant?.metadata || {};
  const identity = String(metadata.participantIdentity || metadata.identity || "").toLowerCase();
  const notes = String(reporter.notes || "").toLowerCase();
  const fullName = String(reporter.fullName || "").toLowerCase();
  const email = String(reporter.email || "").toLowerCase();

  if (!identity) {
    return false;
  }

  return identity.includes(fullName)
    || identity.includes(email)
    || (notes && identity.includes(notes));
}

function findActiveReporterParticipant(rooms, reporter = {}) {
  const allParticipants = (Array.isArray(rooms) ? rooms : []).flatMap((room) => (
    Array.isArray(room?.participants) ? room.participants : []
  ));

  const reporterId = reporter?.id || null;

  const isActive = (participant) => (
    !participant?.leftAt
    && String(participant?.connectionStatus || "").toLowerCase() !== "left"
    && String(participant?.lifecycleState || "").toLowerCase() !== "disconnected"
  );

  const directMatch = allParticipants.find((participant) => (
    participant?.reporterId === reporterId
      && !participant?.leftAt
      && String(participant?.connectionStatus || "").toLowerCase() !== "left"
      && String(participant?.lifecycleState || "").toLowerCase() !== "disconnected"
  ));
  if (directMatch) {
    return directMatch;
  }

  const hintedMatch = allParticipants.find((participant) => (
    isActive(participant) && matchesReporterHints(participant, reporter)
  ));
  if (hintedMatch) {
    return hintedMatch;
  }

  return allParticipants.find((participant) => (
    isActive(participant) && String(participant?.participantRole || "").toLowerCase() === "reporter"
  )) || null;
}

export const producerControlService = {
  async listRequests() {
    return reporterControlService.listReporters();
  },

  async listPendingRequests() {
    try {
      return await reporterControlService.listPendingReporters();
    } catch {
      const reporters = await reporterControlService.listReporters();
      return (Array.isArray(reporters) ? reporters : []).filter((reporter) => {
        const status = normalizeStatus(reporter?.status);
        return status === "pending" || status === "waiting";
      });
    }
  },

  async getPendingReporters() {
    return this.listPendingRequests();
  },

  async approveRequest(reporterId) {
    return reporterControlService.updateReporterStatus(reporterId, "live");
  },

  async rejectRequest(reporterId) {
    return reporterControlService.updateReporterStatus(reporterId, "offline");
  },

  async setTalkback(reporter, enabled) {
    try {
      const roomsResponse = await APIClient.get(API_CONFIG.endpoints.media.rooms);
      const rooms = roomsResponse?.data?.data || [];
      const participant = findActiveReporterParticipant(rooms, reporter);

      if (!participant?.id) {
        throw new Error("No active media participant found for this reporter.");
      }

      const endpoint = `${API_CONFIG.endpoints.media.participantPublisher}/${participant.id}/producer-control`;
      const response = await APIClient.post(endpoint, {
        action: enabled ? "subscriber.enable" : "subscriber.disable",
        value: {
          channel: "talkback",
          enabled: Boolean(enabled),
        },
      });

      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },
};