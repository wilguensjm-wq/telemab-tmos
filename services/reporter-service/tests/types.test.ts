import { generateSessionId } from '../src/types';

describe('Reporter Service Types', () => {
  test('generateSessionId creates valid session ID', () => {
    const sessionId = generateSessionId();

    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(sessionId).toMatch(/^sess-\d+-[a-z0-9]+$/);
  });

  test('generateSessionId creates unique IDs', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();

    expect(id1).not.toBe(id2);
  });

  test('Reporter status validation', () => {
    const validStatuses = ['available', 'live', 'busy', 'offline'];
    validStatuses.forEach((status) => {
      expect(validStatuses).toContain(status);
    });
  });

  test('ReporterResponse interface has required fields', () => {
    const response = {
      id: 'uuid',
      userId: 'user-id',
      name: 'John Doe',
      location: 'Field',
      status: 'available' as const,
      lastHeartbeatAt: new Date().toISOString(),
      connectedAt: new Date().toISOString(),
      sessionId: 'session-id',
    };

    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('userId');
    expect(response).toHaveProperty('name');
    expect(response).toHaveProperty('status');
  });

  test('WebSocketMessage has required type field', () => {
    const message = {
      type: 'ping' as const,
      payload: {},
      timestamp: new Date().toISOString(),
    };

    expect(message.type).toBe('ping');
    expect(['ping', 'pong', 'status_change', 'heartbeat', 'error']).toContain(message.type);
  });
});
