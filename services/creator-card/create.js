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

function generateSlugBase(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

async function resolveSlug(data) {
  let slug = data.slug;

  if (slug) {
    const existing = await CreatorCardRepository.findOne({ query: { slug, deleted: null } });
    if (existing) {
      throwAppError(CreatorCardMessages.SLUG_TAKEN, ERROR_CODE.SL02);
    }
  } else {
    const slugBase = generateSlugBase(data.title);
    const baseIsTaken =
      slugBase.length < 5 ||
      !!(await CreatorCardRepository.findOne({ query: { slug: slugBase, deleted: null } }));

    slug = baseIsTaken ? `${slugBase}-${randomBytes(6)}` : slugBase;
  }

  return slug;
}

async function createCreatorCard(serviceData, options = {}) {
  let response;
  const data = validator.validate(serviceData, parsedCreateSpec);

  const accessType = data.access_type || 'public';

  if (accessType === 'private' && !data.access_code) {
    throwAppError(CreatorCardMessages.ACCESS_CODE_REQUIRED, ERROR_CODE.AC01);
  }

  if (accessType === 'public' && data.access_code) {
    throwAppError(CreatorCardMessages.ACCESS_CODE_FORBIDDEN, ERROR_CODE.AC05);
  }

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

  response = serializeCard(card);

  return response;
}

module.exports = createCreatorCard;
