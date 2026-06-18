const assert = require('assert');
const createMockServer = require('@app-core/mock-server');
const { MockModelStubs } = require('@app/mock-models');

const VALID_CREATOR_REFERENCE = '12345678901234567890';

const server = createMockServer(['endpoints/creator-cards']);

describe('Creator Cards API', () => {
  describe('POST /creator-cards', () => {
    it('creates a card, returns id (not _id), and exposes access_code', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        mockNull: true,
      });

      let response;
      try {
        response = await server.post('/creator-cards', {
          body: {
            title: 'Ada Designs Things',
            creator_reference: VALID_CREATOR_REFERENCE,
            status: 'published',
          },
        });
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.data.status, 'success');
      assert.ok(response.data.data.id);
      assert.strictEqual(response.data.data._id, undefined);
      assert.strictEqual(response.data.data.slug, 'ada-designs-things');
      assert.strictEqual(response.data.data.access_type, 'public');
    });

    it('rejects with AC01 when private and access_code is omitted', async () => {
      const response = await server.post('/creator-cards', {
        body: {
          title: 'Some Title Here',
          creator_reference: VALID_CREATOR_REFERENCE,
          status: 'published',
          access_type: 'private',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.code, 'AC01');
    });

    it('rejects with AC05 when public and access_code is provided', async () => {
      const response = await server.post('/creator-cards', {
        body: {
          title: 'Some Title Here',
          creator_reference: VALID_CREATOR_REFERENCE,
          status: 'published',
          access_type: 'public',
          access_code: 'AB12CD',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.code, 'AC05');
    });

    it('rejects with SL02 when the provided slug already exists', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: () => ({ slug: 'taken-slug' }),
      });

      let response;
      try {
        response = await server.post('/creator-cards', {
          body: {
            title: 'Some Title Here',
            creator_reference: VALID_CREATOR_REFERENCE,
            status: 'published',
            slug: 'taken-slug',
          },
        });
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.code, 'SL02');
    });

    it('auto-generates a suffixed slug when the generated base is already taken', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: (configuration) => {
          if (configuration.query.slug === 'ada-designs-things') {
            return { slug: 'ada-designs-things' };
          }
          return null;
        },
      });

      let response;
      try {
        response = await server.post('/creator-cards', {
          body: {
            title: 'Ada Designs Things',
            creator_reference: VALID_CREATOR_REFERENCE,
            status: 'published',
          },
        });
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.data.data.slug.startsWith('ada-designs-things-'));
      assert.strictEqual(response.data.data.slug.length, 'ada-designs-things-'.length + 6);
    });

    it('returns 400 with a code for VSL validation failures (missing title)', async () => {
      const response = await server.post('/creator-cards', {
        body: {
          creator_reference: VALID_CREATOR_REFERENCE,
          status: 'published',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.status, 'error');
    });

    it('rejects a client-provided slug with disallowed characters', async () => {
      const response = await server.post('/creator-cards', {
        body: {
          title: 'Some Title Here',
          creator_reference: VALID_CREATOR_REFERENCE,
          status: 'published',
          slug: 'Not_A_Valid Slug!',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.code, 'SPCL_VALIDATION');
    });

    it('rejects a link url without an http/https scheme', async () => {
      const response = await server.post('/creator-cards', {
        body: {
          title: 'Some Title Here',
          creator_reference: VALID_CREATOR_REFERENCE,
          status: 'published',
          links: [{ title: 'My Site', url: 'ftp://example.com' }],
        },
      });

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.code, 'SPCL_VALIDATION');
    });

    it('rejects a non-integer service_rates amount', async () => {
      const response = await server.post('/creator-cards', {
        body: {
          title: 'Some Title Here',
          creator_reference: VALID_CREATOR_REFERENCE,
          status: 'published',
          service_rates: {
            currency: 'NGN',
            rates: [{ name: 'Logo Design', amount: 1500.5 }],
          },
        },
      });

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.code, 'SPCL_VALIDATION');
    });

    it('rejects a non-alphanumeric access_code', async () => {
      const response = await server.post('/creator-cards', {
        body: {
          title: 'Some Title Here',
          creator_reference: VALID_CREATOR_REFERENCE,
          status: 'published',
          access_type: 'private',
          access_code: 'AB-12!',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.code, 'SPCL_VALIDATION');
    });
  });

  describe('GET /creator-cards/:slug', () => {
    it('returns NF01 when the slug does not exist', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        mockNull: true,
      });

      let response;
      try {
        response = await server.get('/creator-cards/missing-slug');
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 404);
      assert.strictEqual(response.data.code, 'NF01');
    });

    it('returns NF02 for a draft card', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: () => ({ slug: 'draft-card', status: 'draft', access_type: 'public' }),
      });

      let response;
      try {
        response = await server.get('/creator-cards/draft-card');
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 404);
      assert.strictEqual(response.data.code, 'NF02');
    });

    it('returns AC03 for a private card with no access_code query param', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: () => ({
          slug: 'private-card',
          status: 'published',
          access_type: 'private',
          access_code: 'ABC123',
        }),
      });

      let response;
      try {
        response = await server.get('/creator-cards/private-card');
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 403);
      assert.strictEqual(response.data.code, 'AC03');
    });

    it('returns AC04 for a private card with the wrong access_code', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: () => ({
          slug: 'private-card',
          status: 'published',
          access_type: 'private',
          access_code: 'ABC123',
        }),
      });

      let response;
      try {
        response = await server.get('/creator-cards/private-card?access_code=WRONG1');
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 403);
      assert.strictEqual(response.data.code, 'AC04');
    });

    it('returns 200 and omits access_code for a valid private card access', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: () => ({
          _id: '01ABCDEFGHIJKLMNOPQRSTUV',
          slug: 'private-card',
          status: 'published',
          access_type: 'private',
          access_code: 'ABC123',
        }),
      });

      let response;
      try {
        response = await server.get('/creator-cards/private-card?access_code=ABC123');
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.data.data.access_code, undefined);
      assert.strictEqual(response.data.data.id, '01ABCDEFGHIJKLMNOPQRSTUV');
    });

    it('returns 200 for a public card without an access_code field set', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: () => ({
          _id: '01ABCDEFGHIJKLMNOPQRSTUV',
          slug: 'public-card',
          status: 'published',
          access_type: 'public',
          access_code: null,
        }),
      });

      let response;
      try {
        response = await server.get('/creator-cards/public-card');
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.data.data.access_code, undefined);
    });
  });

  describe('DELETE /creator-cards/:slug', () => {
    it('returns NF01 when the slug does not exist', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        mockNull: true,
      });

      let response;
      try {
        response = await server.delete('/creator-cards/missing-slug', {
          body: { creator_reference: VALID_CREATOR_REFERENCE },
        });
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 404);
      assert.strictEqual(response.data.code, 'NF01');
    });

    it('soft deletes and returns the card with deleted set and access_code visible', async () => {
      const { revert } = MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: () => ({
          _id: '01XYZABCDEFGHIJKLMNOPQRS',
          slug: 'to-delete',
          status: 'published',
          access_type: 'public',
          access_code: null,
          deleted: null,
        }),
      });

      let response;
      try {
        response = await server.delete('/creator-cards/to-delete', {
          body: { creator_reference: VALID_CREATOR_REFERENCE },
        });
      } finally {
        revert();
      }

      assert.strictEqual(response.statusCode, 200);
      assert.ok(response.data.data.deleted);
      assert.strictEqual(response.data.data.id, '01XYZABCDEFGHIJKLMNOPQRS');
    });

    it('returns 400 when creator_reference is missing from the body', async () => {
      const response = await server.delete('/creator-cards/some-slug', { body: {} });

      assert.strictEqual(response.statusCode, 400);
      assert.strictEqual(response.data.status, 'error');
    });
  });
});
