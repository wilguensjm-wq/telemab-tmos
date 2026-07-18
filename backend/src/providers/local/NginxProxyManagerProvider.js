import { Provider } from "../sdk/Provider.js";
import { TmosError } from "../../errors/TmosError.js";
import { runCommand } from "../../utils/commandRunner.js";

function parseJson(text, fallback = []) {
  const value = String(text || "").trim();
  if (!value) return fallback;
  return JSON.parse(value);
}

function parseDomainNames(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toDaysRemaining(value) {
  const expiresAt = new Date(value).getTime();
  if (!Number.isFinite(expiresAt)) return null;
  return Math.max(Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)), 0);
}

export class NginxProxyManagerProvider extends Provider {
  constructor({ config, timeoutMs }) {
    super("nginx-proxy-manager");
    this.config = config;
    this.timeoutMs = timeoutMs;
  }

  async query(script) {
    const result = await runCommand("docker", ["exec", this.config.containerName, "node", "-e", script], {
      timeout: this.timeoutMs,
    });
    return result.stdout;
  }

  async hosts() {
    if (!this.config.enabled) {
      throw new TmosError({ code: "PROVIDER_UNAVAILABLE", message: "Nginx Proxy Manager provider is disabled", status: 503 });
    }

    const script = `const knex=require('knex')({client:'sqlite3',connection:{filename:'${this.config.databasePath}'},useNullAsDefault:true}); knex('proxy_host').where({is_deleted:0}).select('id','domain_names','enabled','forward_host','forward_port','forward_scheme','certificate_id').then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exit(1)}).finally(()=>knex.destroy())`;
    const rows = parseJson(await this.query(script), []);
    return rows.map((row) => ({
      id: row.id,
      domain: parseDomainNames(row.domain_names).join(", "),
      status: row.enabled ? "Online" : "Disabled",
      upstream: `${row.forward_scheme || "http"}://${row.forward_host}:${row.forward_port}`,
      sslCertificateId: row.certificate_id || 0,
      enabled: Boolean(row.enabled),
    }));
  }

  async certificates() {
    const script = `const knex=require('knex')({client:'sqlite3',connection:{filename:'${this.config.databasePath}'},useNullAsDefault:true}); knex('certificate').where({is_deleted:0}).select('id','nice_name','domain_names','expires_on','provider').then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exit(1)}).finally(()=>knex.destroy())`;
    const rows = parseJson(await this.query(script), []);
    return rows.map((row) => ({
      id: row.id,
      name: row.nice_name,
      domains: parseDomainNames(row.domain_names),
      expiresOn: row.expires_on,
      provider: row.provider,
      status: row.expires_on ? "Valid" : "Unknown",
      daysRemaining: toDaysRemaining(row.expires_on),
    }));
  }

  async health() {
    try {
      const hosts = await this.hosts();
      return { provider: "nginx-proxy-manager", status: "healthy", connected: true, hostCount: hosts.length };
    } catch (error) {
      return { provider: "nginx-proxy-manager", status: "unhealthy", connected: false, reason: error?.message || "proxy unavailable" };
    }
  }

  async status(resourceId) {
    const hosts = await this.hosts();
    if (!resourceId) return hosts;
    const match = hosts.find((item) => String(item.id) === String(resourceId));
    if (!match) {
      throw new TmosError({ code: "PROVIDER_BAD_RESPONSE", message: `Proxy host ${resourceId} not found`, status: 404 });
    }
    return match;
  }

  async logs() {
    return [];
  }

  async events() {
    const hosts = await this.hosts();
    return hosts
      .filter((item) => !item.enabled)
      .map((item) => ({
        id: `evt-npm-${item.id}`,
        timestamp: new Date().toISOString(),
        provider: "nginx-proxy-manager",
        resource: item.id,
        action: "proxy-host-state",
        severity: "warning",
        status: "open",
        operator: "system",
        correlationId: "nginx-proxy-manager",
        metadata: { domain: item.domain, upstream: item.upstream },
      }));
  }

  capabilities() {
    return {
      canReadStatus: true,
      canReadMetrics: false,
      canReadLogs: true,
      canStart: false,
      canStop: false,
      canRestart: false,
      implemented: true,
    };
  }
}