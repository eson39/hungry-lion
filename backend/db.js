import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB || "hungry-lion";

let client = null;
let db = null;

export async function getDb() {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  const ratings = db.collection("ratings");
  await ratings.createIndex({ dateKey: 1, hallName: 1 });
  await ratings.createIndex({ visitorId: 1, hallName: 1 });
  return db;
}

export function getRatingsCollection() {
  if (!db) throw new Error("Database not connected. Call getDb() first.");
  return db.collection("ratings");
}

export function getMenuCollection() {
  if (!db) throw new Error("Database not connected. Call getDb() first.");
  return db.collection("menu");
}
