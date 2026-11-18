import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import {
  disableNetwork,
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
      localCache: memoryLocalCache(),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}
export const db = dbInstance;

const QUOTA_LOCK_STORAGE_KEY = 'isai_firestore_write_quota_date_v1';
let writeQuotaExceeded = false;

function getPacificDateKey(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function isCloudWriteQuotaExceeded(): boolean {
  if (writeQuotaExceeded) return true;
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(QUOTA_LOCK_STORAGE_KEY);
    if (!stored) return false;
    if (stored === getPacificDateKey()) {
      writeQuotaExceeded = true;
      return true;
    }
    // New day in Pacific time -> clear previous day's quota lock
    window.localStorage.removeItem(QUOTA_LOCK_STORAGE_KEY);
    return false;
  } catch {
    return false;
  }
}

export function markCloudWriteQuotaExceeded(): void {
  writeQuotaExceeded = true;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(QUOTA_LOCK_STORAGE_KEY, getPacificDateKey());
    } catch {
      // ignore storage errors
    }
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === 'resource-exhausted') return true;
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /resource-exhausted|quota\s*(limit\s*)?exceeded/i.test(msg);
}

export const QUOTA_EXCEEDED_MESSAGE =
  'Daily Firebase Cloud write quota has been reached. Cloud reads and local playback continue normally, and cloud writes will resume after the daily reset.';

export async function withFirestoreWriteGuard<T>(writePromise: Promise<T>, timeoutMs = 10000): Promise<T> {
  if (isCloudWriteQuotaExceeded()) {
    throw new Error(QUOTA_EXCEEDED_MESSAGE);
  }

  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error('__FIRESTORE_WRITE_TIMEOUT__'));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([writePromise, timeoutPromise]);
    if (timer !== undefined) window.clearTimeout(timer);
    return result;
  } catch (err) {
    if (timer !== undefined) window.clearTimeout(timer);
    if (err instanceof Error && err.message === '__FIRESTORE_WRITE_TIMEOUT__') {
      markCloudWriteQuotaExceeded();
      // Reset the active WriteStream connection so the SDK does not keep retrying every 60s
      await disableNetwork(db).catch(() => {});
      await enableNetwork(db).catch(() => {});
      throw new Error(QUOTA_EXCEEDED_MESSAGE);
    }
    if (isQuotaExceededError(err)) {
      markCloudWriteQuotaExceeded();
      throw new Error(QUOTA_EXCEEDED_MESSAGE);
    }
    throw err;
  }
}

const provider = new GoogleAuthProvider();

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'permission-denied') {
      // Expected when signed out or reading the blocked test/connection sentinel path
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore client is currently offline.');
    }
  }
}

void testFirestoreConnection();

export function subscribeToFirebaseAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithFirebaseGoogle(): Promise<User> {
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      throw new Error(
        `Domain "${host}" is not authorized in Firebase Authentication. Add it under Authentication → Settings → Authorized domains in Firebase Console.`
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
    }
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in window was closed before completing Google authentication.');
    }
    throw error;
  }
}

export async function signOutFirebase(): Promise<void> {
  await auth.signOut();
}
