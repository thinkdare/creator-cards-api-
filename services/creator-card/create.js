const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { randomBytes } = require('@app-core/randomness');
const CreatorCardRepository = require('@app/repository/creator-card');
const { CreatorCardMessages } = require('@app/messages');
const serializeCard = require('./serialize');

const createSpec = `root {
  title string<minLength:3|maxLength:100>
  description? string<maxLength:500>
  slug? string<minLength:5|maxLength:50>
  creator_reference string<minLength:20|maxLength:20>
  links[]? {
    title string<minLength:1|maxLength:100>
    url string<maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[] {
      name string<minLength:3|maxLength:100>
      description? string<maxLength:250>
      amount number<min:1>
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string<minLength:6|maxLength:6>
}`;

const parsedCreateSpec = validator.parse(createSpec);

const SLUG_CHARSET_REGEX = /^[a-z0-9-_]+$/;
const ALPHANUMERIC_REGEX = /^[a-z0-9]+$/i;

// Mirrors the errorCode/details shape @app-core/validator-vsl itself throws with,
// so format rules VSL can't express (charsets, integer-only) still read as
// ordinary field validation errors rather than a new ad-hoc business code.
function assertFormat(condition, field, message) {
  if (!condition) {
    throwAppError(message, 'SPCL_VALIDATION', { details: { [field]: message } });
  }
}

function validateFormats(data) {
  if (data.slug) {
    assertFormat(
      SLUG_CHARSET_REGEX.test(data.slug),
      'slug',
      'slug may only contain lowercase letters, numbers, hyphens, and underscores.'
    );
  }

  (data.links || []).forEach((link, index) => {
    assertFormat(
      link.url.startsWith('http://') || link.url.startsWith('https://'),
      `links[${index}].url`,
      'links[].url must start with http:// or https://.'
    );
  });

  if (data.service_rates) {
    data.service_rates.rates.forEach((rate, index) => {
      assertFormat(
        Number.isInteger(rate.amount),
        `service_rates.rates[${index}].amount`,
        'service_rates.rates[].amount must be a positive integer.'
      );
    });
  }

  if (data.access_code) {
    assertFormat(
      ALPHANUMERIC_REGEX.test(data.access_code),
      'access_code',
      'access_code must be exactly 6 alphanumeric characters.'
    );
  }
}

function generateSlugBase(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

async function resolveSlug(data) {
  const { slug } = data;

  if (slug) {
    const existing = await CreatorCardRepository.findOne({ query: { slug, deleted: null } });
    if (existing) {
      throwAppError(CreatorCardMessages.SLUG_TAKEN, ERROR_CODE.SL02);
    }
    return slug;
  }

  const slugBase = generateSlugBase(data.title);
  const baseIsTaken =
    slugBase.length < 5 ||
    !!(await CreatorCardRepository.findOne({ query: { slug: slugBase, deleted: null } }));

  return baseIsTaken ? `${slugBase}-${randomBytes(6)}` : slugBase;
}

async function createCreatorCard(serviceData, options = {}) {
  const data = validator.validate(serviceData, parsedCreateSpec);

  const accessType = data.access_type || 'public';

  if (accessType === 'private' && !data.access_code) {
    throwAppError(CreatorCardMessages.ACCESS_CODE_REQUIRED, ERROR_CODE.AC01);
  }

  if (accessType === 'public' && data.access_code) {
    throwAppError(CreatorCardMessages.ACCESS_CODE_FORBIDDEN, ERROR_CODE.AC05);
  }

  validateFormats(data);

  const slug = await resolveSlug(data);

  let card;
  try {
    card = await CreatorCardRepository.create({
      title: data.title,
      description: data.description,
      slug,
      creator_reference: data.creator_reference,
      links: data.links,
      service_rates: data.service_rates,
      status: data.status,
      access_type: accessType,
      access_code: data.access_code || null,
    });
  } catch (error) {
    if (error.errorCode === ERROR_CODE.DUPLRCRD) {
      throwAppError(CreatorCardMessages.SLUG_TAKEN, ERROR_CODE.SL02);
    }
    throw error;
  }

  const response = serializeCard(card);

  return response;
}

module.exports = createCreatorCard;
