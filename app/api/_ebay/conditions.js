// eBay condition descriptors for trading cards.
//
// Source of truth is the Commerce/Sell Metadata API method getItemConditionPolicies,
// which returns, per category: the allowed ConditionIDs and, for each, the
// condition descriptors (numeric Name IDs) and their allowed values (numeric
// Value IDs). Those numeric IDs are exactly what Trading API AddItem expects
// inside ConditionDescriptorType (Name / Value / AdditionalInfo).
//
// Nothing here is hardcoded to a grader list: the IDs are pulled live and matched
// by the abbreviation eBay puts in parentheses ("... (PSA)"), so new graders eBay
// adds start working without a code change.
//
// Docs:
//   https://developer.ebay.com/api-docs/commerce-metadata/resources/item_condition_policy/methods/getItemConditionPolicies
//   https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/types/ConditionDescriptorType.html

import { getAppToken, EBAY_API_BASE, SCOPE_BASE } from './token.js';

// eBay ConditionIDs used by card categories.
export const CONDITION_ID = {
  GRADED: '2750',
  USED: '3000',
  UNGRADED: '4000',
};

// Descriptor Name IDs (stable across card categories).
export const DESCRIPTOR_ID = {
  PROFESSIONAL_GRADER: '27501',
  GRADE: '27502',
  CERTIFICATION_NUMBER: '27503',
  CARD_CONDITION: '40001',
};

// Common leaf categories. 261328 = Sports Trading Card Singles,
// 183454 = CCG Individual Cards (Pokemon/MTG/etc).
export const CATEGORY = {
  SPORTS_SINGLES: '261328',
  CCG_SINGLES: '183454',
};

const POLICY_TTL_MS = 24 * 60 * 60 * 1000; // policies change rarely
const policyCache = new Map(); // `${marketplaceId}:${categoryId}` -> { at, policy }

/**
 * Fetch the item condition policy for one category, cached for 24h.
 * @returns {Promise<object|null>} the itemConditionPolicies[0] entry, or null
 */
