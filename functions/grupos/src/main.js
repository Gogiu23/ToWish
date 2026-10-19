import { randomInt } from "node:crypto";
import { Client, ID, Permission, Query, Role, TablesDB, Teams, Users } from "node-appwrite";

const BD = "nuestra-lista";
const MAX_MIEMBROS = 3;
const MAX_GRUPOS = 10; // por persona: las altas son abiertas, que nadie cree grupos sin fin
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I: se dictan sin líos
const nuevoCodigo = () => Array.from({ length: 6 }, () => LETRAS[randomInt(LETRAS.length)]).join("");

// La ejecuta la app (usuarios con sesión): crear un grupo, unirse a uno con su código o borrarlo.
// Va en el servidor para que el límite de 3 personas no se pueda saltar desde el navegador.
export default async function grupos({ req, res, error }) {
  const userId = req.headers["x-appwrite-user-id"];
  if (!userId) return res.json({ error: "sin-sesion" }, 401);
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"]);
  const equipos = new Teams(client);
  const db = new TablesDB(client);
  const { accion, nombre, codigo, grupo } = req.bodyJson ?? {};

  try {
    if (accion === "crear") {
      const n = String(nombre ?? "").trim().slice(0, 60);
      if (!n) return res.json({ error: "sin-nombre" }, 400);
      const { total } = await new Users(client).listMemberships({ userId });
      if (total >= MAX_GRUPOS) return res.json({ error: "demasiados-grupos" }, 409);
      const equipo = await equipos.create({ teamId: ID.unique(), name: n });
      await equipos.createMembership({ teamId: equipo.$id, roles: ["owner"], userId });
      // El código lo pueden leer los del grupo (para compartirlo); nadie más
      for (let intento = 0; ; intento++) {
        try {
          await db.createRow({
            databaseId: BD,
            tableId: "grupos",
            rowId: equipo.$id,
            data: { nombre: n, codigo: nuevoCodigo() },
            permissions: [Permission.read(Role.team(equipo.$id))],
          });
          break;
        } catch (e) {
          if (e.code !== 409 || intento >= 3) throw e; // 409: código repetido (índice único), otro
        }
      }
      return res.json({ grupo: equipo.$id });
    }

    if (accion === "unirse") {
      const c = String(codigo ?? "").trim().toUpperCase();
      const { rows } = await db.listRows({
        databaseId: BD,
        tableId: "grupos",
        queries: [Query.equal("codigo", c), Query.limit(1)],
      });
      if (!rows.length) return res.json({ error: "codigo-no-valido" }, 404);
      const teamId = rows[0].$id;
      const { memberships } = await equipos.listMemberships({ teamId, queries: [Query.limit(100)] });
      if (memberships.some((m) => m.userId === userId)) return res.json({ grupo: teamId }); // ya estaba
      // ponytail: dos altas a la vez podrían pasar las dos con 2 miembros; para 3 amigos, aceptable
      if (memberships.length >= MAX_MIEMBROS) return res.json({ error: "grupo-lleno" }, 409);
      await equipos.createMembership({ teamId, roles: [], userId });
      return res.json({ grupo: teamId });
    }

    if (accion === "borrar") {
      // Solo quien lo creó (rol owner). Se borra todo lo del grupo para todos, y luego el grupo
      const teamId = String(grupo ?? "");
      const { memberships } = await equipos.listMemberships({ teamId, queries: [Query.equal("userId", userId)] });
      if (!memberships[0]?.roles.includes("owner")) return res.json({ error: "no-eres-admin" }, 403);
      for (const tableId of ["planes", "mensajes", "comentarios"])
        await db.deleteRows({ databaseId: BD, tableId, queries: [Query.equal("grupo", teamId)] });
      await db.deleteRow({ databaseId: BD, tableId: "grupos", rowId: teamId }).catch(() => {});
      await equipos.delete({ teamId });
      return res.json({ grupo: teamId });
    }

    return res.json({ error: "accion-no-valida" }, 400);
  } catch (e) {
    error(`${accion}: ${e.message}`);
    return res.json({ error: "error" }, 500);
  }
}
