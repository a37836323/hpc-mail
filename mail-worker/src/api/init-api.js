import app from '../hono/hono';
import { dbInit } from '../init/init';
import BizError from '../error/biz-error';
import result from '../model/result';

app.post('/init', async (c) => {
	const authorization = c.req.header('Authorization');
	if (!c.env.init_secret || authorization !== `Bearer ${c.env.init_secret}`) {
		throw new BizError('Unauthorized initialization request', 401);
	}
	const data = await dbInit.init(c, await c.req.json());
	return c.json(result.ok(data));
});
