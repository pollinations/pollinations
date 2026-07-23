var ELEMENTS_COLLECTION = "elements";
var INVENTORY_COLLECTION = "inventories";
var PROFILES_COLLECTION = "profiles";
var IMAGE_MODEL = "flux";
var TEXT_MODEL = "openai";

var IDENTITY_CACHE = {};
var IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000;
var COLLECTION_FIELD_CACHE = {};

var SYSTEM_PROFILE_EMAIL = "seed@pollicraft.local";
var SYSTEM_PROFILE_NAME = "Atlas";

var SEED_ELEMENTS = [
  { slug: "water", name: "Water", description: "Clear pressure, tide memory, patient motion." },
  { slug: "fire", name: "Fire", description: "A hot little argument with the dark." },
  { slug: "wind", name: "Wind", description: "Invisible weather with a habit of escaping." },
  { slug: "earth", name: "Earth", description: "Weight, root, grit, and stubborn shape." }
];

var DISCOVERER_FIELD = "discoverer";
var SEED_NAMES = ["water", "fire", "earth", "wind"];

var normalizeIngredients = function(raw) {
  if (!Array.isArray(raw)) return [];
  var cleaned = raw.filter(function(value) {
    return typeof value === "string" && value.trim().length > 0;
  });
  var unique = [];
  for (var i = 0; i < cleaned.length; i++) {
    if (unique.indexOf(cleaned[i]) < 0) unique.push(cleaned[i]);
  }
  unique.sort();
  return unique;
};

var normalizeIngredientPair = function(raw) {
  var normalized = normalizeIngredients(raw);
  return normalized.length === 2 ? normalized : [];
};

var normalizeRecipeIngredients = function(leftId, rightId) {
  if (!leftId || !rightId) return [];
  if (leftId === rightId) return [leftId];
  return normalizeIngredientPair([leftId, rightId]);
};

var normalizeSlug = function(value) {
  if (typeof value !== "string") return "";
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
};

