import { ENDPOINT, PROYECTO } from "./proyecto";
import { Account, Client, Functions, Presences, Realtime, TablesDB, Teams } from "appwrite";

// Son IDs públicos (acaban en el navegador igualmente); lo que protege los datos es el login
const client = new Client().setEndpoint(ENDPOINT).setProject(PROYECTO);

export const account = new Account(client);
export const db = new TablesDB(client);
export const presencias = new Presences(client);
export const equipos = new Teams(client); // cada grupo de amigos es un equipo de Appwrite
export const funciones = new Functions(client);
// Un solo WebSocket para toda la app (planes, mensajes y presencia)
export const realtime = new Realtime(client);

export const BD = "nuestra-lista";
