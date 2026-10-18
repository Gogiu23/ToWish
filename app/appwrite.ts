import { Account, Client, Presences, Realtime, TablesDB } from "appwrite";

// Son IDs públicos (acaban en el navegador igualmente); lo que protege los datos es el login
const client = new Client()
  .setEndpoint("https://fra.cloud.appwrite.io/v1")
  .setProject("6aa7fdb90023eb740a7c");

export const account = new Account(client);
export const db = new TablesDB(client);
export const presencias = new Presences(client);
// Un solo WebSocket para toda la app (planes, mensajes y presencia)
export const realtime = new Realtime(client);

export const BD = "nuestra-lista";
