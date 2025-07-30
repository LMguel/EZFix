import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string; // ou number, dependendo do tipo do seu userId
    }
  }
}