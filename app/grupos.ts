import { BD, db, equipos, funciones } from "./appwrite";

export const MAX_MIEMBROS = 3; // el límite de verdad lo pone la función "grupos" en el servidor

export type Miembro = { id: string; nombre: string };
export type Grupo = { id: string; nombre: string; miembros: Miembro[]; admins: string[] }; // admins: ids de quien lo creó

/** Los grupos de los que formas parte, con quién está en cada uno. */
export async function misGrupos(): Promise<Grupo[]> {
  const { teams } = await equipos.list();
  return Promise.all(
    teams.map(async (e) => {
      const { memberships } = await equipos.listMemberships({ teamId: e.$id });
      return {
        id: e.$id,
        nombre: e.name,
        miembros: memberships.filter((m) => m.confirm).map((m) => ({ id: m.userId, nombre: m.userName })),
        admins: memberships.filter((m) => m.roles.includes("owner")).map((m) => m.userId),
      };
    }),
  );
}

// Crear y unirse van por la función del servidor: devuelve el id del grupo o lanza el código de error
// ("codigo-no-valido", "grupo-lleno", "demasiados-grupos"…)
async function llamar(datos: Record<string, string>): Promise<string> {
  const e = await funciones.createExecution({ functionId: "grupos", body: JSON.stringify(datos) });
  let r: { grupo?: string; error?: string } = {};
  try {
    r = JSON.parse(e.responseBody);
  } catch {}
  if (!r.grupo) throw new Error(r.error ?? "error");
  return r.grupo;
}

export const crearGrupo = (nombre: string) => llamar({ accion: "crear", nombre });
export const unirseAGrupo = (codigo: string) => llamar({ accion: "unirse", codigo });
/** Borra el grupo con todos sus planes, mensajes y comentarios (solo quien lo creó). */
export const borrarGrupo = (grupo: string) => llamar({ accion: "borrar", grupo });

/** Código de invitación (solo lo pueden leer los del grupo). */
export const codigoDeGrupo = (id: string) =>
  db.getRow({ databaseId: BD, tableId: "grupos", rowId: id }).then((r) => String(r.codigo));

export const enlaceInvitacion = (codigo: string) => `${location.origin}/?unirse=${codigo}`;

// Grupo elegido en este dispositivo, y la invitación que llega por enlace: se guarda hasta que
// la persona entra o se da de alta (puede tardar varias pantallas)
const CLAVE_GRUPO = "towish-grupo";
const CLAVE_INVITACION = "towish-invitacion";

function leer(clave: string) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {}
}

export const grupoGuardado = () => leer(CLAVE_GRUPO);
export const guardarGrupo = (id: string) => guardar(CLAVE_GRUPO, id);
export const invitacionPendiente = () => leer(CLAVE_INVITACION);
export const guardarInvitacion = (codigo: string | null) => guardar(CLAVE_INVITACION, codigo);
