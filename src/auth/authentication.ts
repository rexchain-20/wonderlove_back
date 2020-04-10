import express from 'express';
import { ProtectedRequest, Tokens } from 'app-request';
import UserRepo from '../database/repository/UserRepo';
import { AuthFailureError, AccessTokenError, TokenExpiredError } from '../core/ApiError';
import JWT, { ValidationParams } from '../core/JWT';
import KeystoreRepo from '../database/repository/KeystoreRepo';
import { Types } from 'mongoose';
import { getAccessToken } from './authUtils';
import { tokenInfo } from '../config';
import validator, { ValidationSource } from '../helpers/validator';
import schema from './schema';
import asyncHandler from '../helpers/asyncHandler';

const router = express.Router();

export default router.use(validator(schema.auth, ValidationSource.HEADER),
	asyncHandler(async (req: ProtectedRequest, res, next) => {
		req.accessToken = getAccessToken(req.headers.authorization); // Express headers are auto converted to lowercase

		try {
			const jwtPayload = await JWT.decode(req.accessToken);
			if (!jwtPayload.sub || !Types.ObjectId.isValid(jwtPayload.sub))
				throw new AuthFailureError('Invalid access token');

			const user = await UserRepo.findById(new Types.ObjectId(jwtPayload.sub));
			if (!user) throw new AuthFailureError('User not registered');
			req.user = user;

			const payload = await JWT.validate(
				req.accessToken,
				new ValidationParams(tokenInfo.issuer, tokenInfo.audience, req.user._id.toHexString()));

			const keystore = await KeystoreRepo.findforKey(req.user._id, payload.prm);

			if (!keystore || keystore.primaryKey !== payload.prm)
				throw new AuthFailureError('Invalid access token');

			req.keystore = keystore;

			return next();
		} catch (e) {
			if (e instanceof TokenExpiredError) throw new AccessTokenError(e.message);
			throw e;
		}
	}));