var normalizeEmail = function(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

var normalizeText = function(value, fallback) {
  if (typeof value !== "string") return fallback;
  var cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : fallback;
};

var hashString = function(value) {
  var hash = 0;
  for (var i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
};

var buildPrompt = function(name, leftName, rightName) {
  return "small hand-painted " + name + ", paper texture, indie game icon, made from " + leftName + " and " + rightName;
};

var readHeader = function(e, names) {
  if (e && e.request && e.request.header && typeof e.request.header.get === "function") {
    for (var i = 0; i < names.length; i++) {
      var direct = e.request.header.get(names[i]);
      if (direct) return String(direct);
    }
  }

  var info = e.requestInfo();
  var headers = (info && info.headers) || {};
  for (var j = 0; j < names.length; j++) {
    var canonical = String(names[j] || "");
    var lower = canonical.toLowerCase();
    var underscored = lower.replace(/-/g, "_");
    var value = headers[canonical] || headers[lower] || headers[underscored];
    if (value) return String(value);
  }
  return "";
};

var readPollenKey = function(e, body) {
  var fromHeader = readHeader(e, ["X-Pollen-Key", "x-pollen-key"]);
  var fromBody = (body && (body.pollenKey || body.pollenkey)) || "";
  return (fromHeader || fromBody).trim();
};

var readUserEmail = function(e, body) {
  var fromHeader = readHeader(e, ["X-User-Email", "x-user-email"]);
  var fromBody = (body && (body.userEmail || body.useremail)) || "";
  return (fromHeader || fromBody).trim();
};

var isNotFoundError = function(err) {
  return err && typeof err.message === "string" && (
    err.message.indexOf("no rows") >= 0 ||
    err.message.indexOf("not found") >= 0 ||
    err.message.indexOf("empty result") >= 0
  );
};

var findOne = function(collection, filter, params) {
  try {
    return $app.findFirstRecordByFilter(collection, filter, params || {});
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
};

var findById = function(collection, id) {
  try {
    return $app.findRecordById(collection, id);
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
};

var collectionHasField = function(collection, fieldName) {
  var cacheKey = collection + ":" + fieldName;
  if (Object.prototype.hasOwnProperty.call(COLLECTION_FIELD_CACHE, cacheKey)) {
    return COLLECTION_FIELD_CACHE[cacheKey];
  }
  try {
    var model = $app.findCollectionByNameOrId(collection);
    var names = model.fields.fieldNames();
    var exists = names.indexOf(fieldName) >= 0;
    COLLECTION_FIELD_CACHE[cacheKey] = exists;
    return exists;
  } catch (_) {
    COLLECTION_FIELD_CACHE[cacheKey] = false;
    return false;
  }
};

var elementHasField = function(fieldName) {
  return collectionHasField(ELEMENTS_COLLECTION, fieldName);
};

var isConstraintError = function(err) {
  if (!err || typeof err.message !== "string") return false;
  if (err.message.indexOf("UNIQUE") >= 0) return true;
  if (err.message.indexOf("unique") >= 0) return true;
  if (err.message.indexOf("validation_not_unique") >= 0) return true;
  if (err.code === "validation_not_unique") return true;
  if (err.statusCode === 400 || err.status === 400) {
    var source = err.data || err.errors || err.raw || {};
    if (typeof source === "object") {
      for (var key in source) {
        if (source[key] && source[key].code === "validation_not_unique") return true;
        if (source[key] && typeof source[key] === "string" && source[key].indexOf("unique") >= 0) return true;
      }
    }
  }
  return false;
};

var isValidationError = function(err) {
  return err && typeof err.message === "string" && (
    err.message.indexOf("Validation") >= 0 ||
    err.message.indexOf("validation") >= 0
  );
};

var sanitizeText = function(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[<>"'`\\;{}\[\]]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/vbscript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
};

var extractJsonObject = function(text) {
  if (!text || typeof text !== "string") return null;
  // Strip markdown code fences if present
  var cleaned = text
    .replace(/^```\w*\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // fall through to extracting the first JSON object
  }

  var start = text.indexOf("{");
  if (start < 0) return null;
  var depth = 0;
  var end = -1;
  for (var i = start; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_) {
    return null;
  }
};

var responseText = function(res) {
  if (!res) return "";
  if (res.raw) return String(res.raw);
  if (res.body) return toString(res.body);
  return "";
};

var parseElementText = function(content) {
  var parsed = extractJsonObject(content);
  if (!parsed) return null;
  var name = normalizeText(parsed.name, "");
  var description = normalizeText(parsed.description, "");
  if (!name || !description) return null;
  return { name: name, description: description };
};

var buildElementJsonPrompt = function(leftName, rightName) {
  return [
    "You are the element resolver for an Infinite Craft style alchemy game.",
    "Combine the two ingredients into the most natural resulting concept, object, place, force, material, creature, technology, or idea.",
    "Prefer recognizable concise results over poetic random names.",
    "CRITICAL: The result name MUST be different from both input ingredients. Never return one of the ingredients as the answer.",
    "Return JSON only with keys name and description.",
    "Name must be 1-3 words in Title Case.",
    "Description must be one concrete sentence, 8-16 words.",
    "Examples: Water+Water = Lake, Earth+Earth = Mountain, Fire+Fire = Ash, Wind+Wind = Tornado.",
    "Combine: " + leftName + " + " + rightName + "."
  ].join(" ");
};

var requestElementTextViaChat = function(pollenKey, leftName, rightName) {
  try {
    var res = $http.send({
      url: "https://gen.pollinations.ai/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: "Bearer " + pollenKey,
        "Content-Type": "application/json",
        "Pollinations-Safe": "privacy,secrets"
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: [
          {
            role: "system",
            content: "You are an Infinite Craft style element resolver. Return a single JSON object with exactly two keys: \"name\" and \"description\". Do not wrap in markdown code fences and do not include any text outside the JSON. Example: {\"name\":\"Lake\",\"description\":\"A body of still water surrounded by land and sky.\"}"
          },
          {
            role: "user",
            content: buildElementJsonPrompt(leftName, rightName)
          }
        ]
      })
    });

    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      console.log("[requestElementTextViaChat] bad status: " + (res && res.statusCode));
      return null;
    }
    var content = "";
    if (res.json && res.json.choices && res.json.choices[0]) {
      var msg = res.json.choices[0].message;
      content = (msg && msg.content) || "";
    }
    var raw = content || responseText(res);
    var parsed = parseElementText(raw);
    if (!parsed) {
      console.log("[requestElementTextViaChat] unparseable response for " + leftName + " + " + rightName + ": " + raw);
    }
    return parsed;
  } catch (err) {
    console.log("[requestElementTextViaChat] exception for " + leftName + " + " + rightName + ": " + (err && err.message));
    return null;
  }
};

var requestElementTextViaDirectText = function(pollenKey, leftName, rightName) {
  try {
    var prompt = buildElementJsonPrompt(leftName, rightName);
    var res = $http.send({
      url: "https://gen.pollinations.ai/text/" + encodeURIComponent(prompt) + "?model=" + encodeURIComponent(TEXT_MODEL) + "&key=" + encodeURIComponent(pollenKey),
      method: "GET",
      headers: {
        Authorization: "Bearer " + pollenKey
      }
    });
    if (!res || res.statusCode < 200 || res.statusCode >= 300) return null;
    return parseElementText(responseText(res));
  } catch (_) {
    return null;
  }
};

var requestElementText = function(pollenKey, leftName, rightName) {
  return requestElementTextViaChat(pollenKey, leftName, rightName) ||
    requestElementTextViaDirectText(pollenKey, leftName, rightName);
};

var fetchPollinationsUserInfo = function(pollenKey) {
  try {
    var res = $http.send({
      url: "https://enter.pollinations.ai/api/device/userinfo",
      method: "GET",
      headers: {
        Authorization: "Bearer " + pollenKey
      }
    });
    if (!res || res.statusCode < 200 || res.statusCode >= 300) return null;
    return res.json || null;
  } catch (_) {
    return null;
  }
};

var getCachedIdentity = function(pollenKey) {
  var cached = IDENTITY_CACHE[pollenKey];
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    delete IDENTITY_CACHE[pollenKey];
    return null;
  }
  return cached;
};

var setCachedIdentity = function(pollenKey, identity) {
  IDENTITY_CACHE[pollenKey] = {
    email: identity.email,
    displayName: identity.displayName,
    picture: identity.picture || "",
    expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS
  };
};

var resolveDisplayName = function(info) {
  if (!info || typeof info !== "object") return "Pollinations user";
  return info.name || info.preferred_username || "Pollinations user";
};

var resolveIdentity = function(e, body) {
  var pollenKey = readPollenKey(e, body);
  var requestedEmail = normalizeEmail(readUserEmail(e, body));
  if (!pollenKey) {
    throw new BadRequestError("Missing Pollinations key", {});
  }
  if (!requestedEmail) {
    throw new BadRequestError("Missing user email", {});
  }

  var cached = getCachedIdentity(pollenKey);
  if (cached) {
    if (cached.email === requestedEmail) {
      return {
        email: cached.email,
        displayName: cached.displayName,
        picture: cached.picture || ""
      };
    }
    throw new ForbiddenError("Pollinations identity mismatch", {});
  }

  var info = fetchPollinationsUserInfo(pollenKey);
  var verifiedEmail = normalizeEmail((info && info.email) || "");
  if (!verifiedEmail) {
    throw new UnauthorizedError("Pollinations identity unavailable", {});
  }
  if (verifiedEmail !== requestedEmail) {
    throw new ForbiddenError("Pollinations identity mismatch", {});
  }

  var identity = {
    email: verifiedEmail,
    displayName: resolveDisplayName(info),
    picture: (info && info.picture) || ""
  };
  setCachedIdentity(pollenKey, identity);
  return identity;
};

var upsertProfile = function(identity) {
  var record = findOne(PROFILES_COLLECTION, "email = {:email}", { email: identity.email });
  if (!record) {
    var collection = $app.findCollectionByNameOrId(PROFILES_COLLECTION);
    record = new Record(collection);
    record.set("email", identity.email);
  }
  record.set("display_name", identity.displayName);
  if (identity.picture) {
    var pictureUrl = String(identity.picture).trim();
    var isHttps = /^https:\/\//i.test(pictureUrl);
    if (isHttps) {
      try {
        record.set("avatar", $filesystem.fileFromURL(pictureUrl, 10));
      } catch (_) {
        // avatar download failed
      }
    }
  }
  try {
    $app.save(record);
  } catch (err) {
    if (isConstraintError(err)) {
      record = findOne(PROFILES_COLLECTION, "email = {:email}", { email: identity.email });
      if (!record) throw err;
      return record;
    }
    throw err;
  }
  return record;
};

var loadProfileById = function(profileId) {
  return profileId ? findById(PROFILES_COLLECTION, profileId) : null;
};

var ensureSystemProfile = function() {
  var record = findOne(PROFILES_COLLECTION, "email = {:email}", { email: SYSTEM_PROFILE_EMAIL });
  if (!record) {
    var collection = $app.findCollectionByNameOrId(PROFILES_COLLECTION);
    record = new Record(collection);
    record.set("email", SYSTEM_PROFILE_EMAIL);
    record.set("display_name", SYSTEM_PROFILE_NAME);
    try {
      $app.save(record);
    } catch (err) {
      if (isConstraintError(err)) {
        record = findOne(PROFILES_COLLECTION, "email = {:email}", { email: SYSTEM_PROFILE_EMAIL });
        if (!record) throw err;
      } else {
        throw err;
      }
    }
  }
  return record;
};

var loadElementBySlug = function(slug) {
  if (!slug || !elementHasField("slug")) return null;
  return findOne(ELEMENTS_COLLECTION, "slug = {:slug}", { slug: slug });
};

var loadElementByName = function(name) {
  return name ? findOne(ELEMENTS_COLLECTION, "name = {:name}", { name: name }) : null;
};

var loadSeedElement = function(seed) {
  return loadElementBySlug(seed.slug) || loadElementByName(seed.name);
};

var loadElementByKey = function(value) {
  if (typeof value !== "string") return null;
  var raw = value.trim();
  if (!raw) return null;

  var byId = findById(ELEMENTS_COLLECTION, raw);
  if (byId) return byId;

  var normalized = normalizeSlug(raw);
  var bySlug = loadElementBySlug(normalized);
  if (bySlug) return bySlug;

  var byExactName = loadElementByName(raw);
  if (byExactName) return byExactName;

  for (var i = 0; i < SEED_ELEMENTS.length; i++) {
    if (SEED_ELEMENTS[i].slug === normalized) {
      return loadElementByName(SEED_ELEMENTS[i].name);
    }
  }
  return null;
};

var findElementByIngredients = function(ingredients) {
  if (!ingredients || ingredients.length < 1) return null;
  var filter = "ingridients ?= {:first}";
  var params = { first: ingredients[0] };
  if (ingredients.length === 2) {
    filter += " && ingridients ?= {:second}";
    params.second = ingredients[1];
  }

  var candidates = [];
  try {
    candidates = $app.findRecordsByFilter(ELEMENTS_COLLECTION, filter, "", 50, 0, params);
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }

  var expected = ingredients.join("|");
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    if (!candidate) continue;
    if (isSeedElement(candidate)) {
      console.log("[findElementByIngredients] skipping seed candidate: " + candidate.getString("name"));
      continue;
    }
    var current = normalizeIngredients(candidate.getStringSlice("ingridients"));
    if (current.join("|") === expected) {
      console.log("[findElementByIngredients] found candidate: " + candidate.getString("name") + " ingredients=[" + current.join(",") + "]");
      return candidate;
    }
  }

  // Fallback: legacy single-item same-element recipes (e.g., [A] instead of [A,A])
  if (ingredients.length === 2 && ingredients[0] === ingredients[1]) {
    var single = ingredients[0];
    var legacyFilter = "ingridients ?= {:first}";
    var legacyParams = { first: single };
    var legacyCandidates = [];
    try {
      legacyCandidates = $app.findRecordsByFilter(ELEMENTS_COLLECTION, legacyFilter, "", 50, 0, legacyParams);
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
    for (var j = 0; j < legacyCandidates.length; j++) {
      var legacy = legacyCandidates[j];
      if (!legacy || isSeedElement(legacy)) continue;
      var legacyCurrent = normalizeIngredients(legacy.getStringSlice("ingridients"));
      if (legacyCurrent.length === 1 && legacyCurrent[0] === single) return legacy;
    }
  }
  return null;
};

var ensureInventoryItem = function(profileId, elementId) {
  if (!profileId || !elementId) return null;
  var existing = findOne(
    INVENTORY_COLLECTION,
    "profile = {:profile} && element = {:element}",
    { profile: profileId, element: elementId }
  );
  if (existing) return existing;
  var collection = $app.findCollectionByNameOrId(INVENTORY_COLLECTION);
  var record = new Record(collection);
  record.set("profile", profileId);
  record.set("element", elementId);
  try {
    $app.saveNoValidate(record);
  } catch (err) {
    if (!isConstraintError(err)) throw err;
    existing = findOne(
      INVENTORY_COLLECTION,
      "profile = {:profile} && element = {:element}",
      { profile: profileId, element: elementId }
    );
    if (existing) return existing;
    throw err;
  }
  return record;
};

var seedIngredientIds = function(record, previousSeedRecord) {
  // Seed elements have no recipe; they are starting ingredients.
  return [];
};

var seedRecordId = function(seed) {
  var base = normalizeSlug(seed.slug || seed.name).replace(/-/g, "");
  var value = "seed" + base;
  while (value.length < 15) value += "0";
  return value.slice(0, 15);
};

var prepareSeedIngredients = function(record, previousSeedRecord) {
  // Seed records are bootstrap data. Use unique two-item placeholders after
  // creation so same-element recipes can safely use a one-item recipe array.
  record.set("ingridients", seedIngredientIds(record, previousSeedRecord));
};

var saveSeedRecord = function(record, previousSeedRecord) {
  prepareSeedIngredients(record, previousSeedRecord);
  try {
    $app.saveNoValidate(record);
  } catch (err) {
    if (!isConstraintError(err)) throw err;
  }
};

var ensureSeedElementMetadata = function(record, seed, systemProfile, previousSeedRecord) {
  var changed = false;
  if (elementHasField("discoverer") && !record.getString("discoverer")) {
    record.set("discoverer", systemProfile.id);
    changed = true;
  }
  if (elementHasField("slug") && !record.getString("slug")) {
    record.set("slug", seed.slug);
    changed = true;
  }
  var currentIngredients = normalizeIngredients(record.getStringSlice("ingridients"));
  var desiredIngredients = seedIngredientIds(record, previousSeedRecord);
  if (currentIngredients.join("|") !== desiredIngredients.join("|")) {
    record.set("ingridients", desiredIngredients);
    changed = true;
  }
  if (changed) {
    try {
      saveSeedRecord(record, previousSeedRecord);
    } catch (err) {
      if (!isConstraintError(err)) throw err;
    }
  }
  return record;
};

var ensureSeedElements = function(profile) {
  var systemProfile = ensureSystemProfile();
  var seeds = [];
  for (var i = 0; i < SEED_ELEMENTS.length; i++) {
    var seed = SEED_ELEMENTS[i];
    var previousSeedRecord = seeds.length > 0 ? seeds[seeds.length - 1] : null;
    var record = loadSeedElement(seed);
    if (!record) {
      var collection = $app.findCollectionByNameOrId(ELEMENTS_COLLECTION);
      record = new Record(collection);
      record.set("id", seedRecordId(seed));
      record.set("name", seed.name);
      record.set("description", seed.description);
      record.set("discoverer", systemProfile.id);
      prepareSeedIngredients(record, previousSeedRecord);
      if (elementHasField("slug")) {
        record.set("slug", seed.slug);
      }
      try {
        $app.saveNoValidate(record);
        saveSeedRecord(record, previousSeedRecord);
      } catch (err) {
        if (isConstraintError(err)) {
          record = loadSeedElement(seed);
          if (!record) throw err;
        } else {
          throw err;
        }
      }
    } else {
      try {
        record = ensureSeedElementMetadata(record, seed, systemProfile, previousSeedRecord);
      } catch (err) {
        if (!isConstraintError(err)) throw err;
        record = loadSeedElement(seed);
        if (!record) throw err;
      }
    }
    ensureInventoryItem(profile.id, record.id);
    seeds.push(record);
  }
  return seeds;
};

var exportRecord = function(record) {
  var exported = record.publicExport();
  exported.collectionId = record.collection().id;
  exported.collectionName = record.collection().name;
  return exported;
};

var buildElementResponse = function(record, discovererDisplayName) {
  var exported = exportRecord(record);
  exported.discovererDisplayName = discovererDisplayName;
  return exported;
};

var profileFirstDiscoveryCount = function(profileId) {
  if (!profileId) return 0;
  try {
    return $app.findRecordsByFilter(
      ELEMENTS_COLLECTION,
      "discoverer = {:profile}",
      "",
      0,
      0,
      { profile: profileId }
    ).length;
  } catch (err) {
    if (isNotFoundError(err)) return 0;
    throw err;
  }
};

var returnExistingElement = function(e, profile, identity, record) {
  var discovererId = record.getString("discoverer");
  var discovererProfile = loadProfileById(discovererId);
  var discovererDisplayName = discovererProfile
    ? discovererProfile.getString("display_name")
    : identity.displayName;
  ensureInventoryItem(profile.id, record.id);
  return e.json(200, {
    element: buildElementResponse(record, discovererDisplayName),
    firstDiscovery: false,
    source: "global-cache"
  });
};

var hasInInventory = function(profileId, elementId) {
  if (!profileId || !elementId) return false;
  return !!findOne(
    INVENTORY_COLLECTION,
    "profile = {:profile} && element = {:element}",
    { profile: profileId, element: elementId }
  );
};

var isSeedElement = function(record) {
  if (!record) return false;
  var name = (record.getString("name") || "").trim().toLowerCase();
  var slug = elementHasField("slug") ? (record.getString("slug") || "").trim().toLowerCase() : "";
  return SEED_NAMES.indexOf(name) >= 0 || SEED_NAMES.indexOf(slug) >= 0;
};

var validateElement = function(e) {
  if (!e.record) {
    return e.next();
  }

  var ingredients = normalizeIngredients(e.record.getStringSlice("ingridients"));
  var seedRecord = isSeedElement(e.record);
  if (seedRecord && ingredients.length <= 2) {
    // Leave seed bootstrap ingredients untouched. They are internal placeholders,
    // not player-facing crafted recipes.
  } else {
    if (ingredients.length < 1 || ingredients.length > 2) {
      throw new ValidationError("ingridients", "One or two ingridients are required.");
    }
    e.record.set("ingridients", ingredients);
  }

  var discoverer = e.record.getString(DISCOVERER_FIELD);
  if (!discoverer) {
    throw new ValidationError(DISCOVERER_FIELD, "Discoverer is required.");
  }

  var original = e.record.original();
  if (original) {
    var originalIngredients = normalizeIngredients(original.getStringSlice("ingridients"));
    if (originalIngredients.length > 0 && originalIngredients.join("|") !== ingredients.join("|")) {
      throw new ValidationError("ingridients", "Ingridients cannot be changed once set.");
    }
    var originalDiscoverer = original.getString(DISCOVERER_FIELD);
    if (originalDiscoverer && originalDiscoverer !== discoverer) {
      throw new ValidationError(DISCOVERER_FIELD, "Discoverer cannot be changed.");
    }
  }

  return e.next();
};

var craft = function(e) {
  var data = new DynamicModel({
    leftId: "",
    rightId: "",
    userEmail: "",
    pollenKey: ""
  });
  e.bindBody(data);

  var leftId = String(data.leftId || data.leftid || "");
  var rightId = String(data.rightId || data.rightid || "");
  var identity = resolveIdentity(e, data);
  var pollenKey = readPollenKey(e, data);

  if (!leftId || !rightId) {
    throw new BadRequestError("Missing ingredients", {});
  }

  var profile = upsertProfile(identity);
  ensureSeedElements(profile);

  var leftRecord = loadElementByKey(leftId);
  var rightRecord = loadElementByKey(rightId);
  if (!leftRecord || !rightRecord) {
    throw new BadRequestError("Unknown ingredients", {});
  }

  if (!hasInInventory(profile.id, leftRecord.id)) {
    throw new ForbiddenError("You do not own the left ingredient", {});
  }
  if (!hasInInventory(profile.id, rightRecord.id)) {
    throw new ForbiddenError("You do not own the right ingredient", {});
  }

  var ingredients = normalizeRecipeIngredients(leftRecord.id, rightRecord.id);
  if (ingredients.length < 1 || ingredients.length > 2) {
    throw new BadRequestError("Invalid ingredients", {});
  }

  var leftName = leftRecord.getString("name") || leftId;
  var rightName = rightRecord.getString("name") || rightId;

  var existing = findElementByIngredients(ingredients);
  if (existing) {
    var existingName = (existing.getString("name") || "").trim().toLowerCase();
    var isSameElement = ingredients.length === 1;
    var matchesInput = existingName === leftName.toLowerCase() || existingName === rightName.toLowerCase();
    if (isSameElement && matchesInput) {
      console.log("[craft] same-element cache hit rejected: " + existing.getString("name") + " matches input, forcing AI");
    } else {
      return returnExistingElement(e, profile, identity, existing);
    }
  }

  var key = ingredients.join("+");
  var aiText = requestElementText(pollenKey, leftName, rightName);
  if (!aiText) {
    console.log("[craft] AI generation failed for pair: " + leftName + " + " + rightName);
    throw new InternalServerError("Element generation failed", {});
  }
  var name = sanitizeText(aiText.name);
  var description = sanitizeText(aiText.description);
  if (!name || !description) {
    throw new InternalServerError("Element generation failed", {});
  }
  var existingByName = loadElementByName(name);
  if (existingByName && !isSeedElement(existingByName)) {
    return returnExistingElement(e, profile, identity, existingByName);
  }
  var slug = normalizeSlug(name + "-" + hashString(key).toString(36));
  var prompt = buildPrompt(name, leftName, rightName);
  var imageUrl = "https://gen.pollinations.ai/image/" + encodeURIComponent(prompt) + "?model=" + encodeURIComponent(IMAGE_MODEL) + "&key=" + encodeURIComponent(pollenKey);

  var collection = $app.findCollectionByNameOrId(ELEMENTS_COLLECTION);
  var record = new Record(collection);
  record.set("name", name);
  record.set("description", description);
  record.set("discoverer", profile.id);
  record.set("ingridients", ingredients);
  if (elementHasField("slug")) {
    record.set("slug", slug);
  }
  if (elementHasField("image")) {
    try {
      record.set("image", $filesystem.fileFromURL(imageUrl, 30));
    } catch (_) {
      // image generation/download failed; keep the crafted element text-only
    }
  }

  console.log("[craft] saving new element: name=" + name + " ingredients=[" + ingredients.join(",") + "] discoverer=" + profile.id);

  // Temporarily relax ingridients minSelect so same-element recipes (single item) can be saved
  var ingridientsField = null;
  for (var i = 0; i < collection.fields.length; i++) {
    if (collection.fields[i].name === "ingridients") {
      ingridientsField = collection.fields[i];
      break;
    }
  }
  var savedMinSelect = null;
  if (ingridientsField) {
    savedMinSelect = ingridientsField.minSelect;
    ingridientsField.minSelect = 0;
  }

  try {
    $app.saveNoValidate(record);
  } catch (saveErr) {
    console.log("[craft] saveNoValidate error: " + (saveErr && saveErr.message));
    if (!isConstraintError(saveErr)) {
      throw new InternalServerError("Crafting failed: " + (saveErr && saveErr.message), {});
    }

    var cached = findElementByIngredients(ingredients);
    if (cached) {
      return returnExistingElement(e, profile, identity, cached);
    }

    var namedCached = loadElementByName(name);
    if (namedCached) {
      return returnExistingElement(e, profile, identity, namedCached);
    }
    throw new InternalServerError("Crafting failed", {});
  } finally {
    if (ingridientsField && savedMinSelect !== null) {
      ingridientsField.minSelect = savedMinSelect;
    }
  }

  ensureInventoryItem(profile.id, record.id);
  return e.json(200, {
    element: buildElementResponse(record, identity.displayName),
    firstDiscovery: true,
    source: "ai-sim"
  });
};

var inventory = function(e) {
  var data = new DynamicModel({
    userEmail: "",
    pollenKey: ""
  });
  e.bindBody(data);

  var identity = resolveIdentity(e, data);
  var profile = upsertProfile(identity);
  ensureSeedElements(profile);

  var items = arrayOf(new Record());
  $app.recordQuery(INVENTORY_COLLECTION)
    .where($dbx.exp("profile = {:profile}", { profile: profile.id }))
    .all(items);

  var elements = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var elementId = item.getString("element");
    if (!elementId) continue;
    var element = findById(ELEMENTS_COLLECTION, elementId);
    if (!element) continue;
    var discovererId = element.getString("discoverer");
    var discovererProfile = loadProfileById(discovererId);
    var discovererDisplayName = discovererProfile
      ? discovererProfile.getString("display_name")
      : identity.displayName;
    elements.push(buildElementResponse(element, discovererDisplayName));
  }

  return e.json(200, { elements: elements, firstDiscoveryCount: profileFirstDiscoveryCount(profile.id) });
};

module.exports = {
  craft: craft,
  inventory: inventory,
  validateElement: validateElement
};