export async function getConditionPolicy(categoryId, marketplaceId = 'EBAY_US') {
  const key = `${marketplaceId}:${categoryId}`;
  const hit = policyCache.get(key);
  if (hit && Date.now() - hit.at < POLICY_TTL_MS) return hit.policy;

  const token = await getAppToken(SCOPE_BASE);
  const url =
    `${EBAY_API_BASE}/sell/metadata/v1/marketplace/${encodeURIComponent(marketplaceId)}` +
    `/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`getItemConditionPolicies ${res.status}`);
  const data = await res.json();
  const policy = data?.itemConditionPolicies?.[0] || null;

  policyCache.set(key, { at: Date.now(), policy });
  return policy;
}

function findCondition(policy, conditionId) {
  return (policy?.itemConditions || []).find((c) => String(c.conditionId) === String(conditionId)) || null;
}

function findDescriptor(condition, descriptorId) {
  return (condition?.conditionDescriptors || []).find(
    (d) => String(d.conditionDescriptorId) === String(descriptorId)
  ) || null;
}

// "Professional Sports Authenticator (PSA)" -> "PSA"
function abbrevOf(name) {
  const m = /\(([^)]+)\)\s*$/.exec(name || '');
  return m ? m[1].trim().toUpperCase() : null;
}

const norm = (s) => String(s ?? '').trim().toUpperCase();

// Collector shorthand that is ambiguous against eBay's full grader names.
// Without this, a bare "Beckett" fuzzy-matches "Beckett Vintage Grading (BVG)"
// before "Beckett Grading Services (BGS)", which is the wrong slab and a
// materially different comp. Resolved to the abbreviation first, always.
const GRADER_ALIASES = {
  BECKETT: 'BGS',
  'BECKETT GRADING': 'BGS',
  'BECKETT GRADING SERVICES': 'BGS',
  'BECKETT VINTAGE': 'BVG',
  'BECKETT COLLECTORS CLUB': 'BCCG',
  'PSA/DNA': 'PSA',
  'PROFESSIONAL SPORTS AUTHENTICATOR': 'PSA',
  'SPORTSCARD GUARANTY': 'SGC',
  'CERTIFIED GUARANTY': 'CGC',
  'CERTIFIED GUARANTY COMPANY': 'CGC',
  'CERTIFIED SPORTS GUARANTY': 'CSG',
  'GEM MINT': 'GMA',
  'HYBRID GRADING': 'HGA',
  'INTERNATIONAL SPORTS AUTHENTICATION': 'ISA',
  'TECHNICAL AUTHENTICATION': 'TAG',
  'AUTOMATED GRADING': 'AGS',
};

/**
 * Resolve a grader name/abbreviation ("PSA", "Beckett", "bgs") to its numeric
 * conditionDescriptorValueId for descriptor 27501.
 * @returns {{id:string,name:string}|null}
 */
export function resolveGrader(policy, grader) {
  const raw = norm(grader);
  if (!raw) return null;
  const want = GRADER_ALIASES[raw] || raw;
  const desc = findDescriptor(findCondition(policy, CONDITION_ID.GRADED), DESCRIPTOR_ID.PROFESSIONAL_GRADER);
  const values = desc?.conditionDescriptorValues || [];

  // 1) exact abbreviation match — the common path ("PSA", "BGS", "SGC")
  for (const v of values) {
    if (abbrevOf(v.conditionDescriptorValueName) === want) {
      return { id: String(v.conditionDescriptorValueId), name: v.conditionDescriptorValueName };
    }
  }
  // 2) exact full-name match
  for (const v of values) {
    if (norm(v.conditionDescriptorValueName) === want) {
      return { id: String(v.conditionDescriptorValueId), name: v.conditionDescriptorValueName };
    }
  }
  // 3) substring match, longest first so "Beckett Grading Services (BGS)" wins
  //    over "Beckett Vintage Grading (BVG)" for a bare "Beckett"
  const subs = values
    .filter((v) => norm(v.conditionDescriptorValueName).includes(want))
    .sort((a, b) => a.conditionDescriptorValueName.length - b.conditionDescriptorValueName.length);
  if (subs.length) {
    return { id: String(subs[0].conditionDescriptorValueId), name: subs[0].conditionDescriptorValueName };
  }
  return null;
}

/**
 * Resolve a grade ("10", 9.5, "PSA 10", "Authentic") to its numeric value ID
 * for descriptor 27502.
 * @returns {{id:string,name:string}|null}
 */
export function resolveGrade(policy, grade) {
  let want = norm(grade);
  if (!want) return null;
  // Tolerate "PSA 10" / "GRADE 9.5" being passed in whole.
  const numeric = /(\d+(?:\.\d+)?)\s*$/.exec(want);
  const desc = findDescriptor(findCondition(policy, CONDITION_ID.GRADED), DESCRIPTOR_ID.GRADE);
  const values = desc?.conditionDescriptorValues || [];

  if (numeric) {
    const n = parseFloat(numeric[1]);
    for (const v of values) {
      const vn = parseFloat(v.conditionDescriptorValueName);
      if (!Number.isNaN(vn) && vn === n) {
        return { id: String(v.conditionDescriptorValueId), name: v.conditionDescriptorValueName };
      }
    }
    return null;
  }
  // Non-numeric grades: "Authentic", "Authentic - Trimmed", "Sample"
  for (const v of values) {
    if (norm(v.conditionDescriptorValueName) === want) {
      return { id: String(v.conditionDescriptorValueId), name: v.conditionDescriptorValueName };
    }
  }
  for (const v of values) {
    if (norm(v.conditionDescriptorValueName).includes(want)) {
      return { id: String(v.conditionDescriptorValueId), name: v.conditionDescriptorValueName };
    }
  }
  return null;
}

/**
 * Resolve an ungraded card condition ("Near Mint", "NM", "Excellent", "Poor")
 * to its numeric value ID for descriptor 40001.
 */
export function resolveCardCondition(policy, condition) {
  const want = norm(condition);
  if (!want) return null;
  const desc = findDescriptor(findCondition(policy, CONDITION_ID.UNGRADED), DESCRIPTOR_ID.CARD_CONDITION);
  const values = desc?.conditionDescriptorValues || [];

  // Map the vocabulary collectors actually use onto eBay's four buckets.
  const aliases = [
    [/^(NM|NM-MT|NEAR MINT|MINT|GEM MINT|PACK FRESH|NEAR MINT OR BETTER)/, 'NEAR MINT OR BETTER'],
    [/^(EX|EXCELLENT|LIGHTLY PLAYED|LP)/, 'EXCELLENT'],
    [/^(VG|VERY GOOD|GOOD|MODERATELY PLAYED|MP|PLAYED)/, 'VERY GOOD'],
    [/^(POOR|PR|HEAVILY PLAYED|HP|DAMAGED|FAIR)/, 'POOR'],
  ];
  let target = want;
  for (const [re, canonical] of aliases) {
    if (re.test(want)) { target = canonical; break; }
  }
  for (const v of values) {
    if (norm(v.conditionDescriptorValueName) === target) {
      return { id: String(v.conditionDescriptorValueId), name: v.conditionDescriptorValueName };
    }
  }
  return null;
}

/**
 * Build the ConditionDescriptorType payload for a card.
 *
 * Per ConditionDescriptorType: Name is the numeric descriptor ID (required),
 * Value holds numeric value IDs (0..*), and AdditionalInfo is the ONLY free-text
 * field (0..1) — which is where a certification number belongs.
 *
 * @param {object} card {graded, grader, grade, certNumber, condition}
 * @returns {Promise<{conditionId:string, descriptors:Array, warnings:string[]}>}
 */
export async function buildConditionDescriptors(card, categoryId = CATEGORY.SPORTS_SINGLES, marketplaceId = 'EBAY_US') {
  const policy = await getConditionPolicy(categoryId, marketplaceId);
  const warnings = [];
  const descriptors = [];

  const isGraded = Boolean(card?.graded ?? (card?.grader && card?.grade));

  if (isGraded) {
    const grader = resolveGrader(policy, card.grader);
    const grade = resolveGrade(policy, card.grade);

    if (grader) {
      descriptors.push({ name: DESCRIPTOR_ID.PROFESSIONAL_GRADER, values: [grader.id], label: grader.name });
    } else {
      warnings.push(`Unrecognised grader "${card.grader}" — eBay requires descriptor 27501 for graded cards.`);
    }
    if (grade) {
      descriptors.push({ name: DESCRIPTOR_ID.GRADE, values: [grade.id], label: grade.name });
    } else {
      warnings.push(`Unrecognised grade "${card.grade}" — eBay requires descriptor 27502 for graded cards.`);
    }
    if (card.certNumber) {
      // FREE_TEXT descriptor: no Value, the number goes in AdditionalInfo.
      descriptors.push({
        name: DESCRIPTOR_ID.CERTIFICATION_NUMBER,
        values: [],
        additionalInfo: String(card.certNumber).trim(),
      });
    }
    return { conditionId: CONDITION_ID.GRADED, descriptors, warnings, policyCategoryId: categoryId };
  }

  const cardCondition = resolveCardCondition(policy, card?.condition);
  if (cardCondition) {
    descriptors.push({ name: DESCRIPTOR_ID.CARD_CONDITION, values: [cardCondition.id], label: cardCondition.name });
  } else {
    warnings.push(`Unrecognised card condition "${card?.condition}" — eBay requires descriptor 40001 for ungraded cards.`);
  }
  return { conditionId: CONDITION_ID.UNGRADED, descriptors, warnings, policyCategoryId: categoryId };
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Serialise descriptors into the Trading API AddItem XML block.
 * Returns '' when there is nothing to send, so it is safe to interpolate.
 */
export function buildConditionDescriptorsXml(descriptors = []) {
  if (!descriptors.length) return '';
  const body = descriptors
    .map((d) => {
      const values = (d.values || []).map((v) => `      <Value>${esc(v)}</Value>`).join('\n');
      const extra = d.additionalInfo ? `      <AdditionalInfo>${esc(d.additionalInfo)}</AdditionalInfo>` : '';
      return [`    <ConditionDescriptor>`, `      <Name>${esc(d.name)}</Name>`, values, extra, `    </ConditionDescriptor>`]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  return `  <ConditionDescriptors>\n${body}\n  </ConditionDescriptors>`;
}

/** Flattened view of a category's descriptors, for UI dropdowns. */
export async function getCardConditionOptions(categoryId = CATEGORY.SPORTS_SINGLES, marketplaceId = 'EBAY_US') {
  const policy = await getConditionPolicy(categoryId, marketplaceId);
  const pick = (conditionId, descriptorId) => {
    const d = findDescriptor(findCondition(policy, conditionId), descriptorId);
    return (d?.conditionDescriptorValues || []).map((v) => ({
      id: String(v.conditionDescriptorValueId),
      name: v.conditionDescriptorValueName,
      abbrev: abbrevOf(v.conditionDescriptorValueName),
    }));
  };
  return {
    categoryId,
    marketplaceId,
    conditionRequired: Boolean(policy?.itemConditionRequired),
    graders: pick(CONDITION_ID.GRADED, DESCRIPTOR_ID.PROFESSIONAL_GRADER),
    grades: pick(CONDITION_ID.GRADED, DESCRIPTOR_ID.GRADE),
    cardConditions: pick(CONDITION_ID.UNGRADED, DESCRIPTOR_ID.CARD_CONDITION),
  };
}
