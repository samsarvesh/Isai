# SONORA Firebase Cloud Security Specification

## 1. Data Invariants
1. **User Isolation**: Every `CloudTrack` and `AudioChunk` document lives under `/users/{userId}/cloudTracks/{trackId}` and is strictly accessible only when `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId`.
2. **Master Gate Integrity**: An `AudioChunk` document cannot exist without a valid parent `CloudTrack` document owned by `request.auth.uid` (`exists(/databases/$(database)/documents/users/$(userId)/cloudTracks/$(trackId))`).
3. **Immutable Ownership & File Envelope**: `id`, `ownerId`, `createdAt`, `chunkCount`, `fileSize`, `fileName`, `format`, `mimeType`, and `duplicateKey` cannot be altered after creation.
4. **Strict Payload Boundaries**: Every string, number, array, and document ID path variable is explicitly bounded to match `firebase-blueprint.json`.
5. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time`.

## 2. The "Dirty Dozen" Attack Payloads
1. Unauthenticated read/write on `/users/u1/cloudTracks/t1`.
2. Cross-user read/list/write where `request.auth.uid != userId`.
3. Unverified email (`email_verified == false`) attempting write.
4. Identity spoofing (`ownerId` set to another UID inside payload).
5. Path poisoning (`trackId` longer than 128 chars or containing invalid characters).
6. Ghost field / shadow update (`isAdmin: true` injected on `create` or `update`).
7. Value poisoning (`title` > 200 chars or non-string `duration`).
8. Unbounded array (`moods` list > 8 items or invalid element type).
9. Temporal spoofing (`createdAt` or `updatedAt` forged as client timestamp instead of `request.time`).
10. Orphaned chunk write (`AudioChunk` created when parent `CloudTrack` does not exist).
11. Chunk payload overflow (`data` > 460,000 chars or `index` < 0 / >= 200).
12. Immutable field tampering (modifying `ownerId`, `createdAt`, or `chunkCount` during metadata `update`).
