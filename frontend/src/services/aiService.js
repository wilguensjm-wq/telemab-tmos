import { API_CONFIG } from "../constants/api";
import APIClient from "../api/APIClient";
import { formatApiError } from "../utils/errorHandling";
import { tmosEventBus } from "./tmosEventBus";

function groupByProvider(events = []) {
  return events.reduce((acc, event) => {
    const key = event.provider || "unknown";
    acc[key] = acc[key] || [];
    acc[key].push(event);
    return acc;
  }, {});
}

function detectCascadingIncidents(events = []) {
  const grouped = groupByProvider(events);
  const activeProviders = Object.keys(grouped).filter((provider) => grouped[provider].length > 0);

  if (activeProviders.length < 2) {
    return [];
  }

  return [
    {
      id: "cascade-1",
      task: "Cross-provider cascading incident",
      context: `${activeProviders.join(", ")} show simultaneous alerts`,
      priority: "High",
      status: "Open",
      reason: "Multiple provider alerts overlap in the same operational window.",
    },
  ];
}

function toIncident(event) {
  return {
    id: event.id,
    task: `${event.provider} ${event.type}`,
    context: event.message,
    priority: event.severity === "critical" ? "High" : "Medium",
    status: event.status === "open" ? "Open" : "In Review",
    reason: `Severity ${event.severity} detected from TMOS event stream.`,
  };
}

function buildRecommendations(incidents = []) {
  if (incidents.length === 0) {
    return {
      suggestions: ["Waiting for provider incidents from TMOS event stream."],
      recommendations: ["No recommendations generated because no connected incident signals were returned."],
    };
  }

  const suggestions = incidents.slice(0, 5).map((incident) => `Investigate ${incident.task}: ${incident.context}`);
  const recommendations = incidents.slice(0, 5).map((incident) => `Recommended action: ${incident.reason}`);

  return { suggestions, recommendations };
}

export const aiService = {
  endpoint: API_CONFIG.endpoints.ai.recommendations,

  async getRecommendations() {
    try {
      const events = await tmosEventBus.getIncidents();
      return buildRecommendations(events.map(toIncident));
    } catch (error) {
      try {
        const response = await APIClient.get(this.endpoint);
        return response?.data?.data || response?.data;
      } catch (fallbackError) {
        throw new Error(formatApiError(fallbackError || error));
      }
    }
  },

  async getIncidents() {
    try {
      const [incidentEvents, timeline] = await Promise.all([
        tmosEventBus.getIncidents(),
        tmosEventBus.getTimeline(20),
      ]);

      const incidents = incidentEvents.map(toIncident);
      const cascading = detectCascadingIncidents(incidentEvents);

      return {
        incidents: [...incidents, ...cascading],
        timeline,
      };
    } catch (error) {
      try {
        const response = await APIClient.get(API_CONFIG.endpoints.ai.incidents);
        return { incidents: response?.data?.data || response?.data || [], timeline: [] };
      } catch (fallbackError) {
        throw new Error(formatApiError(fallbackError || error));
      }
    }
  },

  async getOperationalAssistantOverview() {
    const [{ incidents, timeline }, recommendationData] = await Promise.all([
      this.getIncidents(),
      this.getRecommendations(),
    ]);

    return {
      incidents,
      timeline,
      suggestions: recommendationData.suggestions || [],
      recommendations: recommendationData.recommendations || [],
      reportPreview: incidents.length > 0
        ? `Generated from ${incidents.length} AI-correlated incidents and ${timeline.length} timeline events.`
        : "Waiting for provider events to generate AI correlation.",
    };
  },
};
