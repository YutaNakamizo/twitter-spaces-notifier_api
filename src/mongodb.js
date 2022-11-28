import {
  MongoClient,
} from 'mongodb';

export const mongoClient = new MongoClient(process.env.MONGO_URI);
export const mongoDatabase = mongoClient.db(process.env.MONGO_DATABASE);

