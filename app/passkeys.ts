import { AppwriteException, ID } from "appwrite";
import { account } from "./appwrite";

// Llaves de acceso (passkeys): entrar con Face ID / huella sin contraseña. La llave la guarda el sistema del
// móvil (Llavero de iCloud, gestor de Google…) y Appwrite la comprueba. Al entrar, el propio sistema enseña las
// cuentas que tienen llave en el dispositivo: ese es el selector de cuentas.

export const llavesDisponibles = () =>
  typeof window !== "undefined" && "PublicKeyCredential" in window && typeof navigator.credentials?.get === "function";

// --- Conversión JSON ⇄ binario (los navegadores más nuevos lo traen hecho; para los demás, a mano) ---
const deB64 = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer;
};
const aB64 = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null;

type Json = Record<string, unknown>;
type ConJSON = typeof PublicKeyCredential & {
  parseCreationOptionsFromJSON?: (o: Json) => PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON?: (o: Json) => PublicKeyCredentialRequestOptions;
};
const PKC = () => PublicKeyCredential as ConJSON;
const credenciales = (lista: unknown) =>
  ((lista as { id: string; type: string; transports?: string[] }[] | undefined) ?? []).map((c) => ({
    ...c,
    id: deB64(c.id),
  })) as PublicKeyCredentialDescriptor[];

function opcionesCreacion(o: Json): PublicKeyCredentialCreationOptions {
  const pkc = PKC();
  if (pkc.parseCreationOptionsFromJSON) return pkc.parseCreationOptionsFromJSON(o);
  const u = o.user as Json;
  return {
    ...(o as unknown as PublicKeyCredentialCreationOptions),
    challenge: deB64(o.challenge as string),
    user: { ...(u as unknown as PublicKeyCredentialUserEntity), id: deB64(u.id as string) },
    excludeCredentials: credenciales(o.excludeCredentials),
  };
}

function opcionesPeticion(o: Json): PublicKeyCredentialRequestOptions {
  const pkc = PKC();
  if (pkc.parseRequestOptionsFromJSON) return pkc.parseRequestOptionsFromJSON(o);
  return {
    ...(o as unknown as PublicKeyCredentialRequestOptions),
    challenge: deB64(o.challenge as string),
    allowCredentials: credenciales(o.allowCredentials),
  };
}

function aJSON(c: PublicKeyCredential): object {
  const conJSON = c as PublicKeyCredential & { toJSON?: () => object };
  if (typeof conJSON.toJSON === "function") return conJSON.toJSON();
  const r = c.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  return {
    id: c.id,
    rawId: aB64(c.rawId),
    type: c.type,
    authenticatorAttachment: c.authenticatorAttachment,
    clientExtensionResults: c.getClientExtensionResults(),
    response: {
      clientDataJSON: aB64(r.clientDataJSON),
      ...(r.attestationObject
        ? { attestationObject: aB64(r.attestationObject), transports: r.getTransports?.() ?? [] }
        : { authenticatorData: aB64(r.authenticatorData), signature: aB64(r.signature), userHandle: aB64(r.userHandle) }),
    },
  };
}

/** Nombre del dispositivo para la lista de llaves ("iPhone", "Android", "Mac"…). */
export function nombreDispositivo() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Navegador";
}

/**
 * Registra una llave para la cuenta con la que se ha entrado. Appwrite lo exige poco después de entrar (10 min):
 * si no, lanza un 401 y hay que volver a entrar.
 */
export async function crearLlave() {
  const reto = await account.createPasskey({ passkeyId: ID.unique(), name: nombreDispositivo() });
  const cred = (await navigator.credentials.create({
    publicKey: opcionesCreacion(reto.publicKey as Json),
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelado");
  await account.updatePasskeyVerification({ passkeyId: reto.passkeyId, credential: aJSON(cred) });
}

const esDeInvitado = (e: unknown) =>
  e instanceof AppwriteException && e.code === 401 && /scope|guest/i.test(`${e.type} ${e.message}`);

async function pedirToken() {
  const reto = await account.createPasskeyToken();
  const cred = (await navigator.credentials.get({
    publicKey: opcionesPeticion(reto.publicKey as Json),
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelado");
  return account.updatePasskeyToken({ challengeId: reto.$id, credential: aJSON(cred) });
}

/**
 * Entra con una llave (el sistema deja elegir cuenta). `conSesion`: ya hay una cuenta dentro (cambiar de cuenta);
 * se intenta conseguir la llave antes de cerrar la sesión actual, para que si se cancela no se quede fuera.
 */
export async function entrarConLlave(conSesion: boolean) {
  let token;
  try {
    token = await pedirToken();
  } catch (e) {
    if (!conSesion || !esDeInvitado(e)) throw e;
    // Appwrite solo deja pedir la llave sin sesión: se cierra la actual y se vuelve a pedir
    await account.deleteSession({ sessionId: "current" }).catch(() => {});
    conSesion = false;
    token = await pedirToken();
  }
  if (conSesion) await account.deleteSession({ sessionId: "current" }).catch(() => {});
  await account.createSession({ userId: token.userId, secret: token.secret });
}

/** Cuántas llaves tiene la cuenta (para saber si ofrecer crear una). */
export const cuantasLlaves = () =>
  account
    .listPasskeys()
    .then((l) => l.total)
    .catch(() => 0);
