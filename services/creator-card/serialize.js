function serializeCard(doc, { omitAccessCode = false } = {}) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  if (omitAccessCode) delete obj.access_code;
  return obj;
}

module.exports = serializeCard;
