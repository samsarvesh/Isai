/**
 * Phase 0 Dirty Dozen Security Test Specification for SONORA Firestore Rules.
 * Documents the 12 adversarial payloads verified against firestore.rules.
 */

export const DIRTY_DOZEN_CASES = [
  { name: '01-unauthenticated-read', auth: null, op: 'get', path: '/users/user1/cloudTracks/track1', expect: 'PERMISSION_DENIED' },
  { name: '02-cross-user-list', auth: { uid: 'attacker', email_verified: true }, op: 'list', path: '/users/victim/cloudTracks', expect: 'PERMISSION_DENIED' },
  { name: '03-unverified-email-write', auth: { uid: 'user1', email_verified: false }, op: 'create', path: '/users/user1/cloudTracks/track1', expect: 'PERMISSION_DENIED' },
  { name: '04-owner-spoofing', auth: { uid: 'user1', email_verified: true }, op: 'create', payload: { ownerId: 'victim' }, expect: 'PERMISSION_DENIED' },
  { name: '05-id-poisoning', auth: { uid: 'user1', email_verified: true }, op: 'create', path: '/users/user1/cloudTracks/' + 'a'.repeat(150), expect: 'PERMISSION_DENIED' },
  { name: '06-shadow-ghost-field', auth: { uid: 'user1', email_verified: true }, op: 'create', payload: { isAdmin: true }, expect: 'PERMISSION_DENIED' },
  { name: '07-title-length-overflow', auth: { uid: 'user1', email_verified: true }, op: 'update', payload: { title: 'x'.repeat(250) }, expect: 'PERMISSION_DENIED' },
  { name: '08-unbounded-moods-array', auth: { uid: 'user1', email_verified: true }, op: 'create', payload: { moods: new Array(12).fill('Happy') }, expect: 'PERMISSION_DENIED' },
  { name: '09-forged-timestamp', auth: { uid: 'user1', email_verified: true }, op: 'create', payload: { createdAt: '2020-01-01T00:00:00Z' }, expect: 'PERMISSION_DENIED' },
  { name: '10-orphan-audio-chunk', auth: { uid: 'user1', email_verified: true }, op: 'create', path: '/users/user1/cloudTracks/missingTrack/chunks/chunk_0', expect: 'PERMISSION_DENIED' },
  { name: '11-chunk-size-overflow', auth: { uid: 'user1', email_verified: true }, op: 'create', payload: { data: 'A'.repeat(470000) }, expect: 'PERMISSION_DENIED' },
  { name: '12-immutable-chunkcount-tamper', auth: { uid: 'user1', email_verified: true }, op: 'update', payload: { chunkCount: 999 }, expect: 'PERMISSION_DENIED' },
] as const;
