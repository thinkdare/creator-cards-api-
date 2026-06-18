const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const CreatorCardRepository = require('@app/repository/creator-card');
const { CreatorCardMessages } = require('@app/messages');
const serializeCard = require('./serialize');

const deleteSpec = `root {
  creator_reference string<minLength:20|maxLength:20>
}`;

const parsedDeleteSpec = validator.parse(deleteSpec);

async function deleteCreatorCard(serviceData, options = {}) {
  let response;
  validator.validate(serviceData, parsedDeleteSpec);

  const { slug } = serviceData;

  const card = await CreatorCardRepository.findOne({ query: { slug, deleted: null } });

  if (!card) {
    throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NF01);
  }

  const deletedAt = Date.now();

  await CreatorCardRepository.updateOne({
    query: { slug, deleted: null },
    updateValues: { deleted: deletedAt },
  });

  response = serializeCard({ ...card, deleted: deletedAt });

  return response;
}

module.exports = deleteCreatorCard;
