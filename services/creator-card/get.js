const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const CreatorCardRepository = require('@app/repository/creator-card');
const { CreatorCardMessages } = require('@app/messages');
const serializeCard = require('./serialize');

async function getCreatorCard(serviceData, options = {}) {
  let response;
  const { slug, access_code: accessCode } = serviceData;

  const card = await CreatorCardRepository.findOne({ query: { slug, deleted: null } });

  if (!card) {
    throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NF01);
  }

  if (card.status === 'draft') {
    throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NF02);
  }

  if (card.access_type === 'private') {
    if (!accessCode) {
      throwAppError(CreatorCardMessages.ACCESS_CODE_MISSING, ERROR_CODE.AC03);
    }

    if (accessCode !== card.access_code) {
      throwAppError(CreatorCardMessages.ACCESS_CODE_INVALID, ERROR_CODE.AC04);
    }
  }

  response = serializeCard(card, { omitAccessCode: true });

  return response;
}

module.exports = getCreatorCard;
