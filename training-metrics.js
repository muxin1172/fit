/* P1-4: pure helpers; no record mutations or persisted PR flags.
 * evaluatePR(records, record, set | setIndex): call BEFORE inserting a new set.
 * Also accepts {record, set, setIndex}; existing candidates compare predecessors.
 * First eligible set establishes a baseline, with no PR toast or badge.
 * getPRs(records) returns chronological {recordId,setIndex,...result} rows.
 * buildPRIndex(records) is a Map keyed by key(recordId,setIndex).
 * estimate1RM(set) returns a number in that set's kg/lb unit, or null.
 */
(function (root) {
  'use strict';
  const text = value => String(value ?? '').trim();
  const number = value => value === null || value === undefined || value === '' || typeof value === 'boolean' ? NaN : Number(value);
  function eligible(set) {
    return !!set && set.verified === true && !set.plus && !!text(set.unit) &&
      Number.isFinite(number(set.weight)) && number(set.weight) > 0 &&
      Number.isInteger(number(set.reps)) && number(set.reps) > 0;
  }
  function epley(weight, reps) {
    const w = number(weight), r = number(reps);
    return Number.isFinite(w) && w > 0 && Number.isInteger(r) && r > 0 && r <= 12 ? w * (1 + r / 30) : null;
  }
  function estimate1RM(set) {
    return eligible(set) && ['kg', 'lb'].includes(text(set.unit)) ? epley(set.weight, set.reps) : null;
  }
  const key = (recordId, setIndex) => `${recordId}:${setIndex}`;
  const groupKey = (record, set) => JSON.stringify([text(record.name), text(record.muscle), text(set.unit)]);
  function entries(records) {
    return (Array.isArray(records) ? records : []).filter(Boolean)
      .map((record, index) => ({record, index}))
      .sort((a, b) => text(a.record.date).localeCompare(text(b.record.date)) ||
        (Number(a.record.createdAt) || Date.parse(a.record.createdAt) || 0) -
        (Number(b.record.createdAt) || Date.parse(b.record.createdAt) || 0) || a.index - b.index)
      .flatMap(({record}) => (Array.isArray(record.sets) ? record.sets : []).map((set, setIndex) => ({record, set, setIndex})));
  }
  function result(set, previous) {
    const valid = eligible(set), weight = number(set?.weight), reps = number(set?.reps);
    const previousWeight = previous?.weight ?? null;
    const previousReps = previous?.reps.get(weight) ?? null;
    const weightPR = valid && previousWeight !== null && weight > previousWeight;
    const repsPR = valid && previousReps !== null && reps > previousReps;
    return {isPR: weightPR || repsPR, weightPR, repsPR,
      kind: weightPR ? 'weight' : repsPR ? 'reps' : null,
      previousWeight, previousReps, estimated1RM: estimate1RM(set)};
  }
  function remember(groups, record, set) {
    if (!eligible(set) || !text(record.name) || !text(record.muscle)) return;
    const id = groupKey(record, set), weight = number(set.weight), reps = number(set.reps);
    const previous = groups.get(id) || {weight: -Infinity, reps: new Map()};
    previous.weight = Math.max(previous.weight, weight);
    previous.reps.set(weight, Math.max(previous.reps.get(weight) || 0, reps));
    groups.set(id, previous);
  }
  function evaluatePR(records, context, candidate) {
    const record = context?.record || context || {};
    const setIndex = Number.isInteger(candidate) ? candidate : context?.setIndex;
    const set = candidate && typeof candidate === 'object' ? candidate : context?.set || record.sets?.[setIndex];
    const groups = new Map();
    for (const entry of entries(records)) {
      const sameRecord = entry.record === record || (record.id != null && entry.record.id === record.id);
      if (sameRecord && (entry.set === set || (Number.isInteger(setIndex) && entry.setIndex === setIndex))) break;
      remember(groups, entry.record, entry.set);
    }
    if (!text(record.name) || !text(record.muscle)) return result(null);
    return result(set, set ? groups.get(groupKey(record, set)) : undefined);
  }
  function getPRs(records) {
    const groups = new Map(), badges = [];
    for (const {record, set, setIndex} of entries(records)) {
      if (!text(record.name) || !text(record.muscle)) continue;
      const evaluation = result(set, set ? groups.get(groupKey(record, set)) : undefined);
      if (evaluation.isPR) badges.push({recordId: record.id, setIndex, record, set, ...evaluation});
      remember(groups, record, set);
    }
    return badges;
  }
  function buildPRIndex(records) {
    return new Map(getPRs(records).map(row => [key(row.recordId, row.setIndex), row]));
  }
  root.TrainingMetrics = Object.freeze({eligible, epley, estimate1RM, evaluatePR, getPRs, buildPRIndex, key});
})(typeof window === 'undefined' ? globalThis : window);
