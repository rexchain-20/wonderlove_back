import express, { NextFunction, Response } from 'express';
import { ProtectedRequest, Tokens } from 'app-request';
import UserRepo from '../database/repository/UserRepo';
import { AuthFailureError, AccessTokenError, TokenExpiredError } from '../utils/ApiError';
import JWT, { ValidationParams } from '../utils/JWT';
import KeystoreRepo from '../database/repository/KeystoreRepo';
import { Types } from 'mongoose';
import { validateTokenData } from './AuthUtils';
import { tokenInfo } from '../config';
import validator, { ValidationSource } from '../helpers/validator';
import { authSchema } from './schema';
import asyncHandler from '../helpers/asyncHandler';

const router = express.Router();

router.use(validator(authSchema, ValidationSource.HEADER), asyncHandler(
	async (req: ProtectedRequest, res: Response, next: NextFunction) => {
		req.accessToken = req.headers['x-access-token'].toString();

		const user = await UserRepo.findById(new Types.ObjectId(req.headers['x-user-id'].toString()));
		if (!user) throw new AuthFailureError('User not registered');
		req.user = user;

		try {
			const payload = await JWT.validate(
				req.accessToken,
				new ValidationParams(tokenInfo.issuer, tokenInfo.audience, user._id.toHexString()));

			const jwtPayload = await validateTokenData(payload, req.user._id);
			const keystore = await KeystoreRepo.findforKey(req.user._id, payload.prm);

			if (!keystore || keystore.primaryKey !== jwtPayload.prm)
				throw new AuthFailureError('Invalid access token');

			req.keystore = keystore;

			return next();
		} catch (e) {
			if (e instanceof TokenExpiredError) throw new AccessTokenError(e.message);
			throw e;
		}
	}
));

module.exports = router;