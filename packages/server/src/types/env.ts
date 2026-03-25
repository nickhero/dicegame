import type { JWTPayload } from '../middleware/auth';

export type AppEnv = {
  Variables: {
    user: JWTPayload;
  };
};
