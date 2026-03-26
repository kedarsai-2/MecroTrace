/**
 * API-only Cypress tests for Admin Trader management:
 * - GET  /api/admin/traders
 * - GET  /api/admin/traders/{id}
 * - PATCH /api/admin/traders/{id}/approve
 * - PATCH /api/admin/traders/{id}/reject
 *
 * Aligned with:
 * - AdminTraderSpecResource
 * - TraderDTO / ApprovalStatus
 * - SecurityConfiguration (adminSecurityFilterChain)
 *
 * Security: Follows MERCO QA Cypress API Security Policy (4.1–4.3).
 */

const ADMIN_LOGIN = '/api/admin/auth/login';
const ADMIN_TRADERS = '/api/admin/traders';
const TRADER_LOGIN = '/api/auth/login';

const SENSITIVE_KEYS = ['password', 'passwordHash', 'secretKey', 'refreshToken'];

function apiUrl(): string {
  return Cypress.env('apiUrl') || 'http://localhost:8080';
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Assert response body does not expose sensitive fields (Rule 3). */
function expectNoSensitiveData(body: unknown): void {
  if (body === null || typeof body !== 'object') return;
  const obj = body as Record<string, unknown>;
  for (const key of SENSITIVE_KEYS) {
    expect(obj, `Security: response must not expose "${key}"`).to.not.have.property(key);
  }
}

/** Assert error response does not expose stack traces, SQL, or server paths (Rule 10). */
function expectErrorSanitized(body: unknown): void {
  if (body === null || typeof body !== 'object') return;
  const obj = body as Record<string, unknown>;
  expect(obj, 'Security: error response must not expose stack trace').to.not.have.property('stack');
  const str = JSON.stringify(obj);
  expect(str, 'Security: error must not expose SQL').to.not.match(/select\s+.+\s+from|insert\s+into|update\s+.+\s+set/i);
  expect(str, 'Security: error must not expose server path').to.not.match(/\/[a-z]+\/[a-z]+\/.*\.(java|class)/i);
}

interface TraderSummary {
  id: number;
  businessName?: string;
  approvalStatus?: string;
}

describe('Admin Trader API', () => {
  let adminToken: string | null = null;
  let traderToken: string | null = null;
  let existingTrader: TraderSummary | null = null;

  before(function () {
    const adminLogin = Cypress.env('adminLogin') as string | undefined;
    const adminPassword = Cypress.env('adminPassword') as string | undefined;

    if (!adminLogin || !adminPassword) {
      cy.log('CYPRESS_ADMIN_LOGIN / CYPRESS_ADMIN_PASSWORD not set; skipping Admin Trader API tests');
      this.skip();
      return;
    }

    // Obtain ADMIN JWT via /api/admin/auth/login
    cy.request({
      method: 'POST',
      url: `${apiUrl()}${ADMIN_LOGIN}`,
      body: {
        username: adminLogin,
        password: adminPassword,
        rememberMe: false,
      },
      failOnStatusCode: false,
    }).then((res) => {
      if (res.status !== 200) {
        cy.log(`Admin login failed with status ${res.status}; skipping Admin Trader tests`);
        this.skip();
        return;
      }

      const authHeader = (res.headers['authorization'] || res.headers['Authorization']) as string | string[] | undefined;
      const headerVal = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      expect(headerVal, 'Authorization header with Bearer ADMIN token should be present').to.be.a('string');
      const tokenFromHeader = (headerVal as string).replace(/^Bearer\s+/i, '').trim();
      expect(tokenFromHeader.length, 'ADMIN JWT token length').to.be.greaterThan(10);

      adminToken = tokenFromHeader;

      // List traders once for functional tests
      return cy
        .request({
          method: 'GET',
          url: `${apiUrl()}${ADMIN_TRADERS}`,
          headers: authHeaders(adminToken),
          failOnStatusCode: false,
        })
        .then((tradersRes) => {
          if (tradersRes.status === 200 && Array.isArray(tradersRes.body) && tradersRes.body.length > 0) {
            const first = tradersRes.body[0] as TraderSummary;
            if (first && typeof first.id === 'number') {
              existingTrader = {
                id: first.id,
                businessName: (first as any).businessName,
                approvalStatus: (first as any).approvalStatus,
              };
            }
          }

          // Best-effort: capture a TRADER JWT for RBAC negative tests (optional)
          const traderLogin = Cypress.env('traderLogin') as string | undefined;
          const traderPassword = Cypress.env('traderPassword') as string | undefined;
          if (!traderLogin || !traderPassword) {
            return;
          }
          return cy
            .request({
              method: 'POST',
              url: `${apiUrl()}${TRADER_LOGIN}`,
              body: { username: traderLogin, password: traderPassword },
              failOnStatusCode: false,
            })
            .then((loginRes) => {
              if (loginRes.status !== 200) {
                return;
              }
              const h = loginRes.headers['authorization'] || loginRes.headers['Authorization'];
              const header = Array.isArray(h) ? h[0] : h;
              if (header && typeof header === 'string') {
                traderToken = header.replace(/^Bearer\s+/i, '').trim();
              }
            });
        });
    });
  });

  // --- Authentication Enforcement (Rule 1) ---

  describe('Authentication (Rule 1)', () => {
    it('GET /api/admin/traders without token returns 401 or 403', () => {
      cy.request({
        method: 'GET',
        url: `${apiUrl()}${ADMIN_TRADERS}`,
        failOnStatusCode: false,
      }).then((res) => {
        expect(
          res.status,
          res.status === 200 ? 'Security bug: /api/admin/traders must not succeed without token' : undefined,
        ).to.be.oneOf([401, 403]);
        expectErrorSanitized(res.body);
      });
    });

    it('GET /api/admin/traders/{id} without token returns 401 or 403', function () {
      const id = existingTrader?.id ?? 1;
      cy.request({
        method: 'GET',
        url: `${apiUrl()}${ADMIN_TRADERS}/${id}`,
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([401, 403]);
        expectErrorSanitized(res.body);
      });
    });

    it('PATCH /api/admin/traders/{id}/approve without token returns 401 or 403', function () {
      const id = existingTrader?.id ?? 1;
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/${id}/approve`,
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([401, 403]);
        expectErrorSanitized(res.body);
      });
    });

    it('PATCH /api/admin/traders/{id}/reject without token returns 401 or 403', function () {
      const id = existingTrader?.id ?? 1;
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/${id}/reject`,
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.be.oneOf([401, 403]);
        expectErrorSanitized(res.body);
      });
    });
  });

  // --- RBAC (Rule 2) ---

  describe('RBAC (Rule 2)', function () {
    before(function () {
      if (!traderToken) {
        this.skip();
      }
    });

    it('TRADER JWT cannot access /api/admin/traders (must return 401/403)', function () {
      if (!traderToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'GET',
        url: `${apiUrl()}${ADMIN_TRADERS}`,
        headers: authHeaders(traderToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(
          res.status,
          res.status === 200
            ? 'Critical RBAC bug: trader token must not access /api/admin/traders'
            : undefined,
        ).to.be.oneOf([401, 403]);
        expectErrorSanitized(res.body);
      });
    });

    it('TRADER JWT cannot PATCH /api/admin/traders/{id}/approve (must return 401/403)', function () {
      if (!traderToken) {
        this.skip();
        return;
      }
      const id = existingTrader?.id ?? 1;
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/${id}/approve`,
        headers: authHeaders(traderToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(
          res.status,
          res.status === 200
            ? 'Critical RBAC bug: trader token must not approve admin traders'
            : undefined,
        ).to.be.oneOf([401, 403]);
        expectErrorSanitized(res.body);
      });
    });

    it('TRADER JWT cannot PATCH /api/admin/traders/{id}/reject (must return 401/403)', function () {
      if (!traderToken) {
        this.skip();
        return;
      }
      const id = existingTrader?.id ?? 1;
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/${id}/reject`,
        headers: authHeaders(traderToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(
          res.status,
          res.status === 200
            ? 'Critical RBAC bug: trader token must not reject admin traders'
            : undefined,
        ).to.be.oneOf([401, 403]);
        expectErrorSanitized(res.body);
      });
    });
  });

  // --- Functional behavior ---

  describe('Functional behavior', function () {
    before(function () {
      if (!adminToken) {
        this.skip();
      }
    });

    it('GET /api/admin/traders returns 200 with array of TraderDTO', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'GET',
        url: `${apiUrl()}${ADMIN_TRADERS}`,
        headers: authHeaders(adminToken),
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.be.an('array');
        if (Array.isArray(res.body) && res.body.length > 0) {
          const t = res.body[0] as TraderSummary;
          expect(t).to.have.property('id');
          expectNoSensitiveData(t);
        }
      });
    });

    it('GET /api/admin/traders/{id} returns 200 for existing trader or 404 when none declared', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      if (!existingTrader) {
        cy.log('No traders found via /api/admin/traders; skipping GET by id functional test');
        this.skip();
        return;
      }
      cy.request({
        method: 'GET',
        url: `${apiUrl()}${ADMIN_TRADERS}/${existingTrader.id}`,
        headers: authHeaders(adminToken),
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('id', existingTrader!.id);
        expect(res.body).to.have.property('approvalStatus');
        expectNoSensitiveData(res.body);
      });
    });

    it('PATCH /api/admin/traders/{id}/approve returns 200 and sets approvalStatus=APPROVED', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      if (!existingTrader) {
        cy.log('No traders found via /api/admin/traders; skipping approve functional test');
        this.skip();
        return;
      }
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/${existingTrader.id}/approve`,
        headers: authHeaders(adminToken),
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('id', existingTrader!.id);
        expect(res.body).to.have.property('approvalStatus').and.to.be.a('string');
        expect((res.body as any).approvalStatus).to.eq('APPROVED');
        expectNoSensitiveData(res.body);
      });
    });
  });

  // --- Input validation & error handling (Rules 4, 10) ---

  describe('Input validation and errors', function () {
    before(function () {
      if (!adminToken) {
        this.skip();
      }
    });

    it('GET /api/admin/traders/abc (non-numeric id) returns 400', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'GET',
        url: `${apiUrl()}${ADMIN_TRADERS}/abc`,
        headers: authHeaders(adminToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expectErrorSanitized(res.body);
      });
    });

    it('PATCH /api/admin/traders/abc/approve (non-numeric id) returns 400', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/abc/approve`,
        headers: authHeaders(adminToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expectErrorSanitized(res.body);
      });
    });

    it('PATCH /api/admin/traders/abc/reject (non-numeric id) returns 400', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/abc/reject`,
        headers: authHeaders(adminToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expectErrorSanitized(res.body);
      });
    });

    it('GET /api/admin/traders/{id} with non-existent id returns 404', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'GET',
        url: `${apiUrl()}${ADMIN_TRADERS}/999999`,
        headers: authHeaders(adminToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
        expectErrorSanitized(res.body);
      });
    });

    it('PATCH /api/admin/traders/{id}/approve with non-existent id returns 404', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/999999/approve`,
        headers: authHeaders(adminToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
        expectErrorSanitized(res.body);
      });
    });

    it('PATCH /api/admin/traders/{id}/reject with non-existent id returns 404', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'PATCH',
        url: `${apiUrl()}${ADMIN_TRADERS}/999999/reject`,
        headers: authHeaders(adminToken),
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
        expectErrorSanitized(res.body);
      });
    });
  });

  // --- HTTP security headers (Rule 6) ---

  describe('HTTP security headers (Rule 6)', function () {
    before(function () {
      if (!adminToken) {
        this.skip();
      }
    });

    it('GET /api/admin/traders includes X-Content-Type-Options and X-Frame-Options', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'GET',
        url: `${apiUrl()}${ADMIN_TRADERS}`,
        headers: authHeaders(adminToken),
      }).then((res) => {
        const headers = res.headers as Record<string, string>;
        expect(
          headers['x-content-type-options'] ?? headers['X-Content-Type-Options'],
          'Security: X-Content-Type-Options header should be present',
        )
          .to.be.a('string')
          .and.not.empty;
        expect(
          headers['x-frame-options'] ?? headers['X-Frame-Options'],
          'Security: X-Frame-Options header should be present',
        )
          .to.be.a('string')
          .and.not.empty;
      });
    });
  });

  // --- Method access validation (Rule 8) ---

  describe('Method access (Rule 8)', function () {
    before(function () {
      if (!adminToken) {
        this.skip();
      }
    });

    it('POST on GET-only /api/admin/traders returns non-200 (405/404)', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'POST',
        url: `${apiUrl()}${ADMIN_TRADERS}`,
        headers: authHeaders(adminToken),
        body: {},
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, 'POST on GET-only /api/admin/traders endpoint must not succeed').to.not.eq(200);
      });
    });

    it('PUT on GET-only /api/admin/traders returns non-200 (405/404)', function () {
      if (!adminToken) {
        this.skip();
        return;
      }
      cy.request({
        method: 'PUT',
        url: `${apiUrl()}${ADMIN_TRADERS}`,
        headers: authHeaders(adminToken),
        body: {},
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status, 'PUT on GET-only /api/admin/traders endpoint must not succeed').to.not.eq(200);
      });
    });
  });
});

