import { Request } from 'express';

import { JwtPayload } from './auth';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
